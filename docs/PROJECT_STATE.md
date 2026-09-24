# 📌 WuzzChat — Canonical Project State & Architecture Single Source of Truth (SSOT)

> **Document Status**: CANONICAL & CURRENT  
> **Last Verified Against Codebase**: 2026-09-24  
> **Target Audience**: AI Coding Agents, Software Architects, and Core Developers  
> **Rule of Thumb**: Jika terdapat perbedaan antara dokumentasi lama dengan dokumen ini, **dokumen ini bersama source code aktual adalah sumber kebenaran utama (Single Source of Truth)**.

---

## 1. Product Context

### Apa itu WuzzChat?
**WuzzChat** adalah platform perpesanan real-time hibrida modern yang menggabungkan komunikasi instan 1-on-1 berenkripsi ujung-ke-ujung (E2EE), obrolan grup terstruktur, forum diskusi efemeral (*sub-groups*), dan **AI Memory Engine** terkurasi.

### Problem yang Ingin Diselesaikan
1. **Chat Amnesia & Ephemeral Chaos**: Diskusi di aplikasi chat konvensional (WhatsApp/Telegram/Slack) menghasilkan ribuan pesan sporadis yang cepat tenggelam. Keputusan penting, rencana aksi, dan konsensus tim hilang tanpa jejak atau menuntut pencatatan manual yang melelahkan.
2. **AI Hallucination & Lack of Accountability**: Ringkasan AI otomatis tanpa kendali manusia sering kali mengarang fakta (halusinasi) dan tidak dapat dijadikan rujukan resmi organisasi.
3. **Storage Cost & Privacy Leak**: Layanan perpesanan cloud biasanya menimbun media fisik selamanya di server penyedia layanan, memicu biaya penyimpanan tinggi dan risiko kebocoran privasi.

### Positioning Produk
Bukan sekadar aplikasi chat kloningan, dan bukan bot AI generik. WuzzChat diposisikan sebagai **Actionable Knowledge Messaging Engine**:
> *"Platform perpesanan yang mengubah obrolan sporadis menjadi aset pengetahuan terverifikasi bagi kelompok kerja, komunitas, dan individu."*

### Core Differentiation
1. **Curated Human-in-the-Loop AI Memory**: AI bertugas mengekstrak intisari, keputusan, dan perjalanan pemikiran; manusia (Admin/Creator) yang memvalidasi, menyunting, dan menerbitkannya.
2. **$0 Server Storage Media (Store-and-Forward)**: Berkas media di server hanya berfungsi sebagai transit buffer dan otomatis dihapus segera setelah penerima mengunduhnya ke penyimpanan lokal (IndexedDB).
3. **Zero-Knowledge Decrypted Background Push**: Konten pesan E2EE dapat tampil terdekripsi pada notifikasi push OS pengguna tanpa server pernah mengetahui kunci privat atau plaintext pesan.

### Filosofi AI Memory
> 🎯 **"AI captures. Humans validate. Wuzz remembers."**
* **AI captures**: AI memantau percakapan yang selesai, mengekstrak ringkasan, butir keputusan dengan bukti pesan (*evidence IDs*), dan narasi alur pemikiran.
* **Humans validate**: Admin atau pemilik percakapan meninjau draf hasil AI melalui antarmuka tinjauan khusus (menyetujui, mengedit, atau menolak).
* **Wuzz remembers**: Hanya memori yang telah disetujui manusia yang disimpan secara permanen di basis pengetahuan kelompok (*Group Knowledge Hub*).

### Target Product Direction
Menjadi *headless messaging & memory engine* yang dapat diakses secara mulus melalui Web (Next.js PWA), Mobile Apps (React Native / Android Kotlin & iOS Swift), dan siap diintegrasikan sebagai modul perpesanan pintar pihak ketiga.

---

## 2. Current Product State (Actual Capabilities)

Status eksplisit kapabilitas sistem berdasarkan implementasi aktual di codebase:

| Capability | Status | Detail Implementasi Aktual |
|---|---|---|
| **Identity & User Profiles** | `IMPLEMENTED` | Registrasi akun, avatar studio, kompresi WebP, verifikasi lencana centang biru (`is_verified`), bio/status message, UUID-first identity. |
| **Authentication & Sessions** | `IMPLEMENTED` | JWT token (7 hari), password hashing bcrypt, revocation blacklist (`token_blacklist`), session inventory table (`sessions`), remote logout, revoke other devices. |
| **Device Management & Gating** | `IMPLEMENTED` | Tabel `devices`, batas maksimal 2 perangkat aktif bersamaan, deteksi konflik HTTP 409 (`DEVICE_LIMIT_REACHED`), pengeluaran perangkat selektif / FIFO kick, platform tracking (`web`, `android`, `ios`). |
| **Direct Messaging (1-on-1)** | `IMPLEMENTED` | Room deterministik, linimasa pesan real-time, 3-stage receipts (`sent` ✓, `delivered` ✓✓ abu-abu, `read` ✓✓ biru), quote reply, reactions emoji, unread counters. |
| **Group Messaging** | `IMPLEMENTED` | Grup persisten (`grp_<UUID>`), RBAC (`creator`, `admin`, `member`), approval join request grup privat, penyesuaian profil grup. |
| **Subgroups / Forum Topics** | `IMPLEMENTED` | Subgrup bertopik efemeral (`sub_<UUID>`), waktu hidup terbatas (*TTL expiration*), purging otomatis keanggotaan saat masa aktif usai. |
| **Realtime WebSocket Hub** | `IMPLEMENTED` | Goroutine read/write pump, heartbeat ping/pong, typing indicator dinamis, otorisasi keanggotaan room *fail-closed*, receipt broadcasting. |
| **Cluster Synchronization** | `IMPLEMENTED` | Redis Pub/Sub multi-instance Go hub via channel `wuzz:cluster:events`, mekanisme anti-echo loop UUID, in-memory dedup cache. |
| **End-to-End Encryption (E2EE)** | `IMPLEMENTED (DM Only)` | ECDH P-256 + HKDF + AES-256-GCM via Web Crypto API, penyimpanan kunci privat lokal di IndexedDB (`wuzz_crypto_db`), Safety Number fingerprint 30-digit. *Grup dan Forum bersifat non-E2EE.* |
| **E2EE Device Migration (QR)** | `IMPLEMENTED` | Pemindahan keypair E2EE antar perangkat secara Zero-Knowledge menggunakan QR code ephemeral (TTL 5 menit), enkripsi AES-256-GCM dari entropy PBKDF2. |
| **Store-and-Forward Media** | `IMPLEMENTED` | Unggah gambar, dokumen (PDF/Word/ZIP), voice note berformat audio kustom; auto-purge di server via `POST /api/media/ack` (DM) dan background TTL purge worker (7 hari). |
| **Shared Media Hub (Group/Forum)**| `IMPLEMENTED` | Untuk grup dan forum, panggilan ack download tidak menghapus media fisik sebelum masa TTL habis agar seluruh anggota berkesempatan mengunduh ke cache lokal. |
| **Offline Media Cache** | `IMPLEMENTED` | IndexedDB browser klien (`mediaCache.ts`) menyimpan file terunduh sehingga dapat dibuka kembali secara offline dan instan ($0 server latency). |
| **Write-Through Message Cache** | `IMPLEMENTED` | IndexedDB (`wuzzchat_msg_db`) menyimpan riwayat obrolan terdekripsi secara lokal; pemuatan room 0ms (*Cache-First*). |
| **Push Notification Engine** | `IMPLEMENTED` | RFC 8292 WebPush VAPID untuk Web/PWA, perutean token native FCM via `PushProvider`, dekripsi pesan E2EE di background worker (`sw.js`). |
| **Search Message** | `IMPLEMENTED` | Endpoint `GET /api/chat/messages/search` dengan query SQL LIKE, verifikasi otorisasi anggota room, dan penandaan hasil pencarian. |
| **Edit & Delete Message** | `IMPLEMENTED` | Edit pesan dalam batas 15 menit (`PUT /api/chat/messages/edit`), Delete for Everyone dalam 1 jam, Delete for Me (soft-delete lokal), event real-time `message_edited`/`message_deleted`. |
| **OpenGraph Link Preview** | `IMPLEMENTED` | Scraper backend aman dengan proteksi Anti-SSRF (socket-level IP pinning, blokir subnet privat/loopback), Redis caching 24 jam. |
| **Voice Calling (WebRTC P2P)** | `IMPLEMENTED` | Panggilan suara 1-on-1 latensi rendah dengan signaling WebSocket, STUN + OpenRelay TURN fallback, ringtone prosedural Web Audio API. |
| **AI Memory (Forum)** | `IMPLEMENTED` | Ekstraksi otomatis saat forum kedaluwarsa, antrean kerja `forum_memory_jobs` (Postgres `SKIP LOCKED`), Gemini 2.5 Flash / Groq LLM, draf tinjauan admin, audit trail, publikasi snapshot memori. |
| **AI Memory (Group Chat)** | `PARTIAL` | Interface `ContextSource` telah mendukung `ContextTypeGroup`, namun belum ada penjadwal / trigger summarization on-demand di luar siklus expired forum. |
| **AI Memory (Personal Chat)** | `NOT IMPLEMENTED` | Terkendala arsitektur E2EE (server hanya memegang ciphertext, tidak memiliki akses plaintext pesan direct chat). Memerlukan pipeline ekspor / LLM di sisi klien. |
| **AI Memory (Meeting)** | `NOT IMPLEMENTED` | Belum ada pipeline transkrip audio / Speech-to-Text (STT) dan prompt agenda/action items. |
| **Mobile Client App** | `NOT IMPLEMENTED` | Backend telah siap melayani mobile (REST/WS/Push), namun aplikasi mobile native (React Native / Flutter / Kotlin / Swift) belum dibangun. |
| **Passkey / WebAuthn (FIDO2)** | `NOT IMPLEMENTED` | Desain arsitektur telah tercatat di `docs/ARCHITECTURE_AUDIT.md` (Fase 11 Phase 4), namun belum diimplementasikan di kode. |

---

## 3. Current Architecture

WuzzChat mengadopsi arsitektur **Modular Monolith** dengan pendekatan *lightweight layered architecture* per bounded context.

```
                          ┌──────────────────────────────────────┐
                          │   HTTP / WebSocket Clients (Klien)   │
                          │   (Web Next.js, Mobile App, Postman) │
                          └──────────────────┬───────────────────┘
                                             │
─────────────────────────────────────────────┼─────────────────────────────────────────────
[TRANSPORT LAYER]                            ▼
  backend/internal/api/           backend/internal/ws/
  ├── auth_handler.go             ├── hub.go (WebSocket Hub)
  ├── chat_handler.go             ├── client.go (Pump & Reader)
  ├── group_handler.go            └── message.go (Wire Formats)
  ├── memory_handler.go
  ├── media_handler.go
  └── link_preview.go
─────────────────────────────────────────────┬─────────────────────────────────────────────
[APPLICATION LAYER]                          ▼
  backend/internal/authz/         backend/internal/messaging/     backend/internal/group/
  └── service.go (AuthService)    └── service.go (MessageService) ├── service.go (GroupService)
                                                                  └── forum_service.go
  backend/internal/memory/        backend/internal/ai/            backend/internal/push/
  ├── service.go (MemoryService)  ├── service.go (AIService)      └── push.go (PushService)
  └── context_source.go           └── processor.go
─────────────────────────────────────────────┬─────────────────────────────────────────────
[DOMAIN REPOSITORIES & INFRA]                ▼
  backend/internal/authz/infra/   backend/internal/messaging/infra/ backend/internal/group/infra/
  backend/internal/memory/infra/  backend/internal/storage/         backend/internal/broker/
  backend/internal/store/ (SQL Schema, Connection Pool, Multi-DB Driver: PostgreSQL / SQLite)
```

### Dependency Inversion & Bootstrap Wiring
- **Entrypoint (`backend/main.go`)**: Bootstrap ramping (56 baris) yang memuat konfigurasi terpusat via `internal/shared/config`, menginisialisasi kontainer aplikasi, dan menangani *graceful shutdown* via OS signals (`SIGINT`, `SIGTERM`).
- **Container (`backend/internal/app/container.go` & `wire.go`)**: Bertanggung jawab menginstansiasi koneksi basis data (`*sql.DB`), broker Redis, service layer, dan menyuntikkannya ke HTTP router.
- **Frontend Architecture**:
  - Next.js 16 (Turbopack) dengan React 19 dan TypeScript.
  - Custom proxy server (`frontend/server.js`) untuk isolasi WebSocket upgrade dan reverse proxy `/api/*` serta `/uploads/*`.
  - Dual-Platform Responsive Engine: desktop split 2-kolom dan mobile WhatsApp single-screen flow (`100dvh`, sticky header, back-handler interceptor).
  - Client-Side Crypto & Cache Engine: Web Crypto API (P-256) + IndexedDB (`wuzz_crypto_db`, `wuzzchat_msg_db`, `wuzzchat_media_cache`).

---

## 4. Domain Map

### 1. Domain `authz` (Identity, Auth & Access)
- **Responsibility**: Autentikasi pengguna, manajemen siklus hidup sesi, pelacakan perangkat aktif, penegakan kuota multi-perangkat (maksimal 2 perangkat), dan pencabutan token.
- **Main Entities**: `User`, `SessionInfo`, `Device`, `RegisterInput`, `LoginInput`, `DeviceConflict`.
- **Main Service**: `authz.AuthService` ([`backend/internal/authz/service.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/authz/service.go)).
- **Repository Interface**: `authz.AuthRepository` ([`backend/internal/authz/repository.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/authz/repository.go)).
- **Dependencies**: Mengakses basis data via `authz/infra/sql_repository.go` dan `store.UserStore`.
- **Known Limitation**: Entitas profil pengguna (`UpdateProfile`) dan kunci E2EE (`UpdatePublicKey`) masih diakses langsung dari handler ke `store.UserStore` tanpa lewat `AuthService`.

### 2. Domain `messaging` (Chat, Direct Messaging & Message Lifecycle)
- **Responsibility**: Mengelola percakapan 1-on-1, pencarian pesan, riwayat obrolan, penyuntingan pesan (batas 15 menit), penghapusan pesan (*Delete for Everyone* / *Delete for Me*), pesan tersemat (*pin/unpin*), dan pembaruan tanda terima (*read receipts*).
- **Main Entities**: `Message`, `Conversation`, `ReceiptUpdate`, `MessageSearchQuery`.
- **Main Service**: `messaging.MessageService` ([`backend/internal/messaging/service.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/messaging/service.go)).
- **Repository Interfaces**: `messaging.MessageRepository`, `messaging.ConversationRepository`, `messaging.UserLookupRepository`.
- **Dependencies**: Terhubung ke `internal/ws` untuk memicu broadcast real-time (melanggar aturan dependensi bersih).
- **Known Limitation**: Domain mengimpor `internal/ws.Message` untuk kebutuhan broadcast transport.

### 3. Domain `group` (Persistent Groups & Ephemeral Forums)
- **Responsibility**: Siklus hidup grup persisten, peran anggota (`creator`, `admin`, `member`), persetujuan permintaan bergabung (*join requests*), dan forum topik efemeral dengan batas waktu aktif (*TTL expiration*).
- **Main Entities**: `Group`, `GroupMember`, `JoinRequest`, `ForumTopic`.
- **Main Services**: `group.GroupService`, `group.ForumService` ([`backend/internal/group/service.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/group/service.go)).
- **Repository Interfaces**: `group.GroupRepository`, `group.UserLookupRepository`.
- **Workers**: `group/worker/ttl_worker.go` (memantau forum yang kedaluwarsa).
- **Dependencies**: Memanggil `ws.Hub` untuk event grup dan membuat job memori di `store.MemoryStore`.

### 4. Domain `memory` (AI Memory Engine)
- **Responsibility**: Ekstraksi intisari, keputusan terstruktur, dan narasi alur pemikiran dari percakapan; siklus tinjauan draf oleh admin; audit aksi review; dan publikasi snapshot memori terverifikasi.
- **Main Entities**: `MemoryJob`, `MemoryDraft`, `MemoryArtifact`, `ApprovedMemory`, `MemoryContext`.
- **Main Service**: `memory.MemoryService` ([`backend/internal/memory/service.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/memory/service.go)).
- **Core Abstraction**: `ContextSource` ([`backend/internal/memory/context_source.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/memory/context_source.go)) & `ContextSourceRegistry`.
- **Dependencies**: `ai.AIService` (eksekusi LLM) dan `push.Service` (notifikasi draf & approval).
- **Known Limitation**: Skema database (`forum_memory_jobs`) dan DTO JSON masih memuat atribut `forum_id` dan `group_id`.

### 5. Domain `ai` (LLM Orchestration & Prompts)
- **Responsibility**: Komunikasi dengan provider model bahasa besar (Gemini 2.5 Flash, Groq, Mock Provider), pembuatan prompt terstruktur, validasi format JSON keluaran, dan kalkulasi confidence level.
- **Main Service**: `ai.AIService` ([`backend/internal/ai/service.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ai/service.go)), `ai.Processor` ([`backend/internal/ai/processor.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ai/processor.go)).

### 6. Domain `push` (Multi-Platform Push Gateway)
- **Responsibility**: Pengiriman notifikasi push ke perangkat Web/PWA (VAPID RFC 8292) dan aplikasi Android native (FCM v1).
- **Main Service**: `push.Service` ([`backend/internal/push/push.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/push/push.go)).
- **Provider Abstraction**: Interface `PushProvider` (`VAPIDWebPushProvider`, `FCMv1PushProvider`).

### 7. Domain `storage` (Store-and-Forward Media Buffer)
- **Responsibility**: Penanganan upload file sementara (Supabase Storage / Local Disk), penghapusan berkas fisik saat di-ack oleh klien, dan background purge worker untuk berkas kedaluwarsa.
- **Main Service**: `storage.StorageDriver`, `storage.PurgeWorker` ([`backend/internal/storage/`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/storage/)).

---

## 5. Memory Architecture

### Pipeline Alur Kerja Memori AI (Current State)
```text
[Forum Expired / Completed]
        │
        ▼
[Create MemoryJob (Status: QUEUED)] ➔ Disimpan di basis data
        │
        ▼
[MemoryJobWorker (Goroutine Background)]
   ├── Mengambil job dengan kueri atomik (PostgreSQL: SELECT ... FOR UPDATE SKIP LOCKED)
   ├── Mengubah status menjadi PROCESSING
   └── Memanggil ContextSource.GetMessages & GetContextMeta
        │
        ▼
[AIService (Gemini 2.5 Flash / Groq LLM)]
   ├── Menganalisis riwayat pesan
   └── Menghasilkan Structured JSON: Summary, Decisions (dg Evidence IDs), JourneyLite
        │
        ▼
[Simpan MemoryDraft (Status: DRAFT)] ➔ Notifikasi WebPush & WS ke Admin/Creator
        │
        ▼
[Human Review Gate (Review UI di Web / Modal)]
   ├── Admin meninjau draf
   ├── Opsi 1: REJECT ➔ Status draf menjadi REJECTED (audit dicatat)
   ├── Opsi 2: APPROVE / APPROVE_WITH_EDITS ➔ Admin menyunting/menyetujui draf
        │
        ▼
[Publikasi ApprovedMemory (Snapshot)]
   ├── Memori disimpan permanen di basis pengetahuan kelompok
   └── Notifikasi ke seluruh anggota grup bahwa memori telah terbit
```

### Matriks Kesiapan Tipe Konteks Memori

| Tipe Konteks | Status | Kesiapan Backend & Kendala Teknis |
|---|---|---|
| **Forum Memory** | `IMPLEMENTED` | **Production Ready 100%**. Terintegrasi penuh dengan siklus expired forum efemeral, antrean worker, review modal, dan snapshot viewer. |
| **Group Memory** | `PARTIAL` | **Arsitektur Siap, Trigger Belum Lengkap**. Interface `ContextSource` telah mendukung `ContextTypeGroup`. Namun belum tersedia trigger summarization berkala (misal: mingguan) atau perintah on-demand (misal `@wuzz summarize`) di obrolan grup persisten. |
| **Personal Chat Memory** | `NOT IMPLEMENTED` | **Terkendala E2EE**. Pada direct chat 1-on-1, pesan dienkripsi secara E2EE di perangkat klien. Server **hanya memegang ciphertext** tanpa kunci privat. Backend tidak dapat membaca riwayat pesan untuk dikirim ke LLM. *Solusi masa depan*: Pemrosesan LLM di sisi klien (*On-Device LLM*) atau ekspor konteks terdekripsi oleh klien. |
| **Meeting Memory** | `NOT IMPLEMENTED` | **Pipeline Belum Ada**. Memerlukan integrasi Speech-to-Text (STT) untuk memproses rekaman audio/WebRTC call menjadi transkrip teks ber-timestamp, serta prompt khusus agenda rapat dan penugasan *action items*. |

---

## 6. Identity / Authentication / Device Model

### Relasi Entitas Identitas
```text
User (UUID PK)
├── Credentials (username, password_hash)
├── Identity Attributes (display_name, avatar_url, bio, is_verified)
├── Cryptographic Keys (public_key ECDH P-256, key_version, active_device_id)
├── Sessions (1 user : N sessions — JWT JTI, IP, User-Agent, is_revoked)
└── Devices (1 user : max 2 devices — device_id, platform, name, is_active)
```

### Detail Komponen
1. **JWT & Sesi**:
   - Token ditandatangani menggunakan `HMAC-SHA256` dengan masa berlaku 7 hari.
   - Setiap token disematkan klaim unik `jti` (UUID).
   - Tabel `sessions` mencatat setiap login aktif. Jika pengguna melakukan logout atau remote logout, `jti` dimasukkan ke tabel `token_blacklist` sehingga token lama langsung ditolak oleh middleware `auth.RequireJWT()`.
2. **Manajemen Multi-Perangkat (Device Registry)**:
   - Klien menghasilkan `device_id` acak berformat `dev_<uuid>` dan menyimpannya di `localStorage`.
   - Sistem membatasi maksimal **2 perangkat aktif** bersamaan per akun pengguna.
   - Jika login dari perangkat ke-3:
     - Jika `confirm_override = false`: Server mengembalikan **HTTP 409 Conflict** (`DEVICE_LIMIT_REACHED`) beserta daftar perangkat yang sedang aktif.
     - Jika `confirm_override = true`: Server mengeluarkan perangkat lama secara otomatis (FIFO) atau mengeluarkan perangkat spesifik yang dipilih via `kick_device_id`.
3. **Platform Awareness**:
   - Backend membaca platform dari field JSON `platform` atau HTTP header `X-Device-Platform` (`web`, `android`, `ios`).
   - Jika tidak disediakan, backend mendeteksi secara otomatis dari header `User-Agent`.
   - Nama perangkat ramah pengguna diformat secara otomatis (misal: `"Chrome on Windows"`, `"Android Device"`, `"iPhone"`).
4. **Relasi Kunci Kriptografi E2EE**:
   - E2EE saat ini menggunakan model **Single Shared Master Keypair per Akun**.
   - Kolom `active_device_id` di database mencatat perangkat mana yang saat ini memegang sesi aktif kunci E2EE.
   - Untuk memindahkan kunci ke perangkat kedua tanpa kebocoran, pengguna menggunakan fitur **Device Transfer via QR Code** (mentransfer kunci privat terenkripsi AES-256-GCM langsung antar-layar).

---

## 7. Realtime Architecture

### Komponen Utama
- **WebSocket Hub (`backend/internal/ws/hub.go`)**: Pusat orkestrasi koneksi real-time, menyimpan pemetaan memori lokal (`clients`, `userClients`, `rooms`).
- **Client Pump (`backend/internal/ws/client.go`)**: Setiap koneksi websocket memiliki 2 goroutine: `readPump` (membaca frame dari klien) dan `writePump` (menulis frame ke klien dengan buffering channel 256 pesan).
- **Protokol Wire Format**: Standar JSON berbasis RFC 6455 dengan event types: `message`, `receipt`, `reaction`, `typing`, `room_users`, `message_edited`, `message_deleted`, `system`.
- **Cluster Sync (`backend/internal/broker/`)**: Sinkronisasi multi-instance Go WebSocket memanfaatkan Upstash Redis / Redis Cluster Pub/Sub.

### Known Scalability Limitations & Scaling Options

| Aspek | Kondisi Saat Ini (Current Limitation) | Status Dampak | Solusi Masa Depan (Future Scaling Option) |
|---|---|---|---|
| **Cluster Channel** | Menggunakan **Single Global Redis Channel** (`wuzz:cluster:events`). Seluruh event chat dari semua room di-publish ke satu channel ini. | `CURRENT LIMITATION` (Aman untuk < 10.000 concurrent users / 2–3 nodes. Menjadi bottleneck CPU saat jutaan pesan). | Terapkan *Channel Partitioning per Room* (`wuzz:room:{room_id}`) atau sharding berbasis *hash slot*. |
| **Presence Tracking** | **Local-Only Presence**. Pengecekan anggota online di room (`h.rooms[roomID]`) hanya memeriksa memori lokal pada instance node yang sama. | `CURRENT LIMITATION` (Bisa memicu pengiriman push notification ke user yang sebenarnya sedang online di node backend lain). | Simpan status online global di Redis Set / Hash dengan TTL heartbeat (`SET user:{id}:online 1 EX 60`). |
| **Hub Mutex** | Mutex global `h.mu.RLock()` / `h.mu.Lock()` masih mengunci struktur room saat ada koneksi baru atau broadcast. | `CURRENT LIMITATION` (Dedup dan member cache sudah dipisah, lock contention rendah di skala saat ini). | Gunakan pemisahan *Sharded Hub* atau *Room-Level Mutex*. |

> ⚠️ **Catatan Penting**: Batasan di atas **TIDAK PERLU diperbaiki sekarang**. Sistem saat ini terbukti sangat stabil, lulus tes konkurensi, dan beban server di Fly.io sangat minim.

---

## 8. Mobile Readiness

### Status Kesiapan: Backend Ready vs Client Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                    WUZZCHAT MOBILE MATRIX                   │
├──────────────────────────────┬──────────────────────────────┤
│ BACKEND READY (SELESAI ✅)   │ CLIENT APP (BELUM ADA ❌)    │
├──────────────────────────────┼──────────────────────────────┤
│ • Headless REST API (JSON)   │ • React Native App (Repo)    │
│ • WebSocket RFC 6455         │ • Android Native Kotlin App  │
│ • Platform Detection Header  │ • iOS Native Swift App       │
│ • Multi-Device Gating (409)  │ • Local Key Keystore Wrapper │
│ • QR Device Transfer API     │ • FCM SDK Listener Service   │
│ • Pluggable PushProvider     │                              │
│ • FCM v1 Token Auto-Routing  │                              │
└──────────────────────────────┴──────────────────────────────┘
```

1. **Authentication & Session**: Klien mobile cukup memanggil `POST /api/auth/login` dengan menyertakan header `X-Device-Platform: android` atau `X-Device-Platform: ios`.
2. **WebSocket Signaling**: Klien mobile dapat langsung menghubungkan library WebSocket standar (misal OkHttp di Android, URLSession di iOS, atau bawaan React Native) ke endpoint `wss://wuzz-chat-backend.fly.dev/ws?token=<JWT>&device_id=<DEV_ID>`.
3. **Push Notifications**:
   - Backend telah mendukung perutean otomatis di `POST /api/notifications/subscribe`.
   - Token registrasi FCM dari Android / iOS native dapat langsung dikirimkan sebagai `endpoint: "<FCM_DEVICE_TOKEN>"`.
   - Backend secara otomatis mendeteksi bahwa endpoint bukan URL VAPID dan mengalirkannya ke `FCMv1PushProvider`.
   - *Catatan APNs*: Aplikasi iOS melalui React Native / Flutter yang memanfaatkan Firebase Messaging (FCM bridging) dapat langsung menggunakan infrastruktur ini tanpa perlu driver direct APNs HTTP/2 terpisah.
4. **Pertimbangan Kriptografi E2EE di Mobile**:
   - Klien mobile harus mengimplementasikan kurva standar **ECDH NIST P-256** dan enkripsi **AES-256-GCM** yang kompatibel dengan Web Crypto API browser.
   - Pustaka yang direkomendasikan: `react-native-quick-crypto` (React Native) atau bawaan `java.security` / `CryptoKit` (Kotlin/Swift).

---

## 9. Security & Privacy

1. **Anti-BOLA / IDOR Verification**: Setiap request REST dan frame WebSocket yang mengakses pesan, room, riwayat obrolan, atau forum divalidasi keanggotaannya secara *fail-closed* (`isAuthorizedForRoom`). Manipulasi ID percakapan milik pengguna lain otomatis ditolak (HTTP 403 / WS Drop).
2. **Anti-Spoofing JWT Claims**: Identitas pengirim pesan (`from_id`) di WebSocket dipaksa menggunakan ID terotentikasi dari klaim JWT saat handshake awal, bukan dari payload JSON yang dikirimkan klien.
3. **Anti-SSRF Link Preview Scraper**: Endpoint link preview menerapkan socket-level IP pinning (`CheckRedirect` + DNS lookup dialer) yang memblokir akses ke IP privat (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254`).
4. **Fail-Closed E2EE Direct Chat**: Direct message 1-on-1 diamankan dengan kunci ECDH P-256. Server tidak pernah menerima plaintext pesan ataupun kunci privat. Jika terjadi konflik kunci, aplikasi masuk ke status terkunci (*Hard Blocker UI*) untuk mencegah kebocoran pesan.
5. **Zero-Knowledge Background Push**: Payload push notification E2EE dikirim dalam bentuk ciphertext. Service Worker di browser mendekripsi teks secara lokal di background sebelum memunculkan banner notifikasi sistem.
6. **Known Security Limitations**:
   - Percakapan Grup (`grp_...`) dan Forum Topik (`sub_...`) saat ini **TIDAK dienkripsi secara E2EE** (disimpan terenkripsi di rest/database level, namun plaintext dapat dibaca oleh backend untuk kebutuhan AI Memory).

---

## 10. Technical Debt Register

Daftar utang teknis aktual yang sengaja ditunda karena tidak menghambat fungsi saat ini:

| ID | Deskripsi Utang Teknis | Lokasi File / Package | Dampak | Prioritas | Alasan Ditunda Saat Ini | Trigger untuk Memperbaiki |
|---|---|---|---|---|---|---|
| **TD-01** | **Circular Import Bypass pada WebSocket Message Ingestion** | `backend/internal/ws/hub.go`, `backend/internal/app/wire.go` | Hub terhubung ke `messagingRepo` via `RealtimeMessageManager`, bukan via `MessageService`. Hub menyusun DTO `store.StoredMessage` secara mandiri. | `Medium` | Menghindari circular import antara `messaging` dan `ws`. Sistem saat ini sudah berjalan stabil dan teruji 100%. | Saat dilakukan refactor event-driven messaging atau ekstraksi package WS event types mandiri. |
| **TD-02** | **Pelanggaran Arah Dependensi (Domain mengimpor Transport)** | `backend/internal/messaging/service.go:10`, `backend/internal/group/service.go:12` | Domain/Application layer mengimpor `internal/ws` hanya untuk menggunakan struct `ws.Message`. | `Medium` | Tidak menimbulkan runtime bug atau memory leak; hanya ketidakmurnian arsitektur Clean Architecture. | Saat memindahkan kontrak event broadcast ke interface domain murni (`DomainEventBroadcaster`). |
| **TD-03** | **Identity Domain Belum Berdiri Sendiri** | `backend/internal/api/chat_handler.go`, `backend/internal/authz` | Fitur profil user, pencarian kontak (`SearchUsers`), dan public key sebelumnya memotong langsung ke `store.UserStore`. | `RESOLVED ✅` | **Tuntas di Milestone 0**: Seluruh pencarian kontak, pengambilan profil, dan public key telah dienkapsulasi ke dalam `authz.AuthService` dan `authz.AuthRepository`. | Selesai di Tenant Engine Milestone 0 (Sep 2026). |
| **TD-04** | **Terminologi Forum Masih Melekat di Schema & AI Prompt** | `backend/internal/ai/service.go:12`, `backend/internal/memory/service.go:36`, `store/sql.go:198` | Tabel database (`forum_memory_jobs`) dan DTO memori masih menggunakan nama `forum_id` dan `group_id`. Prompt AI mengasumsikan diskusi forum. | `Low` | Mengubah skema database berisiko memicu migrasi destruktif pada data live yang sudah ada. | Saat pengembangan fitur Group Memory On-Demand atau Personal Chat Memory. |
| **TD-05** | **Single Global Channel & Local Presence pada Cluster Pub/Sub** | `backend/internal/ws/hub.go:21, 805` | Semua event dikirim ke `wuzz:cluster:events`. Status online diperiksa di in-memory node lokal saat pemicuan push notification. | `Low` | Beban server saat ini sangat kecil (< 500 koneksi); overhead CPU dan duplikasi push praktis tidak terasa. | Ketika beban produksi melebihi 10.000 concurrent users atau cluster terdiri dari > 5 node backend. |

---

## 11. Product Roadmap State

Roadmap berbasis milestone terstruktur berdasarkan kapabilitas aktual:

```text
[Milestone 1] Architecture Foundation & Zero-Risk Cleanup         ==> DONE (Sep 2026) ✅
[Milestone 2] Realtime Ingestion Decoupling via Domain Repo       ==> DONE (Sep 2026) ✅
[Milestone 3] Mobile Gateway Readiness & Pluggable Push Provider  ==> DONE (Sep 2026) ✅
[Milestone 4] AI Memory Engine (Forum Memory Production-Ready)   ==> DONE (Sep 2026) ✅
[Milestone 5] Single Source of Truth Documentation Alignment      ==> DONE (Sep 2026) ✅
──────────────────────────────────────────────────────────────────────────────────────────
─── Track A: Application & Native Feature Roadmap ────────────────────────────────────────
[Milestone 6] Mobile Client App (React Native / Flutter Cross-Plat) ==> NEXT (Client App) 🎯
[Milestone 7] On-Demand Group Chat Memory Summarization           ==> LATER ⏳
[Milestone 8] Passkey / WebAuthn Biometric Login (FIDO2)          ==> LATER ⏳
[Milestone 9] Audio Meeting Memory & Speech-to-Text Pipeline      ==> LATER ⏳
[Milestone 10] Realtime Scaling: Room Partitioned Pub/Sub Channels==> LATER (Scale-Triggered) ⏳
[Milestone 11] Personal Chat Memory (Client-Side Privacy Export)  ==> BLOCKED (E2EE Constraint) 🛑
──────────────────────────────────────────────────────────────────────────────────────────
─── Track B: Tenant-Aware & Integration-Ready Engine (TENANT_ENGINE_MASTER_PLAN.md) ──────
[Milestone 0] Codebase & Hub Prerequisite Stabilization        ==> DONE & DEPLOYED (Sep 2026) ✅
[Milestone 1] Additive Schema Migration & Tenant Registry       ==> NEXT (Engine Track) 🎯
[Milestone 2] Tenant Context Propagation in Services & Repos    ==> LATER ⏳
[Milestone 3] External Provisioning & B2B Auth Gateway          ==> LATER ⏳
[Milestone 4] Realtime & Cluster Envelope Tenant Isolation      ==> LATER ⏳
[Milestone 5] AI Memory Context Tenant Scoping                  ==> LATER ⏳
[Milestone 6] OpenAPI Contract & Headless Integration Guide     ==> LATER ⏳
```

---

## 12. Project State Snapshot (2-Minute Briefing)

* **Project ini sekarang apa?**  
  Aplikasi chat real-time produksi (Web PWA live di `https://chat.wuzzhub.id` dan backend Go di Fly.io `https://wuzz-chat-backend.fly.dev`) yang dilengkapi E2EE 1-on-1, voice note, WebRTC audio calling, store-and-forward media buffer ($0 cost), obrolan grup/forum, dan AI Memory Engine.
* **Fitur apa saja yang sudah ada?**  
  DM terenkripsi, grup, subgrup forum efemeral, unread badge, centang biru 3-tahap, reaksi emoji, kutipan balas, pencarian pesan, edit/delete pesan, transfer kunci via QR code, push notification VAPID & FCM, serta kurasi memori AI otomatis untuk forum.
* **Arsitekturnya seperti apa?**  
  Modular Monolith Go (Transport → Application Service → Domain Repository → Infrastructure) dengan Next.js 16 di frontend, Redis Pub/Sub untuk sinkronisasi multi-instance, dan PostgreSQL / SQLite untuk basis data.
* **Apa yang masih belum selesai?**  
  Aplikasi mobile native (klien React Native / Android / iOS), peringkasan grup on-demand di luar forum expired, dan autentikasi biometrik Passkey.
* **Apa technical debt yang diketahui?**  
  Dependensi struct `ws.Message` di domain messaging/group (TD-02), wire `RealtimeMessageManager` langsung ke repo (TD-01), nama tabel `forum_memory_jobs` (TD-04), dan single global Redis channel (TD-05). *(Catatan: TD-03 Identity Encapsulation telah terselesaikan 100% di Milestone 0)*.
* **Apa milestone yang sedang dikerjakan?**  
  Tenant Engine Milestone 0 (Codebase & Hub Prerequisite Stabilization — Selesai & Deployed ✅).
* **Apa milestone berikutnya?**  
  Tenant Engine Milestone 1 (Additive Schema Migration & Tenant Registry) untuk isolasi data multi-tenant, dan Klien Mobile (Track A Milestone 6).

---

## 13. AI Developer Context & Rules of Engagement

Panduan wajib bagi AI Coding Agent yang bekerja pada repositori ini:

1. **Dilarang Melakukan Refactor Arsitektur Besar**:
   - Jangan mencoba merombak package, memindahkan folder, atau mendesain ulang arsitektur monolit kecuali ada instruksi tertulis eksplisit dari pengguna.
   - Anggap technical debt di Bagian 10 sebagai **keputusan desain yang sengaja ditunda**, bukan bug yang harus diperbaiki segera.
2. **Patuhi Server Lifecycle Rule**:
   - Jika menjalankan server backend Go atau Next.js untuk keperluan verifikasi/testing otomatis, **WAJIB mematikan proses server tersebut (`fuser -k <port>/tcp`) sebelum mengakhiri giliran/respons**. Dilarang meninggalkan server menggantung.
3. **Patuhi Protected Branch Rule**:
   - Dilarang bekerja, mengedit kode, atau melakukan commit di branch `main`.
   - Seluruh pekerjaan dilakukan di branch `dev` atau feature branch.
4. **Patuhi Mandatory Automated Testing**:
   - Setiap selesai mengedit kode backend: wajib jalankan `go test ./...` di direktori `backend/`.
   - Setiap selesai mengedit kode frontend: wajib jalankan `npm run build` di direktori `frontend/`.
   - Tidak perlu menjalankan browser live (subagent / puppeteer) kecuali diminta eksplisit oleh pengguna.
5. **Patuhi Git Commit Approval Gate**:
   - Dilarang melakukan `git commit` sebelum pengguna menyatakan secara eksplisit bahwa tugas **"selesai"**.
   - Dilarang melakukan `git push` tanpa instruksi tertulis terpisah.
6. **Patuhi Backend Deployment Notification**:
   - Setiap perubahan pada kode backend Go (`backend/...`), wajib sertakan kotak peringatan deployment Fly.io (`fly deploy --remote-only`) dalam laporan akhir.

---

## 14. Documentation Governance

Untuk mencegah desinkronisasi dokumentasi di masa mendatang, seluruh tim dan AI wajib mematuhi aturan berikut:

### Matriks Sumber Kebenaran Kanonikal (*Canonical Source of Truth*)

| Domain / Concern | Dokumen Kanonikal Utama | Keterangan & Batasan |
|---|---|---|
| **Product Vision & Snapshot** | [`docs/PROJECT_STATE.md`](PROJECT_STATE.md) | **Sumber Kebenaran Tunggal (SSOT)** ringkasan kondisi, kapabilitas, dan utang teknis proyek. |
| **API & Wire Formats** | [`docs/BACKEND_API.md`](BACKEND_API.md) | Spesifikasi seluruh endpoint REST API, schema payload JSON, dan WebSocket wire events. |
| **Database & ERD** | [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | Skema relasional database, indexing, dan relasi tabel. |
| **Security & Hardening** | [`docs/SECURITY_AND_PERFORMANCE.md`](SECURITY_AND_PERFORMANCE.md) | Detail implementasi mitigasi keamanan (BOLA, SSRF, E2EE, JWT) dan optimasi kueri. |
| **Mobile Integration** | [`docs/MOBILE_INTEGRATION_GUIDE.md`](MOBILE_INTEGRATION_GUIDE.md) | Panduan teknis pengembang aplikasi mobile (Android/iOS) untuk menghubungkan REST & WS. |
| **Roadmap & Milestones** | [`docs/ROADMAP.md`](ROADMAP.md) | Peta jalan jangka panjang dan tahapan milestone. |
| **Historical Work Log** | [`docs/PROGRESS.md`](PROGRESS.md) | Catatan kronologis pekerjaan yang telah diselesaikan per tanggal/sesi. |

### Aturan Sinkronisasi Dokumentasi (Sync Gate):
Jika sebuah perubahan kode memengaruhi:
- Penambahan / perubahan parameter REST API atau event WebSocket ➔ **Wajib update `docs/BACKEND_API.md`**.
- Perubahan skema tabel atau indeks basis data ➔ **Wajib update `docs/ARCHITECTURE.md`**.
- Penambahan fitur produk baru atau penyelesaian milestone ➔ **Wajib update `docs/PROJECT_STATE.md` dan `docs/ROADMAP.md`**.
- Catatan pengerjaan harian ➔ **Wajib catat di `docs/PROGRESS.md`**.
