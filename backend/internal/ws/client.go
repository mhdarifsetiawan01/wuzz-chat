package ws

import (
	"encoding/json"
	"log"
	"strings"
	"sync"
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
	DeviceID    string
	RoomID      string
	PeerID      string
	JoinedAt    time.Time
	hub         *Hub
	conn        *websocket.Conn
	send        chan Message

	// Rate Limiter per koneksi client (Anti-flood)
	rateMu        sync.Mutex
	msgTimestamps []time.Time
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
	case TypeCallOffer, TypeCallAnswer, TypeIceCandidate, TypeCallReject, TypeCallEnd, TypeCallBusy:
		c.onCallSignaling(msg)
	case TypeLeave:
		c.conn.Close()
	default:
		log.Printf("[Client %s] unknown message type: %s", c.ID, msg.Type)
		c.sendError("Tipe pesan tidak dikenali: " + string(msg.Type))
	}
}

// onJoin memproses event join ke room percakapan.
func (c *Client) onJoin(msg Message) {
	// Kunci anti-spoofing: Jangan izinkan client menimpa Nickname yang sudah sah dari JWT
	if c.Nickname == "" && msg.Nickname != "" {
		c.Nickname = strings.TrimSpace(msg.Nickname)
	}

	// Tentukan target room: utamakan msg.Room, fallback ke msg.To (backward compatibility), atau generate ID baru
	targetRoom := msg.Room
	if targetRoom == "" && msg.To != "" {
		targetRoom = msg.To
	}
	if targetRoom == "" {
		targetRoom = "room-" + safePrefix(c.ID, 8)
	}

	// Validasi Hak Akses Room (BOLA Prevention)
	if !c.isAuthorizedForRoom(targetRoom) {
		c.sendError("Akses ditolak: Anda bukan anggota percakapan ini")
		return
	}

	c.RoomID = targetRoom

	// Gabungkan client ke room di Hub (otomatis mem-broadcast TypeRoomUsers untuk presence)
	c.hub.JoinRoom(c, targetRoom)

	// 1. Tandai seluruh pesan tertunda untuk user ini sebagai 'delivered' (centang 2 abu-abu)
	// Selalu gunakan c.ID (UUID) — tidak pernah fallback ke Nickname
	userIdent := c.ID
	deliveredRooms, _ := c.hub.messageStore.MarkUserMessagesAsDelivered(userIdent)
	for _, rID := range deliveredRooms {
		if rID != targetRoom && c.isAuthorizedForRoom(rID) {
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
		_ = c.hub.messageStore.MarkRoomMessagesAsRead(targetRoom, userIdent)

		c.hub.BroadcastRoom(targetRoom, Message{
			Type:      TypeReceipt,
			Room:      targetRoom,
			Status:    StatusRead,
			Timestamp: time.Now().UTC(),
		}, c.ID)

		// Muat dan kirim riwayat pesan percakapan dari database (mendukung delta sync jika msg.Since ada)
		c.hub.sendRoomHistory(c.ID, targetRoom, msg.Since)
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
		c.sendAck(msg.RequestID, "error", "Tidak ada tujuan percakapan")
		return
	}

	// Validasi Hak Akses Room Pengirim (BOLA Prevention)
	if !c.isAuthorizedForRoom(targetRoom) {
		c.sendError("Akses ditolak: Anda bukan anggota percakapan ini")
		c.sendAck(msg.RequestID, "error", "Akses ditolak")
		return
	}

	// Fail-Closed Write Gate: Cegah pengiriman pesan ke subgrup yang telah kedaluwarsa
	if c.hub.userStore != nil && c.hub.userStore.IsConversationExpired(targetRoom) {
		c.sendError("Subgrup ini telah kedaluwarsa dan terkunci. Pesan tidak dapat dikirim.")
		c.sendAck(msg.RequestID, "error", "Subgrup telah kedaluwarsa")
		return
	}

	// Rate Limiting Pengiriman Pesan: Maksimal 10 pesan per 2 detik per koneksi (Anti-Flood)
	if !c.allowRateLimit(10, 2*time.Second) {
		c.sendError("Anda mengirim pesan terlalu cepat. Harap tunggu sebentar.")
		c.sendAck(msg.RequestID, "error", "Rate limit exceeded")
		return
	}

	// Validasi Konten Pesan: Harus memiliki teks ATAU berkas media terlampir
	content := strings.TrimSpace(msg.Content)
	if content == "" && msg.MediaURL == "" {
		c.sendError("Isi pesan atau lampiran media tidak boleh kosong")
		c.sendAck(msg.RequestID, "error", "Konten kosong")
		return
	}
	if len([]rune(content)) > 5000 {
		c.sendError("Pesan terlalu panjang (maksimal 5.000 karakter)")
		c.sendAck(msg.RequestID, "error", "Pesan terlalu panjang")
		return
	}
	msg.Content = content

	// Sanitasi Reply Target preview jika ada
	if msg.ReplyTo != nil && len([]rune(msg.ReplyTo.Content)) > 500 {
		msg.ReplyTo.Content = string([]rune(msg.ReplyTo.Content)[:500]) + "..."
	}

	if msg.ID == "" {
		msg.ID = uuid.New().String()
	}

	// Server-Side Idempotency Guard (DEC-015):
	// Jika pesan dengan ID ini sudah pernah diproses dalam 2 menit terakhir (misal karena resend client reconnect),
	// abaikan broadcast dan save DB, tetapi tetap kirim balik ACK / receipt agar client menghentikan pengiriman ulang.
	if c.hub.IsDuplicateAndRecord(msg.ID, 2*time.Minute) {
		log.Printf("[Client %s] Pesan duplikat terdeteksi (id: %s), melewati broadcast", c.ID, msg.ID)
		if msg.RequestID != "" {
			c.sendAck(msg.RequestID, "ok", "")
		}
		select {
		case c.send <- Message{
			ID:        msg.ID,
			RequestID: msg.RequestID,
			Type:      TypeReceipt,
			Room:      targetRoom,
			Status:    StatusSent,
			Timestamp: time.Now().UTC(),
		}:
		default:
		}
		return
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
	if !isPeerOnline {
		members := c.hub.getRoomMembers(targetRoom)
		for _, name := range members {
			if name != "" && !strings.EqualFold(name, c.Nickname) && name != c.ID {
				if peerClient, found := c.hub.findClientLocked(name); found && peerClient.ID != c.ID {
					isPeerOnline = true
					break
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
	msg.From = c.ID
	msg.Nickname = c.Nickname

	// Broadcast ke semua anggota lain di room dan simpan ke database
	c.hub.BroadcastRoom(targetRoom, msg, c.ID)

	// Kirim balik konfirmasi receipt awal (sent atau delivered) ke sender
	select {
	case c.send <- Message{
		ID:        msg.ID,
		RequestID: msg.RequestID,
		Type:      TypeReceipt,
		Room:      targetRoom,
		Status:    initialStatus,
		Timestamp: time.Now().UTC(),
	}:
	default:
	}

	// Kirim balik paket transport ACK jika request_id disertakan oleh klien
	if msg.RequestID != "" {
		c.sendAck(msg.RequestID, "ok", "")
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

	// Validasi Hak Akses Room (BOLA Prevention)
	if !c.isAuthorizedForRoom(targetRoom) {
		c.sendError("Akses ditolak: Anda bukan anggota percakapan ini")
		return
	}

	if msg.ID != "" {
		// Update status single message di database / memory store
		if err := c.hub.messageStore.UpdateMessageStatus(msg.ID, string(msg.Status)); err != nil {
			log.Printf("[Client %s] gagal update status message %s ke %s: %v", c.ID, msg.ID, msg.Status, err)
		}
	} else if msg.Status == StatusRead {
		// Bulk update status read untuk seluruh pesan di room ini
		// Selalu gunakan c.ID (UUID) — tidak pernah fallback ke Nickname
		userIdent := c.ID
		_ = c.hub.messageStore.MarkRoomMessagesAsRead(targetRoom, userIdent)
	}

	msg.Room = targetRoom
	msg.Type = TypeReceipt
	// Broadcast receipt ke anggota percakapan (terutama sender asli)
	c.hub.BroadcastRoom(targetRoom, msg, c.ID)
}

// onTyping mem-forward indikator typing ke anggota room.
func (c *Client) onTyping(msg Message) {
	// Rate Limiting Typing: Maksimal 3 event typing per 2 detik per koneksi (Anti-Flood)
	if !c.allowRateLimit(3, 2*time.Second) {
		return
	}

	targetRoom := msg.Room
	if targetRoom == "" {
		targetRoom = c.RoomID
	}
	if targetRoom == "" {
		return
	}

	// Validasi Hak Akses Room (BOLA Prevention)
	if !c.isAuthorizedForRoom(targetRoom) {
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

	emoji := strings.TrimSpace(msg.Reaction.Emoji)
	if emoji == "" || len([]rune(emoji)) > 16 {
		c.sendError("Reaksi emoji tidak valid")
		return
	}
	msg.Reaction.Emoji = emoji
	targetRoom := msg.Room
	if targetRoom == "" {
		targetRoom = c.RoomID
	}
	if targetRoom == "" {
		return
	}

	// Validasi Hak Akses Room (BOLA Prevention)
	if !c.isAuthorizedForRoom(targetRoom) {
		c.sendError("Akses ditolak: Anda bukan anggota percakapan ini")
		return
	}

	// Toggle reaksi di database / memory store
	// Gunakan c.ID (UUID) agar reaksi tetap valid meskipun user mengganti display_name
	reactionsJSON, err := c.hub.messageStore.ToggleReaction(msg.Reaction.MessageID, msg.Reaction.Emoji, c.ID)
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

// onCallSignaling memproses pesan sinyal WebRTC (offer, answer, candidate, reject, end, busy)
// dan langsung mem-forward ke anggota room selain pengirim tanpa menyimpan ke database.
func (c *Client) onCallSignaling(msg Message) {
	targetRoom := msg.Room
	if targetRoom == "" {
		targetRoom = c.RoomID
	}
	if targetRoom == "" {
		return
	}

	// Validasi Hak Akses Room (BOLA Prevention)
	if !c.isAuthorizedForRoom(targetRoom) {
		c.sendError("Akses ditolak: Anda bukan anggota percakapan ini")
		return
	}

	msg.Room = targetRoom
	msg.From = c.ID
	msg.Nickname = c.Nickname
	msg.Timestamp = time.Now().UTC()

	// Broadcast pesan sinyal WebRTC ke seluruh peer di room selain pengirim
	c.hub.BroadcastRoom(targetRoom, msg, c.ID)
}

// isAuthorizedForRoom memeriksa apakah user saat ini merupakan anggota sah dari percakapan roomID.
func (c *Client) isAuthorizedForRoom(roomID string) bool {
	if c.hub.userStore == nil || roomID == "" {
		return true
	}
	allowed, err := c.hub.userStore.IsUserInConversation(roomID, c.ID)
	if err != nil {
		log.Printf("[Security] Gagal validasi keanggotaan room %s untuk user %s: %v (Fail-Closed: ditolak)", roomID, c.ID, err)
		return false
	}
	if !allowed {
		log.Printf("[Security] Akses ditolak: User %s (%s) bukan anggota room %s", c.ID, c.Nickname, roomID)
		return false
	}
	return true
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

// sendAck mengirimkan konfirmasi transport level (TypeAck) kembali ke client ini.
func (c *Client) sendAck(requestID string, status string, errMsg string) {
	if requestID == "" {
		return
	}
	ackMsg := Message{
		RequestID: requestID,
		Type:      TypeAck,
		Room:      c.RoomID,
		Status:    MessageStatus(status),
		Timestamp: time.Now().UTC(),
	}
	if errMsg != "" {
		ackMsg.Content = errMsg
	}
	select {
	case c.send <- ackMsg:
	default:
	}
}

// allowRateLimit memeriksa apakah pengiriman pesan client memenuhi kuota sliding window rate limit.
func (c *Client) allowRateLimit(limit int, window time.Duration) bool {
	c.rateMu.Lock()
	defer c.rateMu.Unlock()

	now := time.Now()
	var recent []time.Time
	for _, t := range c.msgTimestamps {
		if now.Sub(t) <= window {
			recent = append(recent, t)
		}
	}

	if len(recent) >= limit {
		c.msgTimestamps = recent
		return false
	}

	recent = append(recent, now)
	c.msgTimestamps = recent
	return true
}

// safePrefix mengembalikan substring awal secara aman tanpa memicu panic jika panjang s < maxLen.
func safePrefix(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen])
}


