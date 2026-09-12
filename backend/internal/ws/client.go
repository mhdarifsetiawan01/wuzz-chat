package ws

import (
	"encoding/json"
	"log"
	"strings"
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
	ID          string
	Username    string
	DisplayName string
	Nickname    string
	RoomID      string
	PeerID      string
	JoinedAt    time.Time
	hub         *Hub
	conn        *websocket.Conn
	send        chan Message
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
	case TypeReaction:
		c.onReaction(msg)
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

	// Gabungkan client ke room di Hub (otomatis mem-broadcast TypeRoomUsers untuk presence)
	c.hub.JoinRoom(c, targetRoom)

	// 1. Tandai seluruh pesan tertunda untuk user ini sebagai 'delivered' (centang 2 abu-abu)
	deliveredRooms, _ := c.hub.messageStore.MarkUserMessagesAsDelivered(c.Nickname)
	for _, rID := range deliveredRooms {
		if rID != targetRoom {
			c.hub.BroadcastRoom(rID, Message{
				Type:      TypeReceipt,
				Room:      rID,
				Status:    StatusDelivered,
				Timestamp: time.Now().UTC(),
			}, c.ID)
		}
	}

	// 2. Jika user membuka room percakapan tertentu, tandai pesan di room tersebut sebagai 'read' (centang 2 biru)
	if targetRoom != "" {
		_ = c.hub.messageStore.MarkRoomMessagesAsRead(targetRoom, c.Nickname)

		c.hub.BroadcastRoom(targetRoom, Message{
			Type:      TypeReceipt,
			Room:      targetRoom,
			Status:    StatusRead,
			Timestamp: time.Now().UTC(),
		}, c.ID)

		// Muat dan kirim riwayat pesan percakapan dari database
		c.hub.sendRoomHistory(c.ID, targetRoom)
	}

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

	// Cek apakah lawan bicara sedang online di Hub
	isPeerOnline := false
	c.hub.mu.RLock()
	if room, ok := c.hub.rooms[targetRoom]; ok {
		for id := range room {
			if id != c.ID {
				isPeerOnline = true
				break
			}
		}
	}
	if !isPeerOnline && c.hub.userStore != nil {
		if memberNames, err := c.hub.userStore.GetConversationMemberUsernames(targetRoom); err == nil {
			for _, name := range memberNames {
				if name != "" && !strings.EqualFold(name, c.Nickname) {
					for _, client := range c.hub.clients {
						if strings.EqualFold(client.Nickname, name) || client.ID == name {
							isPeerOnline = true
							break
						}
					}
				}
			}
		}
	}
	c.hub.mu.RUnlock()

	initialStatus := StatusSent
	if isPeerOnline {
		initialStatus = StatusDelivered
	}
	msg.Status = initialStatus
	msg.Room = targetRoom
	msg.Nickname = c.Nickname

	// Broadcast ke semua anggota lain di room dan simpan ke database
	c.hub.BroadcastRoom(targetRoom, msg, c.ID)

	// Kirim balik konfirmasi receipt awal (sent atau delivered) ke sender
	select {
	case c.send <- Message{
		ID:        msg.ID,
		Type:      TypeReceipt,
		Room:      targetRoom,
		Status:    initialStatus,
		Timestamp: time.Now().UTC(),
	}:
	default:
	}
}

// onReceipt memproses update status tanda terima pesan (delivered / read).
func (c *Client) onReceipt(msg Message) {
	if msg.Status == "" {
		return
	}
	targetRoom := msg.Room
	if targetRoom == "" {
		targetRoom = c.RoomID
	}
	if targetRoom == "" {
		return
	}

	if msg.ID != "" {
		// Update status single message di database / memory store
		if err := c.hub.messageStore.UpdateMessageStatus(msg.ID, string(msg.Status)); err != nil {
			log.Printf("[Client %s] gagal update status message %s ke %s: %v", c.ID, msg.ID, msg.Status, err)
		}
	} else if msg.Status == StatusRead {
		// Bulk update status read untuk seluruh pesan di room ini
		_ = c.hub.messageStore.MarkRoomMessagesAsRead(targetRoom, c.Nickname)
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

// onReaction memproses penambahan atau penghapusan reaksi emoji pada suatu pesan.
func (c *Client) onReaction(msg Message) {
	if msg.Reaction == nil || msg.Reaction.MessageID == "" || msg.Reaction.Emoji == "" {
		return
	}
	targetRoom := msg.Room
	if targetRoom == "" {
		targetRoom = c.RoomID
	}
	if targetRoom == "" {
		return
	}

	// Toggle reaksi di database / memory store
	reactionsJSON, err := c.hub.messageStore.ToggleReaction(msg.Reaction.MessageID, msg.Reaction.Emoji, c.Nickname)
	if err != nil {
		log.Printf("[Client %s] gagal toggle reaction: %v", c.ID, err)
		return
	}

	var reactions []ReactionItem
	_ = json.Unmarshal([]byte(reactionsJSON), &reactions)

	// Broadcast update reaksi ke seluruh anggota room (termasuk pengirim reaksi)
	msg.Room = targetRoom
	msg.Type = TypeReaction
	msg.Nickname = c.Nickname
	msg.From = c.ID
	msg.Reactions = reactions
	msg.ID = msg.Reaction.MessageID
	c.hub.BroadcastRoom(targetRoom, msg, "")
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
