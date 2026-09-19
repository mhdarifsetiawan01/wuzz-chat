# Wuzz Chat — Backend API & Integration Reference

Dokumen ini adalah **panduan integrasi resmi dan menyeluruh** bagi pengembang yang ingin membuat atau memelihara klien frontend (*Web*, *Mobile iOS/Android*, *Flutter*, *React Native*, dsb.) untuk ekosistem **Wuzz Chat**.

Seluruh kapabilitas, format payload REST API, katalog event WebSocket, standar enkripsi E2EE, dan siklus hidup media terdokumentasi di sini sesuai dengan kode aktual backend Go (`backend/internal/...`).

---

## 📑 Daftar Isi
1. [Arsitektur & Konsep Dasar](#1-arsitektur--konsep-dasar)
2. [Matriks Fitur Backend yang Didukung](#2-matriks-fitur-backend-yang-didukung)
3. [REST API Reference](#3-rest-api-reference)
   - [Auth & Profil](#31-auth--profil)
   - [Manajemen Kunci E2EE](#32-manajemen-kunci-e2ee)
   - [Pencarian User & Percakapan](#33-pencarian-user--percakapan)
   - [Manajemen Pesan](#34-manajemen-pesan)
   - [Media & Konfigurasi](#35-media--konfigurasi)
   - [Link Preview (OpenGraph)](#36-link-preview-opengraph)
   - [Push Notifications (Web Push VAPID)](#37-push-notifications-web-push-vapid)
   - [E2EE Device Key Transfer (QR Code)](#38-e2ee-device-key-transfer-qr-code)
   - [Health Check](#39-health-check)
   - [Manajemen Grup & Discovery](#310-manajemen-grup--discovery)
4. [Protokol WebSocket & Event Catalog](#4-protokol-websocket--event-catalog)
5. [Spesifikasi Standar E2EE (End-to-End Encryption)](#5-spesifikasi-standar-e2ee-end-to-end-encryption)
6. [Siklus Hidup Media (Store-and-Forward)](#6-siklus-hidup-media-store-and-forward)
7. [Variabel Lingkungan (Frontend Config)](#7-variabel-lingkungan-frontend-config)
8. [Checklist Implementasi Klien Baru (Quick Start)](#8-checklist-implementasi-klien-baru-quick-start)

---

## 1. Arsitektur & Konsep Dasar

### 1.1 Base URLs
| Lingkungan | Protokol REST | Protokol WebSocket | Status |
| :--- | :--- | :--- | :--- |
| **Live Production** | `https://wuzz-chat-backend.fly.dev` | `wss://wuzz-chat-backend.fly.dev/ws` | Aktif (Fly.io) |
| **Lokal (Dev)** | `http://localhost:8080` | `ws://localhost:8080/ws` | Lokal Go Server |

> 💡 **CORS & Origin Handling**: Backend mendukung validasi origin dinamis via `ALLOWED_ORIGINS` (mendukung domain `https://chat.wuzzhub.id`, `*.vercel.app`, dan `http://localhost:3000`).

### 1.2 Autentikasi (JWT Bearer Token)
- Masa berlaku token JWT: **7 hari**.
- REST API: Sertakan header `Authorization: Bearer <jwt_token>`.
- WebSocket: Sertakan query parameter `?token=<jwt_token>` pada URL koneksi (`/ws?token=...`).

### 1.3 Single Active Session (Device Eviction ala WhatsApp)
- Backend menerapkan prinsip **Single Device Login**. Ketika akun yang sama terhubung dari tab/perangkat baru, koneksi WebSocket pada perangkat lama akan dikirimi event:
  ```json
  {
    "type": "system",
    "from": "server",
    "content": "SESSION_REPLACED: Akun Anda dibuka dari perangkat lain."
  }
  ```
  dan koneksi lama langsung ditutup secara elegan oleh backend.

### 1.4 Keamanan BOLA / IDOR
- Seluruh endpoint percakapan (`/api/conversations/*`), penghapusan pesan, pengunggahan media, dan event WebSocket diproteksi dengan verifikasi keanggotaan room (`IsUserInConversation`). Pengguna dilarang keras mengakses atau mengirim event ke percakapan yang bukan haknya (mengembalikan `403 Forbidden` / error sistem).

---

## 2. Matriks Fitur Backend yang Didukung

| Modul Fitur | Status Backend | Keterangan & Batasan Teknis |
| :--- | :---: | :--- |
| **Autentikasi & Profil** | ✅ Siap | Register, Login, Me, Update Display Name, Status, & Avatar |
| **Rate Limiter Auth** | ✅ Siap | 15 request/menit per IP (Anti Brute-Force) |
| **Pencarian User & Kontak** | ✅ Siap | Query `q`, case-insensitive, autocomplete nama/username |
| **Direct 1-on-1 Chat** | ✅ Siap | Pembuatan room otomatis (deterministic room ID `direct_<uuid>_<uuid>`) |
| **Pesan Realtime (WS)** | ✅ Siap | Full duplex WebSocket dengan buffering & ping/pong liveness |
| **Riwayat Pesan Persisten** | ✅ Siap | SQLite / PostgreSQL / Supabase, batas 50 pesan terakhir per room |
| **Indikator Sedang Mengetik** | ✅ Siap | Event `typing` broadcast ke anggota percakapan aktif |
| **Tanda Terima Bertingkat** | ✅ Siap | 3 Tingkat: `sent` (✓), `delivered` (✓✓ abu-abu), `read` (✓✓ biru) |
| **Reaksi Emoji** | ✅ Siap | Toggle real-time emoji per pesan, counter dan avatar reaktor |
| **Hapus Pesan (Delete for Me)** | ✅ Siap | Bersihkan pesan pada sisi user tanpa menghapus untuk lawan chat |
| **Tarik Pesan (Delete for Everyone)** | ✅ Siap | Batas waktu **1 menit** sejak pesan dikirim; hanya untuk pengirim asli |
| **Enkripsi End-to-End (E2EE)** | ✅ Siap | ECDH P-256 + HKDF-SHA256 + AES-256-GCM. Backend tidak tahu plaintext |
| **Force Reset Public Key** | ✅ Siap | Menaikkan `key_version` jika user login di perangkat baru |
| **Migrasi Kunci E2EE via QR Code** | ✅ Siap | Transfer sesi terenkripsi one-time token (TTL 5 menit) |
| **Panggilan Suara & Video WebRTC** | ✅ Siap | Signaling server (`call_offer`, `call_answer`, `ice_candidate`, `reject`, `end`, `busy`) |
| **Unggah Media (Gambar/Dokumen)** | ✅ Siap | Multi-storage (Local Disk & Cloudflare R2 / S3), ukuran configurable |
| **Media Store-and-Forward** | ✅ Siap | Auto-delete file dari server setelah penerima mengirimkan konfirmasi download (`ACK`) pada Direct 1-on-1 |
| **Shared Media Hub (Grup & Forum)** | ✅ Siap | Retensi penuh berkas media selama 7 hari tanpa penghapusan dini saat diunduh anggota pertama |
| **Pembersih Media Kedaluwarsa (TTL)**| ✅ Siap | Background worker membersihkan file yang tidak diunduh > 7 hari |
| **Multi-User Mentions (@username)** | ✅ Siap | Validasi fail-closed keanggotaan room, format data kekal UUID (`mentions: ["uuid", ...]`), Web Push prioritas |
| **OpenGraph Link Preview** | ✅ Siap | Aman dari SSRF (Private IP Pinning & DNS Rebinding Guard) + Cache |
| **Web Push Notification** | ✅ Siap | VAPID Web Push standard (Chrome, Firefox, Safari iOS/macOS, PWA) |
| **Edit Pesan** | ✅ Siap | Window 15 menit, flag `is_edited`, `edited_at`, real-time WS `message_edited` |
| **Forward Pesan** | ✅ Siap | Multi-target 1–5 room, penandaan `is_forwarded: true`, validasi BOLA per room |
| **Pin Chat (Sidebar)** | ✅ Siap | Per-user isolation di `conversation_members`, endpoint `/pin` & `/unpin` |
| **Pin Pesan (Dalam Chat)** | ✅ Siap | Max 3 pin per room (FIFO), endpoint `/pin`, `/unpin`, `/pinned`, WS real-time |
| **In-Chat Text Search** | ✅ Siap | Query `q`, case-insensitive, menghormati `cleared_at` privasi & `is_deleted` |

---

## 3. REST API Reference

Format respons error standar:
```json
{
  "error": "Pesan deskripsi kesalahan"
}
```

---

### 3.1 Auth & Profil

#### 1. `POST /api/auth/register`
Mendaftarkan akun baru.
- **Autentikasi**: Tidak perlu (Publik)
- **Rate Limit**: 15 req/menit per IP
- **Request Body**:
  ```json
  {
    "username": "budi123",
    "display_name": "Budi Santoso",
    "password": "passwordAman123"
  }
  ```
  *Validasi: `username` 3–30 karakter (hanya huruf, angka, titik, strip, underscore tanpa spasi; bebas dari kata terlarang/reserved), `password` 6–128 karakter, `display_name` maksimal 50 karakter.*
- **Success Response (201 Created)**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "c3d4e5f6-7890-4abc-def1-234567890abc",
      "username": "budi123",
      "display_name": "Budi Santoso",
      "avatar_url": "",
      "status_message": "Hey there! I am using Wuzz Chat",
      "is_verified": false,
      "public_key": "",
      "key_version": 1,
      "created_at": "2026-09-16T10:00:00Z"
    }
  }
  ```
- **Error Codes**: `400 Bad Request`, `409 Conflict` (Username sudah digunakan), `429 Too Many Requests`.

---

#### 2. `POST /api/auth/login`
Masuk dengan kredensial akun yang sudah ada.
- **Autentikasi**: Tidak perlu (Publik)
- **Rate Limit**: 15 req/menit per IP
- **Request Body**:
  ```json
  {
    "username": "budi123",
    "password": "passwordAman123"
  }
  ```
- **Success Response (200 OK)**:
  Format sama dengan respons registrasi.
- **Error Codes**: `400 Bad Request`, `401 Unauthorized` (Username/password salah), `429 Too Many Requests`.

---

#### 3. `GET /api/auth/me`
Mengambil profil akun user yang sedang aktif.
- **Autentikasi**: `Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  {
    "id": "c3d4e5f6-7890-4abc-def1-234567890abc",
    "username": "budi123",
    "display_name": "Budi Santoso",
    "avatar_url": "https://...",
    "status_message": "Online dan siap chatting",
    "is_verified": false,
    "public_key": "{\"crv\":\"P-256\",\"kty\":\"EC\",\"x\":\"...\",\"y\":\"...\"}",
    "key_version": 1,
    "active_device_id": "dev_web_abc123",
    "created_at": "2026-09-16T10:00:00Z",
    "last_seen": "2026-09-16T12:00:00Z"
  }
  ```
- **Error Codes**: `401 Unauthorized`, `404 Not Found`.

---

#### 4. `PUT /api/auth/profile`
Memperbarui nama tampilan, status pesan, atau foto avatar profil.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "display_name": "Budi S.",
    "status_message": "Sedang sibuk rapat",
    "avatar_url": "https://wuzz-chat-backend.fly.dev/uploads/avatar_123.jpg"
  }
  ```
- **Success Response (200 OK)**: Mengembalikan objek `User` yang telah diperbarui.

---

#### 5. `POST /api/auth/logout`
Melakukan logout akun pengguna dan melepaskan sesi perangkat aktif (`active_device_id`) di database secara aman (*device-aware*), sehingga perangkat berikutnya yang login tidak terblokir oleh status 409 Conflict.
- **Autentikasi**: `Bearer <token>`
- **Headers**: `X-Device-ID: <device_id>` *(opsional, dianjurkan)*
- **Request Body** *(opsional)*:
  ```json
  {
    "device_id": "dev_laptop_123"
  }
  ```
  *Catatan Proteksi Device-Aware*: Jika `device_id` disertakan (via body, header `X-Device-ID`, atau query param), server hanya akan mengosongkan `active_device_id` jika cocok dengan ID perangkat aktif saat ini. Jika perangkat lain/penantang yang membatalkan login memanggil logout, sesi perangkat aktif utama tetap aman terlindungi.
- **Success Response (200 OK)**:
  ```json
  {
    "status": "ok",
    "message": "Berhasil logout dan melepaskan sesi perangkat aktif"
  }
  ```
- **Error Codes**: `401 Unauthorized`, `405 Method Not Allowed`, `500 Internal Server Error`.

---

### 3.2 Manajemen Kunci E2EE

#### 5. `PUT /api/users/public-key` *(atau `PUT /api/auth/public-key`)*
Mendaftarkan atau memperbarui Public Key E2EE perangkat saat ini.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "public_key": "{\"crv\":\"P-256\",\"kty\":\"EC\",\"x\":\"...\",\"y\":\"...\"}",
    "device_id": "dev_android_xyz789"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "status": "ok",
    "message": "Kunci publik berhasil disimpan",
    "public_key": "...",
    "key_version": 1
  }
  ```
- **Error Conflict (409 Conflict)**:
  Terjadi bila akun sudah memiliki kunci dari perangkat lain dan belum di-reset.
  ```json
  {
    "error": "KEY_ALREADY_REGISTERED",
    "message": "Akun ini sudah aktif di perangkat lain. Kunci keamanan tidak dapat ditimpa otomatis.",
    "key_version": 1
  }
  ```

---

#### 6. `POST /api/users/public-key/reset`
Mereset paksa public key E2EE saat pengguna login di perangkat baru tanpa mentransfer kunci lama. Tindakan ini menaikkan nomor `key_version`.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "public_key": "{\"crv\":\"P-256\",\"kty\":\"EC\",\"x\":\"...\",\"y\":\"...\"}",
    "device_id": "dev_iphone_999"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "status": "ok",
    "message": "Kunci publik berhasil di-reset ke perangkat baru",
    "public_key": "...",
    "key_version": 2
  }
  ```

---

#### 7. `GET /api/users/public-key?id=<uuid_or_username>`
Mengambil public key kriptografi milik user lawan bicara sebelum mengirim pesan terenkripsi.
- **Autentikasi**: Publik / Bearer (bisa dipanggil dari Service Worker)
- **Success Response (200 OK)**:
  ```json
  {
    "user_id": "c3d4e5f6-7890-4abc-def1-234567890abc",
    "public_key": "{\"crv\":\"P-256\",\"kty\":\"EC\",\"x\":\"...\",\"y\":\"...\"}"
  }
  ```
- **Error Codes**: `400 Bad Request`, `404 Not Found`.

---

### 3.3 Pencarian User & Percakapan

#### 8. `GET /api/users/search?q=<keyword>`
Mencari user lain berdasarkan awalan username atau display name untuk memulai chat baru.
- **Autentikasi**: `Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": "e1f2a3b4-...",
      "username": "siti_aminah",
      "display_name": "Siti Aminah",
      "avatar_url": "",
      "status_message": "Available",
      "is_verified": false,
      "public_key": "..."
    }
  ]
  ```

---

#### 9. `GET /api/users/profile?id=<uuid>` atau `?username=<name>`
Melihat detail profil publik user lain.
- **Autentikasi**: `Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  {
    "id": "e1f2a3b4-...",
    "username": "siti_aminah",
    "display_name": "Siti Aminah",
    "avatar_url": "",
    "status_message": "Available",
    "is_verified": false,
    "public_key": "{\"crv\":\"P-256\",\"kty\":\"EC\",...}",
    "key_version": 1,
    "created_at": "2026-09-16T10:00:00Z",
    "last_seen": "2026-09-17T15:30:00Z"
  }
  ```

---

#### 10. `GET /api/conversations`
Mengambil daftar obrolan aktif (Home screen chat list) milik user saat ini, lengkap dengan pesan terakhir, status tanda terima, unread count, dan data lawan bicara (`peer_id`, `peer_nickname`, `peer_public_key`, `peer_avatar_url`, `peer_is_verified`).
- **Autentikasi**: `Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": "dm_11111111_22222222",
      "type": "direct",
      "title": "Siti Aminah",
      "peer_id": "22222222-...",
      "peer_nickname": "Siti Aminah",
      "peer_public_key": "{\"crv\":\"P-256\",\"kty\":\"EC\",...}",
      "peer_avatar_url": "data:image/webp;base64,...",
      "peer_is_verified": false,
      "last_message": "e2ee:v1:7s8df...:92348df...",
      "last_sender_id": "22222222-7890-4abc-def1-234567890abc",
      "last_status": "delivered",
      "unread_count": 2,
      "updated_at": "2026-09-17T12:15:30Z"
    }
  ]
  ```

> **🔑 UUID-First**: Field `last_sender_id` berisi **UUID immutable** pengirim pesan terakhir (sebelumnya `last_sender` berisi username yang dapat berubah). Frontend wajib membandingkan `last_sender_id` dengan `currentUser.id` (UUID) untuk menentukan tampilan tanda centang (`✓`/`✓✓`) di sidebar.

---

#### 11. `POST /api/conversations`
Membuat atau membuka percakapan direct dengan user tujuan.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "target_user_id": "22222222-7890-4abc-def1-234567890abc"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "room_id": "direct_11111111_22222222"
  }
  ```

---

#### 12. `DELETE /api/conversations?id=<room_id>` *(atau `POST /api/conversations/clear`)*
Membersihkan isi riwayat pesan percakapan khusus untuk pengguna saat ini (*Delete for Me* / Clear Chat).
- **Autentikasi**: `Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Percakapan berhasil dibersihkan untuk akun Anda",
    "id": "direct_11111111_22222222"
  }
  ```
- **Error Codes**: `403 Forbidden` (BOLA: Pengguna bukan anggota percakapan).

---

#### 13. `POST /api/conversations/pin`
Menyematkan (pin) percakapan di bagian atas sidebar secara per-user.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "room_id": "direct_11111111_22222222"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "room_id": "direct_11111111_22222222",
    "is_pinned": true
  }
  ```
- **Error Codes**: `400 Bad Request` (room_id kosong), `403 Forbidden` (BOLA: Pengguna bukan anggota percakapan).

---

#### 14. `POST /api/conversations/unpin`
Melepas sematan (unpin) percakapan dari sidebar per-user.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "room_id": "direct_11111111_22222222"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "room_id": "direct_11111111_22222222",
    "is_pinned": false
  }
  ```
- **Error Codes**: `400 Bad Request` (room_id kosong), `403 Forbidden` (BOLA: Pengguna bukan anggota percakapan).

---

### 3.4 Manajemen Pesan

#### 15. `DELETE /api/messages?id=<msg_id>&delete_for_everyone=<bool>` *(atau `POST /api/messages/delete`)*
Menghapus pesan spesifik.
- **Autentikasi**: `Bearer <token>`
- **Payload / Query Parameters**:
  - `id` atau `message_id` (string): ID pesan.
  - `delete_for_everyone` (boolean, opsional) atau `type` (`"for_everyone"` | `"for_me"`): Menentukan cakupan penghapusan pesan. Jika `true` atau `"for_everyone"`, pesan ditarik untuk semua orang.
- **Aturan Delete for Everyone**:
  1. Hanya pengirim asli pesan yang boleh melakukan *Delete for Everyone* (divalidasi secara ketat di backend berdasarkan `users.id` / UUID pengirim `from_id`, bukan `nickname` atau `display_name`).
  2. Hanya dapat dilakukan dalam jangka waktu **maksimal 1 menit (60 detik)** sejak pesan dikirim. Melebihi 1 menit akan ditolak backend dengan status `400 Bad Request`.
  3. Menghasilkan broadcast real-time event `message_deleted` ke seluruh anggota room.
  4. Jika pesan yang ditarik sedang disematkan (*pinned*), server otomatis menghapusnya dari daftar `pinned_messages`.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message_id": "msg_uuid_123",
    "delete_for_everyone": true,
    "message": "Pesan berhasil dihapus"
  }
  ```

---

#### 16. `PUT /api/messages/edit`
Mengedit konten pesan yang sudah terkirim (hanya untuk pengirim asli dalam batas waktu 15 menit).
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "message_id": "msg_uuid_123",
    "content": "Konten pesan yang telah diperbarui"
  }
  ```
- **Aturan Edit**:
  1. Hanya pengirim asli (`from_id == user.id`) yang berhak mengedit pesan.
  2. Batas waktu edit adalah **15 menit** sejak pesan dibuat (`CreatedAt`). Melebihi 15 menit akan ditolak (`400 Bad Request: Batas waktu edit pesan (15 menit) telah terlewat`).
  3. Pesan yang telah dihapus (`is_deleted = true`) tidak dapat diedit.
  4. Menghasilkan broadcast real-time event `message_edited` ke seluruh anggota room melalui WebSocket dan Redis pub/sub.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message_id": "msg_uuid_123",
    "room_id": "direct_11111111_22222222",
    "content": "Konten pesan yang telah diperbarui",
    "is_edited": true,
    "edited_at": "2026-09-19T12:00:00Z"
  }
  ```
- **Error Codes**: `400 Bad Request`, `403 Forbidden` (bukan pengirim), `404 Not Found`.

---

#### 17. `POST /api/messages/forward`
Meneruskan pesan ke satu atau beberapa percakapan tujuan (1 s/d 5 target sekaligus).
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "message_id": "msg_uuid_123",
    "target_room_ids": [
      "direct_11111111_33333333",
      "grp_44444444_55555555"
    ],
    "plaintext_content": "Isi pesan terdekripsi (opsional, untuk cross-room E2EE forward override)"
  }
  ```
- **Aturan Forward**:
  1. Pengirim wajib menjadi anggota di setiap `target_room_ids` (validasi BOLA ketat, jika bukan anggota akan ditolak dengan `403 Forbidden`).
  2. Jumlah room tujuan dibatasi antara 1 hingga 5 (`len(target_room_ids) > 5` ditolak `400 Bad Request`).
  3. Pesan baru yang dibuat di tiap target room otomatis ditandai dengan flag `is_forwarded: true`.
  4. **Cross-Room E2EE Plaintext Override**: Jika `plaintext_content` dikirim (non-empty), backend menggunakan teks ini sebagai `content` pesan baru, mencegah kegagalan dekripsi E2EE cross-room akibat perbedaan encryption key antar direct room. Jika kosong, fallback menggunakan `srcMsg.Content` dari database.
  5. Setiap pesan yang diteruskan disiarkan via WebSocket Hub ke masing-masing room penerima.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "forwarded_count": 2,
    "messages": [
      {
        "id": "msg_new_uuid_1",
        "room": "direct_11111111_33333333",
        "from": "user_uuid",
        "content": "Isi pesan yang diteruskan",
        "is_forwarded": true,
        "timestamp": "2026-09-19T12:00:00Z"
      }
    ]
  }
  ```

---

#### 18. `POST /api/messages/pin`
Menyematkan pesan penting di dalam obrolan (terlihat oleh seluruh anggota percakapan).
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "message_id": "msg_uuid_123",
    "room_id": "direct_11111111_22222222"
  }
  ```
- **Aturan Pin Message**:
  1. Pengguna wajib merupakan anggota percakapan (`403 Forbidden`).
  2. Pesan yang telah dihapus tidak dapat disematkan (`400 Bad Request`).
  3. Batas maksimal pin per room adalah **3 pesan**. Jika menyematkan pesan ke-4, sistem secara otomatis melepas (*FIFO auto-unpin*) pesan yang paling lama disematkan.
  4. Menghasilkan broadcast real-time event `message_pinned` ke seluruh anggota percakapan.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message_id": "msg_uuid_123",
    "room_id": "direct_11111111_22222222",
    "is_pinned": true
  }
  ```

---

#### 19. `POST /api/messages/unpin`
Melepas sematan pesan dari percakapan.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "message_id": "msg_uuid_123",
    "room_id": "direct_11111111_22222222"
  }
  ```
- **Aturan Unpin**:
  1. Pengguna wajib merupakan anggota percakapan (`403 Forbidden`).
  2. Menghasilkan broadcast real-time event `message_unpinned` ke seluruh anggota percakapan.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message_id": "msg_uuid_123",
    "room_id": "direct_11111111_22222222",
    "is_pinned": false
  }
  ```

---

#### 20. `GET /api/messages/pinned?conversation_id=<room_id>`
Mengambil daftar pesan yang sedang disematkan dalam percakapan aktif (maks 3 pesan, terurut dari yang terbaru disematkan).
- **Autentikasi**: `Bearer <token>`
- **Query Parameter**:
  - `conversation_id` atau `room_id` (string): ID percakapan.
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": "msg_uuid_123",
      "room": "direct_11111111_22222222",
      "from": "user_uuid",
      "content": "Pengumuman jadwal rapat",
      "is_pinned": true,
      "timestamp": "2026-09-19T10:00:00Z"
    }
  ]
  ```
- **Error Codes**: `403 Forbidden` (bukan anggota percakapan).

---

#### 21. `GET /api/messages/search?conversation_id=<room_id>&q=<keyword>`
Mencari pesan teks dalam percakapan tertentu berdasarkan kata kunci.
- **Autentikasi**: `Bearer <token>`
- **Query Parameter**:
  - `conversation_id` atau `room_id` (string): ID percakapan.
  - `q` (string): Kata kunci pencarian (case-insensitive substring match).
- **Privasi & Keamanan**:
  1. Pengguna wajib anggota percakapan (`403 Forbidden`).
  2. Menghormati timestamp `cleared_at` milik pengguna — pesan sebelum `cleared_at` tidak akan bocor dalam hasil pencarian.
  3. Mengecualikan pesan yang telah ditarik (`is_deleted = true`).
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": "msg_uuid_123",
      "room": "direct_11111111_22222222",
      "from": "user_uuid",
      "content": "Dokumen final proposal proyek",
      "timestamp": "2026-09-19T10:00:00Z"
    }
  ]
  ```

---

#### 22. `POST /api/messages/receipt`
Melaporkan tanda terima pesan (Background Delivery Receipt atau Read Receipt) dari Service Worker latar belakang atau REST client.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "message_id": "msg_uuid_123",
    "room_id": "direct_11111111_22222222",
    "status": "delivered"
  }
  ```
- **Ketentuan & Keamanan**:
  1. Pengguna wajib merupakan anggota sah dari `room_id` (`403 Forbidden` jika bukan anggota).
  2. Nilai `status` yang diterima: `"delivered"` atau `"read"`.
  3. **Anti-Downgrade Status Guard**: Jika pesan sudah berstatus `read`, pelaporan `delivered` tidak akan menurunkan status pesan kembali menjadi `delivered`.
  4. Backend mengupdate status di database dan mem-broadcast event `TypeReceipt` ke room pengirim melalui WebSocket Hub / Redis cluster.
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "status": "delivered"
  }
  ```

---

### 3.5 Media & Konfigurasi

#### 23. `GET /api/config`
Mengambil parameter konfigurasi publik backend (fitur toggle, batas ukuran file, retention TTL).
- **Autentikasi**: Publik
- **Success Response (200 OK)**:
  ```json
  {
    "media_upload_enabled": true,
    "max_file_size_mb": 25,
    "storage_driver": "local",
    "media_retention_days": 7,
    "auto_delete_on_download": true
  }
  ```

---

#### 23. `POST /api/media/upload`
Mengunggah berkas gambar, audio, dokumen, atau video.
- **Autentikasi**: `Bearer <token>`
- **Content-Type**: `multipart/form-data`
- **Form Fields**:
  - `file`: Binary file stream (Wajib)
- **Success Response (200 OK)**:
  ```json
  {
    "url": "https://wuzz-chat-backend.fly.dev/uploads/media_abc123.jpg",
    "file_name": "foto_liburan.jpg",
    "file_size": 1048576,
    "media_type": "image",
    "mime_type": "image/jpeg"
  }
  ```
- **Error Codes**: `400 Bad Request` (File kosong/ekstensi ditolak), `413 Payload Too Large` (Ukuran > `max_file_size_mb`), `403 Forbidden` (Fitur dinonaktifkan admin).

---

#### 24. `POST /api/media/ack`
Mengirim konfirmasi unduhan berkas oleh penerima pesan. 
- **Direct Message (1-on-1)**: Memicu backend untuk menghapus berkas fisik secara instan dari Supabase Storage (*WhatsApp Store-and-Forward Lifecycle*, $0 storage cost).
- **Obrolan Grup & Forum Topics (`grp_...`, `sub_...`)**: Konfirmasi unduhan dicatat tanpa menghapus berkas fisik (*Shared Media Hub*), menjamin berkas tetap tersedia bagi seluruh anggota grup hingga masa TTL (7 hari) berakhir.
- **Autentikasi**: `Bearer <token>` (Dilengkapi proteksi validasi Anti-IDOR keanggotaan room)
- **Request Body**:
  ```json
  {
    "message_id": "msg_uuid_123",
    "room_id": "grp_11111111_22222222"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "status": "acknowledged",
    "media_status": "active" // "expired" untuk DM setelah file dihapus, "active" untuk Grup/Forum
  }
  ```

---

### 3.6 Link Preview (OpenGraph)

#### 25. `GET /api/link-preview?url=<target_url>`
Mengambil metadata judul, deskripsi, favicon, dan cover image dari tautan web. Backend dilengkapi proteksi **Anti-SSRF** (Anti Private IP & DNS Rebinding Guard) dan Redis/Memory cache.
- **Autentikasi**: `Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  {
    "url": "https://github.com",
    "title": "GitHub: Let’s build from here",
    "description": "GitHub is where over 100 million developers shape the future of software...",
    "image": "https://github.githubassets.com/assets/campaign-social-031d616c84.png",
    "site_name": "GitHub",
    "favicon": "https://github.githubassets.com/favicons/favicon.png"
  }
  ```
- **Error Codes**: `400 Bad Request` (URL private/localhost dilarang), `504 Gateway Timeout`.

---

### 3.7 Push Notifications (Web Push VAPID)

#### 26. `GET /api/notifications/vapid-public-key`
Mengambil kunci publik VAPID untuk inisialisasi `PushManager.subscribe()` di browser/PWA.
- **Autentikasi**: Publik
- **Success Response (200 OK)**:
  ```json
  {
    "public_key": "BEl62iUYgUivxIkv69yViEuiBIa..."
  }
  ```

---

#### 27. `POST /api/notifications/subscribe`
Mendaftarkan push subscription milik browser / mobile device user yang sedang login.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "platform": "web",
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "BNcRdreALRF...",
      "auth": "tBHItJI..."
    }
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "status": "ok",
    "message": "Push notification berhasil didaftarkan"
  }
  ```

---

#### 28. `POST /api/notifications/unsubscribe`
Mencabut subscription push notification tertentu.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "endpoint": "https://fcm.googleapis.com/fcm/send/..."
  }
  ```

---

### 3.8 E2EE Device Key Transfer (QR Code)

Fitur untuk memindahkan private key E2EE antar-perangkat secara *end-to-end* tanpa membocorkannya ke backend.

#### 29. `POST /api/users/transfer/create`
Dijalankan oleh perangkat lama untuk menaruh bundle private key terenkripsi.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "session_token": "random_secure_token_generated_by_old_device",
    "encrypted_bundle": "base64_ciphertext_of_keys_encrypted_with_shared_secret"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "status": "success",
    "expires_in": 300
  }
  ```
  *(TTL: 5 menit / 300 detik)*.

---

#### 30. `POST /api/users/transfer/consume`
Dijalankan oleh perangkat baru (setelah scan QR code) untuk mengambil bundle terenkripsi secara satu kali (*one-time use*).
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "session_token": "random_secure_token_from_qr_code",
    "device_id": "dev_new_phone_123"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "encrypted_bundle": "base64_ciphertext_of_keys_encrypted_with_shared_secret"
  }
  ```
- **Siklus Hidup Sesi Lama (Direct WebSocket Kick)**:
  Seketika `POST /api/users/transfer/consume` berhasil memvalidasi token dan memperbarui `active_device_id` ke `device_id` baru, backend memicu pemutusan koneksi WebSocket (`KickClientByUserID`) seketika ke seluruh sesi lama milik user terkait dengan frame `SESSION_REPLACED`, 500ms grace period buffer flush, dan Close Code `4001: SESSION_REPLACED`.
- **Error Codes**: `404 Not Found`, `410 Gone` (`SESSION_EXPIRED` atau `SESSION_ALREADY_USED`), `403 Forbidden`.

---

### 3.9 Health Check

#### 31. `GET /health`
Liveness dan readiness probe untuk load balancer / orchestrator (Fly.io).
- **Autentikasi**: Publik
- **Success Response (200 OK)**:
  ```json
  {
    "status": "ok",
    "time": "2026-09-16T12:00:00Z"
  }
  ```

---

### 3.10 Manajemen Grup & Discovery

Layanan REST API lengkap untuk mengelola percakapan grup multi-anggota (Milestone 8.2A). Identitas grup menggunakan format `grp_<UUIDv4>` pada kolom `conversations.id`.

#### 32. `POST /api/groups`
Membuat grup percakapan baru. Pembuat grup otomatis menjadi anggota dengan role `creator`.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "title": "Tim Engineering Wuzz",
    "description": "Grup diskusi teknis & backend engineering",
    "avatar_url": "👥",
    "is_public": false,
    "group_username": "wuzz_engineering",
    "member_ids": ["uuid-user-bob", "uuid-user-charlie"]
  }
  ```
  *(Catatan: `group_username` hanya opsional jika grup privat, namun disarankan jika grup publik. Wajib diawali huruf/angka, 3-30 karakter).*
- **Success Response (201 Created)**:
  ```json
  {
    "group": {
      "id": "grp_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "title": "Tim Engineering Wuzz",
      "description": "Grup diskusi teknis & backend engineering",
      "avatar_url": "👥",
      "is_public": false,
      "group_username": "wuzz_engineering",
      "parent_id": null,
      "created_by": "uuid-user-alice",
      "created_at": "2026-09-17T12:00:00Z",
      "updated_at": "2026-09-17T12:00:00Z",
      "member_count": 3,
      "my_role": "creator"
    }
  }
  ```

---

#### 33. `GET /api/groups/search?q={query}&limit=20`
Mencari grup dengan status publik (`is_public = true`) berdasarkan nama atau `@group_username`.
- **Autentikasi**: `Bearer <token>`
- **Query Params**:
  - `q` (*wajib*): Kata kunci pencarian nama atau username grup.
  - `limit` (*opsional*): Jumlah hasil (default 20, max 50).
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": "grp_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "title": "Komunitas Pengembang Wuzz",
      "description": "Tempat sharing open source Wuzz Chat",
      "avatar_url": "🌐",
      "is_public": true,
      "group_username": "wuzz_community",
      "member_count": 42
    }
  ]
  ```

---

#### 34. `GET /api/groups/{id}`
Mengambil informasi detail grup. Dapat diakses oleh anggota grup, atau siapapun jika grup bertipe publik.
- **Autentikasi**: `Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  {
    "id": "grp_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "title": "Tim Engineering Wuzz",
    "description": "Grup diskusi teknis & backend engineering",
    "avatar_url": "👥",
    "is_public": false,
    "group_username": "wuzz_engineering",
    "parent_id": null,
    "created_by": "uuid-user-alice",
    "created_at": "2026-09-17T12:00:00Z",
    "updated_at": "2026-09-17T12:00:00Z",
    "member_count": 3,
    "my_role": "creator"
  }
  ```
- **Error Response (403 Forbidden - Grup Privat / Bukan Anggota)**:
  ```json
  {
    "error": "Akses ditolak: Anda bukan anggota grup ini"
  }
  ```
  > 🛡️ **Penanganan Klien (Web & Mobile - DEC-013)**: Jika pemanggil mengakses tautan langsung grup privat (`/chat?room=grp_...`) saat bukan anggota, API mengembalikan HTTP 403. Klien **DILARANG** merender linimasa ruang obrolan kosong, **DILARANG** mengirim event WebSocket `join`, dan **DILARANG** memicu false connection timeout. Klien wajib menampilkan antarmuka proteksi otorisasi bertema *Aurora Glassmorphism* ("🔒 Grup Ini Bersifat Privat") dengan tombol navigasi kembali ke beranda obrolan.

---

#### 35. `POST /api/groups/{id}/join`
Bergabung ke grup publik secara mandiri (*self-join*). Ditolak (403 Forbidden) jika grup privat.
> 💡 **Alur Klien Frontend / Mobile**: Klien wajib menampilkan modal pratinjau konfirmasi (`GroupPreviewModal.tsx`) sebelum mengeksekusi endpoint ini guna mencegah *accidental auto-join* saat pengguna menjelajahi hasil pencarian (DEC-012).
- **Autentikasi**: `Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Berhasil bergabung ke grup"
  }
  ```

---

#### 36. `GET /api/groups/{id}/members`
Mengambil daftar anggota grup beserta peran (`creator`, `admin`, `member`) dan status verified badge.
- **Autentikasi**: `Bearer <token>` (wajib anggota grup)
- **Success Response (200 OK)**:
  ```json
  [
    {
      "user_id": "uuid-alice",
      "username": "alice",
      "display_name": "Alice Developer",
      "avatar_url": "https://...",
      "role": "creator",
      "is_verified": true,
      "joined_at": "2026-09-17T12:00:00Z"
    },
    {
      "user_id": "uuid-bob",
      "username": "bob",
      "display_name": "Bob Admin",
      "avatar_url": "",
      "role": "admin",
      "is_verified": false,
      "joined_at": "2026-09-17T12:05:00Z"
    }
  ]
  ```

---

#### 37. `POST /api/groups/{id}/members`
Menambahkan anggota baru ke grup. Hanya dapat dijalankan oleh `creator` atau `admin`.
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "member_ids": ["uuid-user-david", "uuid-user-eva"]
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "added_count": 2
  }
  ```

---

#### 38. `DELETE /api/groups/{id}/members/{userId}`
Mengeluarkan anggota dari grup (*kick*), atau keluar dari grup (*leave group* jika `userId == currentUserID`).
- **Autentikasi**: `Bearer <token>`
- **Hak Akses**:
  - Anggota biasa dapat mengeluarkan dirinya sendiri (*leave*).
  - Admin/Creator dapat mengeluarkan anggota biasa.
  - Creator tidak dapat di-kick oleh siapapun.
- **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Anggota berhasil dikeluarkan dari grup"
  }
  ```

---

#### 39. `PATCH /api/groups/{id}/members/{userId}/role`
Mengubah peran anggota (promosi ke `admin` atau demosi ke `member`).
- **Autentikasi**: `Bearer <token>` (hanya `creator` grup)
- **Request Body**:
  ```json
  {
    "role": "admin"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Peran anggota berhasil diperbarui"
  }
  ```

---

#### 40. `PATCH /api/groups/{id}`
Memperbarui metadata grup (judul, deskripsi, avatar, atau visibilitas publik/privat).
- **Autentikasi**: `Bearer <token>` (hanya `creator` atau `admin`)
- **Request Body**:
  ```json
  {
    "title": "Tim Engineering Wuzz (Official)",
    "description": "Deskripsi grup yang diperbarui",
    "avatar_url": "🚀",
    "is_public": true
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Informasi grup berhasil diperbarui"
  }
  ```

---

#### 41. `GET /api/groups/{id}/subgroups` (Forum Topics List)
Mengambil daftar topik forum / subgrup aktif di bawah grup induk (`parent_id = id`). Memeriksa keanggotaan grup induk secara ketat (*Parent-Membership Gate*); bukan anggota grup utama akan ditolak (`HTTP 403 Forbidden`).
- **Autentikasi**: `Bearer <token>` (wajib anggota aktif grup utama)
- **Path Parameter**: `id` — ID grup utama (`grp_<UUID>`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "subgroups": [
      {
        "id": "sub_9e67b2d5-4567-4890-bcde-fabc12345678",
        "parent_id": "grp_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "title": "Diskusi Sprint Go Backend",
        "description": "Topik diskusi arsitektur real-time",
        "status": "active",
        "is_public": false,
        "has_pending_request": false,
        "expires_at": "2026-09-25T12:00:00Z",
        "created_by": "uuid-user-alice",
        "created_at": "2026-09-18T12:00:00Z",
        "member_count": 4,
        "is_member": true,
        "remaining_seconds": 604790,
        "pending_requests_count": 1
      }
    ]
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: `{"error":"Akses ditolak: Anda harus menjadi anggota grup utama terlebih dahulu"}`

---

#### 42. `POST /api/groups/{id}/subgroups` (Create Forum Topic)
Membuat topik forum / subgrup baru di bawah grup induk. Dibatasi secara ketat hanya untuk **Creator** dan **Admin** grup induk (*Parent RBAC Gate*).
- **Autentikasi**: `Bearer <token>` (wajib Creator atau Admin grup utama)
- **Path Parameter**: `id` — ID grup utama (`grp_<UUID>`)
- **Request Body**:
  ```json
  {
    "title": "Diskusi Sprint Go Backend",
    "description": "Topik diskusi arsitektur real-time",
    "duration": "7_days",
    "is_public": false
  }
  ```
- **Catatan Parameter `duration`**:
  - `"7_days"`: Kedaluwarsa dalam 7 hari (default)
  - `"30_days"`: Kedaluwarsa dalam 30 hari
- **Catatan Parameter `is_public`**:
  - `true`: Publik (anggota grup induk dapat langsung bergabung)
  - `false`: Privat (wajib mengajukan izin bergabung atau diundang oleh pembuat)
- **Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "subgroup": {
      "id": "sub_9e67b2d5-4567-4890-bcde-fabc12345678",
      "parent_id": "grp_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "title": "Diskusi Sprint Go Backend",
      "description": "Topik diskusi arsitektur real-time",
      "status": "active",
      "is_public": false,
      "expires_at": "2026-09-25T12:00:00Z",
      "created_by": "uuid-user-alice",
      "created_at": "2026-09-18T12:00:00Z",
      "member_count": 1,
      "my_role": "creator"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Validasi judul gagal atau durasi tidak valid
  - `403 Forbidden`: `{"error":"Akses ditolak: Hanya admin atau pembuat grup yang dapat membuat topik forum"}`

---

#### 43. `POST /api/groups/{id}/join-request`
Mengajukan permohonan izin bergabung ke subgrup privat. Pemohon wajib anggota aktif di grup induk. Permohonan berstatus `pending` dan memicu notifikasi real-time ganda (WebSocket event `join_request` dan Web Push) khusus ke Creator subgrup dan Admin yang terdaftar sebagai anggota subgrup tersebut.
- **Autentikasi**: `Bearer <token>` (wajib anggota grup induk)
- **Path Parameter**: `id` — ID subgrup (`sub_<UUID>`)
- **Real-Time Notification Dispatch**:
  - WebSocket Hub mengirimkan event `join_request` langsung ke koneksi aktif Creator dan Admin subgrup.
  - Web Push Notification dikirimkan ke perangkat offline milik Creator dan Admin subgrup (`"tag": "join-request-<subGroupID>"`).
  - Admin grup induk yang **tidak bergabung** ke subgrup privat tidak menerima notifikasi untuk mencegah spam (DEC-014).
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Permohonan bergabung berhasil diajukan, menunggu persetujuan admin"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Subgrup bertipe publik (dapat langsung join) atau permohonan sedang pending
  - `403 Forbidden`: Pemohon bukan anggota grup utama
  - `409 Conflict`: Pengguna sudah menjadi anggota subgrup

---

#### 44. `GET /api/groups/{id}/join-requests`
Mengambil seluruh daftar permohonan bergabung berstatus `pending` untuk subgrup privat tertentu. Hanya dapat diakses oleh admin/creator subgrup atau admin/creator grup induk.
- **Autentikasi**: `Bearer <token>` (wajib admin/creator)
- **Path Parameter**: `id` — ID subgrup (`sub_<UUID>`)
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "requests": [
      {
        "id": "req_11223344-5566-7788-99aa-bbccddeeff00",
        "conversation_id": "sub_9e67b2d5-4567-4890-bcde-fabc12345678",
        "user_id": "uuid-user-bob",
        "username": "bob_marley",
        "display_name": "Bob Marley",
        "avatar_url": "",
        "is_verified": false,
        "status": "pending",
        "created_at": "2026-09-18T12:05:00Z"
      }
    ]
  }
  ```
- **Error Responses**:
  - `403 Forbidden`: Pengguna bukan admin/creator yang berwenang

---

#### 45. `POST /api/groups/{id}/join-requests/{requestId}/action`
Menyetujui (`approve: true`) atau menolak (`approve: false`) permohonan bergabung ke subgrup privat. Jika disetujui, pemohon otomatis ditambahkan sebagai `member` di `conversation_members` dan status request menjadi `approved`.
- **Autentikasi**: `Bearer <token>` (wajib admin/creator)
- **Path Parameter**:
  - `id` — ID subgrup (`sub_<UUID>`)
  - `requestId` — ID permohonan (`req_<UUID>`)
- **Request Body**:
  ```json
  {
    "approve": true
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Permohonan berhasil disetujui"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Permohonan sudah diproses sebelumnya
  - `403 Forbidden`: Pengguna bukan admin/creator yang berwenang

---

## 4. Protokol WebSocket & Event Catalog

### 4.1 Koneksi & Parameter URL
Sambungkan koneksi WebSocket ke:
```
wss://<backend-host>/ws?token=<JWT_TOKEN>&device_id=<DEVICE_ID>
```
- **Query Params**:
  - `token` (*wajib*): JWT token otentikasi.
  - `device_id` (*opsional namun direkomendasikan*): UUID unik perangkat klien (`wuzz_device_id`). Dapat juga dikirim via header `X-Device-ID`.
- **Single Active Device Gatekeeper**:
  - Jika akun pengguna telah meregistrasikan perangkat aktif sah di database (`active_device_id`), koneksi yang mengirimkan `device_id` tidak cocok atau kosong akan **DITOLAK saat handshake HTTP** dengan status `HTTP 403 Forbidden`:
    ```json
    {
      "error": "DEVICE_MISMATCH",
      "code": "SESSION_REPLACED",
      "message": "Akun Anda sedang aktif di perangkat lain."
    }
    ```
  - Jika perangkat baru yang sah terhubung, sesi perangkat lama di Hub akan dikirimi event notifikasi `system` (`SESSION_REPLACED: Akun Anda dibuka dari perangkat lain.`), diberikan jeda flush 250ms, lalu diputus secara tertib dengan WebSocket Close Control Frame **Code `4001`**. Klien wajib menghentikan auto-reconnect saat menerima Close Code `4001`.
- **Write Deadline**: 10 detik.
- **Pong Wait**: 60 detik.
- **Ping Period**: 54 detik (Server otomatis mengirim Ping frame secara periodik).
- **Max Message Size**: 64 KB (65.536 bytes).

---

### 4.2 Skema Message JSON Standar
Setiap frame WebSocket dipertukarkan dalam format JSON tunggal (`Message` struct):

> **🔑 UUID-First Identity Principle**: Field `from` selalu berisi **UUID immutable** (`sender_id`) yang di-*enforce* dari JWT token server. Field `nickname` hanya bersifat **display label** yang dapat berubah sewaktu-waktu. Seluruh logika otorisasi, receipt tracking, ownership check, dan perbandingan identitas di frontend **wajib menggunakan `from` (UUID)**, bukan `nickname`.

| Field | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id` | `string` | UUID unik pesan (wajib untuk chat baru) |
| `type` | `string` | Tipe event (lihat daftar di bawah) |
| `from` | `string` | **UUID immutable** pengirim (di-*enforce* dari JWT, bukan dari payload klien) |
| `room` | `string` | ID percakapan target (misal: `direct_uuid_uuid`) |
| `nickname` | `string` | Display name / username pengirim (**hanya untuk tampilan**, bukan identifier) |
| `content` | `string` | Teks pesan (berisi ciphertext E2EE jika terenkripsi) |
| `timestamp` | `string` | Waktu RFC3339 UTC dari server |
| `status` | `string` | `"pending"`, `"sent"`, `"delivered"`, `"read"` |
| `reply_to` | `object` | Objek pesan yang dikutip: `{ id, nickname, content }` |
| `reactions` | `array` | Daftar reaksi aktif pada pesan: `[{ emoji, users:[uuid,...], count }]` — `users` berisi **UUID** |
| `reaction` | `object` | Payload event toggle reaksi: `{ message_id, emoji }` |
| `media_url` | `string` | URL berkas terlampir |
| `media_type` | `string` | `"image"`, `"document"`, `"audio"`, `"video"` |
| `file_name` | `string` | Nama file asli (misal: `surat.pdf`) |
| `file_size` | `integer`| Ukuran file dalam bytes |
| `is_deleted` | `boolean`| Menandakan pesan ditarik untuk semua orang |
| `sdp` | `string` | WebRTC Session Description string (Offer/Answer) |
| `candidate` | `string` | WebRTC ICE Candidate string |
| `messages` | `array` | Array pesan riwayat (khusus event `history`) |
| `users` | `array` | Array anggota aktif di room (khusus event `room_users`) |
| `since` | `string` | ISO 8601 timestamp checkpoint untuk delta offline sync pada event `join` |
| `request_id` | `string` | ID korelasi transport request-response untuk ACK deterministik (Milestone 8.9) |

---

### 4.3 Katalog Event WebSocket

#### 1. `join` (Client ➔ Server)
Mengabarkan server bahwa user membuka ruang percakapan tertentu. Server otomatis membalas dengan event `history`, memperbarui tanda terima menjadi `read`, dan mem-broadcast `room_users` (hanya ke anggota room tersebut).

Klien dapat menyertakan checkpoint `since` (diambil dari timestamp pesan terakhir di cache lokal) untuk mengaktifkan **Delta Offline Sync**:
```json
{
  "type": "join",
  "room": "direct_11111111_22222222",
  "since": "2026-09-18T14:30:00.000Z"
}
```
*Catatan Delta Sync*: Jika `since` disertakan, server hanya mengirim pesan yang dibuat setelah waktu tersebut (`created_at > since`). Jika tidak ada pesan baru, event `history` mengembalikan array kosong `[]`, menghemat bandwidth hingga 90%. Jika `since` tidak dikirim, server fallback ke 50 pesan terakhir.

---

#### 2. `history` (Server ➔ Client)
Dikirim otomatis oleh server setelah event `join` berhasil. Berisi daftar 50 pesan terakhir dari database (`ORDER BY created_at DESC LIMIT 50`) yang berjalan dengan performa tinggi $O(\log N)$ berkat indeks komposit. Klien modern (Next.js) memadukan 50 pesan server ini dengan IndexedDB lokal (`wuzzchat_msg_db`) yang sudah tampil seketika (0ms *Cache-First*).
```json
{
  "type": "history",
  "room": "direct_11111111_22222222",
  "messages": [
    {
      "id": "msg_001",
      "type": "message",
      "from": "user_111",
      "nickname": "budi123",
      "content": "e2ee:v1:...",
      "timestamp": "2026-09-16T12:00:00Z",
      "status": "read"
    }
  ]
}
```

---

#### 3. `room_users` (Server ➔ Client)
Daftar user yang saat ini sedang membuka room tersebut secara online (indikator presence real-time).
```json
{
  "type": "room_users",
  "room": "direct_11111111_22222222",
  "users": [
    {
      "id": "11111111-...",
      "username": "budi123",
      "display_name": "Budi Santoso"
    }
  ]
}
```

> **🔑 Catatan**: Identifikasi anggota di event `room_users` menggunakan field `id` (UUID), bukan `username` atau `display_name`.

---

#### 4. `message` (Bidirectional)
Mengirim atau menerima pesan chat.

**Kirim (Client ➔ Server)**:
```json
{
  "id": "c7a8b9-generate-uuid-v4",
  "type": "message",
  "room": "grp_f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "content": "@alice tolong review PR ini dan @bob deploy ke staging",
  "reply_to": {
    "id": "msg_sebelumnya",
    "nickname": "siti_aminah",
    "content": "Halo apa kabar?"
  },
  "mentions": [
    "user-uuid-alice",
    "user-uuid-bob"
  ]
}
```

> 🛡️ **Aturan Validasi Mention Fail-Closed (DEC-013)**: Field `mentions` berupa array UUID pengguna (data immutable murni, bukan username/display_name). Backend Go WebSocket Hub memvalidasi setiap UUID via `IsUserInConversation(roomID, mUID)`. Jika user bukan anggota sah dari grup atau subgrup tujuan, mention tersebut di-drop sebelum persistensi dan broadcast.

**Terima (Server ➔ Client)**:
Server membalas pengirim dengan status `sent`, dan meneruskan pesan ke penerima dengan status `delivered` (jika penerima sedang online) beserta `timestamp` server dan field `mentions: ["user-uuid-1", ...]`. Pengguna offline yang tercantum pada `mentions` menerima Web Push prioritas bertag `chat-mention-[room]` dengan judul `🔔 [Pengirim] menyebut Anda`.

---

#### 5. `typing` (Bidirectional)
Menampilkan indikator "sedang mengetik..." kepada lawan bicara.
```json
{
  "type": "typing",
  "room": "direct_11111111_22222222"
}
```
> 🛡️ **Rate Limit Guard**: Backend menerapkan sliding-window rate limiter per koneksi (maksimal **3 event typing per 2 detik**). Event berlebih akan di-drop secara silent untuk mencegah kelebihan beban broadcast.

---

#### 6. `receipt` (Bidirectional)
Memperbarui tanda terima centang pesan.

**Client ➔ Server**:
```json
{
  "type": "receipt",
  "room": "direct_11111111_22222222",
  "id": "msg_001",
  "status": "read"
}
```
*(Nilai status: `"sent"`, `"delivered"`, `"read"`)*.

> **💡 Semantik Tanda Terima: DM vs Grup**:
> - **Pada Direct Message**: Mendukung status penuh: `sent` (✓), `delivered` (✓✓ abu-abu), dan `read` (✓✓ biru neon saat lawan bicara membuka room).
> - **Pada Obrolan Grup**: Status tanda terima difokuskan pada pengiriman ke room (`sent` / `delivered`). Backend saat ini tidak menyiarkan centang biru per-anggota individu ke linimasa guna mencegah kelebihan beban event broadcast $O(N \times M)$ pada grup beranggotakan puluhan orang.

---

#### 7. `ack` (Server ➔ Client)
Konfirmasi transport-level deterministik (Milestone 8.9) yang dikirimkan oleh server kembali ke soket pengirim segera setelah paket diterima dan divalidasi.
```json
{
  "type": "ack",
  "request_id": "req-custom-uuid-123",
  "room": "direct_11111111_22222222",
  "status": "ok",
  "timestamp": "2026-09-19T00:15:00Z"
}
```
*Catatan Reliabilitas Transport*:
- Klien (PWA, Android Native Kotlin, React Native) menggunakan paket ini untuk mem-pop pesan dari `outboundQueue` lokal dan menghentikan pengiriman ulang.
- Jika validasi gagal (BOLA access denied, room expired, rate limit), `status` bernilai `"error"` disertai penjelasan pada field `content`.
- Didukung oleh **Server-Side Idempotency Guard**: jika klien me-resend pesan duplikat saat reconnect, server membatalkan broadcast ganda namun tetap membalas paket `ack` ini agar klien mengetahui bahwa pesan telah tersimpan aman di server.

---

#### 8. `reaction` (Bidirectional)
Menambahkan atau menarik reaksi emoji pada pesan.

**Client ➔ Server**:
```json
{
  "type": "reaction",
  "room": "direct_11111111_22222222",
  "reaction": {
    "message_id": "msg_001",
    "emoji": "❤️"
  }
}
```

**Server ➔ Client (Broadcast)**:
```json
{
  "type": "reaction",
  "room": "direct_11111111_22222222",
  "id": "msg_001",
  "reactions": [
    {
      "emoji": "❤️",
      "users": ["11111111-uuid-budi"],
      "count": 1
    }
  ]
}
```

---

#### 9. `message_deleted` (Server ➔ Client)
Diterima ketika pesan tertentu ditarik untuk semua orang (*Delete for Everyone*).
```json
{
  "type": "message_deleted",
  "id": "msg_001",
  "room": "direct_11111111_22222222",
  "content": "🚫 Pesan ini telah dihapus",
  "is_deleted": true,
  "timestamp": "2026-09-16T12:05:00Z"
}
```

---

#### 10. `message_edited` (Server ➔ Client)
Diterima ketika pengirim asli memperbarui isi teks pesan (dalam batas waktu 15 menit).
```json
{
  "type": "message_edited",
  "id": "msg_001",
  "room": "direct_11111111_22222222",
  "content": "Teks pesan yang telah diedit",
  "is_edited": true,
  "edited_at": "2026-09-19T12:00:00Z"
}
```

---

#### 11. `message_pinned` (Server ➔ Client)
Diterima ketika sebuah pesan disematkan di dalam percakapan (maksimal 3 pin per percakapan).
```json
{
  "type": "message_pinned",
  "id": "msg_001",
  "room": "direct_11111111_22222222",
  "content": "Pengumuman penting yang disematkan",
  "from": "user_uuid_pengirim",
  "from_display": "Nama Pengirim"
}
```

---

#### 12. `message_unpinned` (Server ➔ Client)
Diterima ketika sebuah pesan dilepas sematannya dari percakapan.
```json
{
  "type": "message_unpinned",
  "id": "msg_001",
  "room": "direct_11111111_22222222"
}
```

---

#### 13. WebRTC Signaling Events (P2P Calling)
Digunakan untuk negosiasi panggilan suara/video tanpa menyentuh database chat:
- `call_offer`: Pemanggil mengirim SDP offer.
- `call_answer`: Penerima mengirim SDP answer.
- `ice_candidate`: Pertukaran kandidat koneksi jaringan STUN/TURN.
- `call_reject`: Panggilan ditolak penerima.
- `call_end`: Panggilan diputus atau dibatalkan.
- `call_busy`: Penerima sedang berada pada panggilan lain.

Contoh payload `call_offer`:
```json
{
  "type": "call_offer",
  "room": "direct_11111111_22222222",
  "sdp": "v=0\r\no=- 423984 2 IN IP4 127.0.0.1...",
  "media_type": "video"
}
```

Contoh payload `ice_candidate`:
```json
{
  "type": "ice_candidate",
  "room": "direct_11111111_22222222",
  "candidate": "{\"candidate\":\"candidate:1 1 UDP 2122260223...\",\"sdpMid\":\"0\",\"sdpMLineIndex\":0}"
}
```

---

#### 14. `system` (Server ➔ Client)
Pesan pemberitahuan sistem atau error dari backend.
```json
{
  "type": "system",
  "from": "server",
  "content": "ERROR: Akses ditolak: Anda bukan anggota percakapan ini"
}
```

---

#### 15. `join_request` (Server ➔ Client)
Notifikasi permohonan bergabung ke subgrup privat yang dikirimkan secara langsung ke koneksi aktif Creator dan Admin subgrup, atau notifikasi hasil peninjauan (*approval/rejection*) yang dikirimkan balik ke pemohon.
```json
{
  "type": "join_request",
  "room": "sub_9e67b2d5-4567-4890-bcde-fabc12345678",
  "from": "uuid-user-charlie",
  "nickname": "Charlie",
  "content": "Charlie meminta izin bergabung ke topik 'Diskusi Sprint Go Backend'",
  "timestamp": "2026-09-20T02:20:00.000Z"
}
```

---

## 5. Spesifikasi Standar E2EE (End-to-End Encryption)

Backend Wuzz Chat dirancang menganut prinsip **Zero-Knowledge Architecture**. Backend tidak memiliki kunci privat pengguna dan tidak dapat membaca isi obrolan maupun mendekripsi file media.

```
+---------------+                                       +---------------+
| Pengirim (A)  |                                       | Penerima (B)  |
+-------+-------+                                       +-------+-------+
        |                                                       |
        | 1. Ambil Public Key B via GET /api/users/public-key   |
        | 2. Hitung Shared Secret: ECDH(PrivKeyA, PubKeyB)      |
        | 3. Derivasi Kunci AES: HKDF-SHA256(SharedSecret)      |
        | 4. Enkripsi teks: AES-256-GCM (12-byte IV)           |
        |                                                       |
        |--------- 5. Kirim "e2ee:v1:IV:Ciphertext" ----------->|
        |                      via WebSocket                    |
        |                                                       |
                                        6. Hitung Shared Secret: ECDH(PrivKeyB, PubKeyA)
                                        7. Derivasi Kunci AES: HKDF-SHA256(SharedSecret)
                                        8. Dekripsi AES-256-GCM -> Plaintext Asli!
```

### 5.1 Format Wire Kriptografi
Pesan terenkripsi dikirimkan melalui field `content` dengan format:
```
e2ee:v1:<base64_iv>:<base64_ciphertext>
```
- `e2ee:v1`: Pengenal versi skema enkripsi.
- `<base64_iv>`: 12-byte initialization vector acak di-encode Base64.
- `<base64_ciphertext>`: Hasil cipher AES-GCM (termasuk 16-byte authentication tag) di-encode Base64.

### 5.2 Algoritma Kriptografi yang Wajib Digunakan Frontend
1. **Key Pair**: Elliptic Curve Diffie-Hellman (**ECDH**) dengan kurva **P-256** (`secp256r1`).
2. **Key Derivation Function**: **HKDF** berbasis **SHA-256**:
   - Salt: Kosong atau string unik aplikasi `"wuzz-chat-e2ee-salt"`.
   - Info: `"wuzz-chat-v1-key-agreement"`.
   - Panjang kunci keluaran: 256 bits (32 bytes).
3. **Cipher Simetris**: **AES-256-GCM** dengan tag autentikasi 128-bit (16 bytes).

---

## 6. Siklus Hidup Media (Store-and-Forward & Shared Group Media)

Untuk menghemat kuota server dan menjamin privasi, file media mengikuti dua model distribusi tergantung tipe percakapan:

### 6.1 Direct Message (1-on-1): WhatsApp Store-and-Forward
```
[ Pengirim ] ➔ (1. POST /api/media/upload) ➔ [ Backend Storage ]
     |                                               |
     |--- (2. WS: message dengan media_url) -------->|
                                                     |--- (3. WS Forward) ---> [ Penerima ]
                                                                                   |
                                                     |<-- (4. POST /api/media/ack)-|
                                                     |
                                            [ File Fisik DIHAPUS ]
                                            Status: 'downloaded'
```

1. **Upload**: Pengirim mengunggah file ke `POST /api/media/upload` dan memperoleh URL transit.
2. **Dispatch**: Pengirim mengirim pesan chat WebSocket dengan mengisi field `media_url`, `media_type`, `file_name`, dan `file_size`.
3. **Receive & ACK**: Begitu aplikasi penerima selesai mengunduh atau menampilkan gambar, klien penerima memanggil `POST /api/media/ack` membawa `message_id`.
4. **Immediate Auto-Purge**: Backend langsung menghapus berkas fisik dari storage dan menandai `media_status = 'downloaded'`. Berkas tetap dapat dilihat oleh kedua pihak karena sudah tersimpan di browser IndexedDB masing-masing (`wuzzchat_media_db`).
5. **TTL Fallback Cleanup**: Jika penerima tidak online selama > 7 hari (nilai default `MEDIA_RETENTION_DAYS`), background worker backend (`PurgeWorker`) yang berjalan setiap 1 jam akan secara otomatis membersihkan file tersebut dan mengubah statusnya menjadi `'expired'`.

### 6.2 Obrolan Grup & Forum Topics (1-to-Many): Shared Media Hub
Pada obrolan grup dan forum topik (`grp_...`, `sub_...`) dengan banyak anggota, berkas media **TIDAK DIHAPUS saat orang pertama mengunduh**. Jika dihapus pada ACK pertama, anggota lain yang baru membuka obrolan belakangan akan mengalami kegagalan unduh (*Error 404/410 Expired*).

| Parameter | Direct Message (1-on-1) | Obrolan Grup & Forum Topics (1-to-Many) |
| :--- | :--- | :--- |
| **Model Distribusi** | *Store-and-Forward Transit Buffer* | *Shared Media Hub (TTL-Based)* |
| **Trigger Hapus Fisik** | Langsung dihapus saat penerima memanggil `POST /api/media/ack`. | **TIDAK dihapus oleh ACK anggota**. Berkas bertahan di Supabase Storage selama masa retensi TTL penuh (default 7 hari). |
| **Status Media di Database** | Berubah menjadi `'expired'` seketika setelah di-ACK. | **Tetap `'active'`** agar anggota ke-2, ke-3, dst. tidak mendapati status media kedaluwarsa. |
| **Penyimpanan Lokal Klien**| Disimpan di IndexedDB penerima (`wuzzchat_media_db`). | Anggota yang sudah membuka media langsung meng-cache blob ke **IndexedDB lokal masing-masing**, mencegah download ulang. |
| **Pembersihan Server** | Segera setelah diunduh, atau maksimal 7 hari jika penerima offline lama. | Dihapus otomatis oleh `PurgeWorker` setiap 1 jam setelah file melampaui `MEDIA_RETENTION_DAYS` (7 hari). |

---

## 7. Variabel Lingkungan (Frontend Config)

Untuk menghubungkan klien frontend (Next.js, Vite, React Native, dsb.) ke backend Wuzz Chat:

### Contoh `.env.local` (Next.js / Web)
```bash
# URL REST Backend
NEXT_PUBLIC_API_URL=https://wuzz-chat-backend.fly.dev

# URL WebSocket Gateway
NEXT_PUBLIC_WS_URL=wss://wuzz-chat-backend.fly.dev/ws

# Public VAPID Key untuk Web Push (Bisa didapat juga via GET /api/notifications/vapid-public-key)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa...
```

---

## 8. Checklist Implementasi Klien Baru (Quick Start)

Bagi pengembang yang mulai membangun frontend baru dari nol, ikuti urutan integrasi berikut:

- [ ] **Langkah 1: Setup Klien REST & Auth Flow**
  - Implementasikan form registrasi & login ke `/api/auth/register` dan `/api/auth/login`.
  - Simpan token JWT di secure storage (`localStorage`, `SecureStore`, atau `Keychain`).
- [ ] **Langkah 2: Inisialisasi E2EE Key Pair Lokal**
  - Saat login pertama, periksa apakah perangkat sudah memiliki private key lokal (misal di IndexedDB). Jika belum, generate pasangan kunci ECDH P-256.
  - Daftarkan public key ke `PUT /api/users/public-key`. Jika menerima HTTP 409 (`KEY_ALREADY_REGISTERED`), tampilkan opsi: *Scan QR Transfer* atau *Reset Kunci Baru* (`POST /api/users/public-key/reset`).
- [ ] **Langkah 3: Buka Koneksi WebSocket**
  - Buat koneksi ke `wss://<backend>/ws?token=<JWT>`.
  - Pasang handler auto-reconnect dengan exponential backoff jika koneksi terputus.
  - Tangani event `system` dengan isi `SESSION_REPLACED` untuk menampilkan modal *"Akun terbuka di perangkat lain"*.
- [ ] **Langkah 4: Fetch Home Screen Chat List**
  - Panggil `GET /api/conversations` untuk merender daftar riwayat percakapan.
- [ ] **Langkah 5: Buka Room Obrolan & Join**
  - Muat cache lokal terlebih dahulu (IndexedDB / SQLite) untuk render instan 0ms (*Cache-First*).
  - Saat user memilih chat, kirim frame `{"type":"join","room":"<room_id>"}`.
  - Dengarkan event `history` untuk merender pesan lama.
  - Dekripsi setiap pesan berawalan `e2ee:v1:...` menggunakan kunci lawan bicara, lalu simpan hasil plaintext ke database cache lokal (*write-through*) demi kontinuitas pembacaan saat kunci lawan berubah.
- [ ] **Langkah 6: Pengiriman Pesan & Receipt Sync**
  - Saat mengetik pesan, kirim event `typing`.
  - Saat tombol kirim ditekan, enkripsi pesan dengan public key lawan bicara, lalu kirim frame `{"type":"message", ...}`.
  - Saat lawan bicara online membuka room, dengarkan event `receipt` untuk mengubah centang dari ✓ (sent) ke ✓✓ biru (read).
- [ ] **Langkah 7: Unggah Media & Download ACK**
  - Implementasikan upload multipart ke `/api/media/upload`.
  - Pasang pemanggilan `POST /api/media/ack` saat penerima selesai mengunduh file media.
- [ ] **Langkah 8: Setup Push Notifications**
  - Minta izin notifikasi ke user (`Notification.requestPermission()`).
  - Ambil VAPID key via `/api/notifications/vapid-public-key`, daftarkan subscription ke browser, lalu kirim ke `POST /api/notifications/subscribe`.
