package ws

import "time"

// MessageType mendefinisikan tipe event yang didukung pada protokol fase 1.
// Desain pakai string constant (bukan iota int) supaya JSON payload tetap human-readable
// dan mudah di-debug via wscat/Postman tanpa perlu lookup enum.
type MessageType string

const (
	TypeJoin    MessageType = "join"    // client pertama kali connect, kirim nickname
	TypeMessage MessageType = "message" // pesan chat biasa
	TypeTyping  MessageType = "typing"  // indikator sedang mengetik (opsional fase 1)
	TypeLeave   MessageType = "leave"   // client disconnect

	// TypeSystem: pesan dari server ke client (tidak dikirim oleh client).
	// Digunakan untuk konfirmasi join, error, dll.
	TypeSystem MessageType = "system"
)

// Message adalah struktur JSON yang dipertukarkan antara client dan server.
// Field "to" kosong berarti broadcast / server-generated message.
//
// Alasan semua field pointer-free dan pakai nilai langsung:
// kita sudah define omitempty di tag json supaya field kosong tidak muncul di payload.
type Message struct {
	Type      MessageType `json:"type"`
	From      string      `json:"from,omitempty"`      // ClientID pengirim
	To        string      `json:"to,omitempty"`        // ClientID tujuan (unicast)
	Nickname  string      `json:"nickname,omitempty"`  // hanya pada event "join"
	Content   string      `json:"content,omitempty"`   // isi pesan
	Timestamp time.Time   `json:"timestamp,omitempty"` // di-set oleh server
}
