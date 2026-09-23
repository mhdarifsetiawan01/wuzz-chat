package ws

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

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
	deviceStore   store.DeviceStore
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

// SetDeviceStore menyuntikkan store.DeviceStore untuk update last_seen_at saat WebSocket connect.
func (h *Handler) SetDeviceStore(deviceStore store.DeviceStore) {
	h.deviceStore = deviceStore
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

	// 3. Validasi Otoritas Device ID (Level 2 Multi-Session Gatekeeper)
	deviceID := strings.TrimSpace(r.URL.Query().Get("device_id"))
	if deviceID == "" {
		deviceID = strings.TrimSpace(r.Header.Get("X-Device-ID"))
	}

	if h.deviceStore != nil {
		if deviceID != "" {
			// Periksa status perangkat di database
			targetDev, err := h.deviceStore.GetDeviceByID(deviceID)
			if err == nil && targetDev != nil {
				if !targetDev.IsActive {
					log.Printf("[Handler] Tolak koneksi WebSocket user %s: device '%s' telah dinonaktifkan", claims.UserID, deviceID)
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					_ = json.NewEncoder(w).Encode(map[string]string{
						"error":   "DEVICE_DEACTIVATED",
						"code":    "DEVICE_KICKED",
						"message": "Perangkat ini telah dikeluarkan dari akun Anda.",
					})
					return
				}
			} else if targetDev == nil {
				// Perangkat belum terdaftar di tabel devices (misal sesi lama sebelum migrasi)
				// Daftarkan sebagai perangkat aktif secara otomatis
				newDev := &store.Device{
					ID:        deviceID,
					UserID:    claims.UserID,
					Name:      parseDeviceName(r.UserAgent()),
					Platform:  "web",
					UserAgent: r.UserAgent(),
					IPAddress: getClientIP(r),
					IsActive:  true,
					CreatedAt: time.Now().UTC(),
				}
				if err := h.deviceStore.RegisterOrUpdateDevice(newDev); err != nil {
					log.Printf("[Handler] Auto-register device baru saat WS handshake gagal (user: %s, device: %s): %v", claims.UserID, deviceID, err)
				}
			}

			// Sinkronkan active_device_id di userStore jika kosong atau menunjuk ke perangkat yang sudah dinonaktifkan
			if h.userStore != nil {
				_, _, activeDev, err := h.userStore.GetE2EEInfo(claims.UserID)
				if err == nil {
					if activeDev == "" {
						_ = h.userStore.SetActiveDevice(claims.UserID, deviceID)
					} else if activeDev != deviceID {
						actDevObj, _ := h.deviceStore.GetDeviceByID(activeDev)
						if actDevObj == nil || !actDevObj.IsActive {
							_ = h.userStore.SetActiveDevice(claims.UserID, deviceID)
						}
					}
				}
			}
		}
	} else if h.userStore != nil {
		// Fallback ke active_device_id single device HANYA jika deviceStore tidak digunakan sama sekali
		_, _, activeDev, err := h.userStore.GetE2EEInfo(claims.UserID)
		if err == nil && activeDev != "" {
			if deviceID != activeDev || deviceID == "" {
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

	// Update last_seen_at device secara non-blocking
	if h.deviceStore != nil && deviceID != "" {
		go func() {
			if err := h.deviceStore.TouchDevice(deviceID); err != nil {
				log.Printf("[Handler] TouchDevice gagal (device: %s): %v", deviceID, err)
			}
		}()
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
	if deviceID != "" {
		client.SessionKey = fmt.Sprintf("%s:%s", clientID, deviceID)
	} else {
		client.SessionKey = clientID
	}

	// Daftarkan ke Hub
	h.hub.Register(client)

	// Jalankan writePump di goroutine baru
	go client.WritePump()

	// readPump berjalan di goroutine ini (blocking sampai koneksi putus)
	client.ReadPump()
}

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	return r.RemoteAddr
}

func parseDeviceName(ua string) string {
	if ua == "" {
		return "Web Client"
	}
	uaLower := strings.ToLower(ua)
	os := "Web"
	switch {
	case strings.Contains(uaLower, "android"):
		os = "Android"
	case strings.Contains(uaLower, "iphone") || strings.Contains(uaLower, "ipad"):
		os = "iOS"
	case strings.Contains(uaLower, "windows"):
		os = "Windows"
	case strings.Contains(uaLower, "macintosh") || strings.Contains(uaLower, "mac os"):
		os = "macOS"
	case strings.Contains(uaLower, "linux"):
		os = "Linux"
	}

	browser := "Browser"
	switch {
	case strings.Contains(uaLower, "edg/"):
		browser = "Edge"
	case strings.Contains(uaLower, "chrome/") || strings.Contains(uaLower, "crios/"):
		browser = "Chrome"
	case strings.Contains(uaLower, "firefox/") || strings.Contains(uaLower, "fxios/"):
		browser = "Firefox"
	case strings.Contains(uaLower, "safari/") && !strings.Contains(uaLower, "chrome"):
		browser = "Safari"
	}

	return fmt.Sprintf("%s on %s", browser, os)
}

