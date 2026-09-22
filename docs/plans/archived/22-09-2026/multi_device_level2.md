# 🏗️ Rencana Implementasi: Multi-Device — Level 2 (Multi-Session HP + Laptop Bersamaan)

**Tanggal:** 22 September 2026  
**Branch:** `feature/multi-device-level2` (dibuat dari `dev`)  
**Scope:** Phase 2B — Multi-Session WebSocket Hub (Max 2 Perangkat Aktif, Fanout Broadcast, FIFO Eviction)  
**Target Pembaca:** Junior Programmer / AI model kecil — **setiap langkah atomic, mandiri, dan dapat diverifikasi**

---

## 📌 Konteks & Keputusan Desain yang Sudah Disepakati

### 1. Kenapa Level 2 Dulu (Bukan Langsung 2 & 3)?
- **Level 2 (Multi-Session WebSocket & Fanout)**: Mengubah model koneksi in-memory WebSocket dari `1 User = 1 Koneksi` menjadi `1 User = N Koneksi`, fanout broadcast ke semua device user (termasuk sinkronisasi chat terkirim antar perangkat sender), dan penegakan batas maksimal perangkat aktif (FIFO eviction).
- **Level 3 (Credential Separation & Passkey)**: Mengubah layer autentikasi database (refresh token per-device di SQL, token rotation, passkey credentials).
- *Kesimpulan:* Memisahkan Level 2 dan Level 3 menjaga cakupan tetap terisolasi, risiko regresi rendah, dan mudah diuji 100% oleh junior programmer / AI kecil.

### 2. Aturan Bisnis yang Dipilih Pengguna:
1. **Kuota Perangkat Bersamaan**: Maksimal 2 perangkat aktif bersamaan secara default (`MaxActiveDevicesPerUser = 2`), dibuat fleksibel via konfigurasi/konstanta agar di masa depan mudah diubah menjadi 4 atau N.
2. **Device ke-3 Connect**: Jika user yang sudah aktif di 2 perangkat mencoba login/konek di perangkat ke-3, perangkat yang paling lama aktif akan dikeluarkan otomatis (**FIFO Eviction**) dengan kode WebSocket `4001` dan alasan `"SESSION_REPLACED: Batas maksimal perangkat aktif tercapai. Sesi perangkat terlama ditutup."`.
3. **Notifikasi Push**: Tetap dikirim ke seluruh `push_subscriptions` milik user offline. Jika HP & Laptop online, notifikasi WebSocket mengalir ke kedua layar.
4. **Keamanan Kunci E2EE saat Remote Logout**: Saat perangkat menerima tendangan `4001` (`DEVICE_KICKED`), frontend di perangkat yang dikeluarkan wajib memanggil `clearLocalKeyPair(userId)` untuk memusnahkan private key lokal dari IndexedDB & CacheStorage, sehingga perangkat yang hilang/dijual tidak dapat membuka riwayat enkripsi.

---

## 🗺️ Peta Langkah Kerja (Step-by-Step)

```
Step 1: Definisikan Konstanta MaxActiveDevicesPerUser & Update Struct Hub di hub.go
Step 2: Ubah Hub.Register() untuk Mendukung Multi-Session & FIFO Eviction
Step 3: Ubah Hub.Unregister() untuk Membersihkan Sesi Spesifik
Step 4: Ubah Hub.broadcastLocal() & NotifyUser() untuk Fanout ke Seluruh Perangkat User
Step 5: Relaksasi Gatekeeper active_device_id di ws/handler.go
Step 6: Update Frontend — Bersihkan Local E2EE Key saat Menerima Kick 4001 & Handle Self-Sync
Step 7: Buat Unit Test Backend Hub Multi-Session (hub_multisession_test.go)
Step 8: Verifikasi Otomatis (go test ./... & npm run build)
```

---

## Step 1 — Definisikan Konstanta & Perbarui Struktur `Hub` di `hub.go`

### 📁 File: `backend/internal/ws/hub.go`

### Apa yang dilakukan:
Saat ini `Hub` hanya memiliki:
```go
clients map[string]*Client // key: userID
```
Karena key-nya adalah `userID`, saat Laptop konek lalu HP konek dengan `userID` yang sama, koneksi Laptop langsung tertimpa dan putus.  
Kita ubah agar `Hub` menyimpan pemetaan multi-session:
1. Konstanta batas perangkat aktif:
   ```go
   const DefaultMaxActiveDevicesPerUser = 2
   ```
2. Pemetaan di struct `Hub`:
   - `clients map[string]*Client`: key berupa `sessionID` unik (format: `userID:deviceID` atau UUID).
   - `userClients map[string]map[string]*Client`: key `userID -> (deviceID -> *Client)`.
   - `maxActiveDevices int`: fleksibel, default `DefaultMaxActiveDevicesPerUser`.

### Verifikasi Mandiri:
Kompilasi backend dengan `go build ./...` di direktori `backend/`.

---

## Step 2 — Ubah `Hub.Register()` untuk Multi-Session & FIFO Eviction

### 📁 File: `backend/internal/ws/hub.go`

### Logika yang diterapkan:
1. **Device Sama Reconnect (Refresh Browser / Jaringan Putus-Nyambung)**:
   - Jika `deviceID` sama dengan yang sudah ada di `userClients[userID]`, gantikan soket lama dengan soket baru (tutup soket lama secara rapi tanpa pesan `SESSION_REPLACED`).
2. **Device Baru Connect**:
   - Hitung jumlah device aktif user saat ini: `len(userClients[userID])`.
   - Jika `len >= maxActiveDevices` (sudah 2 device aktif):
     - Cari device yang paling awal login/joined (`c.JoinedAt` tertua).
     - Tendang device tertua tersebut via goroutine dengan sinyal:
       `SESSION_REPLACED: Batas maksimal perangkat aktif tercapai. Sesi perangkat terlama ditutup.` (Close Code `4001`).
     - Hapus dari registry.
   - Daftarkan device baru ke `clients[sessionKey]` dan `userClients[userID][c.DeviceID]`.

---

## Step 3 — Ubah `Hub.Unregister()` untuk Sesi Spesifik

### 📁 File: `backend/internal/ws/hub.go`

### Logika yang diterapkan:
Saat koneksi suatu perangkat putus:
1. Hapus koneksi dari `clients[c.SessionKey]`.
2. Hapus dari `userClients[c.ID][c.DeviceID]`.
3. Hanya hapus username/presence global jika **tidak ada lagi perangkat aktif lain** untuk user tersebut (`len(userClients[c.ID]) == 0`).
4. Hapus dari `rooms[roomID]` untuk instance client spesifik tersebut.

---

## Step 4 — Ubah Broadcast Fanout di `broadcastLocal` & `NotifyUser`

### 📁 File: `backend/internal/ws/hub.go`

### Logika yang diterapkan:
1. **`findClientsLocked(userID string) []*Client`**:
   - Mengembalikan seluruh pointer `*Client` yang sedang aktif untuk `userID` tersebut (bisa 1, 2, dst).
2. **`broadcastLocal(roomID, msg, senderSessionID)`**:
   - Untuk setiap member di room, ambil **seluruh perangkat aktif** member tersebut.
   - Jika member tersebut adalah pengirim (`mID == senderUserID`), kirimkan juga pesan ke perangkat sender yang LAIN (skip hanya koneksi yang mengirim pesan asal). Dengan cara ini, jika user mengetik di Laptop, pesan langsung muncul secara real-time di layar HP user tersebut tanpa perlu refresh!
3. **`NotifyUser(userID, msg)` & `NotifyUsers(userIDs, msg)`**:
   - Mengirim notifikasi ke seluruh perangkat aktif masing-masing user.
4. **`KickClientByDeviceID(userID, deviceID, reason)`**:
   - Menemukan klien tepat pada `userClients[userID][deviceID]` dan mengirim sinyal kick `4001`.

---

## Step 5 — Relaksasi Gatekeeper di `backend/internal/ws/handler.go`

### 📁 File: `backend/internal/ws/handler.go`

### Apa yang dilakukan:
Pada baris 89-105 saat ini:
```go
if activeDev != "" && deviceID != activeDev {
    // Menolak koneksi jika device_id != active_device_id tunggal di DB
}
```
Kita perbarui:
- Karena sekarang multi-device aktif (Level 2), pengecekan tidak lagi membatasi hanya pada 1 `active_device_id`.
- Validasi apakah token JWT sah. Jika `deviceID` disediakan, pastikan device tersebut valid atau dicatat via `TouchDevice(deviceID)`.
- Buat `sessionKey` unik pada client: `c.SessionKey = fmt.Sprintf("%s:%s", claims.UserID, deviceID)`.

---

## Step 6 — Frontend: Penanganan Kick 4001 & Pembersihan Kunci E2EE Lokal

### 📁 File:
1. `frontend/lib/socket.ts` (atau file penanganan WebSocket client)
2. `frontend/lib/crypto/keyStore.ts`

### Apa yang dilakukan:
1. Saat WebSocket menerima Close Code `4001` dengan pesan `DEVICE_KICKED` (remote logout dari HP):
   - Bersihkan token auth (`localStorage.removeItem('token')`).
   - Panggil fungsi `clearLocalKeyPair(userId)` agar private key E2EE di IndexedDB & CacheStorage perangkat yang dikeluarkan langsung terhapus bersih.
   - Arahkan user ke halaman login dengan pesan ramah: *"Perangkat ini telah dikeluarkan dari sesi akun Anda."*
2. Saat chat terkirim diterima kembali dari perangkat lain milik user sendiri (`msg.From == myUserId`):
   - Pastikan timeline chat frontend me-render bubble pesan sebagai pesan keluar (*outgoing message*) dengan tanda centang.

---

## Step 7 — Unit Testing Backend Hub Multi-Session

### 📁 File baru: `backend/internal/ws/hub_multisession_test.go`

### Skenario Pengujian:
1. `TestHub_MultiSession_MaxTwoDevices`:
   - User mendaftarkan Device 1 (Laptop) -> Sukses terdaftar.
   - User mendaftarkan Device 2 (HP) -> Sukses terdaftar (keduanya aktif bersamaan).
   - User mendaftarkan Device 3 (Tablet) -> Device 1 (tertua) otomatis menerima sinyal kick `4001`, Device 2 & 3 tetap aktif.
2. `TestHub_MultiSession_BroadcastFanout`:
   - User A punya 2 perangkat (Laptop & HP). User B punya 1 perangkat.
   - User B mengirim pesan -> Kedua perangkat User A menerima pesan tersebut.
   - User A mengirim dari Laptop -> HP milik User A juga menerima pesan tersebut (self-sync).
3. `TestHub_KickClientByDeviceID`:
   - User A punya Device 1 dan Device 2.
   - `KickClientByDeviceID(UserA, Device1)` dipanggil -> Hanya Device 1 yang putus, Device 2 tetap aktif.

---

## Step 8 — Verifikasi & Quality Gate

1. Jalankan unit test backend:
   ```bash
   cd backend && go test -v ./internal/ws/...
   ```
2. Jalankan seluruh test suite backend:
   ```bash
   cd backend && go test ./...
   ```
3. Jalankan automated build frontend:
   ```bash
   cd frontend && npm run build
   ```
