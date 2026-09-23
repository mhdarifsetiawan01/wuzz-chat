package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// DeviceHandler mengelola endpoint manajemen perangkat terdaftar.
type DeviceHandler struct {
	deviceStore  store.DeviceStore
	sessionStore store.SessionStore
	userStore    store.UserStore
	hub          WebSocketHub
}

// NewDeviceHandler membuat instance DeviceHandler baru.
func NewDeviceHandler(ds store.DeviceStore) *DeviceHandler {
	return &DeviceHandler{deviceStore: ds}
}

// SetUserStore menyuntikkan UserStore untuk sinkronisasi active_device_id.
func (h *DeviceHandler) SetUserStore(us store.UserStore) {
	h.userStore = us
}

// SetSessionStore menyuntikkan SessionStore (opsional, untuk revoke session saat kick).
func (h *DeviceHandler) SetSessionStore(ss store.SessionStore) {
	h.sessionStore = ss
}

// SetHub menyuntikkan WebSocketHub untuk kick koneksi WS saat remote logout.
func (h *DeviceHandler) SetHub(hub WebSocketHub) {
	h.hub = hub
}

// ListDevices menangani GET /api/auth/devices
// Response: array of Device (hanya perangkat is_active = true milik user yang request)
func (h *DeviceHandler) ListDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	devices, err := h.deviceStore.GetUserDevices(claims.UserID)
	if err != nil {
		log.Printf("❌ ListDevices gagal (user: %s): %v", claims.UserID, err)
		http.Error(w, `{"error":"Gagal mengambil daftar perangkat"}`, http.StatusInternalServerError)
		return
	}

	if devices == nil {
		devices = []store.Device{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(devices)
}

// RemoveDevice menangani DELETE /api/auth/devices/{id}
// Melakukan: deactivate device di DB + kick WebSocket koneksi (jika online)
func (h *DeviceHandler) RemoveDevice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Ambil device ID dari path: /api/auth/devices/{id}
	deviceID := strings.TrimPrefix(r.URL.Path, "/api/auth/devices/")
	deviceID = strings.TrimSpace(deviceID)
	if deviceID == "" {
		http.Error(w, `{"error":"Device ID tidak boleh kosong"}`, http.StatusBadRequest)
		return
	}

	// Cegah user logout dari device SAAT INI via API ini
	currentDeviceID := strings.TrimSpace(r.Header.Get("X-Device-ID"))
	if currentDeviceID != "" && deviceID == currentDeviceID {
		http.Error(w, `{"error":"Gunakan endpoint logout untuk keluar dari perangkat ini"}`, http.StatusBadRequest)
		return
	}

	// 1. Nonaktifkan device di database (guard: userID harus cocok)
	if err := h.deviceStore.DeactivateDevice(deviceID, claims.UserID); err != nil {
		log.Printf("❌ RemoveDevice deactivate gagal (user: %s, device: %s): %v", claims.UserID, deviceID, err)
		http.Error(w, `{"error":"Device tidak ditemukan atau bukan milik Anda"}`, http.StatusNotFound)
		return
	}

	// 2. Revoke sesi token JWT untuk device yang dikeluarkan jika sessionStore tersedia
	if h.sessionStore != nil {
		if err := h.sessionStore.RevokeDeviceSessions(deviceID, claims.UserID); err != nil {
			log.Printf("⚠️ RemoveDevice revoke sessions gagal (user: %s, device: %s): %v", claims.UserID, deviceID, err)
		}
	}

	// 3. Sinkronkan users.active_device_id agar tidak mengarah ke device yang sudah dinonaktifkan
	if h.userStore != nil {
		_, _, activeDev, err := h.userStore.GetE2EEInfo(claims.UserID)
		if err == nil && (activeDev == deviceID || activeDev == "") {
			if currentDeviceID != "" {
				_ = h.userStore.SetActiveDevice(claims.UserID, currentDeviceID)
			} else {
				_ = h.userStore.ClearActiveDevice(claims.UserID, deviceID)
			}
		}
	}

	// 4. Pastikan device pemanggil (currentDeviceID) terdaftar aktif di deviceStore
	if h.deviceStore != nil && currentDeviceID != "" {
		callerDev, _ := h.deviceStore.GetDeviceByID(currentDeviceID)
		if callerDev == nil {
			_ = h.deviceStore.RegisterOrUpdateDevice(&store.Device{
				ID:        currentDeviceID,
				UserID:    claims.UserID,
				Name:      parseDeviceName(r.UserAgent()),
				Platform:  "web",
				UserAgent: r.UserAgent(),
				IPAddress: getClientIP(r),
				IsActive:  true,
				CreatedAt: time.Now().UTC(),
			})
		}
	}

	// 5. Kick WebSocket koneksi device tersebut (jika sedang online)
	if h.hub != nil {
		h.hub.KickClientByDeviceID(claims.UserID, deviceID, "DEVICE_KICKED: Perangkat dikeluarkan dari jarak jauh.")
	}

	log.Printf("✅ RemoveDevice berhasil (user: %s, device: %s)", claims.UserID, deviceID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Perangkat berhasil dikeluarkan"})
}
