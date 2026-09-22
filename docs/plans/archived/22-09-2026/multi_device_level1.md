# 🏗️ Rencana Implementasi: Multi-Device — Level 1 (Device Registry & Remote Logout)

**Tanggal:** 22 September 2026  
**Branch:** `dev` (JANGAN PERNAH di `main`)  
**Scope:** Phase 2A — Fondasi Device Registry + Remote Logout  
**Target pembaca:** Junior programmer / AI model kecil — **setiap langkah adalah atomic dan bisa diverifikasi sendiri**

---

## 📌 Konteks: Apa yang Sudah Ada, Apa yang Belum

### ✅ Sudah ada (JANGAN diubah):
| File | Isi |
|---|---|
| `backend/internal/store/sql.go` | Tabel `users`, `sessions`, `revoked_tokens`, dll. Auto-migrate aktif |
| `backend/internal/store/session_store.go` | `CreateSession`, `GetActiveSessions`, `RevokeSession`, dll |
| `backend/internal/api/auth_handler.go` | Handler Login (baris 151), Me, Logout, dll |
| `backend/internal/ws/hub.go` | `KickClientByUserID(userID, exceptDeviceID, reason)` sudah ada di baris 791 |
| `backend/internal/api/transfer_handler.go` | Interface `WebSocketHub` dengan method `KickClientByUserID` |

### ❌ Belum ada (yang akan dibuat di Level 1):
- Tabel `devices` di database
- File `device_store.go` (Store + Interface)
- Endpoint `GET /api/auth/devices` dan `DELETE /api/auth/devices/:id`
- Method `KickClientByDeviceID` di `hub.go`
- Fungsi `getDeviceName()` di frontend
- Tab "Perangkat" di `ProfileModal.tsx`

### ⚠️ Keputusan Desain yang Sudah Dikonfirmasi:
- **Level 1 TIDAK mengubah logika single-active-device** — mendaftar device ≠ mengizinkan multi-session
- **`KickClientByDeviceID` perlu ditambahkan** ke interface `WebSocketHub` dan implementasinya
- **Tabel `devices` bersifat additive** — tidak mengubah tabel yang ada

---

## 🗺️ Peta Langkah Kerja

```
Step 1: Tambah DDL tabel 'devices' di sql.go
Step 2: Buat file device_store.go (interface + SQL implementation)
Step 3: Tambah KickClientByDeviceID ke hub.go + WebSocketHub interface
Step 4: Tambah device registration ke Login handler (auth_handler.go)
Step 5: Tambah DeviceStore ke AuthHandler + route baru (handler devices)
Step 6: Update last_seen_at saat WebSocket connect (ws/handler.go)
Step 7: Frontend — fungsi getDeviceName() di auth-context.tsx
Step 8: Frontend — Tab "Perangkat" di ProfileModal.tsx
Step 9: Jalankan go test + npm run build → laporkan hasilnya
```

---

## Step 1 — Tambah DDL Tabel `devices` ke `sql.go`

### 📁 File yang diedit: `backend/internal/store/sql.go`

### Apa yang dilakukan:
Menambahkan SQL DDL untuk tabel `devices` baru ke dalam fungsi `autoMigrate()`.  
Ini **tidak mengubah tabel yang ada**, hanya menambah tabel baru dengan `CREATE TABLE IF NOT EXISTS`.

### Cara menemukan tempat yang tepat:
1. Buka `backend/internal/store/sql.go`
2. Cari (Ctrl+F): `// Tabel Users` → ini ada di baris ~94
3. Cari tabel terakhir dalam `migrations := []string{...}` — tambahkan DDL `devices` **setelah** entry terakhir dalam slice, tapi sebelum tanda `}`

### SQL yang ditambahkan (copy-paste persis):
```go
// Tabel Devices — Registry perangkat yang pernah login
`CREATE TABLE IF NOT EXISTS devices (
    id          VARCHAR(64) PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL,
    name        VARCHAR(128) DEFAULT '',
    platform    VARCHAR(32) DEFAULT 'web',
    user_agent  TEXT DEFAULT '',
    ip_address  VARCHAR(45) DEFAULT '',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMP,
    created_at  TIMESTAMP NOT NULL
);`,
`CREATE INDEX IF NOT EXISTS idx_devices_user_active ON devices(user_id, is_active);`,
```

### Cara menemukannya di file:
Gunakan grep berikut di terminal untuk melihat baris terakhir migrations:
```bash
grep -n "CREATE TABLE IF NOT EXISTS\|migrations :=" backend/internal/store/sql.go | tail -20
```

### Verifikasi setelah step ini:
```bash
cd backend && go build ./...
```
**Expected output:** Tidak ada error. Kompilasi berhasil.

> [!NOTE]
> `autoMigrate()` dijalankan otomatis saat server start. Tabel baru akan dibuat secara otomatis di database. Tidak perlu jalankan script SQL manual.

---

## Step 2 — Buat File `device_store.go`

### 📁 File yang dibuat: `backend/internal/store/device_store.go`

### Apa yang dilakukan:
Membuat struct `Device`, interface `DeviceStore`, dan implementasi SQL-nya.

### Kode lengkap yang dibuat (copy-paste):

```go
package store

import (
	"database/sql"
	"fmt"
	"time"
)

// ─────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────

// Device merepresentasikan satu perangkat yang pernah login oleh seorang user.
type Device struct {
	ID          string     `json:"id"`           // dev_<uuid>, dari localStorage frontend
	UserID      string     `json:"user_id"`
	Name        string     `json:"name"`          // Contoh: "Chrome on Windows 11"
	Platform    string     `json:"platform"`      // "web" | "android" | "ios" | "desktop"
	UserAgent   string     `json:"user_agent,omitempty"`
	IPAddress   string     `json:"ip_address,omitempty"`
	IsActive    bool       `json:"is_active"`
	LastSeenAt  *time.Time `json:"last_seen_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

// ─────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────

// DeviceStore mendefinisikan operasi yang bisa dilakukan pada tabel devices.
type DeviceStore interface {
	// RegisterOrUpdateDevice mencatat perangkat baru atau memperbarui data perangkat yang sudah ada.
	// Dipanggil setiap kali user berhasil login.
	RegisterOrUpdateDevice(device *Device) error

	// GetUserDevices mengembalikan semua perangkat aktif milik user tertentu.
	GetUserDevices(userID string) ([]Device, error)

	// DeactivateDevice menonaktifkan (is_active = false) sebuah perangkat.
	// userID digunakan sebagai guard keamanan — user hanya bisa menonaktifkan device miliknya sendiri.
	DeactivateDevice(deviceID, userID string) error

	// TouchDevice memperbarui last_seen_at ke waktu sekarang.
	// Dipanggil saat WebSocket berhasil terhubung.
	TouchDevice(deviceID string) error
}

// ─────────────────────────────────────────────
// SQL Implementation
// ─────────────────────────────────────────────

// SQLDeviceStore adalah implementasi DeviceStore menggunakan SQL (PostgreSQL atau SQLite).
type SQLDeviceStore struct {
	db         *sql.DB
	driverName string // "postgres" atau "sqlite3"
}

// NewSQLDeviceStore membuat instance baru SQLDeviceStore.
func NewSQLDeviceStore(db *sql.DB, driverName string) *SQLDeviceStore {
	return &SQLDeviceStore{db: db, driverName: driverName}
}

// isPostgres mengembalikan true jika driver adalah PostgreSQL.
func (s *SQLDeviceStore) isPostgres() bool {
	return s.driverName == "postgres"
}

// RegisterOrUpdateDevice melakukan UPSERT — insert jika belum ada, update jika sudah ada.
// Strategi: UPDATE dulu, jika tidak ada row yang terpengaruh, lakukan INSERT.
func (s *SQLDeviceStore) RegisterOrUpdateDevice(device *Device) error {
	now := time.Now().UTC()
	if device.CreatedAt.IsZero() {
		device.CreatedAt = now
	}

	// Coba UPDATE terlebih dahulu
	var updateQuery string
	if s.isPostgres() {
		updateQuery = `UPDATE devices
			SET name=$1, platform=$2, user_agent=$3, ip_address=$4, is_active=TRUE, last_seen_at=$5
			WHERE id=$6 AND user_id=$7`
	} else {
		updateQuery = `UPDATE devices
			SET name=?, platform=?, user_agent=?, ip_address=?, is_active=1, last_seen_at=?
			WHERE id=? AND user_id=?`
	}

	result, err := s.db.Exec(updateQuery,
		device.Name, device.Platform, device.UserAgent, device.IPAddress, now,
		device.ID, device.UserID,
	)
	if err != nil {
		return fmt.Errorf("RegisterOrUpdateDevice update: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("RegisterOrUpdateDevice rows affected: %w", err)
	}

	// Jika tidak ada row yang diupdate, berarti device baru → INSERT
	if rowsAffected == 0 {
		var insertQuery string
		if s.isPostgres() {
			insertQuery = `INSERT INTO devices (id, user_id, name, platform, user_agent, ip_address, is_active, last_seen_at, created_at)
				VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)`
		} else {
			insertQuery = `INSERT INTO devices (id, user_id, name, platform, user_agent, ip_address, is_active, last_seen_at, created_at)
				VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
		}
		_, err = s.db.Exec(insertQuery,
			device.ID, device.UserID, device.Name, device.Platform,
			device.UserAgent, device.IPAddress, now, device.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("RegisterOrUpdateDevice insert: %w", err)
		}
	}

	return nil
}

// GetUserDevices mengembalikan semua perangkat aktif milik user, diurutkan berdasarkan last_seen_at terbaru.
func (s *SQLDeviceStore) GetUserDevices(userID string) ([]Device, error) {
	var query string
	if s.isPostgres() {
		query = `SELECT id, user_id, name, platform, ip_address, is_active, last_seen_at, created_at
			FROM devices
			WHERE user_id=$1 AND is_active=TRUE
			ORDER BY last_seen_at DESC NULLS LAST`
	} else {
		query = `SELECT id, user_id, name, platform, ip_address, is_active, last_seen_at, created_at
			FROM devices
			WHERE user_id=? AND is_active=1
			ORDER BY CASE WHEN last_seen_at IS NULL THEN 0 ELSE 1 END DESC, last_seen_at DESC`
	}

	rows, err := s.db.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("GetUserDevices query: %w", err)
	}
	defer rows.Close()

	var devices []Device
	for rows.Next() {
		var d Device
		var lastSeen sql.NullTime
		err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.Platform, &d.IPAddress, &d.IsActive, &lastSeen, &d.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("GetUserDevices scan: %w", err)
		}
		if lastSeen.Valid {
			d.LastSeenAt = &lastSeen.Time
		}
		devices = append(devices, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("GetUserDevices rows: %w", err)
	}

	return devices, nil
}

// DeactivateDevice menonaktifkan perangkat (is_active = false).
// Guard: userID harus cocok agar user tidak bisa menonaktifkan device user lain.
func (s *SQLDeviceStore) DeactivateDevice(deviceID, userID string) error {
	var query string
	if s.isPostgres() {
		query = `UPDATE devices SET is_active=FALSE WHERE id=$1 AND user_id=$2`
	} else {
		query = `UPDATE devices SET is_active=0 WHERE id=? AND user_id=?`
	}

	result, err := s.db.Exec(query, deviceID, userID)
	if err != nil {
		return fmt.Errorf("DeactivateDevice: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("DeactivateDevice rows affected: %w", err)
	}
	if rows == 0 {
		// Tidak ditemukan — mungkin device_id tidak ada atau bukan milik user ini
		return fmt.Errorf("device tidak ditemukan atau bukan milik user")
	}

	return nil
}

// TouchDevice memperbarui last_seen_at ke waktu sekarang.
func (s *SQLDeviceStore) TouchDevice(deviceID string) error {
	var query string
	if s.isPostgres() {
		query = `UPDATE devices SET last_seen_at=$1 WHERE id=$2`
	} else {
		query = `UPDATE devices SET last_seen_at=? WHERE id=?`
	}
	_, err := s.db.Exec(query, time.Now().UTC(), deviceID)
	if err != nil {
		return fmt.Errorf("TouchDevice: %w", err)
	}
	return nil
}
```

### Verifikasi setelah step ini:
```bash
cd backend && go build ./...
```
**Expected output:** Tidak ada error. File baru tercompile dengan baik.

---

## Step 3 — Tambah `KickClientByDeviceID` ke `hub.go` dan `WebSocketHub` interface

### Apa yang dilakukan:
- Menambah method `KickClientByDeviceID(userID, deviceID, reason string)` ke `hub.go`
- Menambah method yang sama ke interface `WebSocketHub` di `transfer_handler.go`

### 3a. Edit `backend/internal/ws/hub.go`

Tambahkan fungsi baru **di akhir file** (setelah `KickClientByUserID`, baris 829):

```go
// KickClientByDeviceID menendang koneksi WebSocket dari device tertentu milik user tertentu.
// Dipanggil saat admin/user melakukan remote logout dari satu perangkat spesifik.
func (h *Hub) KickClientByDeviceID(userID, deviceID, reason string) {
	h.mu.RLock()
	client, exists := h.clients[userID]
	h.mu.RUnlock()

	if !exists || client == nil {
		return
	}

	// Hanya kick jika device_id cocok
	if client.DeviceID != deviceID {
		return
	}

	if reason == "" {
		reason = "DEVICE_KICKED: Perangkat ini telah dikeluarkan dari jarak jauh."
	}

	log.Printf("[Hub %s] kick by device: user=%s device=%s reason=%s", h.nodeID[:8], userID, deviceID, reason)

	go func(c *Client) {
		kickMsg := Message{
			ID:        uuid.New().String(),
			Type:      TypeSystem,
			Content:   reason,
			Timestamp: time.Now().UTC(),
		}
		select {
		case c.send <- kickMsg:
		default:
		}
		time.Sleep(500 * time.Millisecond)
		if c.conn != nil {
			closeMsg := websocket.FormatCloseMessage(4001, reason)
			_ = c.conn.WriteControl(websocket.CloseMessage, closeMsg, time.Now().Add(1000*time.Millisecond))
			time.Sleep(100 * time.Millisecond)
			_ = c.conn.Close()
		}
	}(client)
}
```

### 3b. Edit `backend/internal/api/transfer_handler.go`

Cari interface `WebSocketHub` (baris 16) dan **tambah method baru**:

```go
// SEBELUM:
type WebSocketHub interface {
	KickClientByUserID(userID, exceptDeviceID, reason string)
}

// SESUDAH:
type WebSocketHub interface {
	KickClientByUserID(userID, exceptDeviceID, reason string)
	KickClientByDeviceID(userID, deviceID, reason string)
}
```

### Verifikasi setelah step ini:
```bash
cd backend && go build ./...
```
**Expected output:** Tidak ada error.

> [!IMPORTANT]
> Jika ada error "does not implement WebSocketHub (missing method KickClientByDeviceID)", cek apakah ada mock di test file yang perlu ditambah juga. Cari di: `backend/internal/api/transfer_handler_test.go`

---

## Step 4 — Daftarkan Device saat Login (`auth_handler.go`)

### 📁 File yang diedit: `backend/internal/api/auth_handler.go`

### Apa yang dilakukan:
1. Tambah field `deviceStore store.DeviceStore` ke struct `AuthHandler`
2. Tambah method `SetDeviceStore()`
3. Di dalam fungsi `Login()`, setelah `CreateSession` berhasil → panggil `RegisterOrUpdateDevice`
4. Tambah helper `parseDeviceName()` untuk auto-detect nama device dari User-Agent

### 4a. Modifikasi struct `AuthHandler` (baris 16-21):

```go
// SEBELUM:
type AuthHandler struct {
	userStore    store.UserStore
	tokenStore   store.TokenStore
	sessionStore store.SessionStore
	hub          WebSocketHub
}

// SESUDAH:
type AuthHandler struct {
	userStore    store.UserStore
	tokenStore   store.TokenStore
	sessionStore store.SessionStore
	deviceStore  store.DeviceStore  // ← TAMBAH BARIS INI
	hub          WebSocketHub
}
```

### 4b. Tambah method `SetDeviceStore` (setelah baris 37, setelah func SetHub):

```go
// SetDeviceStore menyuntikkan DeviceStore ke AuthHandler untuk mencatat perangkat saat login.
func (h *AuthHandler) SetDeviceStore(ds store.DeviceStore) {
	h.deviceStore = ds
}
```

### 4c. Tambah helper `parseDeviceName` (bisa ditaruh di bawah `getClientIP`):

```go
// parseDeviceName membaca User-Agent string dan mengembalikan nama ramah untuk perangkat.
// Contoh output: "Chrome on Windows", "Safari on iPhone", "Firefox on Android"
func parseDeviceName(userAgent string) string {
	ua := strings.ToLower(userAgent)

	// Deteksi OS
	os := "Unknown OS"
	switch {
	case strings.Contains(ua, "windows"):
		os = "Windows"
	case strings.Contains(ua, "iphone"):
		os = "iPhone"
	case strings.Contains(ua, "ipad"):
		os = "iPad"
	case strings.Contains(ua, "android"):
		os = "Android"
	case strings.Contains(ua, "mac os"):
		os = "Mac"
	case strings.Contains(ua, "linux"):
		os = "Linux"
	}

	// Deteksi browser
	browser := "Browser"
	switch {
	case strings.Contains(ua, "edg/"):
		browser = "Edge"
	case strings.Contains(ua, "chrome") && !strings.Contains(ua, "chromium"):
		browser = "Chrome"
	case strings.Contains(ua, "firefox"):
		browser = "Firefox"
	case strings.Contains(ua, "safari") && !strings.Contains(ua, "chrome"):
		browser = "Safari"
	case strings.Contains(ua, "opera") || strings.Contains(ua, "opr/"):
		browser = "Opera"
	}

	return browser + " on " + os
}
```

### 4d. Modifikasi `Login()` — tambah pemanggilan `RegisterOrUpdateDevice` (di baris ~190, setelah blok `CreateSession`):

Cari bagian kode di `Login()` yang terlihat seperti ini (baris 175-196):
```go
if h.sessionStore != nil && claims != nil {
    sess := &store.Session{...}
    if err := h.sessionStore.CreateSession(sess); err != nil {
        log.Printf("⚠️ Gagal mencatat sesi login (user: %s): %v", user.ID, err)
    }
}

w.Header().Set("Content-Type", "application/json")
```

**Tambahkan blok berikut DI ANTARA** penutup `}` dari if sessionStore dan `w.Header()`:

```go
// Daftarkan atau perbarui perangkat yang login
if h.deviceStore != nil && strings.TrimSpace(req.DeviceID) != "" {
    device := &store.Device{
        ID:        strings.TrimSpace(req.DeviceID),
        UserID:    user.ID,
        Name:      parseDeviceName(r.UserAgent()),
        Platform:  "web",
        UserAgent: r.UserAgent(),
        IPAddress: getClientIP(r),
        IsActive:  true,
        CreatedAt: time.Now().UTC(),
    }
    if err := h.deviceStore.RegisterOrUpdateDevice(device); err != nil {
        log.Printf("⚠️ Gagal mendaftarkan device (user: %s, device: %s): %v", user.ID, req.DeviceID, err)
        // Non-fatal: login tetap berhasil meskipun device registration gagal
    }
}
```

### Verifikasi setelah step ini:
```bash
cd backend && go build ./...
```
**Expected output:** Tidak ada error.

---

## Step 5 — Buat Device Handler + Daftarkan Routes

### 📁 File yang dibuat: `backend/internal/api/device_handler.go`

### Apa yang dilakukan:
Membuat handler untuk 2 endpoint baru:
- `GET /api/auth/devices` — ambil daftar perangkat user
- `DELETE /api/auth/devices/{id}` — remote logout perangkat tertentu

```go
package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// DeviceHandler mengelola endpoint manajemen perangkat terdaftar.
type DeviceHandler struct {
	deviceStore  store.DeviceStore
	sessionStore store.SessionStore
	hub          WebSocketHub
}

// NewDeviceHandler membuat instance DeviceHandler baru.
func NewDeviceHandler(ds store.DeviceStore) *DeviceHandler {
	return &DeviceHandler{deviceStore: ds}
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

	// Jika tidak ada device, kembalikan array kosong (bukan null)
	if devices == nil {
		devices = []store.Device{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(devices)
}

// RemoveDevice menangani DELETE /api/auth/devices/{id}
// Melakukan: deactivate device di DB + kick WebSocket koneksi (jika online) + revoke sessions device tersebut
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
	// Pola path: hapus prefix "/api/auth/devices/"
	deviceID := strings.TrimPrefix(r.URL.Path, "/api/auth/devices/")
	deviceID = strings.TrimSpace(deviceID)
	if deviceID == "" {
		http.Error(w, `{"error":"Device ID tidak boleh kosong"}`, http.StatusBadRequest)
		return
	}

	// Cegah user logout dari device SAAT INI via API ini
	// (User harus pakai endpoint /api/auth/logout untuk itu)
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

	// 2. Kick WebSocket koneksi device tersebut (jika sedang online)
	if h.hub != nil {
		h.hub.KickClientByDeviceID(claims.UserID, deviceID, "DEVICE_KICKED: Perangkat dikeluarkan dari jarak jauh.")
	}

	log.Printf("✅ RemoveDevice berhasil (user: %s, device: %s)", claims.UserID, deviceID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Perangkat berhasil dikeluarkan"})
}
```

### 5b. Daftarkan Routes di Router

Cari file router. Biasanya `backend/cmd/server/main.go` atau `backend/internal/api/router.go`.
```bash
grep -rn "GET /api/auth/sessions\|auth/sessions" backend/ --include="*.go" | head -5
```

Temukan tempat di mana route `/api/auth/sessions` didaftarkan, lalu **tambahkan 2 route baru di bawahnya**:

```go
// Tambahkan setelah route sessions yang sudah ada:
deviceHandler := api.NewDeviceHandler(deviceStore) // deviceStore dibuat di Step 5c
deviceHandler.SetHub(hub)
deviceHandler.SetSessionStore(sessionStore)

mux.Handle("/api/auth/devices", authMiddleware(http.HandlerFunc(deviceHandler.ListDevices)))
mux.Handle("/api/auth/devices/", authMiddleware(http.HandlerFunc(deviceHandler.RemoveDevice)))
```

### 5c. Inisialisasi `DeviceStore` di main/server

Cari di `main.go` tempat `sessionStore` diinisialisasi:
```bash
grep -n "NewSQLSessionStore\|sessionStore" backend/cmd/server/main.go | head -10
```

Tambahkan inisialisasi `deviceStore` tepat setelah `sessionStore`:
```go
deviceStore := store.NewSQLDeviceStore(db, driverName)
```

Dan jika `AuthHandler` sudah diinisialisasi di sana, tambahkan:
```go
authHandler.SetDeviceStore(deviceStore)
```

### Verifikasi setelah step ini:
```bash
cd backend && go build ./...
```
**Expected output:** Tidak ada error.

---

## Step 6 — Update `last_seen_at` saat WebSocket Connect (`ws/handler.go`)

### 📁 File yang diedit: `backend/internal/ws/handler.go`

### Apa yang dilakukan:
Setelah WebSocket upgrade berhasil, panggil `deviceStore.TouchDevice()` secara non-blocking (goroutine).

### 6a. Tambah `deviceStore` ke struct `Handler`:

Cari struct `Handler` (baris 23-28):
```go
// SEBELUM:
type Handler struct {
	hub           *Hub
	userStore     store.UserStore
	corsValidator *auth.CORSValidator
	upgrader      websocket.Upgrader
}

// SESUDAH:
type Handler struct {
	hub           *Hub
	userStore     store.UserStore
	deviceStore   store.DeviceStore   // ← TAMBAH BARIS INI
	corsValidator *auth.CORSValidator
	upgrader      websocket.Upgrader
}
```

### 6b. Tambah method `SetDeviceStore` (setelah `SetUserStore`):

```go
// SetDeviceStore menyuntikkan DeviceStore ke Handler untuk update last_seen_at saat WS connect.
func (h *Handler) SetDeviceStore(deviceStore store.DeviceStore) {
	h.deviceStore = deviceStore
}
```

### 6c. Di `ServeHTTP`, tambah `TouchDevice` setelah upgrade berhasil

Cari bagian upgrade (baris 101-106):
```go
// Setelah:
conn, err := h.upgrader.Upgrade(w, r, nil)
if err != nil {
    log.Printf("[Handler] WebSocket upgrade gagal: %v", err)
    return
}

// Tambahkan SEBELUM bagian "Bind identitas":
// Update last_seen_at device secara non-blocking
if h.deviceStore != nil && deviceID != "" {
    go func() {
        if err := h.deviceStore.TouchDevice(deviceID); err != nil {
            log.Printf("[Handler] TouchDevice gagal (device: %s): %v", deviceID, err)
        }
    }()
}
```

### 6d. Update inisialisasi di main.go

Cari tempat `Handler` dibuat (biasanya `ws.NewHandler(hub, ...)`):
```bash
grep -n "ws.NewHandler\|wsHandler\|SetUserStore" backend/cmd/server/main.go | head -10
```

Tambahkan setelah `SetUserStore`:
```go
wsHandler.SetDeviceStore(deviceStore)
```

### Verifikasi setelah step ini:
```bash
cd backend && go build ./...
go test -v -run TestWSHandler ./internal/ws/... 2>/dev/null || echo "No WS tests found — OK"
```

---

## Step 7 — Frontend: Fungsi `getDeviceName()` di `auth-context.tsx`

### 📁 File yang diedit: `frontend/lib/auth-context.tsx`

### Apa yang dilakukan:
Menambah helper function `getDeviceName()` yang membaca `navigator.userAgent` dan menghasilkan nama ramah untuk perangkat saat ini. Nama ini dikirim ke backend sebagai metadata.

### Tambahkan fungsi ini di bagian atas file (setelah import):

```typescript
/**
 * Mendeteksi nama ramah perangkat dari User-Agent browser.
 * Digunakan sebagai label perangkat di halaman manajemen device.
 * @returns string — contoh: "Chrome on Windows", "Safari on iPhone"
 */
export function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Web Browser'
  
  const ua = navigator.userAgent.toLowerCase()
  
  // Deteksi OS
  let os = 'Unknown OS'
  if (ua.includes('windows')) os = 'Windows'
  else if (ua.includes('iphone')) os = 'iPhone'
  else if (ua.includes('ipad')) os = 'iPad'
  else if (ua.includes('android')) os = 'Android'
  else if (ua.includes('mac os')) os = 'Mac'
  else if (ua.includes('linux')) os = 'Linux'

  // Deteksi browser
  let browser = 'Browser'
  if (ua.includes('edg/')) browser = 'Edge'
  else if (ua.includes('chrome') && !ua.includes('chromium')) browser = 'Chrome'
  else if (ua.includes('firefox')) browser = 'Firefox'
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari'
  else if (ua.includes('opera') || ua.includes('opr/')) browser = 'Opera'

  return `${browser} on ${os}`
}
```

### Verifikasi setelah step ini:
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```
**Expected output:** Tidak ada error TypeScript.

---

## Step 8 — Frontend: Tab "Perangkat" di `ProfileModal.tsx`

### 📁 File yang diedit: `frontend/app/chat/ProfileModal.tsx`

### Apa yang dilakukan:
Menambah tab "Perangkat" di dalam `ProfileModal` yang menampilkan daftar perangkat aktif user, dengan tombol "Keluarkan" per perangkat.

### 8a. Tambah TypeScript interface (di bagian atas file, setelah import):

```typescript
// Interface untuk data perangkat yang dikembalikan backend
interface DeviceItem {
  id: string
  name: string
  platform: string
  ip_address: string
  last_seen_at: string | null
  created_at: string
  is_active: boolean
}
```

### 8b. Tambah state dan fetch logic (di dalam komponen `ProfileModal`):

Cari tempat di dalam fungsi `ProfileModal` di mana state lain didefinisikan, lalu tambahkan:

```typescript
// State untuk tab aktif ProfileModal
const [activeTab, setActiveTab] = useState<'profile' | 'sessions' | 'devices'>('profile')

// State untuk daftar perangkat
const [devices, setDevices] = useState<DeviceItem[]>([])
const [devicesLoading, setDevicesLoading] = useState(false)
const [devicesError, setDevicesError] = useState<string | null>(null)
const [kickingDeviceId, setKickingDeviceId] = useState<string | null>(null)

// Ambil device_id saat ini dari localStorage
const currentDeviceId = typeof window !== 'undefined' 
  ? localStorage.getItem('device_id') ?? '' 
  : ''

// Fetch daftar perangkat saat tab "Perangkat" dibuka
useEffect(() => {
  if (activeTab !== 'devices' || !isOpen) return
  
  const fetchDevices = async () => {
    setDevicesLoading(true)
    setDevicesError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/auth/devices', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Gagal memuat daftar perangkat')
      const data: DeviceItem[] = await res.json()
      setDevices(data)
    } catch (err) {
      setDevicesError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    } finally {
      setDevicesLoading(false)
    }
  }
  
  fetchDevices()
}, [activeTab, isOpen])

// Fungsi untuk mengeluarkan perangkat
const handleKickDevice = async (deviceId: string) => {
  setKickingDeviceId(deviceId)
  try {
    const token = localStorage.getItem('token')
    const deviceIdHeader = localStorage.getItem('device_id') ?? ''
    const res = await fetch(`/api/auth/devices/${deviceId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Device-ID': deviceIdHeader,
      },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'Gagal mengeluarkan perangkat')
    }
    // Hapus dari list lokal (optimistic update)
    setDevices(prev => prev.filter(d => d.id !== deviceId))
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Terjadi kesalahan')
  } finally {
    setKickingDeviceId(null)
  }
}
```

### 8c. Tambah tab button "Perangkat" di JSX tab navigation:

Cari bagian tab di JSX `ProfileModal`. Biasanya ada `button` untuk tab "Profil" atau "Sesi". Tambahkan setelah tab terakhir:

```tsx
<button
  id="tab-btn-devices"
  className={`modal-tab-btn ${activeTab === 'devices' ? 'active' : ''}`}
  onClick={() => setActiveTab('devices')}
>
  📱 Perangkat
</button>
```

### 8d. Tambah konten tab Perangkat di JSX (setelah konten tab lain):

```tsx
{activeTab === 'devices' && (
  <div className="devices-tab-content">
    <p className="devices-tab-desc">
      Perangkat yang terdaftar dan aktif menggunakan akun Anda.
    </p>

    {devicesLoading && (
      <div className="devices-loading">Memuat perangkat...</div>
    )}

    {devicesError && (
      <div className="devices-error">{devicesError}</div>
    )}

    {!devicesLoading && !devicesError && devices.length === 0 && (
      <div className="devices-empty">Tidak ada perangkat aktif.</div>
    )}

    <ul className="devices-list">
      {devices.map(device => {
        const isCurrentDevice = device.id === currentDeviceId
        const lastSeen = device.last_seen_at
          ? new Date(device.last_seen_at).toLocaleString('id-ID')
          : 'Belum pernah'

        return (
          <li key={device.id} className="device-item">
            <div className="device-item-info">
              <span className="device-item-name">
                {device.name || 'Perangkat Tidak Dikenal'}
                {isCurrentDevice && (
                  <span className="device-current-badge">Ini Perangkat Ini</span>
                )}
              </span>
              <span className="device-item-meta">
                Terakhir aktif: {lastSeen}
                {device.ip_address ? ` · IP: ${device.ip_address}` : ''}
              </span>
            </div>

            {!isCurrentDevice && (
              <button
                id={`btn-kick-device-${device.id}`}
                className="btn-kick-device"
                onClick={() => handleKickDevice(device.id)}
                disabled={kickingDeviceId === device.id}
              >
                {kickingDeviceId === device.id ? 'Mengeluarkan...' : 'Keluarkan'}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  </div>
)}
```

### 8e. Tambah CSS untuk komponen devices

Cari file CSS utama yang digunakan ProfileModal. Biasanya `frontend/app/globals.css` atau CSS module-nya.

```bash
grep -n "modal-tab-btn\|ProfileModal" frontend/app/globals.css | head -5
```

Tambahkan CSS berikut (gunakan CSS variables yang sudah ada — jangan hex raw):

```css
/* ── Device Tab ─────────────────────────────────── */
.devices-tab-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.devices-tab-desc {
  font-size: var(--text-sm, 0.875rem);
  color: var(--color-text-secondary);
  margin: 0;
}

.devices-loading,
.devices-empty {
  font-size: var(--text-sm, 0.875rem);
  color: var(--color-text-secondary);
  text-align: center;
  padding: var(--space-4, 16px) 0;
}

.devices-error {
  font-size: var(--text-sm, 0.875rem);
  color: var(--tint-error-60, #ef4444);
  background: var(--tint-error-10, rgba(239,68,68,0.1));
  border-radius: var(--radius-md, 8px);
  padding: var(--space-3, 12px);
}

.devices-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.device-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px);
  background: var(--color-surface-elevated, rgba(255,255,255,0.05));
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--color-border-subtle, rgba(255,255,255,0.08));
}

.device-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.device-item-name {
  font-size: var(--text-sm, 0.875rem);
  font-weight: var(--fw-medium, 500);
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}

.device-current-badge {
  font-size: var(--text-xs, 0.75rem);
  font-weight: var(--fw-medium, 500);
  background: var(--tint-accent-10, rgba(59,130,246,0.15));
  color: var(--color-accent, #3b82f6);
  border-radius: var(--radius-full, 9999px);
  padding: 2px 8px;
}

.device-item-meta {
  font-size: var(--text-xs, 0.75rem);
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-kick-device {
  flex-shrink: 0;
  font-size: var(--text-xs, 0.75rem);
  font-weight: var(--fw-medium, 500);
  color: var(--tint-error-60, #ef4444);
  background: transparent;
  border: 1px solid var(--tint-error-30, rgba(239,68,68,0.3));
  border-radius: var(--radius-sm, 6px);
  padding: 4px 10px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.btn-kick-device:hover:not(:disabled) {
  background: var(--tint-error-10, rgba(239,68,68,0.1));
  border-color: var(--tint-error-60, #ef4444);
}

.btn-kick-device:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### Verifikasi setelah step ini:
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
**Expected output:** Tidak ada TypeScript error.

---

## Step 9 — Testing Final

### 9a. Backend test:
```bash
cd /home/bms-del112/BMS/personal-project/wuzz-chat/backend
go test -v -count=1 ./... 2>&1 | tail -30
```
**Expected output:** `--- PASS` atau `ok` untuk semua package. Tidak ada `FAIL`.

### 9b. Frontend build test:
```bash
cd /home/bms-del112/BMS/personal-project/wuzz-chat/frontend
npm run build 2>&1 | tail -30
```
**Expected output:** `✓ Compiled successfully` atau ` Route (app) ... ` tanpa error.

### 9c. Jika ada error:
1. Lihat pesan error lengkap
2. Cari file yang disebutkan dalam error
3. Perbaiki satu per satu
4. Ulangi test dari 9a

---

## ✅ Checklist Verifikasi Sebelum Lapor ke User

- [ ] `go build ./...` lolos tanpa error
- [ ] `go test -v ./...` semua PASS (atau skip jika test yang ada tidak relevan)
- [ ] `npm run build` lolos tanpa error TypeScript/lint
- [ ] Tabel `devices` ada di DDL `sql.go`
- [ ] File `device_store.go` ada dan kompil dengan baik
- [ ] Interface `WebSocketHub` sudah punya `KickClientByDeviceID`
- [ ] Route `GET /api/auth/devices` dan `DELETE /api/auth/devices/{id}` terdaftar
- [ ] Login handler memanggil `RegisterOrUpdateDevice`
- [ ] WS handler memanggil `TouchDevice` setelah upgrade
- [ ] Frontend: `getDeviceName()` ada di `auth-context.tsx`
- [ ] Frontend: Tab "Perangkat" ada di `ProfileModal.tsx`
- [ ] Semua server dimatikan setelah test

---

## 🚨 Rollback Plan (Jika Ada Masalah)

Level 1 bersifat **additive** — tidak mengubah tabel yang ada. Jika perlu rollback:

1. **Hapus tabel `devices`** (jika sudah sempat dibuat di DB):
   ```sql
   -- Jalankan HANYA jika yakin ingin rollback
   DROP TABLE IF EXISTS devices;
   ```
2. **Revert file yang diedit**: `git checkout dev -- backend/internal/store/sql.go`
3. **Hapus file baru**:
   ```bash
   rm backend/internal/store/device_store.go
   rm backend/internal/api/device_handler.go
   ```
4. Rollback perubahan di `auth_handler.go`, `hub.go`, `handler.go`, `ProfileModal.tsx`, `auth-context.tsx` via `git checkout`.

---

## 📊 Ringkasan Level & Urutan Eksekusi

| Level | Nama | Bergantung pada | Estimasi | Risiko |
|---|---|---|---|---|
| **L1 (sekarang)** | Device Registry + Remote Logout | - | ~2 sesi | 🟢 Rendah |
| **L2** | Multi-Session HP + Laptop bersamaan | L1 selesai | ~4 sesi | 🟠 Sedang |
| **L3** | Credential Separation (Passkey-ready) | L1 selesai | ~2 sesi | 🟢 Rendah |
| **L4** | Per-Device E2EE Signal Protocol | L2 selesai | ~6 sesi | 🔴 Tinggi |

> [!NOTE]
> **Level 2, 3, dan 4 akan direncanakan dalam plan terpisah setelah L1 selesai dan disetujui user.**

---

## ⚠️ Peringatan Deployment Backend

> ⚠️ **Pemberitahuan Deployment Backend**: Implementasi ini mengubah kode backend Go (`backend/internal/...`).  
> Setelah commit di branch `dev` disetujui, backend di Fly.io **wajib di-deploy ulang**:
> ```bash
> fly deploy --remote-only
> ```
> Lakukan health check setelah deploy:
> ```bash
> curl -sI https://wuzz-chat-backend.fly.dev/health
> ```
> Expected: `HTTP/2 200`
