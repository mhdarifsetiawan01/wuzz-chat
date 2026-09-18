# Dokumentasi Keamanan & Performa Backend — Wuzz Chat

Dokumen ini menyajikan panduan arsitektur komprehensif mengenai seluruh lapisan **Keamanan (*Security*)**, **Performa (*Performance*)**, dan **Keandalan Skalabilitas (*Scalability & Concurrency*)** yang telah diterapkan pada sistem backend Wuzz Chat (Golang 1.26).

---

## 📑 Daftar Isi
1. [Ringkasan Eksekutif](#-1-ringkasan-eksekutif)
2. [Arsitektur Keamanan Backend (Security Hardening)](#-2-arsitektur-keamanan-backend-security-hardening)
   - 2.1 [Mitigasi BOLA / IDOR pada WebSocket Events](#21-mitigasi-bola--idor-pada-websocket-events)
   - 2.2 [Proteksi IDOR pada Siklus Penghapusan Berkas Media (ACK Deletion)](#22-proteksi-idor-pada-siklus-penghapusan-berkas-media-ack-deletion)
   - 2.3 [Mitigasi TOCTOU SSRF & DNS Rebinding pada Link Preview Scraper](#23-mitigasi-toctou-ssrf--dns-rebinding-pada-link-preview-scraper)
   - 2.4 [Anti-Spoofing Identitas Pengguna (JWT Enforcement)](#24-anti-spoofing-identitas-pengguna-jwt-enforcement)
   - 2.5 [Pencegahan Tabrakan Deterministik Room ID (Zero Collision)](#25-pencegahan-tabrakan-deterministik-room-id-zero-collision)
   - 2.6 [Filter Privasi Asimetris & Non-Destructive Message Lifecycle](#26-filter-privasi-asimetris--non-destructive-message-lifecycle)
   - 2.7 [CORS Dynamic Validator & IP Rate Limiting](#27-cors-dynamic-validator--ip-rate-limiting)
   - 2.8 [Zero-Knowledge Push Notification & Client-Side Background Decryption](#28-zero-knowledge-push-notification--client-side-background-decryption)
   - 2.9 [Pencegahan Key Overwrite & Single Active Device Guard (E2EE)](#29-pencegahan-key-overwrite--single-active-device-guard-e2ee)
   - 2.10 [Zero-Knowledge QR Code Key Migration & Atomic Transaction Guard](#210-zero-knowledge-qr-code-key-migration--atomic-transaction-guard)
   - 2.11 [Client-Side E2EE Decrypted Persistence & Anti-Downgrade Status Guard](#211-client-side-e2ee-decrypted-persistence--anti-downgrade-status-guard)
   - 2.12 [Strict Parent-Membership Gate, RBAC Creation Guard & Immutable-Only Identity Enforcement](#212-strict-parent-membership-gate-rbac-creation-guard--immutable-only-identity-enforcement-dec-008--dec-011)
   - 2.13 [Fail-Closed Write Gate & Ephemeral Forum Topics Lifecycle](#213-fail-closed-write-gate--ephemeral-forum-topics-lifecycle)
   - 2.14 [Forum Topics Access Control & Join Request Purge Lifecycle](#214-forum-topics-access-control--join-request-purge-lifecycle)
   - 2.15 [Mitigasi Akses Tautan Langsung Grup Privat & WebSocket Drop Guard (DEC-013)](#215-mitigasi-akses-tautan-langsung-grup-privat--websocket-drop-guard-dec-013)
3. [Arsitektur Performa & Skalabilitas (Performance Optimization)](#-3-arsitektur-performa--skalabilitas-performance-optimization)
   - 3.1 [Penyelesaian Masalah $N+1$ Query pada `GetUserConversations`](#31-penyelesaian-masalah-n1-query-pada-getuserconversations)
   - 3.2 [Indeks Performa Database (PostgreSQL & SQLite)](#32-indeks-performa-database-postgresql--sqlite)
   - 3.3 [Keandalan Concurrency SQLite (WAL Mode & Busy Timeout)](#33-keandalan-concurrency-sqlite-wal-mode--busy-timeout)
   - 3.4 [Goroutine Concurrency & Buffered WebSocket Channels](#34-goroutine-concurrency--buffered-websocket-channels)
   - 3.5 [Skalabilitas Horizontal Multi-Node (Redis Cluster Pub/Sub)](#35-skalabilitas-horizontal-multi-node-redis-cluster-pubsub)
   - 3.6 [Arsitektur Ketahanan Jaringan Latensi Tinggi & Server Lambat / Flaky](#36-arsitektur-ketahanan-jaringan-latensi-tinggi--server-lambat--flaky)
4. [Matriks Pengujian Otomatis & Verifikasi E2E](#-4-matriks-pengujian-otomatis--verifikasi-e2e)

---

## 📌 1. Ringkasan Eksekutif

Aplikasi perpesanan instan modern menghadapi dua tantangan utama saat jumlah pengguna bertumbuh:
1. **Risiko Eksploitasi Keamanan**: Penyadapan event WebSocket secara liar, manipulasi ID objek untuk menghapus data orang lain (BOLA/IDOR), dan serangan penetrasi jaringan internal server melalui preview link (SSRF).
2. **Degradasi Performa & Bottleneck Database**: Pola kueri loop ($N+1$) yang menghabiskan pool koneksi database, *lock contention* pada file database saat konkurensi tinggi, dan latensi pemuatan daftar obrolan.

Seluruh tantangan tersebut telah diselesaikan secara sistemik pada backend Wuzz Chat dengan prinsip **Zero-Trust Security**, **$O(1)$ Batching Database Queries**, dan **Non-Blocking Concurrent Concurrency**.

---

## 🛡️ 2. Arsitektur Keamanan Backend (Security Hardening)

```
                       ┌────────────────────────────────────────────────────────┐
                       │                   API & WS GATEWAY                     │
                       └──────────────────────────┬─────────────────────────────┘
                                                  │
                ┌─────────────────────────────────┼─────────────────────────────────┐
                ▼                                 ▼                                 ▼
      [WebSocket Shielding]               [Media Store-Forward]             [Link Preview Scraper]
   • BOLA / IDOR Verification           • Room Membership Check           • Socket-Level IP Pinning
   • Strict isAuthorizedForRoom         • Anti Unauthorized ACK           • Cloud Metadata Blocked
   • Anti-Spoofing JWT Claims           • Auto Physical Purge             • Anti DNS Rebinding / TOCTOU
```

### 2.1 Mitigasi BOLA / IDOR pada WebSocket Events
* **Lokasi Kode**: [`backend/internal/ws/client.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/client.go)
* **Vektor Serangan**: Penyerang (*intruder*) yang terautentikasi mengirim payload JSON dengan nama `room` obrolan milik orang lain untuk menguping atau mengintervensi sinyal WebRTC (`call_offer`, `call_answer`, `ice_candidate`), tanda terima centang biru (`receipt`), reaksi emoji (`reaction`), dan status mengetik (`typing`).
* **Solusi Implementasi**:
  Setiap client WebSocket memiliki method otorisasi terisolasi:
  ```go
  func (c *Client) isAuthorizedForRoom(roomID string) bool {
      // 1. Validasi cache lokal client
      // 2. Jika belum tercatat, verifikasi ke database relasional (UserStore.IsUserInRoom)
      allowed, err := c.hub.userStore.IsUserInRoom(c.ID, roomID)
      return err == nil && allowed
  }
  ```
  Jika client mencoba mem-broadcast event ke room yang bukan haknya, server seketika memutus event, mencatat log security warning, dan mengembalikan pesan `TypeSystem` bertuliskan `"Akses ditolak: Anda bukan anggota room ini"`.

### 2.2 Proteksi IDOR pada Siklus Penghapusan Berkas Media (ACK Deletion)
* **Lokasi Kode**: [`backend/internal/api/media_handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/media_handler.go)
* **Vektor Serangan**: Dalam arsitektur *Store-and-Forward*, berkas media fisik yang selesai diunduh oleh penerima akan dihapus dari storage (`POST /api/media/ack`). Penyerang dapat menebak parameter `message_id` milik orang lain dan memicu penghapusan berkas fisik secara paksa (*Denial of Service*).
* **Solusi Implementasi**:
  Endpoint `AcknowledgeDownload` memvalidasi bahwa `claims.UserID` dari token JWT pemanggil adalah **anggota yang sah** dari room tempat pesan media tersebut dikirimkan sebelum mengeksekusi penghapusan fisik berkas dari disk:
  ```go
  if allowed, err := h.userStore.IsUserInRoom(claims.UserID, msg.RoomID); err != nil || !allowed {
      http.Error(w, `{"error":"Akses ditolak: Anda bukan anggota percakapan media ini"}`, http.StatusForbidden)
      return
  }
  ```

### 2.3 Mitigasi TOCTOU SSRF & DNS Rebinding pada Link Preview Scraper
* **Lokasi Kode**: [`backend/internal/api/link_preview.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/link_preview.go)
* **Vektor Serangan**:
  1. *Direct SSRF*: Meminta preview link ke IP internal (`http://127.0.0.1:8080`, `http://10.0.0.1`, `http://169.254.169.254`).
  2. *TOCTOU (Time-of-Check to Time-of-Use) / DNS Rebinding*: Domain penyerang mengembalikan IP publik saat lookup DNS pertama (lolos filter), namun mengembalikan IP metadata cloud (`169.254.169.254`) saat TCP soket dibuka.
* **Solusi Implementasi**:
  1. **Socket-Level IP Pinning (`safeDialContext`)**: Pengecekan keamanan dilakukan **tepat di dalam proses dial TCP**. Koneksi langsung di-pin ke IP yang terverifikasi, sehingga kebal terhadap manipulasi DNS rebinding sekunder.
  2. **Subnet Blacklist Ketat (`validateIP`)**:
     - Loopback IPv4 & IPv6 (`127.0.0.0/8`, `::1`)
     - Subnet Privat RFC 1918 & RFC 4193 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`)
     - Cloud Metadata AWS/GCP/Azure (`169.254.169.254`, `169.254.0.0/16`)
     - Carrier-Grade NAT RFC 6598 (`100.64.0.0/10`)
     - IPv4-mapped IPv6 (`::ffff:127.0.0.1`, `::ffff:169.254.169.254`)
     - Localhost hostnames (`localhost`, `*.local`)
  3. **Transport Redirect Guard**: Membatasi redirect maksimal 3 hops dan memvalidasi skema (hanya `http` & `https`).

### 2.4 Anti-Spoofing Identitas Pengguna (JWT Enforcement) & UUID-First Identity
* **Lokasi Kode**: [`backend/internal/ws/handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/handler.go) & [`backend/internal/auth/middleware.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/auth/middleware.go)
* **Solusi Implementasi**:
  Server tidak pernah mempercayai field `from_id` atau `nickname` yang dikirimkan oleh klien di payload JSON. Identitas pengirim selalu dipaksakan (*enforced*) dari claims token JWT yang telah diverifikasi secara kriptografis menggunakan secret key backend.

  **UUID-First Architecture (Full-Stack)**:
  Implementasi keamanan identitas diperluas ke seluruh stack (backend + frontend) dengan prinsip **UUID-first**:
  - **Backend Ownership Verification (`store/store.go`, `store/sql.go`)**: Kontrak `MessageStore.DeleteMessage(msgID, userID string, deleteForEveryone bool)` memverifikasi kepemilikan pesan untuk penarikan (*Delete for Everyone*) murni menggunakan `msg.FromID == userID` (UUID). Parameter display name/nickname telah dihapus sepenuhnya dari interface, SQL query, in-memory store, dan REST handler untuk menutup celah spoofing berbasis nama.
  - **Backend Reaction Persistence (`store/sql.go`, `store/memory.go`)**: Reaksi emoji (`ToggleReaction`) menyimpan array `userID` (UUID) pada kolom `messages.reactions`, kebal terhadap pergantian `display_name` atau `username` pengguna.
  - **Backend Receipts Tracking & Broadcast Guard (`ws/client.go`)**: Read receipt tracking (`MarkRoomMessagesAsRead`) dan delivered receipts (`MarkUserMessagesAsDelivered`) menggunakan `c.ID` (UUID) tanpa fallback nickname. Siaran event `delivered` saat user terhubung diproteksi guard `c.isAuthorizedForRoom(rID)` agar status tidak bocor ke room yang tidak sah.
  - **Frontend Message Bubbles (`MessageBubble.tsx`)**: Penentuan `isSelf` (apakah bubble kanan/kiri) memprioritaskan `msgSenderId === currentUser.id` (UUID), bukan perbandingan string nickname. Pengecekan `hasReacted` memprioritaskan kecocokan UUID `u === currentUser.id`.
  - **Frontend Timeline Peer Discovery (`page.tsx`)**: Resolusi lawan bicara pada riwayat pesan room murni mengevaluasi `senderId !== myUserId` (UUID), mengeliminasi seluruh fallback nama mutable (`nickname`, `display_name`, `username`).
  - **Frontend Sidebar & Header (`Sidebar.tsx`, `StatusBar.tsx`)**: Tampilan tanda centang (`✓`/`✓✓`) di preview chat ditentukan menggunakan `conv.last_sender_id === currentUser.id` (UUID). Resolusi status online dan kontak menggunakan `peerUserId` (UUID).
  - **Mention Engine & Scope Isolation (DEC-013)**: Validasi mention fail-closed di `backend/internal/ws/hub.go` memverifikasi array `msg.Mentions` menggunakan `IsUserInConversation(roomID, mUID)` berbasis UUID kekal. Mention pengguna di luar anggota sah grup atau topik forum otomatis di-drop sebelum persistensi dan broadcast. Push notification prioritas mencocokkan `subscription.user_id` dengan UUID mention murni tanpa pernah mengandalkan username/display_name atau nama grup yang dapat dimutasi.

  **Efek Arsitektur**: Sistem kini sepenuhnya tahan terhadap skenario di mana pengguna mengubah `display_name` atau `username` — tidak ada data yang rusak, tidak ada logika yang salah identifikasi, dan hak akses penarikan pesan/tanda terima tetap 100% konsisten.


### 2.5 Pencegahan Tabrakan Deterministik Room ID (Zero Collision)
* **Lokasi Kode**: [`backend/internal/store/user_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/user_store.go)
* **Solusi Implementasi**:
  Metode `GetOrCreateDirectConversation` menggunakan alur bertingkat yang bebas dari tabrakan data:
  1. *Relational Lookup*: Memeriksa apakah kedua user telah memiliki relasi direct di tabel `conversation_members` (100% backward-compatible).
  2. *Full UUID Deterministic ID*: Jika baru, room dibentuk dengan menggabungkan full ID kedua pengguna (`dm_<userA>_<userB>`), dengan fallback hash `SHA-256` (`dm_<sha256>`) jika panjang melebihi 128 karakter.

### 2.6 Filter Privasi Asimetris & Non-Destructive Message Lifecycle
* **Lokasi Kode**: [`backend/internal/store/user_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/user_store.go) & [`backend/internal/store/sql.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/sql.go)
* **Solusi Implementasi**:
  - **Hapus Percakapan untuk Saya (*Clear Chat*)**: Menggunakan kolom `cleared_at` pada tabel `conversation_members`. Pengguna yang menghapus obrolan tidak akan melihat pesan lama sebelum `cleared_at`, namun riwayat lawan bicara tetap utuh 100%. Obrolan otomatis muncul kembali jika ada pesan baru setelah `cleared_at`.
  - **Tarik Pesan (*Delete for Everyone*)**: Hanya diizinkan jika usia pesan **≤ 60 detik (1 menit)** dan dikirim oleh user pemanggil. Melebihi batas waktu akan ditolak dengan error 400.

### 2.7 CORS Dynamic Validator & IP Rate Limiting
* **Lokasi Kode**: [`backend/internal/auth/cors.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/auth/cors.go) & [`backend/internal/auth/rate_limiter.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/auth/rate_limiter.go)
* **Solusi Implementasi**:
  - Validator CORS mendukung pencocokan domain produksi `chat.wuzzhub.id` dan wildcard subdomain preview Vercel (`*.vercel.app`) secara aman tanpa membuka `*` (wildcard bebas).
  - Rate limiter berbasis sliding window per IP melindungi endpoint autentikasi (`/api/auth/login`, `/api/auth/register`) dari serangan brute-force.

### 2.8 Zero-Knowledge Push Notification & Client-Side Background Decryption
* **Lokasi Kode**: [`backend/internal/push/push.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/push/push.go), [`frontend/public/sw.js`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/public/sw.js), & [`frontend/lib/pushNotification.ts`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/lib/pushNotification.ts)
* **Prinsip Keamanan & Keandalan**:
  - **Zero Server Decryption**: Backend Go TIDAK PERNAH memegang private key pengguna dan TIDAK BISA mendekripsi payload `e2ee:v1:...`.
  - **Static VAPID Key Persistence**: Pasangan kunci VAPID publik-privat statis dikelola aman via Fly.io Secrets dan Environment Variables, mencegah rotasi kunci acak saat server me-restart yang dapat membatalkan token FCM/Web Push di browser pengguna.
  - **CacheStorage Fast Retrieval (< 1ms)**: Service Worker (`sw.js` v1.0.5) memprioritaskan pembacaan private key dari `CacheStorage` (`wuzz-crypto-keys`) untuk membypass locking LevelDB IndexedDB saat PWA berada dalam status killed/background di OS Android.
  - **Automatic Subscription Re-sync**: Helper `pushNotification.ts` secara otomatis membandingkan `applicationServerKey` subscription aktif dengan kunci server. Jika kunci berubah, browser secara otomatis melakukan `unsubscribe()` dan registrasi ulang instan.
  - **Client-Side Background Decryption**: Service Worker membaca private key penerima dan kunci publik pengirim dari push data, lalu melakukan derivasi kunci AES-256-GCM via Web Crypto API untuk mendekripsi teks pesan secara lokal sebelum diteruskan ke Notification API sistem operasi.
  - **Graceful Fallback**: Jika browser belum memiliki kunci privat atau decrypt gagal, notifikasi jatuh kembali secara aman ke teks fallback `🔒 Pesan Baru (Terenkripsi)` tanpa memicu kebocoran data.

### 2.9 Pencegahan Key Overwrite & Single Active Device Guard (E2EE)
* **Lokasi Kode**: [`backend/internal/store/user_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/user_store.go), [`backend/internal/api/auth_handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/auth_handler.go), & [`frontend/lib/crypto/keyStore.ts`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/lib/crypto/keyStore.ts)
* **Latar Belakang & Masalah**:
  - Pada sistem E2EE murni (ECDH P-256), private key tersimpan secara lokal di peramban (`IndexedDB`).
  - Jika pengguna membuka aplikasi di perangkat kedua (misal: HP PWA setelah laptop), perangkat kedua yang belum memiliki kunci lokal akan membuat keypair baru dan menimpa kunci publik di server.
  - Akibatnya, fingerprint *Safety Number* 30-digit menjadi tidak sinkron dan lawan bicara tidak dapat mendekripsi pesan.
* **Solusi & Proteksi**:
  - **Pelacakan Perangkat Aktif (`active_device_id`) & Versi Kunci (`key_version`)**: Database melacak perangkat yang memegang sesi enkripsi aktif.
  - **Penolakan Penimpaan Kunci (HTTP 409 Conflict)**: Endpoint `PUT /api/users/public-key` menolak pembaruan jika `device_id` berbeda dengan kode kesalahan `KEY_ALREADY_REGISTERED`.
  - **Pencegahan Diam-diam di Frontend**: `initUserE2EE()` tidak lagi mengunggah kunci jika status konflik terdeteksi, mencegah korupsi kunci di database server.
  - **Rotasi Kunci Eksplisit (`POST /api/users/public-key/reset`)**: Pengguna dapat mereset kunci ke perangkat baru secara sadar melalui modal UI konfirmasi (`DeviceConflictModal.tsx`). Versi kunci dinaikkan (`key_version + 1`) dan sesi perangkat lama dinonaktifkan secara aman.

### 2.10 Zero-Knowledge QR Code Key Migration & Atomic Transaction Guard
* **Lokasi Kode**: [`backend/internal/store/transfer_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/transfer_store.go), [`backend/internal/api/transfer_handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/transfer_handler.go), & [`frontend/lib/crypto/keyTransfer.ts`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/lib/crypto/keyTransfer.ts)
* **Prinsip Keamanan & Mitigasi Kegagalan**:
  - **Zero Server Plaintext Storage**: Server hanya menyimpan ciphertext terenkripsi AES-256-GCM. Kunci dekripsi diturunkan via PBKDF2 (100.000 iterasi, SHA-256) dari token sesi acak 32-byte (256-bit entropy) yang hanya berpindah via visual QR Code atau input manual pengguna.
  - **Atomic Single-Use Retrieval (Anti-Replay / Anti-Double-Spend)**: Pengambilan paket kunci di endpoint `POST /api/users/transfer/consume` dikunci dalam transaksi database tunggal (`SELECT ... FOR UPDATE` di PostgreSQL / `BEGIN` di SQLite). Sesi langsung ditandai `is_used = true` dan `users.active_device_id` dialihkan ke perangkat baru secara atomik. Usaha konsumsi ulang seketika menghasilkan HTTP 410 Gone (`SESSION_ALREADY_USED`).
  - **Strict Ownership Enforcement**: Endpoint menolak token transfer jika JWT user pemanggil berbeda dari pemilik sesi transfer (`403 Forbidden`).
  - **Ephemeral TTL & Background Sweeper**: Sesi otomatis kedaluwarsa setelah 5 menit (300 detik), dan worker di Go backend secara berkala membersihkan entri usang setiap 10 menit.
  - **State Isolation pada Kegagalan Dekripsi**: Jika dekripsi lokal di browser gagal, penyimpanan `IndexedDB` perangkat target tidak disentuh sama sekali, mencegah rusaknya state kriptografi lokal.

### 2.11 Client-Side E2EE Decrypted Persistence & Anti-Downgrade Status Guard
* **Lokasi Kode**: [`frontend/lib/messageCache.ts`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/lib/messageCache.ts) & [`frontend/app/chat/page.tsx`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/app/chat/page.tsx)
* **Latar Belakang & Tantangan**:
  - Pada sistem E2EE murni, server database hanya menyimpan ciphertext (`e2ee:v1:...`).
  - Ketika lawan bicara me-reset perangkatnya dan menerbitkan keypair baru, pesan-pesan lama di server tidak lagi bisa didekripsi dengan kunci baru tersebut.
  - Selain itu, pemuatan riwayat pesan dari server memerlukan waktu roundtrip HTTP yang menimbulkan jeda rendering pada layar klien.
* **Solusi & Proteksi**:
  - **IndexedDB Decrypted Store (`wuzzchat_msg_db`)**: Pesan yang telah berhasil didekripsi disimpan persisten di browser klien masing-masing pengguna.
  - **Pola Cache-First**: Saat ruang obrolan dibuka, pesan lokal dimuat seketika (0ms), lalu digabungkan secara aman dengan riwayat server tanpa menimpa teks yang sudah terdekripsi.
  - **Anti-Downgrade Receipt Guard**: Status tanda terima dilindungi dengan bobot integer (`pending: 0, sent: 1, delivered: 2, read: 3, deleted: 99`) sehingga status centang biru (`read`) tidak dapat ter-downgrade menjadi `delivered` atau `sent` oleh riwayat lama server.
  - **Security Key Change Alert**: Perubahan public key lawan bicara dideteksi saat proses dekripsi dan disisipkan sebagai notifikasi sistem visual amber (`security-notice`), menjamin transparansi kriptografi bagi pengguna.

### 2.12 Proteksi Privilese Akun Terverifikasi (Tamper-Proof `is_verified` & Anti-Self-Elevation)
* **Lokasi Kode**: [`backend/internal/store/user_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/user_store.go)
* **Prinsip Keamanan & Otorisasi**:
  - Kolom `is_verified BOOLEAN DEFAULT false` di tabel `users` tidak dapat dimodifikasi oleh pengguna reguler.
  - Query SQL pada method `UpdateProfile` secara ketat hanya mengizinkan pembaruan field `display_name`, `status_message`, dan `avatar_url`. Parameter `is_verified` diabaikan sepenuhnya dari endpoint publik `PUT /api/auth/profile`.
### 2.13 Pengamanan Pendaftaran Pengguna Baru (Registration Hardening & Anti-Impersonation)
* **Lokasi Kode**: [`backend/internal/auth/validator.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/auth/validator.go) & [`backend/internal/api/auth_handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/auth_handler.go)
* **Prinsip Keamanan & Validasi**:
  - **Payload Body Capping (Anti-DoS)**: `r.Body = http.MaxBytesReader(w, r.Body, 64*1024)` membatasi ukuran request body maksimal 64 KB untuk mencegah memory exhaustion.
  - **Karakter Terkontrol**: Regex `^[a-zA-Z0-9_.-]+$` memastikan username hanya terdiri dari karakter aman tanpa spasi, karakter kontrol, atau path traversal (`../`).
  - **Batas Panjang Karakter**: Username (3-30 karakter), Password (6-128 karakter untuk mencegah bcrypt hashing DoS), Display Name (maks 50 karakter) terhindar dari database truncate error.
  - **Aturan Kata Terlarang Hybrid**:
    1. *Substring Block*: Kata kotor/eksplisit (`jancok`, `puki`, `pepek`) dan entitas tertutup (`semantic`) diblokir di posisi manapun.
    2. *Sensitive / Brand Filter*: Kata sistem/brand (`admin`, `official`, `support`, `wuzz`, `verified`, `moderator`, `staff`, `helpdesk`, `security`, `team`, `service`, `contact`, `info`) diblokir jika persis sama atau berawalan/berakhiran pemisah (`arif_official`, `admin_budi`).
    3. *Technical Exact Match*: Kata rute/protokol (`api`, `bot`, `dev`, `chat`, `null`, `undefined`, `root`, `system`, `anonymous`) hanya diblokir jika persis sama, mengizinkan nama wajar seperti `robot` atau `modern`.
  - **Fail-Closed BOLA Guard** (`backend/internal/ws/client.go`): Method `isAuthorizedForRoom` dirancang *fail-closed* - jika terjadi error database saat lookup keanggotaan room, akses **selalu ditolak** (bukan allowed by default). Mencegah privilege escalation saat DB lambat/gagal.
  - **JWT Runtime Warning** (`backend/internal/auth/jwt.go`): Guard `sync.Once` mencatat warning kritis ke log jika environment variable `JWT_SECRET` tidak di-set, mencegah produksi berjalan dengan secret kosong.
  - **Test Coverage**: `validator_test.go` (33 unit test cases) & `auth_register_test.go` (11 integration test cases) - 100% pass.

### 2.14 Group RBAC & Boundary Access Control Enforcement (Milestone 8.2A)
* **Lokasi Kode**: [`backend/internal/store/group_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/group_store.go) & [`backend/internal/api/group_handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/group_handler.go)
* **Prinsip Keamanan & Otorisasi RBAC**:
  - **Hierarki Peran Ketat**: `creator` (pembuat grup mutlak), `admin` (pengelola grup), `member` (anggota biasa).
  - **Creator Protection**: Creator tidak dapat di-kick atau diubah perannya oleh siapapun (termasuk sesama admin). Creator tidak dapat keluar dari grup sembarangan tanpa membubarkan atau mentransfer grup.
  - **Admin Boundary**: Admin hanya dapat meng-kick anggota dengan peran `member`, dilarang meng-kick sesama admin atau creator.
  - **Public vs Private Guard & Explicit Preview (DEC-012)**: Endpoint `/api/groups/{id}/join` memvalidasi status `is_public` di database secara langsung (menolak grup privat dengan 403 Forbidden). Di sisi antarmuka, klien menerapkan modal pratinjau konfirmasi (`GroupPreviewModal.tsx`) untuk mencegah *accidental auto-join* dan *spamming notifikasi kehadiran* saat pengguna mencari grup publik.
  - **Atomic Transaction Isolation**: Seluruh operasi grup (`CreateGroup`, `AddGroupMembers`, `RemoveGroupMember`) dibungkus dalam `*sql.Tx` atomik guna mencegah *dangling members* atau korupsi hitungan anggota jika terjadi kegagalan jaringan di tengah jalan.

### 2.12 Strict Parent-Membership Gate, RBAC Creation Guard & Immutable-Only Identity Enforcement (DEC-008 & DEC-011)
* **Lokasi Kode**: [`backend/internal/store/group_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/group_store.go), [`backend/internal/store/user_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/user_store.go), [`backend/internal/api/group_handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/group_handler.go)
* **Vektor Serangan**: Pengguna luar mencoba menginfiltrasi subgrup bertopik via direct link `sub_<UUID>`, brute-force ID, atau invite liar; serta anggota biasa melakukan *topic flooding/spamming* dengan membuat puluhan subgrup liar tanpa izin admin.
* **Solusi Implementasi (Strict Fail-Closed)**:
  - **RBAC Creation Guard (DEC-011)**: Pembuatan topik forum (`POST /api/groups/{id}/subgroups`) dibatasi ketat hanya untuk peran `creator` dan `admin` grup induk via `GetUserRoleInGroup`. Anggota biasa (`member`) yang mencoba memanggil API langsung ditolak keras dengan status fail-closed `HTTP 403 Forbidden` (`"Akses ditolak: Hanya admin atau pembuat grup yang dapat membuat topik forum"`).
  - **Validasi Multi-Lapisan**: Setiap pemanggilan untuk melihat subgrup (`GET /api/groups/{id}/subgroups`), membuat subgrup (`POST /api/groups/{id}/subgroups`), bergabung (`POST /api/groups/{sub_id}/join`), melihat detail (`GET /api/groups/{sub_id}`), maupun koneksi WebSocket (`IsUserInConversation`) memverifikasi keanggotaan aktif pengguna di grup induk `conversations.parent_id` via `IsParentMember(parentID, userID)`.
  - **Enforcement Identitas Immutable (DEC-008)**: Seluruh pembanding, query filter, dan otorisasi strictly menggunakan UUID / ID immutable (`users.id`, `conversations.id`, `conversations.parent_id`). Dilarang keras membandingkan variabel yang dapat berubah (*mutable*) seperti `username`, `display_name`, atau nama grup.

### 2.13 Fail-Closed Write Gate & Ephemeral Forum Topics Lifecycle
* **Lokasi Kode**: [`backend/internal/ws/client.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/client.go), [`backend/internal/worker/subgroup_ttl_worker.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/worker/subgroup_ttl_worker.go)
* **Solusi Implementasi**:
  - **WebSocket Drop & Error**: Saat topik forum kedaluwarsa (`status = 'expired'` atau `expires_at <= NOW()`), server langsung menolak pesan masuk dengan `sendError("Topik forum ini telah kedaluwarsa dan terkunci. Pesan tidak dapat dikirim.")`.
  - **Non-Destructive AI Summary Readiness**: Riwayat pesan tidak di-hard delete saat kedaluwarsa agar dapat diakses untuk AI Summary di masa mendatang.
  - **Automated Batch Transition**: Daemon background `SubGroupTTLWorker` berjalan setiap 15 menit menjalankan kueri batch `ExpireSubGroupsBatch` tanpa membebani thread WebSocket utama.

### 2.14 Forum Topics Access Control & Join Request Purge Lifecycle
* **Lokasi Kode**: [`backend/internal/store/group_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/group_store.go), [`backend/internal/api/group_handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/group_handler.go)
* **Vektor Serangan**: Anggota grup induk mencoba membobol topik forum privat tanpa izin melalui manipulasi request `POST /api/groups/{sub_id}/join`.
* **Solusi Implementasi**:
  - **Fail-Closed Direct Join Check**: Saat `is_public = false`, pemanggilan `/join` langsung ditolak dengan pesan instruksi mengajukan izin (`HTTP 400 Bad Request`).
  - **Unique Request Constraint**: Indeks komposit unik `idx_join_requests_conv_user ON conversation_join_requests(conversation_id, user_id)` mencegah eksploitasi *spam/duplicate request attack*.
  - **RBAC Approval Gate**: Hanya admin/creator topik forum atau grup induk yang berhak memanggil `/join-requests` dan `/join-requests/{requestId}/action`.
  - **Automated Expired Data Purge**: Saat topik forum kedaluwarsa, seluruh baris izin di `conversation_join_requests` langsung dihapus secara atomik oleh `ExpireSubGroupsBatch` untuk mencegah kebocoran antrean dan menghemat ruang database.

### 2.15 Mitigasi Akses Tautan Langsung Grup Privat & WebSocket Drop Guard (DEC-013)
* **Lokasi Kode**: [`frontend/app/chat/page.tsx`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/app/chat/page.tsx) & [`backend/internal/store/group_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/group_store.go)
* **Vektor Serangan & Isu Kebocoran UX**: Pengguna membagikan tautan grup privat (`/chat?room=grp_<UUID>`) ke luar. Non-anggota yang membuka tautan sebelumnya langsung diarahkan ke layar ruang obrolan kosong yang menginisialisasi koneksi WebSocket join tanpa otorisasi. Penolakan backend (BOLA protection) menyebabkan timer timeout riwayat pesan 7.5 detik terpicu dan memunculkan notifikasi keliru seolah-olah server mengalami hambatan jaringan.
* **Solusi Implementasi (Zero-Leakage & Fail-Closed Guard)**:
  1. **Dual Gate Verification**: Endpoint `GET /api/groups/{id}` memverifikasi status `is_public` dan keanggotaan `myRole`. Jika `!is_public && myRole == ""`, backend mengembalikan `HTTP 403 Forbidden` (`ErrUnauthorizedGroup`).
  2. **WebSocket Join Drop Guard**: State `privateGroupDenied` memblokir pengiriman frame WebSocket `{ type: "join", room: targetRoomId }` dan membatalkan inisialisasi timeout riwayat pesan seketika, mencegah koneksi liar ke server.
  3. **Shielding UI Aurora Glassmorphism**: Seluruh komponen percakapan (`StatusBar`, `ChatWindow`, `MessageInput`) digantikan oleh kartu proteksi otorisasi bertema *Aurora Glassmorphism* yang menjelaskan status privat grup tanpa membocorkan isi obrolan, jumlah anggota, atau identitas admin. Tombol kembali mengeksekusi `router.replace('/chat')` untuk membersihkan URL history.

---


## ⚡ 3. Arsitektur Performa & Skalabilitas (Performance Optimization)

```
                            [Pemuatan Sidebar /api/conversations]
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
         [SEBELUM: O(N) Loop Queries]                    [SESUDAH: O(1) Batched CTE]
    • 1 Query Daftar Room                           • 1 Query Ambil Room + Peer Info (LEFT JOIN)
    • N Query Data Lawan Bicara (Peer)              • 1 Query Window Function Pesan Terakhir (CTE)
    • N Query Pesan Terakhir                        • 1 Query Hitung Unread Badge (GROUP BY)
    • N Query Unread Count                          ────────────────────────────────────────────
    ───────────────────────────                     TOTAL: Tepat 3 Database Round-Trips!
    TOTAL: 1 + 3N Queries (151 Queries)
```

### 3.1 Penyelesaian Masalah $N+1$ Query pada `GetUserConversations`
* **Lokasi Kode**: [`backend/internal/store/user_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/user_store.go#L354-L525)
* **Masalah Sebelumnya**: Pada user yang memiliki 50 obrolan aktif, endpoint memicu $1 + 3(50) = 151$ kueri SQL individual ke database secara berulang.
* **Solusi $O(1)$ Batched CTE**:
  Direfaktor menjadi **tepat 3 kueri database independen** menggunakan fitur canggih SQL standar (didukung penuh di PostgreSQL & SQLite 3.25+):
  1. **Query 1 (Percakapan & Data Lawan Bicara)**: Menggabungkan data room dan peer user dalam 1 kueri dengan `LEFT JOIN`, dan memfilter `WHERE (c.parent_id IS NULL OR c.parent_id = '')` agar sub-grup tidak membebani linimasa utama.
  2. **Query 2 (Pesan Terakhir & Snippet Media)**: Menggunakan Common Table Expressions (CTE) dan *Window Function* `ROW_NUMBER() OVER (PARTITION BY m.room_id ORDER BY m.created_at DESC)` untuk mengambil pesan terakhir seluruh room sekaligus dalam 1 trip.
  3. **Query 3 (Unread Badge Counter)**: Menggunakan agregasi `GROUP BY m.room_id` untuk menghitung pesan belum dibaca secara massal.
* **Dampak**: Menghemat **98% konsumsi koneksi database** dan memangkas waktu respon API hingga **< 15ms**.

### 3.2 Indeks Performa Database (PostgreSQL & SQLite)
* **Lokasi Kode**: [`backend/internal/store/sql.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/sql.go#L100-L148)
* **Indeks yang Diterapkan**:
  - `idx_conv_members_user ON conversation_members(user_id)`: Mempercepat lookup daftar room milik user.
  - `idx_conv_members_conv ON conversation_members(conversation_id)`: Mempercepat lookup anggota dalam room.
  - `idx_conv_members_role ON conversation_members(conversation_id, role)`: Mempercepat lookup role admin/creator di dalam grup.
  - `idx_conv_parent ON conversations(parent_id)`: Mengoptimalkan pemisahan sub-grup dari daftar obrolan utama.
  - `idx_subgroups_active ON conversations(parent_id, expires_at)`: Mempercepat filter daftar subgrup aktif dan eksekusi batch TTL worker.
  - `idx_conv_public ON conversations(is_public)`: Mempercepat pencarian publik grup pada endpoint `/api/groups/search`.
  - `idx_messages_room_time ON messages(room_id, created_at)`: Mempercepat pagination riwayat obrolan linimasa.
  - `idx_messages_unread ON messages(room_id, status)`: Mengoptimalkan filter badge unread tanpa full-table scan.
  - `idx_messages_to_status ON messages(to_id, status)`: Mempercepat sinkronisasi delivery receipts global saat user online.
  - `idx_join_requests_conv_status ON conversation_join_requests(conversation_id, status)`: Mempercepat kueri filter permohonan izin pending per subgrup.
  - `idx_join_requests_user ON conversation_join_requests(user_id)`: Mempercepat lookup status permohonan milik user tertentu.
  - `idx_join_requests_conv_user ON conversation_join_requests(conversation_id, user_id)`: Indeks unik mencegah duplikasi permohonan bergabung per user per subgrup.

### 3.3 Keandalan Concurrency SQLite (WAL Mode & Busy Timeout)
* **Lokasi Kode**: [`backend/internal/store/sql.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/sql.go#L44-L62)
* **Solusi Implementasi**:
  Saat menggunakan SQLite (development/local fallback), database dikonfigurasi dengan:
  - `PRAGMA journal_mode=WAL;` (Write-Ahead Logging): Pembaca (*readers*) tidak memblokir penulis (*writers*), dan penulis tidak memblokir pembaca.
  - `PRAGMA busy_timeout=5000;`: Otomatis menunggu hingga 5 detik jika terjadi lock sesaat, mencegah error `SQLITE_BUSY: database is locked`.
  - `db.SetMaxOpenConns(25)`: Pool koneksi multi-goroutine yang stabil.

### 3.4 Goroutine Concurrency & Buffered WebSocket Channels
* **Lokasi Kode**: [`backend/internal/ws/client.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/client.go) & [`backend/internal/ws/hub.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub.go)
* **Solusi Implementasi**:
  - Arsitektur pump independen: Setiap koneksi WebSocket memiliki goroutine `readPump` dan `writePump` terpisah.
  - Channel `send chan []byte` dengan buffer kapasitas `256` pesan per client untuk mencegah *head-of-line blocking* jika salah satu client mengalami koneksi lambat (*slow consumer*).

### 3.5 Skalabilitas Horizontal Multi-Node (Redis Cluster Pub/Sub)
* **Lokasi Kode**: [`backend/internal/ws/hub.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub.go) & [`backend/internal/broker/redis_broker.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/broker/redis_broker.go)
* **Solusi Implementasi**:
  - Backend mendukung deployment multi-instance (*horizontal scaling* di Fly.io / Kubernetes).
  - Sinkronisasi event real-time antar instance backend menggunakan channel Pub/Sub Redis `wuzz:cluster:events` dan caching MD5 metadata link preview.

### 3.6 Arsitektur Ketahanan Jaringan Latensi Tinggi & Server Lambat / Flaky
* **Lokasi Kode**: [`backend/internal/ws/handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/handler.go), [`backend/internal/ws/hub.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub.go), [`frontend/lib/api.ts`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/lib/api.ts), [`frontend/lib/ws-client.ts`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/lib/ws-client.ts)
* **Vektor Kegagalan**: Jaringan seluler pengguna (3G/4G/WiFi lemah) dan server berlatensi sedang-tinggi (200–800ms+) sering mengalami *bufferbloat*, paket hilang, atau soket putus tanpa sinyal penutupan tertib. Kondisi ini dapat memicu *race condition* (klien lama reconnect dan menendang klien baru) atau UI menggantung (*hanging requests*).
* **Solusi Implementasi Arsitektur**:
  1. **Handshake Level Single Device Gatekeeper**: Validasi otoritas `device_id` terhadap database `active_device_id` langsung saat HTTP upgrade handshake. Klien dengan `device_id` usang atau kosong ditolak seketika dengan status `HTTP 403 Forbidden` (`DEVICE_MISMATCH` / `SESSION_REPLACED`), mencegah klien usang masuk kembali ke Hub.
  2. **Grace Period Flush 500ms & Long Write Deadlines**: Event pemutusan sesi (`SESSION_REPLACED`) diberi jeda flush minimal 500ms dan batas waktu penulisan WebSocket control frame 1000ms, menjamin frame notifikasi dan Close Code `4001` berhasil dikirim tuntas ke jaringan sebelum soket ditutup (`conn.Close()`).
  3. **Optimistic Local UI & Write-Through Offline Cache**: Pengiriman pesan di frontend dirender seketika secara optimis dan ditulis langsung ke IndexedDB (`wuzzchat_msg_db`). UI tidak pernah memblokir interaksi pengguna saat menunggu konfirmasi jaringan dari server.
  4. **Explicit REST Abort Timeout**: Seluruh request REST diatur dengan batas waktu terkelola menggunakan `AbortController` (15 detik query, 60 detik upload file) agar aplikasi tidak pernah mengalami *infinite hang* di memori browser.
  5. **Terminal WebSocket Close Code & Backoff**: Penerimaan Close Code `4001` langsung mematikan loop auto-reconnect (`this.destroyed = true`). Reconnect koneksi biasa diatur dengan exponential backoff bertingkat (1s s/d 30s) dengan batas maksimal 5 kali percobaan.

### 3.7 Proteksi Profil Pengguna & Sanitasi Media Avatar
* **Lokasi Kode**: [`frontend/lib/imageCompressor.ts`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/lib/imageCompressor.ts), [`frontend/app/chat/AvatarStudio.tsx`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/app/chat/AvatarStudio.tsx), [`backend/internal/api/auth_handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/auth_handler.go)
* **Vektor Serangan & Beban Jaringan**: Unggahan foto profil mentah berukuran besar (>10MB) dapat menghabiskan kuota transfer database, membebani bandwidth klien seluler saat merender daftar obrolan, atau menjadi vektor serangan injeksi SVG/XSS jika file gambar tidak disanitasi.
* **Solusi Implementasi Arsitektur**:
  1. **Client-Side Canvas Downscaling & Re-Encoding (Zero-XSS)**: Setiap foto yang diunggah pengguna diproses melalui elemen `<canvas>` HTML5 offscreen (`imageCompressor.ts`), diperkecil hingga batas resolusi ideal avatar (maksimal 512x512px), dan di-encode ulang menjadi format **WebP** dengan kualitas kompresi optimal. Skrip jahat atau payload SVG yang disisipkan dalam berkas otomatis ternetralisir karena hanya data piksel murni yang digambar ke kanvas.
  2. **Strict Payload Size Bounding**: Format output berupa data URL WebP ringkas (~20–60 KB) sehingga tidak memberatkan query SQL `GetUserConversations` saat memuat banyak percakapan secara batch.
  3. **Fallback Error Isolation**: Komponen `UserAvatar.tsx` mengisolasi kegagalan pemuatan gambar (`onError`) dan seketika beralih ke inisial deterministik dengan palet warna lembut tanpa merusak tata letak antarmuka pengguna (*graceful degradation*).

### 3.8 Storage Retention & Anti-Resource Exhaustion: Direct Message vs Shared Group Media
* **Lokasi Kode**: [`backend/internal/storage/purge_worker.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/storage/purge_worker.go), [`backend/internal/api/media_handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/media_handler.go), & [`backend/internal/store/sql.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/sql.go)
* **Tantangan Arsitektur**: Berkas media (gambar, audio, dokumen) dapat menghabiskan kuota disk server dengan cepat jika tidak dikelola dengan siklus hidup (*lifecycle*) yang tegas. Di sisi lain, pada obrolan grup dan forum topik dengan banyak anggota, file tidak boleh langsung dihapus saat satu orang pertama mengunduhnya.
* **Solusi Implementasi Dual-Retention**:
  1. **Direct Message (Immediate Store-and-Forward)**: Menggunakan pola ACK download tunggal (`POST /api/media/ack`). Begitu penerima selesai mendownload berkas ke IndexedDB lokalnya, server langsung menghapus berkas fisik dari storage ($0 server storage maintenance cost).
  2. **Group Chat & Forum Topics (Shared Media Hub dengan TTL 7 Hari)**: Pada obrolan grup (`grp_...`) dan topik forum (`sub_...`), berkas dipertahankan di Supabase Storage selama batas retensi TTL penuh (`MEDIA_RETENTION_DAYS`, default 7 hari) dan status pesan di database tetap `'active'` agar anggota lain yang online belakangan tetap dapat mengunduh tanpa terkena status expired prematur. Goroutine `PurgeWorker` otomatis berjalan setiap 1 jam untuk menghapus berkas yang telah kedaluwarsa.
  3. **Client-Side Deduplicated IndexedDB (`wuzzchat_media_db`)**: Pengguna yang sudah pernah membuka gambar otomatis menyimpan salinan blob secara lokal, membebaskan server dari pengunduhan ulang.

### 3.9 Query Pagination & Memory Bounding: Limitasi 50 Pesan Awal & Cache-First IndexedDB
* **Lokasi Kode**: [`backend/internal/store/sql.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/sql.go#L490) & [`frontend/lib/messageCache.ts`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/lib/messageCache.ts)
* **Tantangan Skalabilitas**: Ketika ruang obrolan grup terakumulasi hingga ratusan ribu pesan, pengambilan riwayat tanpa batas (*unbounded query*) akan memicu lonjakan memori database, latensi jaringan berlebih, dan *DOM freeze* di browser ponsel pengguna.
* **Solusi Implementasi**:
  1. **Batas Riwayat Awal Server (`LIMIT 50`)**: Backend Go membatasi query riwayat saat event `join` ke 50 pesan terbaru (`ORDER BY created_at DESC LIMIT 50`), dipadukan dengan indeks komposit `idx_messages_room_created (room_id, created_at DESC)` sehingga kecepatan respons tetap konstan pada tingkat **$O(\log N)$**.
  2. **Cache-First 0ms Load**: Klien merender pesan lokal dari IndexedDB (`wuzzchat_msg_db`) terlebih dahulu (0 milidetik), lalu menggabungkan (*upsert*) riwayat 50 pesan server di latar belakang tanpa mengunci UI pengguna.
### 3.10 Core Fanout Optimization $O(M)$ & In-Memory Membership Cache
* **Lokasi Kode**: [`backend/internal/ws/hub.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub.go)
* **Tantangan Performa**: Sebelumnya, fungsi `broadcastLocal` melakukan scan linier $O(N)$ ke seluruh koneksi aktif (`h.clients`) dan mengeksekusi query database SQL `GetConversationMemberUsernames` di setiap pengiriman pesan. Pada ribuan pengguna terkoneksi, hal ini memicu lonjakan CPU dan kejenuhan pool koneksi database.
* **Solusi Implementasi**:
  - Mengimplementasikan `roomMembersCache map[string][]string` dengan lock terisolasi `roomMembersMu sync.RWMutex` pada `Hub`.
  - Lookup penerima pesan dilakukan secara langsung $O(M)$ berdasarkan daftar ID member yang relevan.
  - Invalidation otomatis saat terjadi perubahan keanggotaan grup (`BroadcastGroupSystemEvent`).

### 3.11 Sliding-Window Typing Rate Limiter (Anti-Flood DoS)
* **Lokasi Kode**: [`backend/internal/ws/client.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/client.go)
* **Mitigasi Serangan**: Mencegah serangan denial-of-service melalui pembanjiran frame event `typing` dari bot atau klien modifikasi.
* **Solusi Implementasi**: Menggunakan algoritma sliding-window rate limit per koneksi klien dengan kuota maksimal **3 event typing per 2 detik**. Event berlebih diabaikan secara silent tanpa membebani broadcast goroutine.

### 3.12 Delta Offline History Sync with Checkpoint Timestamp
* **Lokasi Kode**: [`backend/internal/store/sql.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/sql.go) & [`backend/internal/ws/hub.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub.go)
* **Tantangan Efisiensi**: Saat perangkat mobile reconnect setelah offline singkat, pengunduhan ulang 50 pesan penuh memboroskan kuota data seluler dan memori.
* **Solusi Implementasi**: Method `GetRoomHistorySince(roomID, userID, since, limit)` mengeksekusi query delta `WHERE room_id = $1 AND timestamp > $2 ORDER BY timestamp ASC LIMIT $3`. Dikombinasikan dengan pembacaan timestamp pesan terakhir di IndexedDB lokal (`messageCache.ts`), transmisi riwayat pesan dipangkas hingga 90%.

### 3.13 Client-Side Outbound Queue & Auto-Retry Resiliency
* **Lokasi Kode**: [`frontend/lib/ws-client.ts`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/lib/ws-client.ts)
* **Ketahanan Jaringan Mobile**: Menampung pesan ke dalam FIFO `outboundQueue` (maksimal 100 pesan) saat WebSocket dalam status terputus (`reconnecting` / `connecting`), dan mem-flush antrean secara otomatis seketika saat event `onopen` terpicu. Mengeliminasi *blind pop* dengan menahan pesan sampai paket `ack` atau `receipt` yang sesuai diterima dari server.

### 3.14 Server-Side In-Memory Idempotency Guard & Transport ACK (DEC-015)
* **Lokasi Kode**: [`backend/internal/ws/hub.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub.go) & [`backend/internal/ws/client.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/client.go)
* **Vektor Resend Duplikat**: Klien mobile yang terputus di tengah jalan saat mengirim pesan akan mengirim ulang (*retransmit*) pesan yang sama dengan `ID` yang sama begitu soket pulih. Tanpa idempotensi, server akan membroadcast pesan yang sama dua kali ke anggota room sebelum gagal di SQL constraint.
* **Solusi Implementasi**:
  - `Hub` memelihara in-memory cache `dedupHistory map[string]int64` dengan proteksi mutex `dedupMu sync.RWMutex` dan pembersihan otomatis.
  - Pengecekan `IsDuplicateAndRecord` berpresisi `UnixNano()` dengan TTL 2 menit: jika pesan terdeteksi duplikat, server membatalkan broadcast ke room dan broker Redis, namun langsung membalas ACK ke klien agar klien menghentikan pengiriman ulang.
  - Setiap pengiriman pesan masuk yang menyertakan `request_id` otomatis dibalas dengan paket transport `{ type: "ack", request_id: "...", status: "ok" }`.

---

## 🧪 4. Matriks Pengujian Otomatis & Verifikasi E2E

Seluruh lapisan keamanan dan optimasi performa di atas dilindungi oleh suite pengujian otomatis komprehensif:

| Suite Pengujian | File Pengujian | Cakupan Skenario | Status |
| :--- | :--- | :--- | :---: |
| **WebSocket Security & Multi-User Lifecycle E2E** | [`backend/internal/ws/e2e_full_flow_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/e2e_full_flow_test.go) | • Multi-client WebSocket join<br>• WebRTC signaling & message broadcast<br>• Attacker intrusion rejection (BOLA isolation) | ✅ **100% PASS** |
| **Realtime Scalability & Optimization Suite** | [`backend/internal/ws/scalability_optimizations_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/scalability_optimizations_test.go) | • Direct lookup $O(M)$ member routing<br>• Sliding-window typing rate limit<br>• Delta history since checkpoint | ✅ **100% PASS** |
| **Transport ACK & Idempotency Suite** | [`backend/internal/ws/ack_idempotency_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/ack_idempotency_test.go) | • Request ID ACK correlation<br>• Server duplicate broadcast suppression<br>• UnixNano TTL expiration | ✅ **100% PASS** |
| **REST API & Store Lifecycle E2E** | [`backend/internal/api/chat_and_media_e2e_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/chat_and_media_e2e_test.go) | • Media ACK IDOR protection & physical file delete<br>• Batched CTE conversation list<br>• Privacy filter (`cleared_at`) & reappearance | ✅ **100% PASS** |
| **SSRF & DNS Rebinding E2E** | [`backend/internal/api/link_preview_e2e_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/link_preview_e2e_test.go) | • Block 14 vektor SSRF (Loopback, Cloud Metadata, CGNAT)<br>• Block Redirect SSRF & Loop<br>• Safe scraping & Redis caching | ✅ **100% PASS** |
| **Collision & Deterministic Direct Room E2E** | [`backend/internal/store/sql_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/sql_test.go) | • Stress-test prefix collision (0 tabrakan)<br>• Order-invariance & idempotency<br>• Legacy direct room backward compatibility | ✅ **100% PASS** |
| **Purge Worker & Storage Lifecycle** | [`backend/internal/storage/purge_worker_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/storage/purge_worker_test.go) | • Store-and-forward physical file purging | ✅ **100% PASS** |
| **Push Notification Lifecycle E2E** | [`backend/internal/ws/e2e_push_notification_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/e2e_push_notification_test.go) | • Subscribe VAPID endpoint<br>• Offline push dispatch<br>• Unsubscribe endpoint & cleanup | ✅ **100% PASS** |
| **Zero-Knowledge Key Migration & Transfer** | [`backend/internal/api/transfer_handler_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/transfer_handler_test.go) | • Atomic session consume<br>• Anti-replay 410 Gone<br>• Unauthorized 403 Forbidden & Expired TTL | ✅ **100% PASS** |
| **Single Active Device WebSocket Kick** | [`backend/internal/ws/hub_single_device_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub_single_device_test.go) | • Sesi WebSocket lama otomatis di-kick (`SESSION_REPLACED`) saat login baru<br>• Hard conflict blocker & 0% kebocoran plaintext | ✅ **100% PASS** |

---

## 📚 Dokumen Terkait
- [Arsitektur Database & WebSocket Protocol (`docs/ARCHITECTURE.md`)](ARCHITECTURE.md)
- [Roadmap Pengembangan Fitur (`docs/ROADMAP.md`)](ROADMAP.md)
- [Laporan Progres & Milestone Terkini (`docs/PROGRESS.md`)](PROGRESS.md)
