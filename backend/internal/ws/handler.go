package ws

import (
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// upgrader mengkonfigurasi WebSocket upgrader dari gorilla/websocket.
//
// CheckOrigin: untuk development, kita terima semua origin.
// PENTING: Di production, ganti ini dengan validasi origin yang ketat
// (cek r.Header.Get("Origin") == "https://your-domain.com").
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// TODO (fase 2/production): validasi origin
		return true
	},
}

// Handler adalah HTTP handler untuk endpoint WebSocket (/ws).
// Bertanggung jawab untuk:
//  1. Upgrade HTTP ke WebSocket
//  2. Generate ClientID
//  3. Buat Client baru dan register ke Hub
//  4. Jalankan goroutine readPump + writePump
type Handler struct {
	hub *Hub
}

// NewHandler membuat Handler baru dengan Hub yang di-inject.
func NewHandler(hub *Hub) *Handler {
	return &Handler{hub: hub}
}

// ServeHTTP menangani request WebSocket upgrade.
// Setelah upgrade berhasil, goroutine readPump dan writePump dijalankan.
//
// Kenapa writePump di goroutine tapi readPump di goroutine yang sama dengan ServeHTTP?
// Karena ServeHTTP sudah berjalan di goroutine milik HTTP server.
// Kita manfaatkan goroutine itu untuk readPump (blocking loop),
// lalu spawn satu goroutine baru untuk writePump.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Handler] WebSocket upgrade gagal: %v", err)
		return // gorilla sudah tulis error response ke w
	}

	// Generate ClientID di sisi server (tidak dari client)
	clientID := uuid.New().String()

	// Buat client dengan nickname kosong dulu; akan diupdate saat event "join" diterima
	client := NewClient(clientID, "anon-"+clientID[:8], conn, h.hub)

	// Daftarkan ke Hub
	h.hub.Register(client)

	// Jalankan writePump di goroutine baru
	go client.WritePump()

	// readPump berjalan di goroutine ini (blocking sampai koneksi putus)
	client.ReadPump()
}
