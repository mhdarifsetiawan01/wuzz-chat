package ws

import (
	"context"
	"encoding/json"
	"fmt"
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
	NodeID         string  `json:"node_id"`
	RoomID         string  `json:"room_id"`
	SenderID       string  `json:"sender_id"`
	TargetUserID   string  `json:"target_user_id,omitempty"`
	Message        Message `json:"message"`
	EventType      string  `json:"event_type,omitempty"`
	ExceptDeviceID string  `json:"except_device_id,omitempty"`
	KickReason     string  `json:"kick_reason,omitempty"`
}

// DefaultMaxActiveDevicesPerUser menentukan batas maksimal perangkat aktif bersamaan per user (default 2: misal HP + Laptop).
const DefaultMaxActiveDevicesPerUser = 2

// RoomAuthorizationChecker mendefinisikan verifikasi keanggotaan dan resolusi anggota percakapan.
// Interface ini memutus ketergantungan langsung WebSocket Hub ke implementasi store.UserStore.
type RoomAuthorizationChecker interface {
	GetConversationMemberUsernames(conversationID string) ([]string, error)
	IsUserInConversation(conversationID, userID string) (bool, error)
	IsConversationExpired(conversationID string) bool
}

// RealtimeMessageManager mendefinisikan operasi persistensi dan query pesan untuk WebSocket Hub.
// Interface ini memutus ketergantungan langsung WebSocket Hub ke implementasi store.MessageStore (Milestone 2 Decoupling).
type RealtimeMessageManager interface {
	Save(msg store.StoredMessage) error
	UpdateMessageStatus(msgID string, status string) error
	MarkRoomMessagesAsRead(roomID, excludeUserID string) error
	MarkUserMessagesAsDelivered(userID string) ([]string, error)
	ToggleReaction(msgID, emoji, userID string) (string, error)
	GetRoomHistoryForUser(roomID, userID string, limit int) ([]store.StoredMessage, error)
	GetRoomHistorySince(roomID, userID string, since time.Time, limit int) ([]store.StoredMessage, error)
}

// Hub adalah pusat kendali: menyimpan semua client aktif dan room,
// serta bertanggung jawab merutingkan pesan dan broadcast ke room.
type Hub struct {
	nodeID           string
	clients          map[string]*Client            // sessionKey -> *Client
	userClients      map[string]map[string]*Client // userID -> (deviceID -> *Client)
	rooms            map[string]map[string]*Client // roomID -> (sessionKey -> *Client)
	roomMembersCache map[string][]string           // roomID -> []memberIdentifiers (in-memory cache)
	roomMembersMu    sync.RWMutex                  // Mutex terisolasi untuk membership cache
	dedupHistory     map[string]int64              // msgID -> unixTimestamp (idempotency deduplication cache)
	dedupMu          sync.RWMutex                  // Mutex terisolasi untuk deduplication cache
	maxActiveDevices int                           // batas perangkat aktif bersamaan per user
	mu               sync.RWMutex
	clientStore      store.ClientStore
	messageStore     RealtimeMessageManager
	roomAuth         RoomAuthorizationChecker
	pushService      *push.Service
	broker           broker.MessageBroker
}

// NewHub membuat Hub baru dengan dependency yang disuntikkan.
func NewHub(cs store.ClientStore, ms RealtimeMessageManager) *Hub {
	return &Hub{
		nodeID:           uuid.New().String(),
		clients:          make(map[string]*Client),
		userClients:      make(map[string]map[string]*Client),
		rooms:            make(map[string]map[string]*Client),
		roomMembersCache: make(map[string][]string),
		dedupHistory:     make(map[string]int64),
		maxActiveDevices: DefaultMaxActiveDevicesPerUser,
		clientStore:      cs,
		messageStore:     ms,
	}
}

// SetMessageManager menyuntikkan RealtimeMessageManager (misal adapter repository domain messaging).
func (h *Hub) SetMessageManager(mm RealtimeMessageManager) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.messageStore = mm
}

// SetMessageStore menyuntikkan store.MessageStore (backward-compatible).
func (h *Hub) SetMessageStore(ms store.MessageStore) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.messageStore = ms
}

// SaveMessage menyimpan pesan ke message manager.
func (h *Hub) SaveMessage(msg store.StoredMessage) error {
	h.mu.RLock()
	ms := h.messageStore
	h.mu.RUnlock()
	if ms == nil {
		return nil
	}
	return ms.Save(msg)
}

// UpdateMessageStatus memperbarui status tanda terima pesan.
func (h *Hub) UpdateMessageStatus(msgID, status string) error {
	h.mu.RLock()
	ms := h.messageStore
	h.mu.RUnlock()
	if ms == nil {
		return nil
	}
	return ms.UpdateMessageStatus(msgID, status)
}

// MarkRoomMessagesAsRead menandai pesan di room sebagai read.
func (h *Hub) MarkRoomMessagesAsRead(roomID, excludeUserID string) error {
	h.mu.RLock()
	ms := h.messageStore
	h.mu.RUnlock()
	if ms == nil {
		return nil
	}
	return ms.MarkRoomMessagesAsRead(roomID, excludeUserID)
}

// MarkUserMessagesAsDelivered menandai pesan user sebagai delivered.
func (h *Hub) MarkUserMessagesAsDelivered(userID string) ([]string, error) {
	h.mu.RLock()
	ms := h.messageStore
	h.mu.RUnlock()
	if ms == nil {
		return nil, nil
	}
	return ms.MarkUserMessagesAsDelivered(userID)
}

// ToggleReaction menambah atau menghapus emoji reaksi pada pesan.
func (h *Hub) ToggleReaction(msgID, emoji, userID string) (string, error) {
	h.mu.RLock()
	ms := h.messageStore
	h.mu.RUnlock()
	if ms == nil {
		return "", nil
	}
	return ms.ToggleReaction(msgID, emoji, userID)
}

// GetRoomHistoryForUser mengambil riwayat pesan untuk user.
func (h *Hub) GetRoomHistoryForUser(roomID, userID string, limit int) ([]store.StoredMessage, error) {
	h.mu.RLock()
	ms := h.messageStore
	h.mu.RUnlock()
	if ms == nil {
		return nil, nil
	}
	return ms.GetRoomHistoryForUser(roomID, userID, limit)
}

// GetRoomHistorySince mengambil riwayat pesan sejak timestamp tertentu.
func (h *Hub) GetRoomHistorySince(roomID, userID string, since time.Time, limit int) ([]store.StoredMessage, error) {
	h.mu.RLock()
	ms := h.messageStore
	h.mu.RUnlock()
	if ms == nil {
		return nil, nil
	}
	return ms.GetRoomHistorySince(roomID, userID, since, limit)
}

// SetMaxActiveDevices mengatur batas maksimal perangkat aktif bersamaan per user.
func (h *Hub) SetMaxActiveDevices(limit int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if limit <= 0 {
		limit = DefaultMaxActiveDevicesPerUser
	}
	h.maxActiveDevices = limit
}

// SetPushService menyuntikkan push.Service untuk pengiriman notifikasi pesan saat user offline.
func (h *Hub) SetPushService(ps *push.Service) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.pushService = ps
	if ps != nil {
		ps.SetDeliveryCallback(func(msgID, roomID, recipientUserID string) {
			if msgID == "" || roomID == "" {
				return
			}
			// Update status pesan menjadi 'delivered' di DB jika belum 'read'
			if err := h.UpdateMessageStatus(msgID, string(StatusDelivered)); err == nil {
				// Broadcast status delivered ke room agar pengirim menerima centang 2 abu-abu
				h.BroadcastRoom(roomID, Message{
					ID:        msgID,
					Type:      TypeReceipt,
					Room:      roomID,
					Status:    StatusDelivered,
					Timestamp: time.Now().UTC(),
				}, recipientUserID)
			}
		})
	}
}

// SetRoomAuth menyuntikkan RoomAuthorizationChecker untuk resolusi anggota percakapan.
func (h *Hub) SetRoomAuth(ra RoomAuthorizationChecker) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.roomAuth = ra
}

// SetUserStore menyuntikkan UserStore opsional (backward-compatibility wrapper ke SetRoomAuth).
func (h *Hub) SetUserStore(us store.UserStore) {
	h.SetRoomAuth(us)
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

		switch event.EventType {
		case "session_kick":
			log.Printf("[Hub %s] menerima cluster session_kick dari node %s target=%s except=%s",
				h.nodeID[:8], event.NodeID[:8], event.TargetUserID, event.ExceptDeviceID)
			h.kickClientByUserIDLocal(event.TargetUserID, event.ExceptDeviceID, event.KickReason)

		case "device_kick":
			log.Printf("[Hub %s] menerima cluster device_kick dari node %s target=%s device=%s",
				h.nodeID[:8], event.NodeID[:8], event.TargetUserID, event.SenderID)
			h.kickClientByDeviceIDLocal(event.TargetUserID, event.SenderID, event.KickReason)

		default:
			log.Printf("[Hub %s] menerima cluster event dari node %s room=%s msgID=%s",
				h.nodeID[:8], event.NodeID[:8], event.RoomID, event.Message.ID)

			// Teruskan pesan ke client lokal yang terhubung di node ini
			if event.TargetUserID != "" {
				h.NotifyUser(event.TargetUserID, event.Message)
			} else {
				h.broadcastLocal(event.RoomID, event.Message, event.SenderID)
			}
		}
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

// Register menambahkan client baru ke registry dengan dukungan multi-device (Level 2).
func (h *Hub) Register(c *Client) {
	if c.SessionKey == "" {
		if c.DeviceID != "" {
			c.SessionKey = fmt.Sprintf("%s:%s", c.ID, c.DeviceID)
		} else {
			c.SessionKey = c.ID
		}
	}
	devKey := c.DeviceID
	if devKey == "" {
		devKey = c.SessionKey
	}

	h.mu.Lock()
	devs, ok := h.userClients[c.ID]
	if !ok {
		devs = make(map[string]*Client)
		h.userClients[c.ID] = devs
	}

	var kickClient *Client
	var isSameDevice bool

	// Kasus 1: Reconnect dari perangkat yang sama (hanya jika device_id valid dan cocok)
	if c.DeviceID != "" && devs[c.DeviceID] != nil && devs[c.DeviceID] != c {
		kickClient = devs[c.DeviceID]
		isSameDevice = true
		delete(h.clients, kickClient.SessionKey)
	} else if len(devs) >= h.maxActiveDevices {
		// Kasus 2: Kuota perangkat bersamaan tercapai, lakukan FIFO Eviction (tendang device tertua)
		var oldestClient *Client
		for _, devClient := range devs {
			if oldestClient == nil || devClient.JoinedAt.Before(oldestClient.JoinedAt) {
				oldestClient = devClient
			}
		}
		if oldestClient != nil {
			kickClient = oldestClient
			isSameDevice = false
			oldDevKey := oldestClient.DeviceID
			if oldDevKey == "" {
				oldDevKey = oldestClient.SessionKey
			}
			delete(devs, oldDevKey)
			delete(h.clients, oldestClient.SessionKey)
		}
	}

	devs[devKey] = c
	h.clients[c.SessionKey] = c
	h.mu.Unlock()

	if kickClient != nil {
		log.Printf("[Hub %s] pergantian/eviction sesi client %s (isSameDevice=%v | kickDevice=%s newDevice=%s)", h.nodeID[:8], c.ID, isSameDevice, kickClient.DeviceID, c.DeviceID)
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
				time.Sleep(50 * time.Millisecond)
				if old.conn != nil {
					_ = old.conn.Close()
				}
			}
		}(kickClient, isSameDevice)
	}

	if err := h.clientStore.Set(store.ClientRecord{
		ID:       c.ID,
		Nickname: c.Nickname,
		JoinedAt: c.JoinedAt,
	}); err != nil {
		log.Printf("[Hub] gagal persist client %s: %v", c.ID, err)
	}

	log.Printf("[Hub %s] client terdaftar: id=%s device=%s session=%s nickname=%s | total_koneksi=%d", h.nodeID[:8], c.ID, c.DeviceID, c.SessionKey, c.Nickname, h.count())
}

// JoinRoom mendaftarkan client ke dalam room tertentu.
func (h *Hub) JoinRoom(c *Client, roomID string) {
	cKey := c.SessionKey
	if cKey == "" {
		cKey = c.ID
	}

	var oldRoomID string
	h.mu.Lock()
	// Jika client sebelumnya ada di room lain, bersihkan dulu
	if c.RoomID != "" && c.RoomID != roomID {
		oldRoomID = c.RoomID
		if room, ok := h.rooms[c.RoomID]; ok {
			delete(room, cKey)
			if len(room) == 0 {
				delete(h.rooms, c.RoomID)
			}
		}
	}

	c.RoomID = roomID
	if _, ok := h.rooms[roomID]; !ok {
		h.rooms[roomID] = make(map[string]*Client)
	}
	h.rooms[roomID][cKey] = c

	log.Printf("[Hub %s] client %s (%s - device: %s) bergabung ke room '%s' | member room=%d", h.nodeID[:8], c.ID, c.Nickname, c.DeviceID, roomID, len(h.rooms[roomID]))
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
	cKey := c.SessionKey
	if cKey == "" {
		cKey = c.ID
	}
	devKey := c.DeviceID
	if devKey == "" {
		devKey = cKey
	}

	h.mu.Lock()
	_, exists := h.clients[cKey]
	var remainingDevsCount int
	if exists {
		delete(h.clients, cKey)
		close(c.send)
	}

	if devs, ok := h.userClients[c.ID]; ok {
		delete(devs, devKey)
		remainingDevsCount = len(devs)
		if remainingDevsCount == 0 {
			delete(h.userClients, c.ID)
		}
	}

	// Hapus dari room
	if roomID != "" {
		if room, ok := h.rooms[roomID]; ok {
			delete(room, cKey)
			if len(room) == 0 {
				delete(h.rooms, roomID)
			}
		}
	}
	h.mu.Unlock()

	if !exists {
		return
	}

	// Hanya hapus dari presence store jika seluruh perangkat user telah offline
	if remainingDevsCount == 0 {
		if err := h.clientStore.Delete(c.ID); err != nil {
			log.Printf("[Hub %s] gagal hapus client %s dari store: %v", h.nodeID[:8], c.ID, err)
		}
	}

	log.Printf("[Hub %s] client keluar: id=%s device=%s | sisa_koneksi=%d", h.nodeID[:8], c.ID, c.DeviceID, h.count())

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
		seenUsers := make(map[string]bool)
		for _, client := range room {
			if !seenUsers[client.ID] {
				seenUsers[client.ID] = true
				users = append(users, RoomUser{
					ID:          client.ID,
					Username:    client.Username,
					DisplayName: client.DisplayName,
					Nickname:    client.Nickname,
				})
			}
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
	_ = h.SaveMessage(store.StoredMessage{
		ID:        msg.ID,
		RoomID:    roomID,
		FromID:    "server",
		Nickname:  "Sistem",
		Content:   content,
		Status:    string(StatusDelivered),
		Reactions: "[]",
		Timestamp: msg.Timestamp,
	})
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

	if h.roomAuth == nil {
		return nil
	}

	members, err := h.roomAuth.GetConversationMemberUsernames(roomID)
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

// findClientsLocked mencari semua client berdasarkan ID (UUID) atau sessionKey (wajib dipanggil saat h.mu terkunci).
func (h *Hub) findClientsLocked(identifier string) []*Client {
	var res []*Client
	// 1. Cek apakah identifier adalah userID di userClients
	if devs, ok := h.userClients[identifier]; ok {
		for _, c := range devs {
			res = append(res, c)
		}
		if len(res) > 0 {
			return res
		}
	}

	// 2. Cek apakah identifier adalah sessionKey spesifik di clients
	if c, ok := h.clients[identifier]; ok {
		return []*Client{c}
	}

	return nil
}

// findClientLocked mencari satu client (kompatibilitas mundur saat h.mu terkunci).
func (h *Hub) findClientLocked(identifier string) (*Client, bool) {
	clients := h.findClientsLocked(identifier)
	if len(clients) > 0 {
		return clients[0], true
	}
	return nil, false
}

// broadcastLocal mengirimkan pesan hanya ke klien yang terhubung secara fisik di instance Hub ini.
// senderKey dapat berupa SessionKey pengirim (spesifik perangkat) atau ID pengirim.
func (h *Hub) broadcastLocal(roomID string, msg Message, senderKey string) {
	h.mu.RLock()
	targetMap := make(map[*Client]bool)

	// 1. Klien lokal yang sedang aktif membuka room ini
	if room, roomExists := h.rooms[roomID]; roomExists {
		for key, client := range room {
			if key == senderKey || client.SessionKey == senderKey {
				continue
			}
			if senderKey == client.ID && len(h.userClients[client.ID]) <= 1 {
				continue
			}
			targetMap[client] = true
		}
	}

	// 2. Klien lokal lain yang merupakan anggota percakapan ini (misal di halaman daftar chat / sidebar)
	if roomID != "" {
		memberIDs := h.getRoomMembers(roomID)
		for _, mID := range memberIDs {
			clients := h.findClientsLocked(mID)
			for _, client := range clients {
				if client.SessionKey == senderKey || (senderKey == client.ID && len(clients) <= 1) {
					continue
				}
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
	if len(msg.Mentions) > 0 && h.roomAuth != nil {
		var validMentions []string
		for _, mUID := range msg.Mentions {
			mUID = strings.TrimSpace(mUID)
			if mUID == "" {
				continue
			}
			if isAuth, err := h.roomAuth.IsUserInConversation(roomID, mUID); err == nil && isAuth {
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

		err := h.SaveMessage(store.StoredMessage{
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
			ps.NotifyOfflineRecipients(msg.ID, roomID, msg.From, msg.Nickname, msg.Content, msg.MediaType, onlineIDs, msg.Mentions)
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
		history, err = h.GetRoomHistorySince(roomID, clientID, sinceTime, 100)
	} else {
		history, err = h.GetRoomHistoryForUser(roomID, clientID, 50)
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

// GetClient mengambil client berdasarkan sessionKey atau userID.
func (h *Hub) GetClient(id string) (*Client, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if c, ok := h.clients[id]; ok {
		return c, true
	}
	if devs, ok := h.userClients[id]; ok {
		for _, c := range devs {
			return c, true
		}
	}
	return nil, false
}

// notifyClient mengirim pesan ke satu client spesifik.
func (h *Hub) notifyClient(clientID string, msg Message) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	if !ok {
		if devs, devOk := h.userClients[clientID]; devOk {
			for _, devC := range devs {
				c = devC
				ok = true
				break
			}
		}
	}
	h.mu.RUnlock()
	if !ok || c == nil {
		return
	}
	select {
	case c.send <- msg:
	default:
	}
}

// NotifyUser mengirimkan pesan WebSocket langsung ke satu user (seluruh perangkat aktifnya).
func (h *Hub) NotifyUser(userID string, msg Message) {
	h.mu.RLock()
	targets := h.findClientsLocked(userID)
	h.mu.RUnlock()
	for _, c := range targets {
		select {
		case c.send <- msg:
		default:
			log.Printf("[Hub %s] buffer penuh untuk user %s (%s), pesan di-drop", h.nodeID[:8], userID, c.DeviceID)
		}
	}
}

// NotifyUsers mengirimkan pesan WebSocket langsung ke sejumlah target user IDs (seluruh perangkat aktif).
// Juga mem-publish event ke cluster Redis jika broker aktif.
func (h *Hub) NotifyUsers(userIDs []string, msg Message) {
	if len(userIDs) == 0 {
		return
	}

	h.mu.RLock()
	var targets []*Client
	for _, uid := range userIDs {
		targets = append(targets, h.findClientsLocked(uid)...)
	}
	b := h.broker
	h.mu.RUnlock()

	for _, c := range targets {
		select {
		case c.send <- msg:
		default:
			log.Printf("[Hub %s] buffer penuh untuk client %s (%s), notifikasi di-drop", h.nodeID[:8], c.ID, c.DeviceID)
		}
	}

	if b != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		for _, uid := range userIDs {
			event := ClusterEvent{
				NodeID:       h.nodeID,
				RoomID:       msg.Room,
				TargetUserID: uid,
				Message:      msg,
			}
			if payload, err := json.Marshal(event); err == nil {
				_ = b.Publish(ctx, ClusterEventsChannel, payload)
			}
		}
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
// untuk seluruh koneksi milik userID tertentu. Jika exceptDeviceID diisi, hanya menendang perangkat selain device tersebut.
// Selain menendang klien lokal, method ini mem-publish event ke Redis Pub/Sub agar instance lain ikut menendang perangkat target.
func (h *Hub) KickClientByUserID(userID, exceptDeviceID, reason string) {
	if reason == "" {
		reason = "SESSION_REPLACED: Akun Anda dibuka dari perangkat lain."
	}

	// 1. Eksekusi kick pada klien lokal yang terhubung ke instance ini
	h.kickClientByUserIDLocal(userID, exceptDeviceID, reason)

	// 2. Publish ke Redis Pub/Sub agar node instance lain ikut menendang
	h.mu.RLock()
	b := h.broker
	h.mu.RUnlock()

	if b != nil {
		kickEvent := ClusterEvent{
			NodeID:         h.nodeID,
			EventType:      "session_kick",
			TargetUserID:   userID,
			ExceptDeviceID: exceptDeviceID,
			KickReason:     reason,
		}
		if payload, err := json.Marshal(kickEvent); err == nil {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if pubErr := b.Publish(ctx, ClusterEventsChannel, payload); pubErr != nil {
				log.Printf("[Hub %s] gagal publish session_kick ke broker cluster: %v", h.nodeID[:8], pubErr)
			}
		}
	}
}

func (h *Hub) kickClientByUserIDLocal(userID, exceptDeviceID, reason string) {
	h.mu.RLock()
	var targets []*Client
	if devs, ok := h.userClients[userID]; ok {
		for devID, c := range devs {
			if exceptDeviceID != "" && devID == exceptDeviceID {
				continue
			}
			targets = append(targets, c)
		}
	} else if c, ok := h.clients[userID]; ok {
		if exceptDeviceID == "" || c.DeviceID != exceptDeviceID {
			targets = append(targets, c)
		}
	}
	h.mu.RUnlock()

	if len(targets) == 0 {
		return
	}

	if reason == "" {
		reason = "SESSION_REPLACED: Akun Anda dibuka dari perangkat lain."
	}

	for _, client := range targets {
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
}

// KickClientByDeviceID menendang koneksi WebSocket dari device tertentu milik user tertentu.
// Dipanggil saat admin/user melakukan remote logout dari satu perangkat spesifik.
// Selain menendang klien lokal, method ini mem-publish event ke Redis Pub/Sub agar instance lain ikut menendang perangkat target.
func (h *Hub) KickClientByDeviceID(userID, deviceID, reason string) {
	if reason == "" {
		reason = "DEVICE_KICKED: Perangkat ini telah dikeluarkan dari jarak jauh."
	}

	// 1. Eksekusi kick pada klien lokal jika terhubung ke instance ini
	h.kickClientByDeviceIDLocal(userID, deviceID, reason)

	// 2. Publish ke Redis Pub/Sub agar node instance lain ikut menendang
	h.mu.RLock()
	b := h.broker
	h.mu.RUnlock()

	if b != nil {
		kickEvent := ClusterEvent{
			NodeID:       h.nodeID,
			EventType:    "device_kick",
			TargetUserID: userID,
			SenderID:     deviceID, // reuse SenderID untuk menampung deviceID target
			KickReason:   reason,
		}
		if payload, err := json.Marshal(kickEvent); err == nil {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if pubErr := b.Publish(ctx, ClusterEventsChannel, payload); pubErr != nil {
				log.Printf("[Hub %s] gagal publish device_kick ke broker cluster: %v", h.nodeID[:8], pubErr)
			}
		}
	}
}

func (h *Hub) kickClientByDeviceIDLocal(userID, deviceID, reason string) {
	h.mu.RLock()
	var client *Client
	if devs, ok := h.userClients[userID]; ok {
		client = devs[deviceID]
	}
	if client == nil {
		if c, ok := h.clients[userID]; ok && c.DeviceID == deviceID {
			client = c
		}
	}
	h.mu.RUnlock()

	if client == nil {
		return
	}

	if reason == "" {
		reason = "DEVICE_KICKED: Perangkat ini telah dikeluarkan dari jarak jauh."
	}

	log.Printf("[Hub %s] kick by device: user=%s device=%s reason=%s", h.nodeID[:8], userID, deviceID, reason)

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


