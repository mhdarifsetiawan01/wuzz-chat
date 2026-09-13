package ws

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/broker"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
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
	nodeID       string
	clients      map[string]*Client            // clientID -> *Client
	rooms        map[string]map[string]*Client // roomID -> (clientID -> *Client)
	mu           sync.RWMutex
	clientStore  store.ClientStore
	messageStore store.MessageStore
	userStore    store.UserStore
	broker       broker.MessageBroker
}

// NewHub membuat Hub baru dengan dependency yang disuntikkan.
func NewHub(cs store.ClientStore, ms store.MessageStore) *Hub {
	return &Hub{
		nodeID:       uuid.New().String(),
		clients:      make(map[string]*Client),
		rooms:        make(map[string]map[string]*Client),
		clientStore:  cs,
		messageStore: ms,
	}
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
	h.clients[c.ID] = c
	h.mu.Unlock()

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

// broadcastLocal mengirimkan pesan hanya ke klien yang terhubung secara fisik di instance Hub ini.
func (h *Hub) broadcastLocal(roomID string, msg Message, senderID string) {
	h.mu.RLock()
	room, roomExists := h.rooms[roomID]
	targetMap := make(map[*Client]bool)
	if roomExists {
		for id, client := range room {
			if id != senderID {
				targetMap[client] = true
			}
		}
	}

	// Jika ada userStore, kirim juga ke seluruh klien lokal terhubung yang merupakan anggota percakapan ini
	if h.userStore != nil && roomID != "" {
		if memberNames, err := h.userStore.GetConversationMemberUsernames(roomID); err == nil && len(memberNames) > 0 {
			memberSet := make(map[string]bool)
			for _, name := range memberNames {
				if name != "" {
					memberSet[strings.ToLower(name)] = true
				}
			}
			for id, client := range h.clients {
				if id != senderID && (memberSet[strings.ToLower(client.Nickname)] || memberSet[strings.ToLower(client.ID)]) {
					targetMap[client] = true
				}
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
			Timestamp:       msg.Timestamp,
		})
		if err != nil {
			log.Printf("[Hub %s] gagal menyimpan pesan ke database: %v", h.nodeID[:8], err)
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
func (h *Hub) sendRoomHistory(clientID, roomID string) {
	history, err := h.messageStore.GetRoomHistory(roomID, 50)
	if err != nil {
		log.Printf("[Hub %s] gagal mengambil history untuk room %s: %v", h.nodeID[:8], roomID, err)
		return
	}

	if len(history) == 0 {
		return
	}

	var msgs []Message
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

		msgs = append(msgs, Message{
			ID:          m.ID,
			Type:        TypeMessage,
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

