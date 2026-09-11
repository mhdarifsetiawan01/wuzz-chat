package ws

import (
	"log"
	"sync"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
)

// Hub adalah pusat kendali: menyimpan semua client aktif dan room,
// serta bertanggung jawab merutingkan pesan dan broadcast ke room.
type Hub struct {
	clients      map[string]*Client            // clientID -> *Client
	rooms        map[string]map[string]*Client // roomID -> (clientID -> *Client)
	mu           sync.RWMutex
	clientStore  store.ClientStore
	messageStore store.MessageStore
}

// NewHub membuat Hub baru dengan dependency yang disuntikkan.
func NewHub(cs store.ClientStore, ms store.MessageStore) *Hub {
	return &Hub{
		clients:      make(map[string]*Client),
		rooms:        make(map[string]map[string]*Client),
		clientStore:  cs,
		messageStore: ms,
	}
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

	log.Printf("[Hub] client terdaftar: id=%s nickname=%s | total=%d", c.ID, c.Nickname, h.count())
}

// JoinRoom mendaftarkan client ke dalam room tertentu.
func (h *Hub) JoinRoom(c *Client, roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Jika client sebelumnya ada di room lain, bersihkan dulu
	if c.RoomID != "" && c.RoomID != roomID {
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

	log.Printf("[Hub] client %s (%s) bergabung ke room '%s' | member room=%d", c.ID, c.Nickname, roomID, len(h.rooms[roomID]))
}

// Unregister menghapus client dari registry dan room-nya.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	_, exists := h.clients[c.ID]
	if exists {
		delete(h.clients, c.ID)
		close(c.send)
	}

	// Hapus dari room
	if c.RoomID != "" {
		if room, ok := h.rooms[c.RoomID]; ok {
			delete(room, c.ID)
			if len(room) == 0 {
				delete(h.rooms, c.RoomID)
			}
		}
	}
	h.mu.Unlock()

	if !exists {
		return
	}

	if err := h.clientStore.Delete(c.ID); err != nil {
		log.Printf("[Hub] gagal hapus client %s dari store: %v", c.ID, err)
	}

	log.Printf("[Hub] client keluar: id=%s nickname=%s | sisa=%d", c.ID, c.Nickname, h.count())

	// Beritahu anggota lain di room
	if c.RoomID != "" {
		h.BroadcastRoom(c.RoomID, Message{
			Type:      TypeLeave,
			From:      c.ID,
			Nickname:  c.Nickname,
			Room:      c.RoomID,
			Content:   c.Nickname + " telah meninggalkan percakapan",
			Timestamp: time.Now().UTC(),
		}, c.ID)
	}
}

// BroadcastRoom mengirimkan pesan ke seluruh anggota room (kecuali senderID).
// Jika tipe pesan adalah TypeMessage, pesan akan disimpan secara persisten ke Database.
func (h *Hub) BroadcastRoom(roomID string, msg Message, senderID string) {
	h.mu.RLock()
	room, roomExists := h.rooms[roomID]
	var targets []*Client
	if roomExists {
		for id, client := range room {
			if id != senderID {
				targets = append(targets, client)
			}
		}
	}
	h.mu.RUnlock()

	// Kirim pesan ke semua penerima
	for _, target := range targets {
		select {
		case target.send <- msg:
		default:
			log.Printf("[Hub] buffer penuh untuk client %s di room %s, pesan di-drop", target.ID, roomID)
		}
	}

	// Simpan ke database jika tipe pesan chat biasa
	if msg.Type == TypeMessage {
		if msg.ID == "" {
			msg.ID = uuid.New().String()
		}

		err := h.messageStore.Save(store.StoredMessage{
			ID:        msg.ID,
			RoomID:    roomID,
			FromID:    msg.From,
			Nickname:  msg.Nickname,
			ToID:      msg.To,
			Content:   msg.Content,
			Timestamp: msg.Timestamp,
		})
		if err != nil {
			log.Printf("[Hub] gagal menyimpan pesan ke database: %v", err)
		}
	}
}

// sendRoomHistory mengambil riwayat pesan dari database dan mengirimkannya ke client spesifik.
func (h *Hub) sendRoomHistory(clientID, roomID string) {
	history, err := h.messageStore.GetRoomHistory(roomID, 50)
	if err != nil {
		log.Printf("[Hub] gagal mengambil history untuk room %s: %v", roomID, err)
		return
	}

	if len(history) == 0 {
		return
	}

	var msgs []Message
	for _, m := range history {
		msgs = append(msgs, Message{
			ID:        m.ID,
			Type:      TypeMessage,
			From:      m.FromID,
			To:        m.ToID,
			Room:      m.RoomID,
			Nickname:  m.Nickname,
			Content:   m.Content,
			Timestamp: m.Timestamp,
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
