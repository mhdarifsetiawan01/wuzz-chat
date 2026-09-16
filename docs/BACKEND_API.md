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
| **Media Store-and-Forward** | ✅ Siap | Auto-delete file dari server setelah penerima mengirimkan konfirmasi download (`ACK`) |
| **Pembersih Media Kedaluwarsa (TTL)**| ✅ Siap | Background worker membersihkan file yang tidak diunduh > 7 hari |
| **OpenGraph Link Preview** | ✅ Siap | Aman dari SSRF (Private IP Pinning & DNS Rebinding Guard) + Cache |
| **Web Push Notification** | ✅ Siap | VAPID Web Push standard (Chrome, Firefox, Safari iOS/macOS, PWA) |

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
  *Validasi: `username` minimal 3 karakter, `password` minimal 6 karakter.*
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
      "public_key": "..."
    }
  ]
  ```

---

#### 9. `GET /api/users/profile?id=<uuid>` atau `?username=<name>`
Melihat detail profil publik user lain.
- **Autentikasi**: `Bearer <token>`
- **Success Response (200 OK)**: Objek data user publik.

---

#### 10. `GET /api/conversations`
Mengambil daftar obrolan aktif (Home screen chat list) milik user saat ini, lengkap dengan pesan terakhir, unread count, dan data lawan bicara.
- **Autentikasi**: `Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": "direct_11111111_22222222",
      "type": "direct",
      "name": "Siti Aminah",
      "avatar_url": "",
      "unread_count": 2,
      "other_user": {
        "id": "22222222-...",
        "username": "siti_aminah",
        "display_name": "Siti Aminah",
        "avatar_url": "",
        "public_key": "...",
        "last_seen": "2026-09-16T12:10:00Z"
      },
      "last_message": {
        "id": "msg_987",
        "content": "e2ee:v1:7s8df...:92348df...",
        "from": "siti_aminah",
        "timestamp": "2026-09-16T12:15:30Z",
        "status": "delivered",
        "media_type": ""
      },
      "updated_at": "2026-09-16T12:15:30Z"
    }
  ]
  ```

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

### 3.4 Manajemen Pesan

#### 13. `DELETE /api/messages?id=<msg_id>&delete_for_everyone=<bool>` *(atau `POST /api/messages/delete`)*
Menghapus pesan spesifik.
- **Autentikasi**: `Bearer <token>`
- **Payload / Query Parameters**:
  - `id` atau `message_id` (string): ID pesan.
  - `delete_for_everyone` (boolean, opsional): Jika `true`, pesan ditarik untuk semua orang.
- **Aturan Delete for Everyone**:
  1. Hanya pengirim asli pesan yang boleh melakukan *Delete for Everyone*.
  2. Hanya dapat dilakukan dalam jangka waktu **maksimal 1 menit (60 detik)** sejak pesan dikirim. Melebihi 1 menit akan ditolak backend dengan status `400 Bad Request`.
  3. Menghasilkan broadcast real-time event `message_deleted` ke seluruh anggota room.
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

### 3.5 Media & Konfigurasi

#### 14. `GET /api/config`
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

#### 15. `POST /api/media/upload`
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

#### 16. `POST /api/media/ack`
Mengirim konfirmasi unduhan berkas oleh penerima pesan. Memicu backend untuk menghapus file fisik secara instan dari server (*WhatsApp Store-and-Forward Lifecycle*).
- **Autentikasi**: `Bearer <token>`
- **Request Body**:
  ```json
  {
    "message_id": "msg_uuid_123",
    "room_id": "direct_11111111_22222222"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "status": "ok",
    "message": "Media download acknowledged and purged from server storage"
  }
  ```

---

### 3.6 Link Preview (OpenGraph)

#### 17. `GET /api/link-preview?url=<target_url>`
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

#### 18. `GET /api/notifications/vapid-public-key`
Mengambil kunci publik VAPID untuk inisialisasi `PushManager.subscribe()` di browser/PWA.
- **Autentikasi**: Publik
- **Success Response (200 OK)**:
  ```json
  {
    "public_key": "BEl62iUYgUivxIkv69yViEuiBIa..."
  }
  ```

---

#### 19. `POST /api/notifications/subscribe`
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

#### 20. `POST /api/notifications/unsubscribe`
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

#### 21. `POST /api/users/transfer/create`
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

#### 22. `POST /api/users/transfer/consume`
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
- **Error Codes**: `404 Not Found`, `410 Gone` (`SESSION_EXPIRED` atau `SESSION_ALREADY_USED`), `403 Forbidden`.

---

### 3.9 Health Check

#### 23. `GET /health`
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

## 4. Protokol WebSocket & Event Catalog

### 4.1 Koneksi & Parameter URL
Sambungkan koneksi WebSocket ke:
```
wss://<backend-host>/ws?token=<JWT_TOKEN>
```
- **Write Deadline**: 10 detik.
- **Pong Wait**: 60 detik.
- **Ping Period**: 54 detik (Server otomatis mengirim Ping frame secara periodik).
- **Max Message Size**: 64 KB (65.536 bytes).

---

### 4.2 Skema Message JSON Standar
Setiap frame WebSocket dipertukarkan dalam format JSON tunggal (`Message` struct):

| Field | Tipe Data | Keterangan |
| :--- | :--- | :--- |
| `id` | `string` | UUID unik pesan (wajib untuk chat baru) |
| `type` | `string` | Tipe event (lihat daftar di bawah) |
| `from` | `string` | Client/User ID pengirim (diisi server) |
| `room` | `string` | ID percakapan target (misal: `direct_uuid_uuid`) |
| `nickname` | `string` | Username/display name pengirim |
| `content` | `string` | Teks pesan (berisi ciphertext E2EE jika terenkripsi) |
| `timestamp` | `string` | Waktu RFC3339 UTC dari server |
| `status` | `string` | `"pending"`, `"sent"`, `"delivered"`, `"read"` |
| `reply_to` | `object` | Objek pesan yang dikutip: `{ id, nickname, content }` |
| `reactions` | `array` | Daftar reaksi aktif pada pesan: `[{ emoji, users, count }]` |
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

---

### 4.3 Katalog Event WebSocket

#### 1. `join` (Client ➔ Server)
Mengabarkan server bahwa user membuka ruang percakapan tertentu. Server otomatis membalas dengan event `history`, memperbarui tanda terima menjadi `read`, dan mem-broadcast `room_users`.
```json
{
  "type": "join",
  "room": "direct_11111111_22222222"
}
```

---

#### 2. `history` (Server ➔ Client)
Dikirim otomatis oleh server setelah event `join` berhasil. Berisi daftar 50 pesan terakhir dari database.
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
      "display_name": "Budi Santoso",
      "nickname": "budi123"
    }
  ]
}
```

---

#### 4. `message` (Bidirectional)
Mengirim atau menerima pesan chat.

**Kirim (Client ➔ Server)**:
```json
{
  "id": "c7a8b9-generate-uuid-v4",
  "type": "message",
  "room": "direct_11111111_22222222",
  "content": "e2ee:v1:7sd...:92a...",
  "reply_to": {
    "id": "msg_sebelumnya",
    "nickname": "siti_aminah",
    "content": "Halo apa kabar?"
  }
}
```

**Terima (Server ➔ Client)**:
Server membalas pengirim dengan status `sent`, dan meneruskan pesan ke penerima dengan status `delivered` (jika penerima sedang online) beserta `timestamp` server.

---

#### 5. `typing` (Bidirectional)
Menampilkan indikator "sedang mengetik..." kepada lawan bicara.
```json
{
  "type": "typing",
  "room": "direct_11111111_22222222"
}
```

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

---

#### 7. `reaction` (Bidirectional)
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
      "users": ["budi123"],
      "count": 1
    }
  ]
}
```

---

#### 8. `message_deleted` (Server ➔ Client)
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

#### 9. WebRTC Signaling Events (P2P Calling)
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

#### 10. `system` (Server ➔ Client)
Pesan pemberitahuan sistem atau error dari backend.
```json
{
  "type": "system",
  "from": "server",
  "content": "ERROR: Akses ditolak: Anda bukan anggota percakapan ini"
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

## 6. Siklus Hidup Media (Store-and-Forward)

Untuk menghemat kuota server dan menjamin privasi, file media mengikuti pola **WhatsApp Store-and-Forward**:

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

1. **Upload**: Pengirim mengunggah file ke `POST /api/media/upload` dan memperoleh `url`.
2. **Dispatch**: Pengirim mengirim pesan chat WebSocket dengan mengisi field `media_url`, `media_type`, `file_name`, dan `file_size`.
3. **Receive & ACK**: Begitu aplikasi penerima selesai mengunduh atau menampilkan gambar, klien penerima wajib memanggil `POST /api/media/ack` membawa `message_id`.
4. **Auto-Purge**: Backend langsung menghapus berkas dari disk/bucket dan menandai `media_status = 'downloaded'`.
5. **TTL Cleanup**: Jika penerima offline selama > 7 hari (nilai default `MEDIA_RETENTION_DAYS`), background worker backend akan secara otomatis membersihkan file tersebut dan mengubah statusnya menjadi `'expired'`.

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
  - Saat user memilih chat, kirim frame `{"type":"join","room":"<room_id>"}`.
  - Dengarkan event `history` untuk merender pesan lama.
  - Dekripsi setiap pesan berawalan `e2ee:v1:...` menggunakan kunci lawan bicara.
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
