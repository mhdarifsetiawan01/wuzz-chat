package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// Handler adalah HTTP handler untuk endpoint WebSocket (/ws).
// Bertanggung jawab untuk:
//  1. Validasi origin handshake WebSocket via CORSValidator
//  2. Validasi token JWT sebelum upgrade
//  3. Validasi Otoritas Device ID terhadap active_device_id di database
//  4. Upgrade HTTP ke WebSocket
//  5. Mengikat identitas Client dari claims JWT
//  6. Daftarkan Client ke Hub dan jalankan pump
type Handler struct {
	hub           *Hub
	userStore     store.UserStore
	corsValidator *auth.CORSValidator
	upgrader      websocket.Upgrader
}

// NewHandler membuat Handler baru dengan Hub dan CORSValidator opsional.
func NewHandler(hub *Hub, cv ...*auth.CORSValidator) *Handler {
	var validator *auth.CORSValidator
	if len(cv) > 0 && cv[0] != nil {
		validator = cv[0]
	} else {
		validator = auth.NewCORSValidatorFromEnv()
	}

	return &Handler{
		hub:           hub,
		corsValidator: validator,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin:     validator.CheckWebSocketOrigin,
		},
	}
}

// SetUserStore menyuntikkan store.UserStore untuk validasi kepemilikan perangkat saat handshake.
func (h *Handler) SetUserStore(userStore store.UserStore) {
	h.userStore = userStore
}

// ServeHTTP menangani request WebSocket upgrade dengan autentikasi JWT & validasi device_id wajib.
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

	// 3. Validasi Otoritas Device ID (Single Active Device Gatekeeper)
	deviceID := strings.TrimSpace(r.URL.Query().Get("device_id"))
	if deviceID == "" {
		deviceID = strings.TrimSpace(r.Header.Get("X-Device-ID"))
	}
	if h.userStore != nil {
		_, _, activeDev, err := h.userStore.GetE2EEInfo(claims.UserID)
		if err == nil && activeDev != "" {
			// Jika user memiliki perangkat aktif yang sah di server, tolak jika device_id tidak cocok atau kosong
			if deviceID != activeDev {
				log.Printf("[Handler] Tolak koneksi WebSocket user %s: device_id '%s' tidak cocok dengan active_device_id '%s'", claims.UserID, deviceID, activeDev)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error":   "DEVICE_MISMATCH",
					"code":    "SESSION_REPLACED",
					"message": "Akun Anda sedang aktif di perangkat lain.",
				})
				return
			}
		}
	}

	// 4. Lakukan upgrade HTTP ke WebSocket
	conn, err := h.upgrader.Upgrade(w, r, nil)
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
	client.Username = claims.Username
	client.DisplayName = claims.DisplayName
	client.DeviceID = deviceID

	// Daftarkan ke Hub
	h.hub.Register(client)

	// Jalankan writePump di goroutine baru
	go client.WritePump()

	// readPump berjalan di goroutine ini (blocking sampai koneksi putus)
	client.ReadPump()
}

