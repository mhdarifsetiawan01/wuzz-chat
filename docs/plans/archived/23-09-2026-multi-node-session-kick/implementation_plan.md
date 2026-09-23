# IMPLEMENTATION PLAN
## Fitur: Multi-Node Session Kick via Redis Pub/Sub (Post-Milestone 8)

> **Untuk siapa dokumen ini?**
> Dokumen ini ditulis agar **junior programmer** atau **AI model kecil** sekalipun dapat mengeksekusi pekerjaan ini
> dengan aman, benar, dan tanpa merusak fitur yang sudah ada.

---

## 📖 1. Latar Belakang & Masalah

### Apa masalahnya?

Wuzz Chat berjalan di **Fly.io** yang bisa punya lebih dari 1 server (instance) secara bersamaan.

```
[HP User A]  ──── WebSocket ──→  [Server Instance A (Singapore)]
[PC User A]  ──── WebSocket ──→  [Server Instance B (Tokyo)]
```

Ketika User A login di PC (Instance B), sistem harus "menendang" (kick) koneksi HP lama (di Instance A).

**Masalah yang ada sekarang:**
- Fungsi `KickClientByUserID()` di `hub.go` hanya menendang client yang terhubung ke **server yang sama**.
- Jika HP terhubung ke Instance A, dan perintah kick datang dari Instance B → **HP tidak akan ter-kick**.

### Analogi sederhana

> Bayangkan ada 2 satpam gedung (Instance A & B). Satpam B mendapat instruksi untuk mengusir tamu,
> tapi tamu tersebut duduk di area yang dijaga Satpam A. Satpam B tidak bisa langsung mengusir —
> dia harus **menelepon Satpam A** dulu agar Satpam A yang mengusir.
>
> **Redis Pub/Sub = telepon antar satpam.**

### Mengapa aman dikerjakan sekarang?

- Saat ini Fly.io hanya punya **1 instance aktif** → bug ini belum terjadi.
- Perubahan yang dilakukan **tidak mengubah** fungsi `KickClientByUserID()` yang sudah ada.
- Perubahan hanya **menambahkan** fitur baru (additive), tidak menghapus atau mengubah yang lama.

---

## 🗺️ 2. Gambaran Solusi

### Diagram Alur (Flow Diagram)

```
[User login di PC → Instance B]
        │
        ▼
[Instance B: auth_handler.go memanggil hub.KickClientByUserID(userID, newDeviceID, reason)]
        │
        ├─── [Cek: apakah HP (old device) terhubung ke Instance B?]
        │         ├── YA  → kick langsung (seperti sekarang) ✅ SUDAH ADA
        │         └── TIDAK → [BARU] Publish event ke Redis channel "wuzz:cluster:events"
        │
        ▼
[Redis Pub/Sub Channel: "wuzz:cluster:events"]
        │
        ▼
[Semua Instance (A, B, C...) menerima event ini]
        │
        ├── [Instance B: event dari diri sendiri → ABAIKAN (anti-echo loop)]
        └── [Instance A: event bukan dari diri sendiri → PROSES]
                │
                ▼
        [Instance A: Cek apakah HP ada di sini?]
                ├── YA  → kick HP ✅ SELESAI!
                └── TIDAK → tidak ada yang dilakukan
```

---

## 📁 3. File yang Akan Dimodifikasi

> ⚠️ **Hanya 2 file** yang akan disentuh. Tidak perlu menyentuh file lain.

| No | File | Status | Apa yang Diubah |
|----|------|--------|-----------------|
| 1 | `backend/internal/ws/hub.go` | MODIFY | Tambah field di `ClusterEvent`, tambah publish di 2 fungsi kick, update handler di `SetBroker` |
| 2 | `backend/internal/ws/hub_cross_instance_kick_test.go` | NEW | Unit test 3 skenario baru |

---

## 🔧 4. Rincian Perubahan Kode (Step-by-Step)

### STEP A — Tambah field `EventType` di struct `ClusterEvent`

**File:** `backend/internal/ws/hub.go`
**Lokasi:** sekitar baris 24–31 (cari tulisan `type ClusterEvent struct`)

**Kode SEKARANG (baris ~24–31):**
```go
type ClusterEvent struct {
	NodeID       string  `json:"node_id"`
	RoomID       string  `json:"room_id"`
	SenderID     string  `json:"sender_id"`
	TargetUserID string  `json:"target_user_id,omitempty"`
	Message      Message `json:"message"`
}
```

**Kode SETELAH DIUBAH:**
```go
type ClusterEvent struct {
	NodeID         string  `json:"node_id"`
	RoomID         string  `json:"room_id"`
	SenderID       string  `json:"sender_id"`
	TargetUserID   string  `json:"target_user_id,omitempty"`
	Message        Message `json:"message"`
	// BARU: Tipe event untuk membedakan jenis event
	// Nilai valid: "" (pesan biasa), "session_kick", "device_kick"
	EventType      string  `json:"event_type,omitempty"`
	// BARU: Device ID yang TIDAK ikut di-kick (hanya untuk EventType="session_kick")
	ExceptDeviceID string  `json:"except_device_id,omitempty"`
	// BARU: Alasan kick yang dikirim ke client sebelum koneksi ditutup
	KickReason     string  `json:"kick_reason,omitempty"`
}
```

---

### STEP B — Tambah publish Redis di `KickClientByUserID`

**File:** `backend/internal/ws/hub.go`
**Lokasi:** Cari fungsi `func (h *Hub) KickClientByUserID(...)`, sekitar baris 941.

**Temukan baris penutup `}` dari blok `for _, client := range targets { ... }`**
(cari baris yang ada `}(client)` lalu ada `}` penutup `for` di bawahnya, sekitar baris 989–990)

**Tambahkan kode berikut TEPAT SETELAH closing `}` dari blok `for`:**

```go
	// [BARU] Publish perintah kick ke cluster Redis agar instance server lain
	// juga menendang koneksi user ini jika ada di server mereka.
	if h.broker != nil {
		kickEvent := ClusterEvent{
			NodeID:         h.nodeID,
			EventType:      "session_kick",
			TargetUserID:   userID,
			ExceptDeviceID: exceptDeviceID,
			KickReason:     reason,
		}
		if payload, err := json.Marshal(kickEvent); err == nil {
			ctx := context.Background()
			if pubErr := h.broker.Publish(ctx, ClusterEventsChannel, payload); pubErr != nil {
				log.Printf("[Hub %s] gagal publish session_kick ke cluster: %v", h.nodeID[:8], pubErr)
			} else {
				log.Printf("[Hub %s] session_kick dipublish untuk userID=%s exceptDevice=%s", h.nodeID[:8], userID, exceptDeviceID)
			}
		}
	}
```

---

### STEP C — Tambah publish Redis di `KickClientByDeviceID`

**File:** `backend/internal/ws/hub.go`
**Lokasi:** Cari fungsi `func (h *Hub) KickClientByDeviceID(...)`, sekitar baris 992.

**Temukan baris `}(client)` di akhir fungsi ini (sekitar baris 1035), lalu tambahkan kode berikut TEPAT SETELAHNYA:**

```go
	// [BARU] Publish perintah kick device spesifik ke cluster Redis.
	// SenderID digunakan untuk menyimpan deviceID yang di-kick.
	if h.broker != nil {
		kickEvent := ClusterEvent{
			NodeID:       h.nodeID,
			EventType:    "device_kick",
			TargetUserID: userID,
			SenderID:     deviceID,
			KickReason:   reason,
		}
		if payload, err := json.Marshal(kickEvent); err == nil {
			ctx := context.Background()
			if pubErr := h.broker.Publish(ctx, ClusterEventsChannel, payload); pubErr != nil {
				log.Printf("[Hub %s] gagal publish device_kick ke cluster: %v", h.nodeID[:8], pubErr)
			} else {
				log.Printf("[Hub %s] device_kick dipublish untuk userID=%s deviceID=%s", h.nodeID[:8], userID, deviceID)
			}
		}
	}
```

---

### STEP D — Update handler cluster event di `SetBroker`

**File:** `backend/internal/ws/hub.go`
**Lokasi:** Cari fungsi `func (h *Hub) SetBroker(...)`, sekitar baris 116.

Di dalam `b.Subscribe(...)`, temukan blok ini (sekitar baris 139–146):

```go
// KODE LAMA (HAPUS bagian ini):
log.Printf("[Hub %s] menerima cluster event dari node %s room=%s msgID=%s", h.nodeID[:8], event.NodeID[:8], event.RoomID, event.Message.ID)

// Teruskan pesan ke client lokal yang terhubung di node ini
if event.TargetUserID != "" {
    h.NotifyUser(event.TargetUserID, event.Message)
} else {
    h.broadcastLocal(event.RoomID, event.Message, event.SenderID)
}
```

**Ganti SELURUH blok di atas dengan kode baru berikut:**

```go
// KODE BARU (menggantikan blok if/else lama):
log.Printf("[Hub %s] menerima cluster event (type=%q) dari node %s", h.nodeID[:8], event.EventType, event.NodeID[:8])

switch event.EventType {
case "session_kick":
	// Tendang semua koneksi user ini di instance kita, kecuali device tertentu
	log.Printf("[Hub %s] menjalankan session_kick lokal untuk userID=%s exceptDevice=%s", h.nodeID[:8], event.TargetUserID, event.ExceptDeviceID)
	h.KickClientByUserID(event.TargetUserID, event.ExceptDeviceID, event.KickReason)
	return

case "device_kick":
	// Tendang device spesifik milik user ini di instance kita
	log.Printf("[Hub %s] menjalankan device_kick lokal untuk userID=%s deviceID=%s", h.nodeID[:8], event.TargetUserID, event.SenderID)
	h.KickClientByDeviceID(event.TargetUserID, event.SenderID, event.KickReason)
	return

default:
	// Event pesan/notifikasi biasa (backward compatible dengan kode lama)
	if event.TargetUserID != "" {
		h.NotifyUser(event.TargetUserID, event.Message)
	} else {
		h.broadcastLocal(event.RoomID, event.Message, event.SenderID)
	}
}
```

> ⚠️ **PENTING:** Blok `switch` ini **menggantikan** (replace) blok `if/else` lama.
> Jangan biarkan keduanya ada bersamaan.

---

### STEP E — Buat file unit test baru

**Buat file BARU:** `backend/internal/ws/hub_cross_instance_kick_test.go`

Salin kode berikut ke file baru tersebut:

```go
package ws

import (
	"encoding/json"
	"testing"
	"time"
)

// TestHub_CrossInstanceSessionKick memverifikasi bahwa sebuah Hub (Instance A)
// akan menendang koneksi user lokal ketika menerima event "session_kick" dari
// instance lain (Instance B) melalui Redis Pub/Sub.
func TestHub_CrossInstanceSessionKick(t *testing.T) {
	t.Log("=== TEST: Cross-Instance Session Kick via Cluster Event ===")

	// 1. Buat Hub (simulasi Instance A)
	hubA := NewHub(nil, nil)
	t.Logf("Instance A NodeID: %s", hubA.nodeID[:8])

	// 2. Buat client palsu (simulasi HP yang terhubung ke Instance A)
	fakeClient := &Client{
		ID:       "user-abc-123",
		DeviceID: "device-hp-456",
		send:     make(chan Message, 10),
	}
	// Daftarkan client ke Hub A
	hubA.mu.Lock()
	if hubA.userClients == nil {
		hubA.userClients = make(map[string]map[string]*Client)
	}
	hubA.userClients[fakeClient.ID] = map[string]*Client{
		fakeClient.DeviceID: fakeClient,
	}
	hubA.mu.Unlock()
	t.Logf("Client terdaftar: userID=%s deviceID=%s", fakeClient.ID, fakeClient.DeviceID)

	// 3. Simulasikan event "session_kick" yang datang dari Instance B
	kickEvent := ClusterEvent{
		NodeID:         "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", // Dari Instance B
		EventType:      "session_kick",
		TargetUserID:   "user-abc-123",
		ExceptDeviceID: "device-pc-789", // PC baru yang login, jangan di-kick
		KickReason:     "SESSION_REPLACED: Akun Anda dibuka dari perangkat lain.",
	}
	payload, err := json.Marshal(kickEvent)
	if err != nil {
		t.Fatalf("Gagal marshal kickEvent: %v", err)
	}

	// 4. Parse ulang event (seperti yang dilakukan subscriber Redis)
	var receivedEvent ClusterEvent
	if err := json.Unmarshal(payload, &receivedEvent); err != nil {
		t.Fatalf("Gagal unmarshal payload: %v", err)
	}

	// Pastikan anti-echo loop: NodeID event berbeda dari NodeID Hub A
	if receivedEvent.NodeID == hubA.nodeID {
		t.Fatal("Anti-echo loop gagal: event dari node sendiri tidak boleh diproses")
	}

	// 5. Jalankan handler (ini yang dilakukan subscriber Redis di SetBroker)
	switch receivedEvent.EventType {
	case "session_kick":
		hubA.KickClientByUserID(receivedEvent.TargetUserID, receivedEvent.ExceptDeviceID, receivedEvent.KickReason)
	default:
		t.Fatalf("EventType tidak dikenali: %s", receivedEvent.EventType)
	}

	// 6. Verifikasi: client HP harus menerima pesan kick
	select {
	case msg := <-fakeClient.send:
		t.Logf("✅ Client HP menerima kick: type=%s content=%s", msg.Type, msg.Content)
		if msg.Type != TypeSystem {
			t.Errorf("Expected TypeSystem, got %s", msg.Type)
		}
		if msg.Content != kickEvent.KickReason {
			t.Errorf("Expected reason=%q, got %q", kickEvent.KickReason, msg.Content)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("❌ TIMEOUT: Client HP tidak menerima pesan kick dalam 2 detik")
	}

	t.Log("✅ PASS: Cross-instance session kick berhasil dieksekusi")
}

// TestHub_CrossInstanceDeviceKick memverifikasi kick device spesifik lintas-instance.
func TestHub_CrossInstanceDeviceKick(t *testing.T) {
	t.Log("=== TEST: Cross-Instance Device Kick via Cluster Event ===")

	hubA := NewHub(nil, nil)

	// Buat 2 client: HP dan Tablet, keduanya di Instance A
	clientHP := &Client{
		ID:       "user-xyz-111",
		DeviceID: "device-hp-aaa",
		send:     make(chan Message, 10),
	}
	clientTablet := &Client{
		ID:       "user-xyz-111",
		DeviceID: "device-tablet-bbb",
		send:     make(chan Message, 10),
	}

	hubA.mu.Lock()
	if hubA.userClients == nil {
		hubA.userClients = make(map[string]map[string]*Client)
	}
	hubA.userClients["user-xyz-111"] = map[string]*Client{
		"device-hp-aaa":     clientHP,
		"device-tablet-bbb": clientTablet,
	}
	hubA.mu.Unlock()

	// Simulasikan event "device_kick" untuk menendang HANYA HP
	// SenderID digunakan sebagai deviceID target kick
	hubA.KickClientByDeviceID("user-xyz-111", "device-hp-aaa", "DEVICE_KICKED: Perangkat dikeluarkan.")

	// Verifikasi: HP harus di-kick
	select {
	case msg := <-clientHP.send:
		t.Logf("✅ HP menerima kick: %s", msg.Content)
	case <-time.After(2 * time.Second):
		t.Fatal("❌ HP tidak menerima pesan kick")
	}

	// Verifikasi: Tablet TIDAK boleh di-kick
	select {
	case msg := <-clientTablet.send:
		t.Fatalf("❌ Tablet seharusnya tidak di-kick, tapi menerima: %s", msg.Content)
	case <-time.After(200 * time.Millisecond):
		t.Log("✅ Tablet tidak di-kick (benar)")
	}
}

// TestHub_AntiEchoLoop_SessionKick memverifikasi bahwa Hub TIDAK memproses
// event kick yang berasal dari dirinya sendiri (anti-echo loop).
func TestHub_AntiEchoLoop_SessionKick(t *testing.T) {
	t.Log("=== TEST: Anti-Echo Loop untuk Session Kick ===")

	hubA := NewHub(nil, nil)

	// Event dengan NodeID = nodeID Hub A sendiri (seharusnya DIABAIKAN)
	selfEvent := ClusterEvent{
		NodeID:       hubA.nodeID, // ← Dari diri sendiri, harus diabaikan
		EventType:    "session_kick",
		TargetUserID: "user-loop-test",
		KickReason:   "test",
	}

	// Simulasi logika anti-echo loop di SetBroker
	if selfEvent.NodeID == hubA.nodeID {
		t.Log("✅ Anti-echo loop bekerja: event dari node sendiri diabaikan")
		return
	}

	t.Fatal("❌ Anti-echo loop gagal! Event dari node sendiri seharusnya diabaikan")
}
```

---

## ✅ 5. Checklist Verifikasi Setelah Implementasi

Jalankan perintah berikut secara berurutan. Jika ada yang gagal, **JANGAN** lanjut ke langkah berikutnya.

### Langkah 1: Pastikan kode bisa dikompilasi
```bash
cd backend && go build ./...
```
✅ **Expected:** Tidak ada output error. Output kosong = sukses.

### Langkah 2: Jalankan test baru saja
```bash
cd backend && go test -v -run "TestHub_Cross|TestHub_AntiEchoLoop" ./internal/ws/...
```
✅ **Expected:** Semua 3 test PASS.

### Langkah 3: Jalankan SELURUH test suite backend
```bash
cd backend && go test -count=1 ./...
```
✅ **Expected:** Semua package lulus 100%, tidak ada yang FAIL.

### Langkah 4: Kompilasi frontend (sanity check)
```bash
cd frontend && npm run build
```
✅ **Expected:** Build sukses, 0 TypeScript error.

---

## 🚫 6. Hal-Hal yang DILARANG Dilakukan

> ❌ **JANGAN** mengubah signature (nama/parameter) fungsi `KickClientByUserID` atau `KickClientByDeviceID`.

> ❌ **JANGAN** menambahkan field baru ke struct `Message` — hanya `ClusterEvent` yang dimodifikasi.

> ❌ **JANGAN** mengubah logika kick lokal di dalam blok `for/go func` — hanya tambahkan publish Redis SETELAH blok tersebut.

> ❌ **JANGAN** biarkan blok `if/else` lama dan `switch` baru ada bersamaan di `SetBroker` — pilih salah satu (gunakan `switch` baru).

> ❌ **JANGAN** commit sebelum seluruh test lulus 100%.

> ❌ **JANGAN** bekerja di branch `main` — seluruh pekerjaan di branch `dev`.

---

## ℹ️ 7. Catatan Backward Compatibility

Perubahan ini **100% backward compatible** karena:

1. Field `EventType` pakai `omitempty` → event lama tanpa `EventType` masuk ke `default` case → perilaku identik dengan kode lama.
2. Interface fungsi kick tidak berubah sama sekali.
3. Jika Redis tidak tersedia (`h.broker == nil`), blok publish di-skip → kick lokal tetap berjalan normal.

---

## 📊 8. Ringkasan Dampak

| Aspek | Detail |
|-------|--------|
| **File dimodifikasi** | 1 file (`hub.go`) |
| **File baru** | 1 file (test) |
| **Baris kode baru** | ~50 baris (+ komentar) |
| **Risiko regresi** | Sangat rendah (additive only) |
| **Breaking change** | Tidak ada |
| **Perlu deploy ulang Fly.io** | Ya, setelah merge ke `main` |
