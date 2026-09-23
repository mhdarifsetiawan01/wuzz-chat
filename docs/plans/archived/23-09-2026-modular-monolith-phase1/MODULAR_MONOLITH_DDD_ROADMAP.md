# WuzzChat Modular Monolith & Pragmatic DDD Roadmap

> Dokumen ini adalah single source of truth arsitektur jangka panjang WuzzChat sebagai reusable messaging engine.
> Disepakati pada: 23 September 2026.
> Referensi Audit Artefak: `architecture_audit_proposal.md`

---

## 🗺️ Roadmap Tahapan Eksekusi

```text
[Fase 1: Pisahkan GroupStore] (SELESAI ✅)
       ↓
[Fase 2: Extract Application Service Auth/Identity] (NEXT 🎯)
       ↓
[Fase 3: Extract Application Service Messaging]
       ↓
[Fase 4: Extract Group & Forum Service]
       ↓
[Fase 5: Memory Engine Generalization (ContextSource)]
       ↓
[Fase 6: Cleanup & Slim main.go Wiring]
```

---

## 📌 Status Terkini per Fase

### ✅ Fase 1: Pemisahan GroupStore dari SQLUserStore (SELESAI & DEPLOYED)
- [x] Ekstrak implementasi `GroupStore` dari `SQLUserStore` ke struct terpisah `store.SQLGroupStore` (`backend/internal/store/sql_group_store.go`).
- [x] Bersihkan `SQLUserStore` agar tidak lagi merangkap domain grup/forum.
- [x] Pisahkan inisialisasi di `backend/main.go` (`groupStore = store.NewSQLGroupStore(...)`).
- [x] Audit arsitektur & seluruh test suite (`go test -count=1 ./...`) lulus 100%.
- [x] Dideploy ke live production Fly.io dan dimerge ke branch `main`.

---

### 🎯 Fase 2: Extract Application Service untuk Auth & Identity (TAHAP BERIKUTNYA)
- **Problem**: `api/auth_handler.go` (860+ baris) saat ini merangkap sebagai HTTP transport sekaligus tempat menumpuknya business logic (device limit calculation, remote kick orchestration, JWT claim assembly, session creation, password verify).
- **Target**:
  1. Membuat `AuthService` (Application Service) untuk use case login, register, device management, dan session revocation.
  2. Handler HTTP `api/AuthHandler` menjadi tipis (*thin transport*): parse JSON ➔ panggil `AuthService` ➔ tulis HTTP status/JSON.
  3. Memisahkan domain `Identity` (profil, public key E2EE, pencarian) dari domain `Auth` (kredensial, sesi, token JWT).
  4. Seluruh test existing di `internal/api/` tetap lulus 100% tanpa mengubah schema database.

---

### ⏳ Fase 3: Extract Application Service untuk Messaging
- **Target**:
  1. Membuat `MessageService` untuk menangani use case pengiriman pesan, receipt status, conversation listing, dan unread count.
  2. Membuat abstraction `RoomAuthorizationChecker` agar WebSocket Hub (`ws/hub.go`) tidak lagi langsung bergantung pada `UserStore` database.

---

### ⏳ Fase 4: Extract Group & Forum Service
- **Target**:
  1. Membuat `GroupService` untuk mengorkestrasi pembuatan grup, invitation, approval join request, dan forum TTL lifecycle.
  2. Memindahkan `SubGroupTTLWorker` ke domain worker grup.

---

### ⏳ Fase 5: Memory Engine Generalization (`ContextSource`)
- **Target**:
  1. Mengabstraksikan sumber percakapan menjadi interface `ContextSource` (bukan hanya hardcoded forum).
  2. Mendukung Memory AI untuk Personal Chat (1-on-1) dan Group Chat.

---

### ⏳ Fase 6: Cleanup & Slim Entrypoint
- **Target**:
  1. Merapikan `main.go` menjadi file tipis bootstrap + `wire.go`.
  2. Menghapus store interface lama yang sudah dipindahkan ke domain masing-masing.
