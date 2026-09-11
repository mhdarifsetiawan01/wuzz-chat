package ws

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Ukuran buffer channel send per client.
	// 256 pesan cukup untuk fase 1; jika penuh, Hub akan drop pesan (non-blocking send).
	sendBufferSize = 256

	// Timeout untuk write ke WebSocket connection.
	// Jika klien tidak bisa menerima dalam 10 detik, koneksi ditutup.
	writeWait = 10 * time.Second

	// Timeout untuk menerima pong dari klien (heartbeat).
	// Jika dalam 60 detik tidak ada pong, koneksi dianggap mati.
	pongWait = 60 * time.Second

	// Seberapa sering server mengirim ping ke klien.
	// Harus lebih pendek dari pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Ukuran maksimum pesan yang diterima dari klien (64 KB).
	maxMessageSize = 65536
)

// Client merepresentasikan satu koneksi WebSocket yang aktif.
//
// Setiap Client punya dua goroutine:
//   - readPump: baca pesan dari browser → kirim ke Hub
//   - writePump: terima pesan dari Hub (via channel send) → tulis ke browser
//
// Pemisahan ini penting: gorilla/websocket tidak thread-safe untuk concurrent read+write
// dari goroutine yang berbeda. Dengan pola ini, read dan write selalu dari goroutine yang berbeda
// tapi masing-masing hanya ada SATU goroutine yang membaca dan SATU yang menulis.
type Client struct {
	// ID unik client, di-generate server (UUID v4)
	ID string

	// Nickname yang dikirim client saat event "join"
	Nickname string

	// PeerID adalah ID lawan chat (1-on-1, fase 1)
	PeerID string

	// JoinedAt diset saat client berhasil register
	JoinedAt time.Time

	// hub adalah referensi ke Hub, digunakan oleh readPump untuk routing
	hub *Hub

	// conn adalah koneksi WebSocket dari gorilla/websocket
	conn *websocket.Conn

	// send adalah channel buffer untuk pesan yang akan ditulis ke browser.
	// Hub menulis ke sini; writePump membaca dari sini.
	// Menggunakan channel daripada mutex-protected write karena gorilla tidak thread-safe.
	send chan Message
}

// NewClient membuat instance Client baru.
// Dipanggil oleh handler setelah WebSocket upgrade berhasil.
func NewClient(id, nickname string, conn *websocket.Conn, hub *Hub) *Client {
	return &Client{
		ID:       id,
		Nickname: nickname,
		JoinedAt: time.Now().UTC(),
		hub:      hub,
		conn:     conn,
		send:     make(chan Message, sendBufferSize),
	}
}

// ReadPump membaca pesan dari WebSocket connection dan memprosesnya.
// Berjalan di goroutine tersendiri per client.
//
// Lifecycle: goroutine ini hidup selama koneksi aktif.
// Saat koneksi putus (atau error), goroutine memanggil hub.Unregister lalu return.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	// Konfigurasi limit dan timeout baca
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		// Setiap kali terima pong, perpanjang deadline baca
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		_, rawBytes, err := c.conn.ReadMessage()
		if err != nil {
			// Error bisa karena: koneksi ditutup klien, timeout, atau network issue
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Client %s] read error: %v", c.ID, err)
			}
			return // keluar loop → defer memanggil Unregister
		}

		var msg Message
		if err := json.Unmarshal(rawBytes, &msg); err != nil {
			log.Printf("[Client %s] invalid JSON: %v", c.ID, err)
			// Kirim error ke klien tapi jangan putus koneksi
			c.sendError("Format pesan tidak valid, harus JSON.")
			continue
		}

		// Set metadata yang harus dikontrol oleh server (bukan dipercayai dari klien)
		msg.From = c.ID
		msg.Timestamp = time.Now().UTC()

		c.handleMessage(msg)
	}
}

// WritePump menulis pesan dari channel send ke WebSocket connection.
// Berjalan di goroutine tersendiri per client.
//
// Juga mengirimkan ping secara berkala untuk mendeteksi koneksi yang mati.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Channel send ditutup oleh Hub.Unregister → tutup koneksi WebSocket
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteJSON(msg); err != nil {
				log.Printf("[Client %s] write error: %v", c.ID, err)
				return
			}

		case <-ticker.C:
			// Kirim ping untuk mendeteksi koneksi mati
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("[Client %s] ping gagal, koneksi dianggap mati", c.ID)
				return
			}
		}
	}
}

// ----------------------------------------------------------------
// Event handlers (dipanggil oleh ReadPump)
// ----------------------------------------------------------------

// handleMessage mendispatch event berdasarkan field Type.
func (c *Client) handleMessage(msg Message) {
	switch msg.Type {
	case TypeJoin:
		c.onJoin(msg)
	case TypeMessage:
		c.onMessage(msg)
	case TypeTyping:
		c.onTyping(msg)
	case TypeLeave:
		// Client secara eksplisit minta disconnect
		// ReadPump akan memanggil Unregister via defer saat conn.Close()
		c.conn.Close()
	default:
		log.Printf("[Client %s] unknown message type: %s", c.ID, msg.Type)
		c.sendError("Tipe pesan tidak dikenali: " + string(msg.Type))
	}
}

// onJoin memproses event join.
// Client mengirim nickname; server membalas dengan info sesi (clientID, dll).
// Jika client menyertakan field "to" (peerID yang ingin dichat), Hub langsung set pairing.
func (c *Client) onJoin(msg Message) {
	// Update nickname jika dikirim ulang (reconect scenario)
	if msg.Nickname != "" {
		c.Nickname = msg.Nickname
	}

	// Balas ke pengirim dengan konfirmasi + info sesi
	c.send <- Message{
		Type:      TypeSystem,
		From:      "server",
		To:        c.ID,
		Content:   "Selamat datang, " + c.Nickname + "! ID kamu: " + c.ID,
		Timestamp: time.Now().UTC(),
	}

	// Jika client menentukan peer yang ingin dichat, set pairing di Hub
	if msg.To != "" {
		_, peerExists := c.hub.GetClient(msg.To)
		if !peerExists {
			c.sendError("Peer dengan ID " + msg.To + " tidak ditemukan. Tunggu mereka connect dulu.")
			return
		}
		c.hub.SetPeer(c.ID, msg.To)

		// Beritahu peer bahwa lawan chatnya sudah join
		c.hub.Route(Message{
			Type:      TypeSystem,
			From:      "server",
			To:        msg.To,
			Content:   c.Nickname + " telah bergabung ke percakapan.",
			Timestamp: time.Now().UTC(),
		})
	}

	log.Printf("[Client %s] join: nickname=%s peer=%s", c.ID, c.Nickname, c.PeerID)
}

// onMessage memproses event message.
// Jika field "to" kosong, gunakan PeerID yang sudah di-set saat join.
func (c *Client) onMessage(msg Message) {
	target := msg.To
	if target == "" {
		target = c.PeerID
	}

	if target == "" {
		c.sendError("Tidak ada tujuan pesan. Lakukan join dengan peer dulu.")
		return
	}

	msg.To = target
	c.hub.Route(msg)
}

// onTyping mem-forward indikator typing ke peer.
func (c *Client) onTyping(msg Message) {
	target := msg.To
	if target == "" {
		target = c.PeerID
	}
	if target == "" {
		return
	}
	msg.To = target
	c.hub.Route(msg)
}

// sendError mengirimkan pesan error sistem ke client ini sendiri.
func (c *Client) sendError(errMsg string) {
	select {
	case c.send <- Message{
		Type:      TypeSystem,
		From:      "server",
		Content:   "ERROR: " + errMsg,
		Timestamp: time.Now().UTC(),
	}:
	default:
		// Buffer penuh, skip
	}
}

// ServeHTTP tidak diimplementasikan di sini; lihat handler.go.
// Pemisahan concern: Client = state + I/O loop, Handler = upgrade + wiring.
