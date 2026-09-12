# Laporan Status & Dokumentasi Proyek — Wuzz Chat

**Tanggal:** 12 September 2026  
**Status Proyek:** Fase 1, 2, dan 3 Selesai (100% Berfungsi & Terverifikasi)  
**Branch Aktif:** `dev`

---

## 📌 1. Ringkasan Proyek

**Wuzz Chat** adalah platform pesan instan modern yang dibangun dengan arsitektur monorepo:
- **Backend (Golang 1.26)**: Engine WebSocket real-time dengan goroutine concurrency, middleware JWT, REST API auth & chat, dan database abstraction.
- **Frontend (Next.js 16 App Router + TypeScript)**: Reverse proxy Next.js, Auth Context, layout 2-kolom kelas WhatsApp/Telegram, real-time presence drawer, dan auto-reconnect WebSocket client.
- **Database (PostgreSQL / Supabase)**: Skema relasional persisten (`users`, `conversations`, `conversation_members`, `messages`) dengan auto-migration.

---

## ✅ 2. Apa yang Sudah Dikerjakan (Fase 1 s/d Fase 3)

### A. Fase 1: Real-Time Engine Foundation
- [x] **Golang WebSocket Hub**: Arsitektur hub berbasis goroutine dan channels (`readPump`/`writePump`) dengan graceful shutdown.
- [x] **Next.js Reverse Proxy (`server.js`)**: Menangkap event HTTP upgrade dan me-reverse proxy koneksi WebSocket & REST API ke backend Go tanpa membocorkan port/URL backend asli.
- [x] **Client Abstraction (`ws-client.ts`)**: WebSocket client dengan exponential backoff auto-reconnect dan event emitter.
- [x] **Vanilla CSS Design System**: Tampilan Dark Mode modern yang responsif dan elegan.

### B. Fase 2: Cloud Persistence & Group Presence
- [x] **Multi-Database Flexible Store**: Driver store independen mendukung **Supabase PostgreSQL**, **Local Postgres**, **SQLite**, dan **In-Memory** fallback tanpa ubah kode.
- [x] **Auto-Migration Engine**: Otomatis membuat tabel `messages` dan indeks saat backend dinyalakan.
- [x] **Chat History Persistence**: Riwayat chat otomatis tersimpan di cloud database dan dimuat seketika saat user me-refresh tab.
- [x] **Room-Based Isolation & Sharing**: Fitur room kode (`room-XXXX`), URL invite parameter, dan tombol *Salin Link* instan.
- [x] **Real-Time Presence Tracking**: Event `room_users` dan drawer daftar anggota aktif (`👥 X Online`).

### C. Fase 3: User Identity, JWT Authentication & Direct Messages
- [x] **Autentikasi Akun (Go Backend)**:
  - Pendaftaran akun dengan password hashing `bcrypt` (`POST /api/auth/register`).
  - Login dan pembuatan token JWT 7 hari (`POST /api/auth/login`).
  - Ambil profil user login (`GET /api/auth/me`).
  - Middleware `RequireJWT()` untuk memvalidasi Bearer token.
- [x] **Model Percakapan & Kontak Permanen**:
  - Pencarian kontak/user lain secara instan (`GET /api/users/search?q=...`).
  - Pembuatan Direct Message 1-on-1 antar dua user (`POST /api/conversations`).
  - Daftar obrolan aktif dengan cuplikan pesan terakhir (`GET /api/conversations`).
- [x] **Frontend Modern 2-Kolom (WhatsApp / Telegram Grade)**:
  - Halaman Login ([`/login`](frontend/app/login/page.tsx)) dan Register ([`/register`](frontend/app/register/page.tsx)).
  - Global `AuthProvider` & `useAuth` hook.
  - **Sidebar Kiri**: Info akun, pencarian kontak, daftar *Recent Chats*.
  - **Layar Standby (Welcome Screen)**: Muncul saat belum ada obrolan yang dipilih di `/chat`.
  - Responsive Mobile Drawer (`☰ Buka Obrolan`).

---

### D. Fase 4: Modern Chat UX & Interactive Dynamics (Sedang Berjalan)
- [x] **Milestone 4.1: Sound FX Synthesizer (Web Audio API)**:
  - Procedural Web Audio API sound generator (`lib/sound.ts`) untuk efek suara kirim (*pop*) dan terima (*ding*).
  - Tombol toggle mute di status bar dengan persistensi `localStorage`.
  - 100% tanpa dependensi file eksternal (bebas lag & 404).
- [x] **Milestone 4.2: Live Typing Indicator**:
  - Broadcast event `TypeTyping` dengan nickname pengirim dan unit test `TestHubTypingBroadcast`.
  - Debounce throttling pada textarea input.
  - Tampilan animated label di StatusBar dan author bubble di ChatWindow.
- [x] **Milestone 4.3: Real-Time Sidebar Snippet & Unread Badge Counter**:
  - Auto-increment badge unread saat pesan masuk ke room yang sedang tidak aktif.
  - Reset unread counter saat room dibuka oleh user.
  - Cuplikan pesan terakhir (*snippet*), pengirim, timestamp `HH:mm`, dan indikator status tanda centang (`✓` sent, `✓✓` delivered, `✓✓` read) terupdate real-time.
  - Dynamic sorting percakapan (room terupdate otomatis naik ke paling atas).
- [x] **Milestone 4.4: Message Receipts Status Transitions**:
  - Transisi status tanda terima 4-tahap lengkap: `🕒 Pending` ➔ `✓ Sent` (centang 1 abu-abu) ➔ `✓✓ Delivered` (centang 2 abu-abu saat lawan bicara online) ➔ `✓✓ Read` (centang 2 biru `#53bdeb` saat lawan bicara membuka obrolan).
  - Tampilan receipt realtime terintegrasi di balon chat linimasa dan di daftar percakapan Sidebar kiri.
  - Bulk read & delivered receipts synchronization saat client tersambung kembali ke WebSocket atau membuka room.
  - Penambahan kolom `status VARCHAR(32) DEFAULT 'sent'` pada tabel database `messages` dengan auto-migration & method `UpdateMessageStatus`, `MarkRoomMessagesAsRead`, dan `MarkUserMessagesAsDelivered`.
  - Unit test `TestHubReceiptsFlow` lulus 100%.
- [x] **Milestone 4.5: Emoji Reactions & Reply/Quote Message**:
  - Tombol aksi kutip pesan (*reply/quote*) dengan preview banner di atas textarea input dan kartu kutipan interaktif di dalam balon pesan.
  - **Click-to-Scroll & Glow Highlight**: Mengklik kotak kutipan balasan pada pesan secara otomatis melakukan smooth scroll ke pesan asli dan memicu animasi highlight pulse hijau.
  - Floating emoji toolbar cepat (`👍 ❤️ 😂 😮 😢 🙏`) saat hover balon pesan.
  - **Audio Notification pada Reaksi**: Memberikan atau mengubah reaksi emoji kini membunyikan chime audio notifikasi pada browser lawan bicara.
  - Badge reaksi interaktif di bawah balon pesan dengan fitur toggle penambahan/penghapusan reaksi secara real-time.
  - Skema tabel `messages` diperkaya kolom `reply_to_id`, `reply_to_nickname`, `reply_to_content`, dan `reactions`.
  - Unit test `TestHubReplyAndReactions` lulus 100%.
- [x] **Milestone 4.6: Long Message Clamped View & Zen Read Mode**:
  - **Auto-Clamp Text**: Pesan panjang (> 300 karakter atau > 7 baris) otomatis dibatasi tingginya (`max-height: 160px`) dengan efek *smooth bottom gradient mask*.
  - **Inline Toggle**: Tombol `📖 Baca Selengkapnya / ▲ Sembunyikan` untuk memperluas teks langsung di linimasa balon chat.
  - **Zen Reader View Modal**: Menggunakan React Portal (`createPortal`) ke root `document.body` dengan overlay layar penuh, tema solid gelap `#111b21`, tipografi lega, dan bebas distraksi.

### E. Fase 3.5: Authentication Hardening & Security Polish (Selesai)
- [x] **Milestone 3.5.1: Next.js Auth Guard & Route Protection**:
  - Proteksi penuh rute `/chat`: Pengguna yang belum login otomatis dialihkan ke `/login` (dengan preservasi parameter room `?room=...`).
  - Proteksi rute `/login`, `/register`, dan Landing page `/`: Pengguna yang telah terautentikasi otomatis dialihkan ke `/chat`.
  - HTTP 401 Unauthorized interceptor pada `frontend/lib/api.ts` yang otomatis menghapus session token lama dan mengarahkan user ke `/login?expired=1` dengan banner peringatan.
  - Suspense-safe search params wrapper pada seluruh client route.
- [x] **Milestone 3.5.2: WebSocket JWT Handshake Authentication**:
  - Validasi token JWT sebelum upgrade connection di endpoint `/ws` (backend Go).
  - Penolakan otomatis (HTTP 401 Unauthorized) jika token tidak valid atau tidak disediakan.
  - Pengikatan identitas klien (`c.ID = claims.UserID`, `c.Nickname = claims.DisplayName`) langsung dari token terverifikasi anti-spoofing.
  - Abstraksi `WsClient` frontend yang otomatis membaca token dari `localStorage` dan menyertakannya dalam query param handshake (`/ws?token=...`).
  - Unit test `TestWebSocketJWTAuthentication` lulus 100% (mencakup unauthorized rejection, invalid token rejection, dan authorized connection acceptance).
- [x] **Milestone 3.5.3: User Profile & Status Bio Management**:
  - Kolom `status_message` (default: `'Tersedia untuk mengobrol'`) dan `avatar_url` pada skema database `users` dengan auto-migration.
  - Method `UpdateProfile` pada `UserStore` interface dan `SQLUserStore` (PostgreSQL & SQLite).
  - REST endpoint `PUT /api/auth/profile` dengan middleware JWT untuk memperbarui `display_name`, `status_message`, dan `avatar_url`.
  - Komponen Modal Glassmorphism `ProfileModal.tsx` di frontend dengan avatar selector dan preset bio status cepat.
  - Pembaruan `Sidebar.tsx` untuk menampilkan status bio real-time di bawah nama user dan tombol edit profil.
  - Unit test `TestSQLUserStore_Profile` lulus 100%.
  - **Fitur Lihat Profil Kontak (Contact Profile Viewer)**:
    - Endpoint `GET /api/users/profile?id=...` (atau `?username=...`) untuk mengambil profil publik pengguna lain.
    - Komponen `ContactProfileModal.tsx` untuk melihat kartu profil lawan bicara lengkap (avatar besar, display name, `@username`, status bio, dan tanggal bergabung).
    - Integrasi klik nama/avatar di `StatusBar.tsx` (header chat), `MemberListModal.tsx` (daftar anggota room), dan cuplikan bio di hasil pencarian `Sidebar.tsx`.
- [x] **Milestone 3.5.4: Backend Security Hardening & BOLA Protection**:
  - **Anti-Spoofing Identitas**: Server mengunci identitas pengirim (`c.Nickname` & `msg.From`) dari klaim JWT terverifikasi dan menolak penimpaan identitas via payload WebSocket.
  - **Room Access Authorization (BOLA Prevention)**: Method `IsUserInConversation` memvalidasi keanggotaan sah di tabel `conversation_members` sebelum mengizinkan join room, pengiriman pesan, atau penarikan riwayat chat.
  - **Content Sanitization & Payload Limits**: Validasi pemotongan spasi kosong, penolakan pesan kosong, batasan panjang pesan maks 5.000 karakter, quote preview maks 500 karakter, dan emoji maks 16 karakter.
  - **Rate Limiting & Brute-Force Protection**: `IPRateLimiter` sliding window untuk endpoint login/register (15 req/menit per IP) dan WebSocket anti-flood limiter (10 pesan/2 detik per client).
  - **Configurable CORS Origin**: Menggunakan variabel `CORS_ALLOWED_ORIGIN` untuk mengunci domain request yang diizinkan di production.
  - Unit test `TestIPRateLimiter`, `TestRateLimitMiddleware`, `TestSQLUserStore_RoomAccessAuthorization`, dan security sub-tests di `handler_test.go` lulus 100%.


---

### E. Fase 5: Rich Media, Voice Notes & Attachments (Sedang Berjalan 🎯)
- [x] **Milestone 5.1: Backend Storage Engine, Upload API & Dynamic Feature Flag**:
  - Interface `MediaStorage` mendukung multi-driver (`LocalStorage`, `SupabaseStorage`, `S3Storage`).
  - Endpoint `POST /api/media/upload` dengan otentikasi JWT, validasi MIME magic bytes, pembatasan ukuran berkas (25 MB), dan sanitasi UUID anti-traversal.
  - Endpoint publik `GET /api/config` menyajikan status dynamic toggle `media_upload_enabled`.
  - Auto-migration database non-destruktif menambah kolom `media_url`, `media_type`, `file_name`, dan `file_size` pada tabel `messages`.
  - Static file serving handler `/uploads/` dengan HTTP caching header.
  - Unit test `storage_test.go` dan `media_handler_test.go` lulus 100%.

---

## ⏳ 3. Apa yang Sedang Dikerjakan (Current State)

- **Milestone 5.1 (Backend Media Engine & Upload API) telah selesai & terverifikasi 100%!**
- Langkah berikutnya: **Milestone 5.2 (Frontend UI Attachment Picker, Drag & Drop, Clipboard Paste `Ctrl + V`, dan Image Lightbox Viewer)**.

---

## 📂 Struktur File Utama Proyek

```text
wuzz-chat/
├── docs/
│   ├── ROADMAP.md          -> Master Roadmap Fase 1 s/d 7
│   ├── ARCHITECTURE.md     -> Desain database (ERD), WS protocol, & REST API
│   └── PROGRESS.md         -> Dokumen status pengerjaan ini
├── backend/
│   ├── internal/
│   │   ├── api/            -> REST Handlers (auth_handler.go, chat_handler.go)
│   │   ├── auth/           -> JWT helper & RequireJWT middleware
│   │   ├── store/          -> SQLUserStore, SQLMessageStore, Auto-migration
│   │   └── ws/             -> Hub WebSocket, Client connection, presence
│   ├── main.go             -> Server entry point & routing
│   └── .env                -> Konfigurasi Supabase PostgreSQL
├── frontend/
│   ├── app/
│   │   ├── chat/           -> Sidebar, StatusBar, ChatWindow, MemberListModal, page.tsx
│   │   ├── login/          -> Halaman Login
│   │   ├── register/       -> Halaman Register
│   │   └── globals.css     -> Design system & 2-column styles
│   ├── lib/
│   │   ├── api.ts          -> REST API client helper
│   │   ├── auth-context.tsx-> Global Auth Provider
│   │   ├── sound.ts        -> Web Audio API procedural sound synthesizer
│   │   ├── types.ts        -> TypeScript definitions
│   │   └── ws-client.ts    -> WebSocket abstraction
│   └── server.js           -> Custom Next.js server & proxy layer
└── README.md
```
