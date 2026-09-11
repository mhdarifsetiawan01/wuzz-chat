package ws

import (
	"log"
	"sync"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// Hub adalah pusat kendali: menyimpan semua client aktif dan
// bertanggung jawab merutingkan pesan dari satu client ke client lain.
//
// Desain: mutex-protected map (bukan channel-based hub).
// Alasan: lebih mudah dibaca dan di-extend ke Redis di fase 2.
// Goroutine per-client tetap ada (di readPump/writePump pada client.go).
type Hub struct {
	// clients menyimpan semua koneksi aktif: clientID → *Client
	clients map[string]*Client

	// mu melindungi map clients dari concurrent access.
	// RWMutex dipilih karena operasi Route (baca) lebih sering dari Register/Unregister (tulis).
	mu sync.RWMutex

	// clientStore untuk persist metadata client (in-memory di fase 1)
	clientStore store.ClientStore

	// messageStore untuk persist pesan (no-op di fase 1)
	messageStore store.MessageStore
}

// NewHub membuat Hub baru dengan dependency yang disuntikkan.
// Pola dependency injection ini memudahkan fase 2/3: cukup ganti argumen store-nya.
func NewHub(cs store.ClientStore, ms store.MessageStore) *Hub {
	return &Hub{
		clients:      make(map[string]*Client),
		clientStore:  cs,
		messageStore: ms,
	}
}

// Register menambahkan client baru ke registry.
// Dipanggil oleh handler setelah WebSocket handshake berhasil.
func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	h.clients[c.ID] = c
	h.mu.Unlock()

	// Persist ke store (no-op di fase 1, Redis di fase 2)
	if err := h.clientStore.Set(store.ClientRecord{
		ID:       c.ID,
		Nickname: c.Nickname,
		JoinedAt: c.JoinedAt,
	}); err != nil {
		log.Printf("[Hub] gagal persist client %s: %v", c.ID, err)
	}

	log.Printf("[Hub] client terdaftar: id=%s nickname=%s | total=%d", c.ID, c.Nickname, h.count())
}

// Unregister menghapus client dari registry dan memberi tahu peer-nya (jika ada).
// Dipanggil oleh readPump saat koneksi ditutup.
func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	_, exists := h.clients[c.ID]
	if exists {
		delete(h.clients, c.ID)
		close(c.send) // sinyal ke writePump agar goroutine-nya selesai
	}
	h.mu.Unlock()

	if !exists {
		return
	}

	// Hapus dari store
	if err := h.clientStore.Delete(c.ID); err != nil {
		log.Printf("[Hub] gagal hapus client %s dari store: %v", c.ID, err)
	}

	log.Printf("[Hub] client keluar: id=%s nickname=%s | sisa=%d", c.ID, c.Nickname, h.count())

	// Beritahu peer bahwa lawan chatnya sudah disconnect
	if c.PeerID != "" {
		h.notifyPeer(c.PeerID, Message{
			Type:    TypeLeave,
			From:    c.ID,
			Content: c.Nickname + " telah meninggalkan percakapan",
		})
	}
}

// Route mengirimkan pesan ke client tujuan (unicast).
// Jika client tujuan tidak ditemukan, pesan di-drop dan pengirim diberi tahu.
func (h *Hub) Route(msg Message) {
	h.mu.RLock()
	target, ok := h.clients[msg.To]
	h.mu.RUnlock()

	if !ok {
		log.Printf("[Hub] target tidak ditemukan: to=%s from=%s", msg.To, msg.From)
		// Beritahu pengirim bahwa peer tidak online
		h.notifyClient(msg.From, Message{
			Type:    TypeSystem,
			Content: "Lawan chat kamu tidak ditemukan atau sudah offline.",
		})
		return
	}

	// Non-blocking send: jika channel send penuh (buffer overflow), drop pesan.
	// Ini melindungi Hub dari blocking karena client yang lambat.
	select {
	case target.send <- msg:
	default:
		log.Printf("[Hub] buffer penuh untuk client %s, pesan di-drop", msg.To)
	}

	// Persist pesan (no-op di fase 1)
	_ = h.messageStore.Save(store.StoredMessage{
		From:      msg.From,
		To:        msg.To,
		Content:   msg.Content,
		Timestamp: msg.Timestamp,
	})
}

// SetPeer menghubungkan dua client sebagai pasangan chat (1-on-1).
// Fase 1: dipanggil manual oleh handler saat client join dengan PeerID tertentu.
// Fase 3: diganti dengan Room struct yang mendukung banyak peserta.
func (h *Hub) SetPeer(clientID, peerID string) {
	h.mu.Lock()
	if c, ok := h.clients[clientID]; ok {
		c.PeerID = peerID
	}
	if p, ok := h.clients[peerID]; ok {
		p.PeerID = clientID
	}
	h.mu.Unlock()

	log.Printf("[Hub] pairing: %s ↔ %s", clientID, peerID)
}

// GetClient mengambil client berdasarkan ID (untuk kebutuhan handler).
func (h *Hub) GetClient(id string) (*Client, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	c, ok := h.clients[id]
	return c, ok
}

// ----------------------------------------------------------------
// helper (unexported)
// ----------------------------------------------------------------

// notifyClient mengirim pesan sistem ke satu client spesifik.
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

// notifyPeer adalah alias semantik yang jelas untuk notifyClient.
func (h *Hub) notifyPeer(peerID string, msg Message) {
	h.notifyClient(peerID, msg)
}

// count mengembalikan jumlah client aktif (harus dipanggil di luar lock atau di dalam lock sesuai konteks).
func (h *Hub) count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
