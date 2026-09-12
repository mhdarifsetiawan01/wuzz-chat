package ws

import (
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	sendBufferSize = 256
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 65536
)

// Client merepresentasikan satu koneksi WebSocket yang aktif.
type Client struct {
	ID       string
	Nickname string
	RoomID   string
	PeerID   string
	JoinedAt time.Time
	hub      *Hub
	conn     *websocket.Conn
	send     chan Message
}

// NewClient membuat instance Client baru.
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
func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		_, rawBytes, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[Client %s] read error: %v", c.ID, err)
			}
			return
		}

		var msg Message
		if err := json.Unmarshal(rawBytes, &msg); err != nil {
			log.Printf("[Client %s] invalid JSON: %v", c.ID, err)
			c.sendError("Format pesan tidak valid, harus JSON.")
			continue
		}

		msg.From = c.ID
		msg.Timestamp = time.Now().UTC()

		c.handleMessage(msg)
	}
}

// WritePump menulis pesan dari channel send ke WebSocket connection.
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
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteJSON(msg); err != nil {
				log.Printf("[Client %s] write error: %v", c.ID, err)
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("[Client %s] ping gagal, koneksi dianggap mati", c.ID)
				return
			}
		}
	}
}

// handleMessage mendispatch event berdasarkan field Type.
func (c *Client) handleMessage(msg Message) {
	switch msg.Type {
	case TypeJoin:
		c.onJoin(msg)
	case TypeMessage:
		c.onMessage(msg)
	case TypeTyping:
		c.onTyping(msg)
	case TypeReceipt:
		c.onReceipt(msg)
	case TypeLeave:
		c.conn.Close()
	default:
		log.Printf("[Client %s] unknown message type: %s", c.ID, msg.Type)
		c.sendError("Tipe pesan tidak dikenali: " + string(msg.Type))
	}
}

// onJoin memproses event join ke room percakapan.
func (c *Client) onJoin(msg Message) {
	if msg.Nickname != "" {
		c.Nickname = msg.Nickname
	}

	// Tentukan target room: utamakan msg.Room, fallback ke msg.To (backward compatibility), atau generate ID baru
	targetRoom := msg.Room
	if targetRoom == "" && msg.To != "" {
		targetRoom = msg.To
	}
	if targetRoom == "" {
		targetRoom = "room-" + c.ID[:8]
	}

	c.RoomID = targetRoom

	// Gabungkan client ke room di Hub
	c.hub.JoinRoom(c, targetRoom)

	// Balas konfirmasi join ke client
	c.send <- Message{
		Type:      TypeSystem,
		From:      "server",
		To:        c.ID,
		Room:      targetRoom,
		Content:   "Selamat datang, " + c.Nickname + "! ID kamu: " + c.ID,
		Timestamp: time.Now().UTC(),
	}

	// Beritahu anggota lain di room yang sama
	c.hub.BroadcastRoom(targetRoom, Message{
		Type:      TypeSystem,
		From:      "server",
		Room:      targetRoom,
		Content:   c.Nickname + " telah bergabung ke percakapan.",
		Timestamp: time.Now().UTC(),
	}, c.ID)

	// Muat dan kirim riwayat pesan percakapan dari database
	c.hub.sendRoomHistory(c.ID, targetRoom)

	log.Printf("[Client %s] join: nickname=%s room=%s", c.ID, c.Nickname, targetRoom)
}

// onMessage memproses pengiriman pesan chat ke room.
func (c *Client) onMessage(msg Message) {
	targetRoom := msg.Room
	if targetRoom == "" {
		targetRoom = c.RoomID
	}

	if targetRoom == "" {
		c.sendError("Tidak ada tujuan percakapan. Lakukan join ke room dulu.")
		return
	}

	if msg.ID == "" {
		msg.ID = uuid.New().String()
	}
	msg.Status = StatusSent
	msg.Room = targetRoom
	msg.Nickname = c.Nickname

	// Broadcast ke semua anggota lain di room dan simpan ke database
	c.hub.BroadcastRoom(targetRoom, msg, c.ID)

	// Kirim balik konfirmasi receipt status sent ke sender
	select {
	case c.send <- Message{
		ID:        msg.ID,
		Type:      TypeReceipt,
		Room:      targetRoom,
		Status:    StatusSent,
		Timestamp: time.Now().UTC(),
	}:
	default:
	}
}

// onReceipt memproses update status tanda terima pesan (delivered / read).
func (c *Client) onReceipt(msg Message) {
	if msg.ID == "" || msg.Status == "" {
		return
	}
	targetRoom := msg.Room
	if targetRoom == "" {
		targetRoom = c.RoomID
	}
	if targetRoom == "" {
		return
	}

	// Update status di database / memory store
	if err := c.hub.messageStore.UpdateMessageStatus(msg.ID, string(msg.Status)); err != nil {
		log.Printf("[Client %s] gagal update status message %s ke %s: %v", c.ID, msg.ID, msg.Status, err)
	}

	msg.Room = targetRoom
	msg.Type = TypeReceipt
	// Broadcast receipt ke anggota percakapan (terutama sender asli)
	c.hub.BroadcastRoom(targetRoom, msg, c.ID)
}

// onTyping mem-forward indikator typing ke anggota room.
func (c *Client) onTyping(msg Message) {
	targetRoom := msg.Room
	if targetRoom == "" {
		targetRoom = c.RoomID
	}
	if targetRoom == "" {
		return
	}
	msg.Room = targetRoom
	msg.Nickname = c.Nickname
	c.hub.BroadcastRoom(targetRoom, msg, c.ID)
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
	}
}
