package ws

import "time"

// MessageType mendefinisikan tipe event yang didukung pada protokol WebSocket.
type MessageType string

const (
	TypeJoin      MessageType = "join"       // client pertama kali connect, kirim nickname & room
	TypeMessage   MessageType = "message"    // pesan chat biasa
	TypeTyping    MessageType = "typing"     // indikator sedang mengetik
	TypeLeave     MessageType = "leave"      // client disconnect
	TypeSystem    MessageType = "system"     // pesan sistem dari server ke client
	TypeHistory   MessageType = "history"    // riwayat pesan percakapan dari database
	TypeRoomUsers MessageType = "room_users" // daftar user yang sedang aktif di room
)

// RoomUser merepresentasikan informasi singkat member di dalam room
type RoomUser struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
}

// Message adalah struktur JSON yang dipertukarkan antara client dan server.
type Message struct {
	ID        string      `json:"id,omitempty"`        // UUID unik pesan
	Type      MessageType `json:"type"`
	From      string      `json:"from,omitempty"`      // ClientID pengirim
	To        string      `json:"to,omitempty"`        // ClientID tujuan (opsional jika unicast)
	Room      string      `json:"room,omitempty"`      // Room ID / Conversation ID (persisten)
	Nickname  string      `json:"nickname,omitempty"`  // Nickname pengirim
	Content   string      `json:"content,omitempty"`   // Isi pesan
	Timestamp time.Time   `json:"timestamp,omitempty"` // Timestamp server
	Messages  []Message   `json:"messages,omitempty"`  // Kumpulan pesan untuk TypeHistory
	Users     []RoomUser  `json:"users,omitempty"`     // Daftar user aktif di room
}
