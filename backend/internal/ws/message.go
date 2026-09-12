package ws

import "time"

// MessageType mendefinisikan tipe event yang didukung pada protokol WebSocket.
type MessageType string

const (
	TypeJoin      MessageType = "join"       // client pertama kali connect, kirim nickname & room
	TypeMessage   MessageType = "message"    // pesan chat biasa
	TypeTyping    MessageType = "typing"     // indikator sedang mengetik
	TypeReceipt   MessageType = "receipt"    // tanda terima pesan (sent, delivered, read)
	TypeReaction  MessageType = "reaction"   // reaksi emoji terhadap pesan
	TypeLeave     MessageType = "leave"      // client disconnect
	TypeSystem    MessageType = "system"     // pesan sistem dari server ke client
	TypeHistory   MessageType = "history"    // riwayat pesan percakapan dari database
	TypeRoomUsers MessageType = "room_users" // daftar user yang sedang aktif di room
)

// MessageStatus merepresentasikan status tanda terima pesan
type MessageStatus string

const (
	StatusPending   MessageStatus = "pending"
	StatusSent      MessageStatus = "sent"
	StatusDelivered MessageStatus = "delivered"
	StatusRead      MessageStatus = "read"
)

// ReplyTarget merepresentasikan konteks pesan yang dikutip/dibalas
type ReplyTarget struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
	Content  string `json:"content"`
}

// ReactionItem merepresentasikan satu jenis emoji dan daftar user yang bereaksi
type ReactionItem struct {
	Emoji string   `json:"emoji"`
	Users []string `json:"users"`
	Count int      `json:"count"`
}

// ReactionPayload adalah payload saat client mengirim event TypeReaction
type ReactionPayload struct {
	MessageID string `json:"message_id"`
	Emoji     string `json:"emoji"`
}

// RoomUser merepresentasikan informasi singkat member di dalam room
type RoomUser struct {
	ID          string `json:"id"`
	Username    string `json:"username,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
	Nickname    string `json:"nickname"`
}

// Message adalah struktur JSON yang dipertukarkan antara client dan server.
type Message struct {
	ID        string           `json:"id,omitempty"`        // UUID unik pesan
	Type      MessageType      `json:"type"`
	From      string           `json:"from,omitempty"`      // ClientID pengirim
	To        string           `json:"to,omitempty"`        // ClientID tujuan (opsional jika unicast)
	Room      string           `json:"room,omitempty"`      // Room ID / Conversation ID (persisten)
	Nickname  string           `json:"nickname,omitempty"`  // Nickname pengirim
	Content   string           `json:"content,omitempty"`   // Isi pesan
	Timestamp time.Time        `json:"timestamp,omitempty"` // Timestamp server
	Status    MessageStatus    `json:"status,omitempty"`    // "pending", "sent", "delivered", "read"
	ReplyTo   *ReplyTarget     `json:"reply_to,omitempty"`  // Konteks pesan yang dikutip (opsional)
	Reactions []ReactionItem   `json:"reactions,omitempty"` // Reaksi emoji terhadap pesan ini
	Reaction  *ReactionPayload `json:"reaction,omitempty"`  // Data reaksi (digunakan saat type = 'reaction')
	MediaURL  string           `json:"media_url,omitempty"`  // URL file media (lokal atau cloud CDN)
	MediaType string           `json:"media_type,omitempty"` // 'image', 'document', 'audio', 'video'
	FileName  string           `json:"file_name,omitempty"`  // Nama asli berkas (misal: laporan.pdf)
	FileSize  int64            `json:"file_size,omitempty"`  // Ukuran berkas dalam bytes
	Messages  []Message        `json:"messages,omitempty"`  // Kumpulan pesan untuk TypeHistory
	Users     []RoomUser       `json:"users,omitempty"`     // Daftar user aktif di room
}
