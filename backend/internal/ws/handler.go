package ws

import (
	"log"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// upgrader mengkonfigurasi WebSocket upgrader dari gorilla/websocket.
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Handler adalah HTTP handler untuk endpoint WebSocket (/ws).
// Bertanggung jawab untuk:
//  1. Validasi token JWT sebelum upgrade
//  2. Upgrade HTTP ke WebSocket
//  3. Mengikat identitas Client dari claims JWT
//  4. Daftarkan Client ke Hub dan jalankan pump
type Handler struct {
	hub *Hub
}

// NewHandler membuat Handler baru dengan Hub yang di-inject.
func NewHandler(hub *Hub) *Handler {
	return &Handler{hub: hub}
}

// ServeHTTP menangani request WebSocket upgrade dengan autentikasi JWT wajib.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 1. Ekstrak token JWT dari query param '?token=' atau header 'Authorization'
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	if tokenStr == "" {
		http.Error(w, "Unauthorized: token JWT tidak ditemukan", http.StatusUnauthorized)
		return
	}

	// 2. Validasi token JWT
	claims, err := auth.ValidateToken(tokenStr)
	if err != nil {
		http.Error(w, "Unauthorized: token JWT tidak valid atau kadaluarsa", http.StatusUnauthorized)
		return
	}

	// 3. Lakukan upgrade HTTP ke WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Handler] WebSocket upgrade gagal: %v", err)
		return
	}

	// Bind identitas resmi dari claims JWT
	clientID := claims.UserID
	if clientID == "" {
		clientID = uuid.New().String()
	}

	nickname := claims.DisplayName
	if nickname == "" {
		nickname = claims.Username
	}

	client := NewClient(clientID, nickname, conn, h.hub)

	// Daftarkan ke Hub
	h.hub.Register(client)

	// Jalankan writePump di goroutine baru
	go client.WritePump()

	// readPump berjalan di goroutine ini (blocking sampai koneksi putus)
	client.ReadPump()
}

