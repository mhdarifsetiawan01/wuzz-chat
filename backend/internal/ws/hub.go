package ws

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/broker"
	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	// ClusterEventsChannel adalah nama channel Redis global untuk sinkronisasi antar instance backend.
	ClusterEventsChannel = "wuzz:cluster:events"
)

// ClusterEvent adalah amplop event yang dikirimkan melalui Redis Pub/Sub ke instance lain.
type ClusterEvent struct {
	NodeID   string  `json:"node_id"`
	RoomID   string  `json:"room_id"`
	SenderID string  `json:"sender_id"`
	Message  Message `json:"message"`
}

// Hub adalah pusat kendali: menyimpan semua client aktif dan room,
// serta bertanggung jawab merutingkan pesan dan broadcast ke room.
type Hub struct {
	nodeID           string
	clients          map[string]*Client            // clientID (UUID) -> *Client
	clientsByNick    map[string]*Client            // lowercase (username/nickname) -> *Client
	rooms            map[string]map[string]*Client // roomID -> (clientID -> *Client)
	roomMembersCache map[string][]string           // roomID -> []memberIdentifiers (in-memory cache)
	roomMembersMu    sync.RWMutex                  // Mutex terisolasi untuk membership cache
	dedupHistory     map[string]int64              // msgID -> unixTimestamp (idempotency deduplication cache)
	dedupMu          sync.RWMutex                  // Mutex terisolasi untuk deduplication cache
	mu               sync.RWMutex
	clientStore      store.ClientStore
	messageStore     store.MessageStore
	userStore        store.UserStore
	pushService      *push.Service
	broker           broker.MessageBroker
}

// NewHub membuat Hub baru dengan dependency yang disuntikkan.
func NewHub(cs store.ClientStore, ms store.MessageStore) *Hub {
	return &Hub{
		nodeID:           uuid.New().String(),
		clients:          make(map[string]*Client),
		clientsByNick:    make(map[string]*Client),
		rooms:            make(map[string]map[string]*Client),
		roomMembersCache: make(map[string][]string),
		dedupHistory:     make(map[string]int64),
		clientStore:      cs,
		messageStore:     ms,
	}
}

// SetPushService menyuntikkan push.Service untuk pengiriman notifikasi pesan saat user offline.
func (h *Hub) SetPushService(ps *push.Service) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.pushService = ps
}

// SetUserStore menyuntikkan UserStore opsional untuk resolusi anggota percakapan.
func (h *Hub) SetUserStore(us store.UserStore) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.userStore = us
}

// SetBroker menyuntikkan MessageBroker (Redis / In-Memory) dan mendaftarkan listener cluster.
func (h *Hub) SetBroker(b broker.MessageBroker) {
	h.mu.Lock()
	h.broker = b
	h.mu.Unlock()

	if b == nil {
		return
	}

	// Dengarkan event dari instance server lain via Redis Pub/Sub
	ctx := context.Background()
	err := b.Subscribe(ctx, ClusterEventsChannel, func(channel string, payload []byte) {
		var event ClusterEvent
		if err := json.Unmarshal(payload, &event); err != nil {
			log.Printf("[Hub %s] gagal unmarshal cluster event: %v", h.nodeID[:8], err)
			return
		}

		// Abaikan event yang berasal dari node ini sendiri (Anti-Echo Loop)
		if event.NodeID == h.nodeID {
			return
		}

		// Teruskan pesan ke client lokal yang terhubung di node ini
		h.broadcastLocal(event.RoomID, event.Message, event.SenderID)
	})

	if err != nil {
		log.Printf("[Hub %s] gagal subscribe ke cluster channel %s: %v", h.nodeID[:8], ClusterEventsChannel, err)
	} else {
		log.Printf("[Hub %s] berhasil terhubung ke Cluster Pub/Sub channel '%s'", h.nodeID[:8], ClusterEventsChannel)
	}
}

// NodeID mengembalikan ID unik instance Hub ini.
func (h *Hub) NodeID() string {
	return h.nodeID
}

// Register menambahkan client baru ke registry.
func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	oldClient, exists := h.clients[c.ID]
	h.clients[c.ID] = c
	if c.Username != "" {
		h.clientsByNick[strings.ToLower(c.Username)] = c
	}
	if c.Nickname != "" {
		h.clientsByNick[strings.ToLower(c.Nickname)] = c
	}
	h.mu.Unlock()

	// Single Active Device Enforcement: Kick sesi WebSocket lama dari UserID yang sama
	if exists && oldClient != nil && oldClient != c {
		isSameDevice := oldClient.DeviceID != "" && c.DeviceID != "" && oldClient.DeviceID == c.DeviceID
		log.Printf("[Hub %s] pergantian sesi client %s (isSameDevice=%v | oldDevice=%s newDevice=%s)", h.nodeID[:8], c.ID, isSameDevice, oldClient.DeviceID, c.DeviceID)
		go func(old *Client, sameDev bool) {
			if !sameDev {
				kickMsg := Message{
					ID:        uuid.New().String(),
					Type:      TypeSystem,
					Content:   "SESSION_REPLACED: Akun Anda dibuka dari perangkat lain.",
					Timestamp: time.Now().UTC(),
				}
				select {
				case old.send <- kickMsg:
				default:
				}
				// Berikan grace period flush 500ms agar pesan system sampai ke jaringan klien lambat/medium
				time.Sleep(500 * time.Millisecond)
				if old.conn != nil {
					// Kirim WebSocket Close Control Frame resmi (Code 4001) sebelum soket ditutup
					closeMsg := websocket.FormatCloseMessage(4001, "SESSION_REPLACED: Akun Anda dibuka dari perangkat lain.")
					_ = old.conn.WriteControl(websocket.CloseMessage, closeMsg, time.Now().Add(1000*time.Millisecond))
					time.Sleep(100 * time.Millisecond)
					_ = old.conn.Close()
				}
			} else {
				// Reconnect dari perangkat yang sama (misal refresh browser / reconnect normal)
				// Tutup soket lama secara tertib tanpa mengirim sinyal SESSION_REPLACED
				time.Sleep(50 * time.Millisecond)
				if old.conn != nil {
					_ = old.conn.Close()
				}
			}
		}(oldClient, isSameDevice)
	}

	if err := h.clientStore.Set(store.ClientRecord{
		ID:       c.ID,
		Nickname: c.Nickname,
		JoinedAt: c.JoinedAt,
	}); err != nil {
		log.Printf("[Hub] gagal persist client %s: %v", c.ID, err)
	}

	log.Printf("[Hub %s] client terdaftar: id=%s nickname=%s | total=%d", h.nodeID[:8], c.ID, c.Nickname, h.count())
}

// JoinRoom mendaftarkan client ke dalam room tertentu.
func (h *Hub) JoinRoom(c *Client, roomID string) {
	var oldRoomID string
	h.mu.Lock()
	// Jika client sebelumnya ada di room lain, bersihkan dulu
	if c.RoomID != "" && c.RoomID != roomID {
		oldRoomID = c.RoomID
		if room, ok := h.rooms[c.RoomID]; ok {
			delete(room, c.ID)
			if len(room) == 0 {
				delete(h.rooms, c.RoomID)
			}
		}
	}

	c.RoomID = roomID
	if _, ok := h.rooms[roomID]; !ok {
		h.rooms[roomID] = make(map[string]*Client)
	}
	h.rooms[roomID][c.ID] = c

	log.Printf("[Hub %s] client %s (%s) bergabung ke room '%s' | member room=%d", h.nodeID[:8], c.ID, c.Nickname, roomID, len(h.rooms[roomID]))
	h.mu.Unlock()

	// Broadcast update user list untuk room lama jika ada perpindahan
	if oldRoomID != "" {
		h.BroadcastRoomUsers(oldRoomID)
	}

	// Broadcast update user list ke seluruh anggota di room baru
	h.BroadcastRoomUsers(roomID)
}

// Unregister menghapus client dari registry dan room-nya.
func (h *Hub) Unregister(c *Client) {
	roomID := c.RoomID
	h.mu.Lock()
	_, exists := h.clients[c.ID]
	if exists {
		delete(h.clients, c.ID)
		if c.Username != "" {
			delete(h.clientsByNick, strings.ToLower(c.Username))
		}
		if c.Nickname != "" {
			delete(h.clientsByNick, strings.ToLower(c.Nickname))
		}
		close(c.send)
	}

	// Hapus dari room
	if roomID != "" {
		if room, ok := h.rooms[roomID]; ok {
			delete(room, c.ID)
			if len(room) == 0 {
				delete(h.rooms, roomID)
			}
		}
	}
	h.mu.Unlock()

	if !exists {
		return
	}

	if err := h.clientStore.Delete(c.ID); err != nil {
		log.Printf("[Hub %s] gagal hapus client %s dari store: %v", h.nodeID[:8], c.ID, err)
	}

	log.Printf("[Hub %s] client keluar: id=%s nickname=%s | sisa=%d", h.nodeID[:8], c.ID, c.Nickname, h.count())

	// Perbarui daftar user aktif di room (presence)
	if roomID != "" {
		h.BroadcastRoomUsers(roomID)
	}
}

// BroadcastRoomUsers mengumpulkan seluruh klien aktif di sebuah room dan mem-broadcast pesan TypeRoomUsers.
func (h *Hub) BroadcastRoomUsers(roomID string) {
	if roomID == "" {
		return
	}

	h.mu.RLock()
	room, exists := h.rooms[roomID]
	var users []RoomUser
	var targets []*Client
	if exists {
		for _, client := range room {
			users = append(users, RoomUser{
				ID:          client.ID,
				Username:    client.Username,
				DisplayName: client.DisplayName,
				Nickname:    client.Nickname,
			})
			targets = append(targets, client)
		}
	}
	h.mu.RUnlock()

	if len(targets) == 0 {
		return
	}

	msg := Message{
		Type:      TypeRoomUsers,
		Room:      roomID,
		Users:     users,
		Timestamp: time.Now().UTC(),
	}

	for _, target := range targets {
		select {
		case target.send <- msg:
		default:
			log.Printf("[Hub %s] buffer penuh saat broadcast room_users ke client %s", h.nodeID[:8], target.ID)
		}
	}
}

// BroadcastGroupSystemEvent mengirimkan pesan notifikasi sistem (TypeSystem) ke seluruh anggota room grup.
// Digunakan untuk event seperti "member bergabung", "member dikeluarkan", "role diubah", "info grup diperbarui".
// Content berisi teks notifikasi yang akan ditampilkan di timeline chat sebagai system bubble.
func (h *Hub) BroadcastGroupSystemEvent(roomID, eventType, content string) {
	if roomID == "" || content == "" {
		return
	}
	// Invalidasikan cache anggota room karena keanggotaan atau status grup berubah
	h.InvalidateRoomMembersCache(roomID)

	msg := Message{
		ID:        uuid.New().String(),
		Type:      TypeSystem,
		From:      "server",
		Room:      roomID,
		Content:   content,
		Timestamp: time.Now().UTC(),
	}
	if h.messageStore != nil {
		_ = h.messageStore.Save(store.StoredMessage{
			ID:        msg.ID,
			RoomID:    roomID,
			FromID:    "server",
			Nickname:  "Sistem",
			Content:   content,
			Status:    string(StatusDelivered),
			Reactions: "[]",
			Timestamp: msg.Timestamp,
		})
	}
	// Gunakan broadcastLocal; juga publish ke cluster agar semua node meneruskan ke anggota offline
	h.broadcastLocal(roomID, msg, "server")
	h.mu.RLock()
	b := h.broker
	h.mu.RUnlock()
	if b != nil {
		event := ClusterEvent{
			NodeID:   h.nodeID,
			RoomID:   roomID,
			SenderID: "server",
			Message:  msg,
		}
		if payload, err := json.Marshal(event); err == nil {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if pubErr := b.Publish(ctx, ClusterEventsChannel, payload); pubErr != nil {
				log.Printf("[Hub %s] gagal publish group_system_event ke broker: %v", h.nodeID[:8], pubErr)
			}
		}
	}
	log.Printf("[Hub %s] group_system_event room=%s type=%s", h.nodeID[:8], roomID, eventType)
}

// getRoomMembers mengambil daftar anggota room dari cache in-memory, atau memuat dari userStore jika cache miss.
func (h *Hub) getRoomMembers(roomID string) []string {
	if roomID == "" {
		return nil
	}
	h.roomMembersMu.RLock()
	cached, ok := h.roomMembersCache[roomID]
	h.roomMembersMu.RUnlock()
	if ok {
		return cached
	}

	if h.userStore == nil {
		return nil
	}

	members, err := h.userStore.GetConversationMemberUsernames(roomID)
	if err != nil || len(members) == 0 {
		return nil
	}

	h.roomMembersMu.Lock()
	h.roomMembersCache[roomID] = members
	h.roomMembersMu.Unlock()

	return members
}

// InvalidateRoomMembersCache menghapus cache keanggotaan percakapan (dipanggil saat ada member join/leave).
func (h *Hub) InvalidateRoomMembersCache(roomID string) {
	if roomID == "" {
		return
	}
	h.roomMembersMu.Lock()
	delete(h.roomMembersCache, roomID)
	h.roomMembersMu.Unlock()
}

// findClientLocked mencari client berdasarkan ID atau username/nickname (wajib dipanggil saat h.mu terkunci).
func (h *Hub) findClientLocked(identifier string) (*Client, bool) {
	if c, ok := h.clients[identifier]; ok {
		return c, true
	}
	if c, ok := h.clientsByNick[strings.ToLower(identifier)]; ok {
		return c, true
	}
	return nil, false
}

// broadcastLocal mengirimkan pesan hanya ke klien yang terhubung secara fisik di instance Hub ini.
func (h *Hub) broadcastLocal(roomID string, msg Message, senderID string) {
	h.mu.RLock()
	targetMap := make(map[*Client]bool)

	// 1. Klien lokal yang sedang aktif membuka room ini
	if room, roomExists := h.rooms[roomID]; roomExists {
		for id, client := range room {
			if id != senderID {
				targetMap[client] = true
			}
		}
	}

	// 2. Klien lokal lain yang merupakan anggota percakapan ini (misal di halaman daftar chat / sidebar)
	// Menggunakan in-memory cache dan direct lookup O(M) tanpa query SQL dan tanpa scan linier O(N) seluruh h.clients
	if roomID != "" {
		memberIDs := h.getRoomMembers(roomID)
		for _, mID := range memberIDs {
			if mID == senderID {
				continue
			}
			if client, found := h.findClientLocked(mID); found && client.ID != senderID {
				targetMap[client] = true
			}
		}
	}
	h.mu.RUnlock()

	// Kirim pesan ke semua penerima lokal
	for target := range targetMap {
		select {
		case target.send <- msg:
		default:
			log.Printf("[Hub %s] buffer penuh untuk client %s di room %s, pesan di-drop", h.nodeID[:8], target.ID, roomID)
		}
	}
}

// BroadcastRoom mengirimkan pesan ke seluruh anggota room lokal dan mem-publish ke Redis cluster broker.
// Jika tipe pesan adalah TypeMessage, pesan akan disimpan secara persisten ke Database oleh node pengirim asal.
func (h *Hub) BroadcastRoom(roomID string, msg Message, senderID string) {
	// Validasi mention fail-closed: verifikasi user ID yang di-mention adalah anggota room yang sah (DEC-013)
	if len(msg.Mentions) > 0 && h.userStore != nil {
		var validMentions []string
		for _, mUID := range msg.Mentions {
			mUID = strings.TrimSpace(mUID)
			if mUID == "" {
				continue
			}
			if isAuth, err := h.userStore.IsUserInConversation(roomID, mUID); err == nil && isAuth {
				validMentions = append(validMentions, mUID)
			}
		}
		msg.Mentions = validMentions
	}

	// 1. Broadcast ke client lokal yang terhubung di instance server ini
	h.broadcastLocal(roomID, msg, senderID)

	// 2. Simpan ke database jika tipe pesan chat biasa (hanya dilakukan oleh node pengirim asal)
	if msg.Type == TypeMessage {
		if msg.ID == "" {
			msg.ID = uuid.New().String()
		}
		if msg.Status == "" {
			msg.Status = StatusSent
		}

		var replyToID, replyToNickname, replyToContent string
		if msg.ReplyTo != nil {
			replyToID = msg.ReplyTo.ID
			replyToNickname = msg.ReplyTo.Nickname
			replyToContent = msg.ReplyTo.Content
		}

		mentionsJSON := "[]"
		if len(msg.Mentions) > 0 {
			if data, err := json.Marshal(msg.Mentions); err == nil {
				mentionsJSON = string(data)
			}
		}

		err := h.messageStore.Save(store.StoredMessage{
			ID:              msg.ID,
			RoomID:          roomID,
			FromID:          msg.From,
			Nickname:        msg.Nickname,
			ToID:            msg.To,
			Content:         msg.Content,
			Status:          string(msg.Status),
			ReplyToID:       replyToID,
			ReplyToNickname: replyToNickname,
			ReplyToContent:  replyToContent,
			Reactions:       "[]",
			MediaURL:        msg.MediaURL,
			MediaType:       msg.MediaType,
			FileName:        msg.FileName,
			FileSize:        msg.FileSize,
			Mentions:        mentionsJSON,
			IsForwarded:     msg.IsForwarded,
			Timestamp:       msg.Timestamp,
		})
		if err != nil {
			log.Printf("[Hub %s] gagal menyimpan pesan ke database: %v", h.nodeID[:8], err)
		}

		// Kirim Push Notification ke seluruh anggota percakapan yang sedang offline/tidak di room
		h.mu.RLock()
		ps := h.pushService
		var onlineIDs []string
		if room, ok := h.rooms[roomID]; ok {
			for _, c := range room {
				onlineIDs = append(onlineIDs, c.ID, c.Nickname, c.Username)
			}
		}
		h.mu.RUnlock()

		if ps != nil {
			ps.NotifyOfflineRecipients(roomID, msg.From, msg.Nickname, msg.Content, msg.MediaType, onlineIDs, msg.Mentions)
		}
	}

	// 3. Publish event ke Redis Message Broker untuk disinkronkan ke instance Go lainnya
	h.mu.RLock()
	b := h.broker
	h.mu.RUnlock()

	if b != nil {
		event := ClusterEvent{
			NodeID:   h.nodeID,
			RoomID:   roomID,
			SenderID: senderID,
			Message:  msg,
		}

		if payload, err := json.Marshal(event); err == nil {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if pubErr := b.Publish(ctx, ClusterEventsChannel, payload); pubErr != nil {
				log.Printf("[Hub %s] gagal publish ke broker cluster: %v", h.nodeID[:8], pubErr)
			}
		}
	}
}

// sendRoomHistory mengambil riwayat pesan dari database dan mengirimkannya ke client spesifik.
// Jika sinceStr diberikan dan valid (RFC3339), hanya mengambil pesan delta yang lebih baru dari checkpoint.
func (h *Hub) sendRoomHistory(clientID, roomID string, sinceStr ...string) {
	var sinceTime time.Time
	if len(sinceStr) > 0 && strings.TrimSpace(sinceStr[0]) != "" {
		raw := strings.TrimSpace(sinceStr[0])
		if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
			sinceTime = t
		} else if t, err := time.Parse(time.RFC3339, raw); err == nil {
			sinceTime = t
		}
	}

	var history []store.StoredMessage
	var err error

	if !sinceTime.IsZero() {
		history, err = h.messageStore.GetRoomHistorySince(roomID, clientID, sinceTime, 100)
	} else {
		history, err = h.messageStore.GetRoomHistoryForUser(roomID, clientID, 50)
	}
	if err != nil {
		log.Printf("[Hub %s] gagal mengambil history untuk room %s: %v", h.nodeID[:8], roomID, err)
		h.notifyClient(clientID, Message{
			Type:      TypeHistory,
			From:      "server",
			To:        clientID,
			Room:      roomID,
			Timestamp: time.Now().UTC(),
			Messages:  []Message{},
		})
		return
	}

	msgs := make([]Message, 0, len(history))
	for _, m := range history {
		status := StatusSent
		if m.Status != "" {
			status = MessageStatus(m.Status)
		}

		var replyTo *ReplyTarget
		if m.ReplyToID != "" {
			replyTo = &ReplyTarget{
				ID:       m.ReplyToID,
				Nickname: m.ReplyToNickname,
				Content:  m.ReplyToContent,
			}
		}

		var reactions []ReactionItem
		if m.Reactions != "" && m.Reactions != "[]" {
			_ = json.Unmarshal([]byte(m.Reactions), &reactions)
		}

		var mentions []string
		if m.Mentions != "" && m.Mentions != "[]" {
			_ = json.Unmarshal([]byte(m.Mentions), &mentions)
		}

		msgType := TypeMessage
		if m.FromID == "server" {
			msgType = TypeSystem
		}

		msgs = append(msgs, Message{
			ID:          m.ID,
			Type:        msgType,
			From:        m.FromID,
			To:          m.ToID,
			Room:        m.RoomID,
			Nickname:    m.Nickname,
			Content:     m.Content,
			Status:      status,
			ReplyTo:     replyTo,
			Reactions:   reactions,
			MediaURL:    m.MediaURL,
			MediaType:   m.MediaType,
			FileName:    m.FileName,
			FileSize:    m.FileSize,
			MediaStatus: m.MediaStatus,
			IsDeleted:   m.IsDeleted,
			IsEdited:    m.IsEdited,
			EditedAt:    m.EditedAt,
			IsForwarded: m.IsForwarded,
			Mentions:    mentions,
			Timestamp:   m.Timestamp,
		})
	}

	h.notifyClient(clientID, Message{
		Type:      TypeHistory,
		From:      "server",
		To:        clientID,
		Room:      roomID,
		Timestamp: time.Now().UTC(),
		Messages:  msgs,
	})
}

// GetClient mengambil client berdasarkan ID.
func (h *Hub) GetClient(id string) (*Client, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	c, ok := h.clients[id]
	return c, ok
}

// notifyClient mengirim pesan ke satu client spesifik.
func (h *Hub) notifyClient(clientID string, msg Message) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if !ok {
		return
	}
	select {
	case c.send <- msg:
	default:
	}
}

func (h *Hub) count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// IsDuplicateAndRecord memeriksa apakah msgID sudah pernah diproses dalam rentang waktu ttl.
// Jika pesan sudah pernah tercatat (duplikat), mengembalikan true.
// Jika belum ada, mencatat msgID dengan timestamp sekarang dan mengembalikan false.
func (h *Hub) IsDuplicateAndRecord(msgID string, ttl time.Duration) bool {
	if msgID == "" {
		return false
	}
	now := time.Now().UnixNano()
	cutoff := now - ttl.Nanoseconds()

	h.dedupMu.Lock()
	defer h.dedupMu.Unlock()

	if ts, exists := h.dedupHistory[msgID]; exists {
		if ts >= cutoff {
			return true // Duplikat dalam rentang TTL
		}
	}

	// Simpan timestamp pemrosesan pesan (dalam nanodetik)
	h.dedupHistory[msgID] = now

	// Optimistic periodic cleanup: jika map melebihi 2000 entri, bersihkan entri yang sudah expired
	if len(h.dedupHistory) > 2000 {
		for id, ts := range h.dedupHistory {
			if ts < cutoff {
				delete(h.dedupHistory, id)
			}
		}
	}

	return false
}

// KickClientByUserID mengirimkan sinyal SESSION_REPLACED / kick dan menutup koneksi WebSocket
// untuk klien dengan userID tertentu. Jika exceptDeviceID diisi, hanya menendang perangkat selain device tersebut.
func (h *Hub) KickClientByUserID(userID, exceptDeviceID, reason string) {
	h.mu.RLock()
	client, exists := h.clients[userID]
	h.mu.RUnlock()

	if !exists || client == nil {
		return
	}

	if exceptDeviceID != "" && client.DeviceID == exceptDeviceID {
		return
	}

	if reason == "" {
		reason = "SESSION_REPLACED: Akun Anda dibuka dari perangkat lain."
	}

	log.Printf("[Hub %s] kick client %s (deviceID=%s | exceptDevice=%s | reason=%s)", h.nodeID[:8], userID, client.DeviceID, exceptDeviceID, reason)

	go func(c *Client) {
		kickMsg := Message{
			ID:        uuid.New().String(),
			Type:      TypeSystem,
			Content:   reason,
			Timestamp: time.Now().UTC(),
		}
		select {
		case c.send <- kickMsg:
		default:
		}
		time.Sleep(500 * time.Millisecond)
		if c.conn != nil {
			closeMsg := websocket.FormatCloseMessage(4001, reason)
			_ = c.conn.WriteControl(websocket.CloseMessage, closeMsg, time.Now().Add(1000*time.Millisecond))
			time.Sleep(100 * time.Millisecond)
			_ = c.conn.Close()
		}
	}(client)
}

