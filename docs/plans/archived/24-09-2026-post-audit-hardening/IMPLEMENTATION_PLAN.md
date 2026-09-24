# Implementation Plan — 3 Focus Areas Post-Audit Hardening

## 🎯 Tujuan Arsitektur
Menata ulang dan memperkuat arsitektur Modular Monolith WuzzChat berdasarkan hasil audit kritis, melalui 3 milestone terpisah yang berorientasi pada kesederhanaan (*clean & pragmatic*), keamanan operasi (*zero-breakage*), dan kemudahan pemahaman bagi pengembang junior.

---

## 🗺️ Milestone Breakdown

### 📍 Milestone 1: Zero-Risk Handler Cleanup (Eliminasi Dual-Path Debt)
*Tujuan: Membersihkan blok fallback `if h.service == nil` / `else` pada layer HTTP handlers agar menjadi pure thin transport.*

- **Latar Belakang Masalah:**
  Saat migrasi ke Application Service di Track B, handlers (`chat_handler.go`, `auth_handler.go`, `group_handler.go`) tetap mempertahankan implementasi kueri database lama sebagai fallback cabang `else`. Hal ini memboroskan >1.500 baris kode dan membingungkan alur logika.
- **Target File yang Diubah:**
  1. `backend/internal/api/auth_handler.go`
  2. `backend/internal/api/chat_handler.go`
  3. `backend/internal/api/group_handler.go`
  4. `backend/internal/api/memory_handler.go`
  5. `backend/internal/app/wire.go`
- **Langkah Kerja Konkret:**
  1. Audit setiap handler method: pastikan handler memvalidasi DTO request, memanggil `h.service.Method(ctx, input)`, dan memformat JSON response.
  2. Hapus seluruh blok fallback kueri langsung `h.userStore.*` atau `h.messageStore.*` yang sudah ditangani oleh service.
  3. Sederhanakan constructor handler di `internal/api/` (tidak perlu menyuntikkan store yang sudah tidak dipakai).
  4. Perbarui inisialisasi handler di `internal/app/wire.go`.
  5. Jalankan `go test -v ./...` dan pastikan 100% test lulus.

---

### 📍 Milestone 2: Realtime Message Ingestion Decoupling (Route WS via MessageService)
*Tujuan: Memindahkan persistensi pesan, kalkulasi delivery receipt, dan validasi mention dari WebSocket Hub/Client ke dalam MessageService.*

- **Latar Belakang Masalah:**
  Saat ini, WebSocket `client.go` dan `hub.go` langsung menyimpan pesan ke database (`h.messageStore.Save`) dan mengupdate receipt (`h.messageStore.UpdateMessageStatus`), sehingga WebSocket merangkap sebagai domain logic (God Component).
- **Target File yang Diubah:**
  1. `backend/internal/messaging/service.go`
  2. `backend/internal/messaging/repository.go`
  3. `backend/internal/ws/client.go`
  4. `backend/internal/ws/hub.go`
  5. `backend/internal/app/wire.go`
- **Langkah Kerja Konkret:**
  1. Tambahkan use cases baru pada `messaging.MessageService`:
     - `SaveIncomingMessage(ctx context.Context, input SendMessageInput) (*Message, error)`
     - `HandleReceiptUpdate(ctx context.Context, input ReceiptInput) error`
     - `HandleReactionToggle(ctx context.Context, input ReactionInput) (string, error)`
  2. Suntikkan `MessageService` ke dalam `ws.Hub` via IoC `internal/app/wire.go`.
  3. Di `ws/client.go` dan `ws/hub.go`: delegasikan operasi simpan pesan, tanda terima, dan reaksi ke `MessageService`.
  4. Pertahankan `ws.Hub` fokus pada tugas transport: mengelola koneksi TCP soket, broadcasting lokal, dan cluster Redis Pub/Sub.
  5. Jalankan suite test WebSocket dan Messaging (`go test -v ./internal/ws/... ./internal/messaging/...`).

---

### 📍 Milestone 3: Mobile Gateway Readiness (Device Platform & Multi-Push Architecture)
*Tujuan: Menyiapkan backend WuzzChat agar siap dikonsumsi oleh klien mobile React Native (Android & iOS).*

- **Latar Belakang Masalah:**
  Saat ini platform perangkat di-hardcode `"web"` dan dideteksi via regex User-Agent browser. Selain itu, push notification hanya mendukung Web Push VAPID browser, belum ramah terhadap native token push (FCM / APNs).
- **Target File yang Diubah:**
  1. `backend/internal/authz/service.go` & `entity.go`
  2. `backend/internal/api/auth_handler.go`
  3. `backend/internal/store/user_store.go` / `device_store.go`
  4. `backend/internal/push/push.go`
  5. Skema database (kolom `platform` di tabel `devices` & opsi provider pada `notification_subscriptions`)
- **Langkah Kerja Konkret:**
  1. Tambahkan penerimaan parameter platform eksplisit (`"web" | "android" | "ios"`) pada request `Register` dan `Login` (via header `X-Device-Platform` atau JSON body).
  2. Perbarui `AuthService` agar mencatat platform aktual ke tabel `devices`.
  3. Desain antarmuka provider push di `internal/push/push.go`:
     - Interface `PushProvider` dengan method `SendPush(ctx context.Context, target Subscription, payload NotificationPayload) error`.
     - Implementasi `VAPIDWebPushProvider` (eksisting) dan kerangka scaffolding `FCMv1PushProvider` (untuk React Native).
  4. Verifikasi seluruh alur autentikasi dan notifikasi via unit test.

---

## 🛡️ Rencana Verifikasi & Definition of Done
Setiap milestone harus memenuhi kriteria:
1. `go test -v ./...` lulus 100% (0 fail).
2. `npm run build` di direktori `frontend/` lulus kompilasi (0 error).
3. Kode bersih, tidak ada compiler warning atau dependency loop.
4. Server sementara selalu dimatikan sebelum selesai respons.
