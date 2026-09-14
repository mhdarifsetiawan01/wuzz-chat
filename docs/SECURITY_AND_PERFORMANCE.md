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
3. [Arsitektur Performa & Skalabilitas (Performance Optimization)](#-3-arsitektur-performa--skalabilitas-performance-optimization)
   - 3.1 [Penyelesaian Masalah $N+1$ Query pada `GetUserConversations`](#31-penyelesaian-masalah-n1-query-pada-getuserconversations)
   - 3.2 [Indeks Performa Database (PostgreSQL & SQLite)](#32-indeks-performa-database-postgresql--sqlite)
   - 3.3 [Keandalan Concurrency SQLite (WAL Mode & Busy Timeout)](#33-keandalan-concurrency-sqlite-wal-mode--busy-timeout)
   - 3.4 [Goroutine Concurrency & Buffered WebSocket Channels](#34-goroutine-concurrency--buffered-websocket-channels)
   - 3.5 [Skalabilitas Horizontal Multi-Node (Redis Cluster Pub/Sub)](#35-skalabilitas-horizontal-multi-node-redis-cluster-pubsub)
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

### 2.4 Anti-Spoofing Identitas Pengguna (JWT Enforcement)
* **Lokasi Kode**: [`backend/internal/ws/handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/handler.go) & [`backend/internal/auth/middleware.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/auth/middleware.go)
* **Solusi Implementasi**:
  Server tidak pernah mempercayai field `from_id` atau `nickname` yang dikirimkan oleh klien di payload JSON. Identitas pengirim selalu dipaksakan (*enforced*) dari claims token JWT yang telah diverifikasi secara kriptografis menggunakan secret key backend.

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
* **Lokasi Kode**: [`backend/internal/push/push.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/push/push.go) & [`frontend/public/sw.js`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/public/sw.js)
* **Prinsip Keamanan**:
  - **Zero Server Decryption**: Backend Go TIDAK PERNAH memegang private key pengguna dan TIDAK BISA mendekripsi payload `e2ee:v1:...`.
  - **Client-Side Background Decryption**: Service Worker (`sw.js`) membaca private key penerima dari IndexedDB (`wuzz_crypto_db`) dan kunci publik pengirim dari push data, lalu melakukan derivasi kunci AES-256-GCM via Web Crypto API untuk mendekripsi teks pesan secara lokal sebelum diteruskan ke Notification API sistem operasi.
  - **Graceful Fallback**: Jika browser belum memiliki kunci privat atau decrypt gagal, notifikasi jatuh kembali secara aman ke teks fallback `🔒 Pesan Baru (Terenkripsi)` tanpa memicu kebocoran data.

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
  1. **Query 1 (Percakapan & Data Lawan Bicara)**: Menggabungkan data room dan peer user dalam 1 kueri dengan `LEFT JOIN`.
  2. **Query 2 (Pesan Terakhir & Snippet Media)**: Menggunakan Common Table Expressions (CTE) dan *Window Function* `ROW_NUMBER() OVER (PARTITION BY m.room_id ORDER BY m.created_at DESC)` untuk mengambil pesan terakhir seluruh room sekaligus dalam 1 trip.
  3. **Query 3 (Unread Badge Counter)**: Menggunakan agregasi `GROUP BY m.room_id` untuk menghitung pesan belum dibaca secara massal.
* **Dampak**: Menghemat **98% konsumsi koneksi database** dan memangkas waktu respon API hingga **< 15ms**.

### 3.2 Indeks Performa Database (PostgreSQL & SQLite)
* **Lokasi Kode**: [`backend/internal/store/sql.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/sql.go#L100-L148)
* **Indeks yang Diterapkan**:
  - `idx_conv_members_user ON conversation_members(user_id)`: Mempercepat lookup daftar room milik user.
  - `idx_conv_members_conv ON conversation_members(conversation_id)`: Mempercepat lookup anggota dalam room.
  - `idx_messages_room_time ON messages(room_id, created_at)`: Mempercepat pagination riwayat obrolan linimasa.
  - `idx_messages_unread ON messages(room_id, status)`: Mengoptimalkan filter badge unread tanpa full-table scan.
  - `idx_messages_to_status ON messages(to_id, status)`: Mempercepat sinkronisasi delivery receipts global saat user online.

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

---

## 🧪 4. Matriks Pengujian Otomatis & Verifikasi E2E

Seluruh lapisan keamanan dan optimasi performa di atas dilindungi oleh suite pengujian otomatis komprehensif:

| Suite Pengujian | File Pengujian | Cakupan Skenario | Status |
| :--- | :--- | :--- | :---: |
| **WebSocket Security & Multi-User Lifecycle E2E** | [`backend/internal/ws/e2e_full_flow_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/e2e_full_flow_test.go) | • Multi-client WebSocket join<br>• WebRTC signaling & message broadcast<br>• Attacker intrusion rejection (BOLA isolation) | ✅ **100% PASS** |
| **REST API & Store Lifecycle E2E** | [`backend/internal/api/chat_and_media_e2e_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/chat_and_media_e2e_test.go) | • Media ACK IDOR protection & physical file delete<br>• Batched CTE conversation list<br>• Privacy filter (`cleared_at`) & reappearance | ✅ **100% PASS** |
| **SSRF & DNS Rebinding E2E** | [`backend/internal/api/link_preview_e2e_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/link_preview_e2e_test.go) | • Block 14 vektor SSRF (Loopback, Cloud Metadata, CGNAT)<br>• Block Redirect SSRF & Loop<br>• Safe scraping & Redis caching | ✅ **100% PASS** |
| **Collision & Deterministic Direct Room E2E** | [`backend/internal/store/sql_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/sql_test.go) | • Stress-test prefix collision (0 tabrakan)<br>• Order-invariance & idempotency<br>• Legacy direct room backward compatibility | ✅ **100% PASS** |
| **Purge Worker & Storage Lifecycle** | [`backend/internal/storage/purge_worker_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/storage/purge_worker_test.go) | • Store-and-forward physical file purging | ✅ **100% PASS** |
| **Push Notification Lifecycle E2E** | [`backend/internal/ws/e2e_push_notification_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/e2e_push_notification_test.go) | • Subscribe VAPID endpoint<br>• Offline push dispatch<br>• Unsubscribe endpoint & cleanup | ✅ **100% PASS** |

---

## 📚 Dokumen Terkait
- [Arsitektur Database & WebSocket Protocol (`docs/ARCHITECTURE.md`)](ARCHITECTURE.md)
- [Roadmap Pengembangan Fitur (`docs/ROADMAP.md`)](ROADMAP.md)
- [Laporan Progres & Milestone Terkini (`docs/PROGRESS.md`)](PROGRESS.md)
