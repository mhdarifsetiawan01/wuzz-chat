# Spesifikasi Desain Arsitektur & Database — Wuzz Chat

Dokumen ini mendefinisikan desain skema data, alur komunikasi WebSocket, dan standar API untuk evolusi platform **Wuzz Chat** menuju aplikasi chatting modern kelas WhatsApp/Telegram.

---

## 🗄️ 1. Skema Database Relasional (PostgreSQL / Supabase)

Untuk mendukung percakapan berkelanjutan (*Direct Message & Group*), daftar kontak, profil pengguna, dan tanda terima pesan (*read receipts*), skema database dirancang sebagai berikut:

```mermaid
erDiagram
    USERS ||--o{ CONVERSATION_MEMBERS : joins
    USERS ||--o{ MESSAGES : sends
    USERS ||--o{ MESSAGE_RECEIPTS : reads
    USERS ||--o{ PUSH_SUBSCRIPTIONS : registers
    CONVERSATIONS ||--o{ CONVERSATION_MEMBERS : contains
    CONVERSATIONS ||--o{ MESSAGES : has
    MESSAGES ||--o{ MESSAGE_RECEIPTS : tracked_by
    MESSAGES ||--o{ ATTACHMENTS : includes

    USERS {
        uuid id PK
        varchar username UK
        varchar display_name
        varchar email UK
        varchar password_hash
        text avatar_url
        varchar status_message
        text public_key "ECDH P-256 Public Key JWK"
        integer key_version "Key generation/rotation counter (default 1)"
        text active_device_id "Current device holding active E2EE session"
        timestamp last_seen
        timestamp created_at
    }

    PUSH_SUBSCRIPTIONS {
        uuid id PK
        uuid user_id FK
        varchar platform "web / android / ios"
        text endpoint UK
        text p256dh_key
        text auth_key
        timestamp created_at
    }

    CONVERSATIONS {
        uuid id PK
        varchar type "direct / group"
        varchar title "null if direct"
        text icon_url
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }

    CONVERSATION_MEMBERS {
        uuid id PK
        uuid conversation_id FK
        uuid user_id FK
        varchar role "admin / member"
        timestamp cleared_at "nullable timestamp for user clear chat"
        timestamp joined_at
    }

    MESSAGES {
        uuid id PK
        uuid conversation_id FK
        uuid sender_id FK
        varchar from_nickname
        uuid reply_to_id FK "nullable for quoted message"
        varchar reply_to_nickname "nullable"
        text reply_to_content "nullable"
        text reactions "JSON string array of emoji reactions"
        varchar status "pending / sent / delivered / read"
        varchar type "text / image / video / audio / document"
        text content
        boolean is_edited
        boolean is_deleted "true if message was recalled for everyone"
        text deleted_for_users "JSON array of user IDs who deleted message for themselves"
        timestamp created_at
        timestamp updated_at
    }

    ATTACHMENTS {
        uuid id PK
        uuid message_id FK
        varchar file_name
        varchar file_type
        bigint file_size
        text file_url
        text thumbnail_url
        timestamp created_at
    }
```

---

## 📡 2. Protokol Komunikasi WebSocket (Payload Standard & Autentikasi)

### A. Handshake Autentikasi (`/ws`)
Koneksi WebSocket mewajibkan autentikasi token JWT sebelum upgrade connection dilakukan. Token dapat dikirimkan melalui parameter query `?token=<jwt>` atau header `Authorization: Bearer <jwt>`.
- Jika token tidak valid atau tidak disertakan ➔ Server merespons `401 Unauthorized`.
- Jika token valid ➔ Server melakukan upgrade ke WebSocket dan secara otomatis mengikat identitas koneksi (`ClientID` = `claims.UserID`, `Nickname` = `claims.DisplayName` / `claims.Username`) tanpa celah pemalsuan nickname.

### B. Format Amplop Pesan (Payload Envelope)
```json
{
  "id": "uuid-v4-event",
  "type": "message | typing | receipt | reaction | room_users | history | system",
  "room": "dm_xxx / room-xxx",
  "from": "uuid-sender",
  "nickname": "Alice",
  "content": "Isi pesan...",
  "status": "pending | sent | delivered | read",
  "reply_to": {
    "id": "uuid-quoted-msg",
    "nickname": "Bob",
    "content": "Pesan yang dibalas"
  },
  "reactions": [
    { "emoji": "❤️", "users": ["Alice"], "count": 1 }
  ],
  "timestamp": "2026-09-12T03:00:00Z"
}
```

### B. Daftar Tipe Event:
| Event Type | Arah | Penjelasan |
|---|---|---|
| `message` | Bidirectional | Pengiriman dan penerimaan pesan teks/media |
| `message_deleted` | Server ➔ Client | Broadcast notifikasi pesan ditarik/dihapus untuk semua orang |
| `typing` | Bidirectional | Notifikasi bahwa user sedang mengetik di obrolan |
| `receipt` | Bidirectional | Laporan status pesan (`sent`, `delivered`, `read`) secara single atau bulk room |
| `reaction`| Bidirectional | Toggle penambahan/penghapusan reaksi emoji pada pesan |
| `room_users`| Server ➔ Client | Daftar anggota aktif dalam satu obrolan (presence realtime) |
| `history` | Server ➔ Client | Pengiriman riwayat pesan persisten saat user join ke obrolan |
| `join` | Client ➔ Server | Permintaan bergabung ke room tertentu dengan nickname/identitas |
| `call_offer` | Bidirectional | Sinyal WebRTC SDP Offer saat pemanggil memulai panggilan suara/video |
| `call_answer`| Bidirectional | Sinyal WebRTC SDP Answer saat penerima menerima panggilan suara/video |
| `ice_candidate` | Bidirectional | Pertukaran ICE candidate WebRTC untuk traversal NAT/STUN |
| `call_reject` | Bidirectional | Notifikasi penolakan panggilan oleh penerima |
| `call_end` | Bidirectional | Notifikasi pengakhiran panggilan oleh salah satu pihak |
| `call_busy` | Bidirectional | Notifikasi bahwa penerima sedang sibuk dalam panggilan lain |

---

## 🔐 3. Standar API & Autentikasi (REST Endpoints)

| Method | Endpoint | Fungsi | Auth |
|---|---|---|---|
| `POST` | `/api/auth/register` | Pendaftaran akun user baru | Public |
| `POST` | `/api/auth/login` | Login dan generate JWT token | Public |
| `GET` | `/api/auth/me` | Mengambil profil user yang sedang login | Bearer Token |
| `PUT` | `/api/auth/profile` | Memperbarui display name, status bio, dan avatar | Bearer Token |
| `PUT` | `/api/users/public-key` | Mendaftarkan / memperbarui Public Key kriptografi E2EE | Bearer Token |
| `GET` | `/api/users/profile?id=&username=` | Mengambil profil publik pengguna lain via UUID atau @username (termasuk `public_key`) | Bearer Token |
| `GET` | `/api/users/search?q=` | Mencari user berdasarkan username/nama (termasuk `public_key`) | Bearer Token |
| `GET` | `/api/conversations` | Daftar obrolan aktif beserta pesan terakhir dan `peer_public_key` | Bearer Token |
| `POST` | `/api/conversations` | Membuat obrolan baru (Direct atau Group) | Bearer Token |
| `DELETE` / `POST` | `/api/conversations?id=` / `/api/conversations/clear` | Menghapus riwayat percakapan untuk user pemanggil (*Delete for Me*) | Bearer Token |
| `DELETE` / `POST` | `/api/messages?id=&type=` / `/api/messages/delete` | Menghapus pesan (*for_me* kapanpun, atau *for_everyone* ≤ 60s) | Bearer Token |
| `POST` | `/api/media/upload` | Upload file gambar/dokumen/audio ke storage | Bearer Token |
| `POST` | `/api/media/ack` | Konfirmasi download file oleh client (memicu auto-delete file fisik) | Bearer Token |
| `GET` | `/api/notifications/vapid-public-key` | Mengambil VAPID Public Key untuk PushManager browser | Public |
| `POST` | `/api/notifications/subscribe` | Mendaftarkan endpoint & kunci push subscription per perangkat | Bearer Token |
| `POST` | `/api/notifications/unsubscribe` | Mencabut endpoint push subscription saat logout/toggle off | Bearer Token |
| `GET` | `/api/link-preview?url=` | Scraping aman metadata OpenGraph (SSRF protected & cached) | Bearer Token |
| `GET` | `/api/config` | Mengambil status konfigurasi publik (media upload toggle & retention) | Public |

---

## 📦 4. Panduan Ekstensi Media Storage & WhatsApp-Style Store-and-Forward

Backend WuzzChat menggunakan kontrak tunggal `MediaStorage` di `backend/internal/storage/storage.go`:

```go
type MediaStorage interface {
    Upload(ctx context.Context, file io.Reader, filename string, contentType string) (publicURL string, err error)
    Delete(ctx context.Context, fileKey string) error
    DriverName() string
}
```

### 🔄 Siklus Hidup Media (Store-and-Forward & IndexedDB Caching)

1. **Upload & Transit Buffer**: File diunggah ke storage (Supabase / Local) hanya sebagai penampung sementara (*transit buffer*).
2. **Download & Client Caching**: Klien penerima mengunduh binary blob dan menyimpannya secara offline ke browser **IndexedDB** (`mediaCache.ts`).
3. **Immediate Server Purge (ACK)**: Klien mengirim `POST /api/media/ack`. Server langsung memanggil `storage.Delete()` untuk menghapus berkas fisik dari server disk/bucket ($0 Server Storage Cost).
4. **TTL Background Auto-Purge (`PurgeWorker`)**: Berkas yang belum pernah diunduh melebihi `MEDIA_RETENTION_DAYS` (default 7 hari) otomatis dibersihkan oleh goroutine worker berkala.
5. **Client Pre-Upload Compression**: Klien mengompresi gambar otomatis (`imageCompressor.ts`, max 1600px, WebP quality 0.82) dengan opsi toggle yang dapat dimatikan kapan saja.

### 🚀 Cara Menambah Provider Storage Baru (Misal: AWS S3 / Cloudflare R2 / GCS):

1. **Buat File Driver Baru**: Buat file `backend/internal/storage/<nama_provider>_storage.go` yang mengimplementasikan ketiga method di atas.
2. **Daftarkan di Factory**: Buka `backend/internal/storage/storage.go`, lalu tambahkan case baru pada fungsi `NewMediaStorageFromEnv()`:
   ```go
   case "s3":
       return NewS3Storage(...)
   ```
3. **Konfigurasi `.env`**: Cukup atur nilai `STORAGE_DRIVER=<nama_provider>` dan tambahkan kredensial terkait.
4. **Zero-Touch Codebase**: Seluruh endpoint REST API, WebSocket Hub, database query, dan frontend Next.js **tidak perlu diubah sama sekali**.

---

## 📱💻 5. Arsitektur Frontend Dual-Platform (Desktop & Mobile)

Aplikasi frontend WuzzChat dirancang untuk memberikan pengalaman optimal di dua form-factor utama:

### A. Pola Layout Dual-Platform
- **Desktop / Laptop (Split 2-Column Mode)**:
  - Sidebar (daftar chat) dan Chat Main Pane (ruang obrolan) aktif berdampingan di satu layar.
  - Event chat masuk langsung ter-append secara live ke timeline chat aktif via `ADD_MESSAGE`.
- **Mobile / Handphone (WhatsApp Single-Screen Flow)**:
  - Layar bergantian penuh: **Layar 1 (Daftar Chat Fullscreen)** ⇄ **Layar 2 (Ruang Obrolan Fullscreen)**.
  - Transisi antar layar menggunakan tombol `← Back` (`activeRoomId = ''`).
  - Viewport menggunakan Dynamic Viewport Height (`100dvh`), header sticky (`position: sticky; top: 0; z-index: 50;`), dan safe area insets `env(safe-area-inset-bottom)`.

### B. Siklus Hidup State & Anti-Stale Lifecycle Guards
```text
[Home HP (Daftar Chat)] ──(Klik Chat)──► [Ruang Obrolan Fullscreen]
       ▲                                            │
       │                                            │ (Kirim/Terima Chat & Read Receipt)
       └──────────────(Klik ← Back)─────────────────┘
```
1. **Clean History State Sync**: Saat berpindah dari Home HP ke ruang obrolan, action `SET_MESSAGES` di `chatReducer` me-reset state bersih dari payload riwayat server (`messages: action.payload`), mencegah penggabungan dengan riwayat lama yang stale.
2. **Anti-Stale Reprocessing Guard (`lastHandledMsgIdRef`)**: Ketika `activeRoomId` berganti menjadi `''` saat user menekan `← Back`, ref guard mencegah `useEffect` memproses ulang `lastIncomingMessage` lama sebagai pesan belum dibaca yang baru.
3. **Real-Time Read Receipts & Dynamic Reload**: Event `receipt` diproses secara terpisah di Sidebar untuk memastikan pembaruan status centang (`✓` ➔ `✓✓` ➔ `✓✓` biru) seketika tanpa refresh, dan memicu reload daftar obrolan saat user kembali ke Home.

### C. Client-Side Persistent Message Cache (IndexedDB)
```text
[Buka Room] ──► [IndexedDB getCachedMessages] ──► Render Timeline (0ms Instant)
                        ▲
                        │ (Write-Through Merge)
[Server Event / REST] ──┴───────────────────────► [IndexedDB cacheMessages]
```
1. **Penyimpanan Lokal Persisten**: Pesan terdekripsi disimpan di IndexedDB browser klien (`wuzzchat_msg_db`) dengan object store `messages` (keyPath: `id`) dan index `by_room` (`roomId, createdAt`).
2. **Pola Cache-First**: Saat pengguna membuka percakapan, snapshot lokal segera dimuat ke UI untuk menghilangkan efek blank/loading, kemudian riwayat dari server digabungkan secara aman di latar belakang.
3. **Kontinuitas E2EE**: Plaintext pesan lama tetap dapat diakses oleh penerima meskipun pengirim melakukan reset perangkat dan mengunggah kunci publik baru.
4. **Anti-Downgrade Status Guard**: Bobot status numerik (`pending: 0, sent: 1, delivered: 2, read: 3, deleted: 99`) mencegah kemunduran status tanda terima saat server mengirimkan status lama.

---

## 🔐 6. Spesifikasi End-to-End Encryption (E2EE)

WuzzChat mengadopsi standar kriptografi terbuka (*Open RFC Cryptography*) yang menjamin privasi mutlak (*Zero-Knowledge Privacy*) sekaligus fleksibilitas lintas platform:

### A. Primitif Kriptografi
- **Key Agreement**: **ECDH (NIST P-256 / secp256r1)**.
- **Key Derivation Function**: **HKDF-SHA256 (RFC 5869)** dengan room-level salt deterministik.
- **Symmetric Cipher**: **AES-256-GCM (NIST SP 800-38D)** dengan 96-bit (12-byte) initialization vector (IV) unik acak per pesan.
- **Ciphertext Wire Format**: `e2ee:v1:<base64(iv)>:<base64(ciphertext)>`.

### B. Alur Enkripsi & Dekripsi
```text
[Pengirim (Alice)] ──(ECDH + HKDF ➔ AES-GCM Encrypt)──► [Ciphertext e2ee:v1:...]
                                                               │
                                                   (WebSocket & DB Supabase)
                                                               │
[Penerima (Bob)]   ◄──(ECDH + HKDF ➔ AES-GCM Decrypt)── [Ciphertext e2ee:v1:...]
```

### C. Kompatibilitas Multi-Platform (Cross-Platform Interoperability)
Karena seluruh algoritma menggunakan standar resmi NIST & RFC:
- **Web (Next.js)**: Menggunakan `window.crypto.subtle` bawaan browser dengan penyimpanan private key di `IndexedDB` (`wuzz_crypto_db`).
- **Android Native (Kotlin)**: Dapat langsung menggunakan `java.security.KeyPairGenerator` (secp256r1) + `javax.crypto.Cipher` (AES/GCM/NoPadding) dengan private key di Android Keystore.
- **Flutter / React Native**: Menggunakan package standard `cryptography` / `react-native-quick-crypto`.
- Klien web dan klien mobile dapat saling berkirim pesan terenkripsi secara langsung tanpa hambatan format.

### D. Verifikasi Keamanan Visual (Safety Number Fingerprint)
- Digest SHA-256 dari gabungan kunci publik kedua pihak yang diurutkan secara deterministik, diformat menjadi 6 blok angka 5 digit (total 30 digit) untuk perbandingan manual visual antar pengguna.

### E. Single Active Device, Hard Conflict Blocker & WebSocket Kick
- **Active Device Tracking**: Server melacak `active_device_id` dan `key_version` per akun di tabel `users`.
- **Hard Blocker UI Guard**: Jika akun sedang mengalami konflik perangkat, frontend memblokir total render UI chat (`chat-layout` tidak dimount ke DOM). Menutup modal atau gesture back HP otomatis mengarahkan ke `logout()` bersih.
- **Fail-Closed E2EE Guard**: Pengiriman pesan langsung (direct chat) diwajibkan melewati enkripsi AES-256-GCM. Jika kunci sesi lokal `null`, pengiriman langsung dibatalkan (0% kebocoran plaintext).
- **Single-Session WebSocket Kick**: Backend Go `Hub.Register` mendeteksi jika client baru terhubung dengan UserID yang sama dengan client aktif, mengirimkan event notifikasi penutupan `SESSION_REPLACED`, dan memutus koneksi WebSocket client lama seketika (`conn.Close()`).
- **Explicit Key Rotation**: Kunci hanya dapat dirotasi secara sadar melalui `POST /api/users/public-key/reset` yang menaikkan `key_version`. Sesi device lama otomatis kedaluwarsa.

### F. Zero-Knowledge QR Code Key Migration Protocol (Opsi 2)
```mermaid
sequenceDiagram
    autonumber
    participant A as Perangkat Lama (Aktif)
    participant S as Server (Fly.io)
    participant B as Perangkat Baru (Target)

    A->>A: Baca Keypair Lokal dari IndexedDB
    A->>A: Generate random session_token (256-bit Hex)
    A->>A: PBKDF2(session_token, 100k iter) ➔ AES-GCM Encrypt Keypair
    A->>S: POST /api/users/transfer/create (session_token, encrypted_bundle)
    Note over S: Simpan ke device_transfer_sessions (TTL 5 Menit, is_used=false)
    A->>A: Tampilkan QR Code (/transfer?token=session_token) + 5 Min Timer

    B->>B: Buka In-App Camera Scanner (html5-qrcode) / Input Kode Manual
    B->>S: POST /api/users/transfer/consume (session_token, new_device_id)
    Note over S: Atomic DB Tx: Cek Token + is_used=true + users.active_device_id=new_device_id
    S->>B: Return encrypted_bundle
    B->>B: PBKDF2(session_token) ➔ AES-GCM Decrypt
    B->>B: Simpan Keypair ke IndexedDB & CacheStorage
    Note over B: Sesi Aktif Berpindah Tanpa Reset Kunci & History Tetap Utuh!
```

1. **Jaminan Keamanan Zero-Knowledge**: Private key tidak pernah menyentuh database server dalam bentuk plaintext. Hanya ciphertext terenkripsi AES-256-GCM dengan kunci turunan dari session token yang disimpan sementara di tabel `device_transfer_sessions`.
2. **In-App Camera Scanner Terintegrasi**: Perangkat baru menggunakan library `html5-qrcode` langsung di dalam modal untuk memindai QR code dari layar perangkat lama. Untuk Android PWA WebAPK, diterapkan **Pre-Warm Permission Strategy** (memanggil `getUserMedia()` sesegera mungkin sebelum async chain agar gesture token pengguna tidak kedaluwarsa) dan **Native Camera Intent Capture Fallback** (`<input type="file" accept="image/*" capture="environment">`) yang memicu intent kamera sistem Android native tanpa terbatas oleh `Permissions Policy` WebView. Manifest PWA juga mendeklarasikan `"permissions": ["camera"]` untuk instalasi WebAPK.
3. **Atomic One-Time Use**: Operasi download dan pengalihan status sesi dikunci dalam 1 transaksi database SQL (`SELECT ... FOR UPDATE` di PostgreSQL / `BEGIN EXCLUSIVE` di SQLite) untuk mencegah race condition atau double-consumption.
4. **Resilience & Fallback Berlapis**: Sesi transfer otomatis kedaluwarsa dalam 5 menit. Terdapat 3 jalur fallback: (a) **In-App Live Scanner** (`html5-qrcode` dengan pre-warm strategy), (b) **Native Camera Capture** (`<input capture="environment">` via sistem Android), dan (c) **Input Kode Manual** 64-karakter Hex untuk situasi tanpa kamera sama sekali. Untuk akses kamera live scanner penuh tanpa batasan platform, solusi optimal adalah **Android Native App** (MLKit BarcodeScanning API).

---

## 📞 7. Arsitektur WebRTC 1-on-1 Voice Calling & Signaling

WuzzChat mengintegrasikan kapabilitas komunikasi suara real-time berbasis **WebRTC P2P (Peer-to-Peer)** dengan latensi sangat rendah:

```mermaid
sequenceDiagram
    autonumber
    participant A as Pemanggil (Alice)
    participant S as WebSocket Signaling Hub (Go)
    participant B as Penerima (Bob)
    
    A->>S: call_offer (sdp, target_user_id)
    S->>B: Forward call_offer
    Note over A: playOutgoingRing (tuut... tuut...)
    Note over B: playIncomingRing (ringtone C5-E5-G5-C6)
    
    alt Bob Menolak Panggilan
        B->>S: call_reject (room)
        S->>A: Forward call_reject
        Note over A,B: stopCallSounds & Tutup Dialog
    else Bob Menerima Panggilan
        B->>S: call_answer (sdp, room)
        S->>A: Forward call_answer
        Note over A,B: stopCallSounds & Buka AudioCallOverlay
        
        loop Pertukaran ICE Candidate
            A->>S: ice_candidate (candidate)
            S->>B: Forward ice_candidate
            B->>S: ice_candidate (candidate)
            S->>A: Forward ice_candidate
        end
        
        Note over A,B: Direct P2P Audio Stream (STUN / TURN Fallback)
        
        opt Salah satu mengakhiri panggilan
            A->>S: call_end (room)
            S->>B: Forward call_end
            Note over A,B: Tutup AudioCallOverlay & Lepas Hardware Mic
        end
    end
```

### A. Infrastruktur Signaling & ICE Traversal
- **Signaling Server**: Menggunakan koneksi WebSocket Go backend yang sudah ada tanpa perlu server signaling terpisah.
- **ICE Servers**:
  - Primary: Google Public STUN (`stun:stun.l.google.com:19302`).
  - Fallback TURN: OpenRelay Public TURN (`openrelay.metered.ca:80` & `:443`) untuk traversal koneksi simetris NAT / Firewall ketat.
- **Early Candidate Buffering**: Menyimpan kandidat ICE yang tiba sebelum `setRemoteDescription()` selesai untuk mencegah *ICE connection failure / race condition*.

### B. Synthesizer Nada Dering Bebas File Eksternal (Web Audio API)
- **Outgoing Ringtone**: `playOutgoingRing()` menggunakan generator osilator dual-sine 440Hz + 480Hz berulang (*cadence: 1.5s bunyi, 3s jeda*).
- **Incoming Ringtone**: `playIncomingRing()` menggunakan rangkaian harmoni arpeggio 4-nada C5 ➔ E5 ➔ G5 ➔ C6 yang jernih dan berulang.
- **Zero Asset Latency**: 100% diproduksi oleh browser audio chip tanpa dependensi file MP3/WAV.

---

## 🔔 8. Arsitektur Push Notification & Zero-Knowledge Client-Side Background Decryption

WuzzChat mengimplementasikan pipeline Push Notification berbasis standar industri W3C Web Push (RFC 8291/8292) dengan enkripsi Zero-Knowledge end-to-end:

```mermaid
sequenceDiagram
    autonumber
    participant A as Pengirim (Alice)
    participant S as Golang Backend (Fly.io)
    participant B as Browser Push Service (Google/Apple/Mozilla)
    participant W as Service Worker (sw.js)
    participant OS as OS Notification Center (Bob)

    A->>S: Kirim pesan E2EE (e2ee:v1:...) via WebSocket
    Note over S: Deteksi Bob Offline / Room Berbeda
    S->>S: Ambil Public Key Alice & Subscription Bob
    S->>B: Send VAPID Web Push Payload (encrypted_content, sender_public_key)
    B->>W: Push Event ke Service Worker
    Note over W: Baca Private Key Bob dari IndexedDB (wuzz_crypto_db)
    Note over W: Web Crypto Decrypt (ECDH + HKDF + AES-GCM)
    W->>OS: self.registration.showNotification(Title, Decrypted Plaintext)
    Note over OS: Notifikasi OS Menampilkan Plaintext Pesan Asli
```

### A. Fitur & Keunggulan
1. **Zero-Knowledge Privacy**: Server Go sama sekali tidak pernah mendekripsi atau membaca isi pesan. Plaintext hanya muncul di perangkat fisik penerima setelah didekripsi oleh Service Worker di latar belakang.
2. **Instant Offline Decryption**: Data public key pengirim (`sender_public_key`) disertakan dalam payload push sehingga Service Worker dapat mendekripsi secara instan (1-2 ms) tanpa perlu melakukan HTTP request tambahan ke server.
3. **Graceful Fallback**: Jika private key belum ada di perangkat (misal user belum login di browser tersebut), notifikasi akan tetap tampil aman dengan teks default `🔒 Pesan Baru (Terenkripsi)`.

---

## 🎨 9. Arsitektur Frontend & Modular Design System (Soft Tri-Color Glassmorphism)

Wuzz Chat mengadopsi prinsip desain modular berlapis yang memisahkan logika styling, pembuatan avatar kontak, dan tata letak dual-platform:

1. **Modular Generator Avatar Deterministik (`frontend/lib/avatarColor.ts`)**:
   - Menghasilkan palet gradien soft pastel dan border specular berbasis hashing string nama/ID kontak.
   - Bersifat *pure function* tanpa state, digunakan secara konsisten oleh seluruh komponen UI (Sidebar, StatusBar, ContactProfileModal, MemberListModal, Call Overlay).
2. **Centralized CSS Design Tokens (`frontend/app/globals.css`)**:
   - Seluruh token warna primer (`Soft Azure`), sekunder (`Soft Lavender`), dan tersier (`Soft Coral Rose`) dikunci di `:root`.
   - Permukaan *frosted glass* (`backdrop-filter: blur()`), kartu profil pengguna, dan *specular highlights* diatur secara terpusat untuk memudahkan pembaruan tema tanpa *breaking changes*.
3. **High-Contrast Readability Guard**:
   - Memenuhi standar WCAG untuk kenyamanan membaca di perangkat seluler dengan rasio kontras tinggi pada bubble pesan masuk (`Slate Frosted Glass`), timestamp putih terang (`rgba(255, 255, 255, 0.88)`), read receipts (`Electric Cyan #67e8f9`), dan kotak balasan pesan berbayang gelap.
4. **Ultra-Modern Aurora Glassmorphism Header**:
   - Header aplikasi mengadopsi pencahayaan ambient radial mesh (`Soft Azure` dan `Soft Lavender`) di balik frosted glass transparan (`backdrop-filter: blur(20px) saturate(180%)`).
   - Mengintegrasikan avatar profil pengguna langsung ke baris brand header atas untuk efisiensi ruang vertikal maksimal di layar seluler tanpa redundansi komponen.
5. **Modular Emoticon Catalog & Precision Flagship Input Bar**:
   - Komponen input mengadopsi arsitektur kapsul pil WhatsApp/Telegram (`border-radius: 24px`, tinggi 48px) dengan tombol aksi rekam suara/kirim melayang independen (*floating circular action button 48x48px*).
   - Katalog emoji diisolasi secara modular di `frontend/lib/emojis.ts` dengan 5 kategori Unicode native, memungkinkan penambahan atau modifikasi emoji secara dinamis tanpa menyentuh komponen UI.
6. **High-Contrast SVG Read Receipt Indicator (`ReceiptIcon.tsx`)**:
   - Menggantikan karakter teks tipis dengan komponen vektor SVG standar WhatsApp/Telegram yang tebal dan tajam (`stroke-width: 2`, sudut 45 derajat paralel).
   - Memecahkan isu kontras rendah *blue-on-blue* pada bubble pesan keluar (Soft Blue-Indigo) menggunakan Electric Neon Cyan (`#00f2fe`) yang dipadukan dengan dark drop shadow (`rgba(0, 0, 0, 0.95)`) dan ambient cyan glow, menjamin tanda centang terbaca seketika di semua jenis layar seluler dan desktop.
7. **Dual-Platform Single-Screen SPA Navigation Lifecycle (`frontend/app/chat/page.tsx`)**:
   - Menjamin integritas browser history stack saat navigasi bolak-balik antara Layar Home/Sidebar dan Ruang Obrolan pada perangkat seluler dan desktop.
   - Menggunakan `router.push('/chat?room=...')` tunggal tanpa pemanggilan manual ganda `window.history.pushState` yang dapat melipatgandakan entry history.
   - Menggunakan `router.replace('/chat')` saat kembali ke daftar obrolan (`activeRoomId = ''`) agar tidak menambah entry history baru yang memicu siklus loop saat pengguna menekan tombol Back fisik/browser.



