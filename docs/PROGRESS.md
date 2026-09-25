# Laporan Status & Dokumentasi Proyek — Wuzz Chat

**Tanggal:** 19 September 2026  
**Status Proyek:** Fase 1 s/d 8 (Partial) — Milestone 8.8 & 8.9 (Scalability & Mobile-Ready Reliability) SELESAI ✅  
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
- [x] **Milestone 4.7: Proportional Sidebar & Search Hierarchy Refinement**:
  - **Lebar Sidebar Proporsional**: Peningkatan lebar desktop dari `340px` ke `400px` (`min-width: 360px`, `max-width: 450px`) untuk ruang obrolan kelas WhatsApp/Telegram Web yang lebih lega di layar widescreen.
  - **Responsif Mobile**: Optimasi lebar drawer sidebar mobile menjadi `min(340px, 85vw)` yang adaptif.
  - **Tata Letak 2-Baris Hasil Pencarian**: Pemisahan baris Display Name + @username dengan bio status di hasil pencarian kontak `Sidebar.tsx`.
- [x] **Milestone 4.8: Delete Conversation for Me (Privacy & Asymmetric Clear Chat)**:
  - **Kolom `cleared_at` Non-Destruktif**: Auto-migration `conversation_members` dengan kolom `cleared_at TIMESTAMP DEFAULT NULL`.
  - **Filter Privasi & Keamanan Lawan Bicara**: User yang menghapus percakapan tidak akan melihat chat lama sebelum `cleared_at`. Riwayat lawan bicara tetap utuh 100%. Percakapan muncul kembali secara otomatis jika ada pesan baru setelah `cleared_at`.
  - **REST API Endpoints**: `DELETE /api/conversations?id=...` dan `POST /api/conversations/clear` dengan otorisasi JWT.
  - **UI Modal Konfirmasi**: Ikon 🗑️ saat hover item obrolan di `Sidebar.tsx` dengan modal konfirmasi protektif.
  - Unit test `TestClearConversation_PrivacyFilter` lulus 100%.
- [x] **Milestone 4.9: Delete Specific Message (For Me vs For Everyone with 1-Minute Limit)**:
  - **Skema Database Non-Destruktif**: Kolom `is_deleted BOOLEAN DEFAULT FALSE` dan `deleted_for_users TEXT DEFAULT '[]'` pada tabel `messages` dengan auto-migration di SQLite dan Supabase PostgreSQL.
  - **Business Logic Validasi**:
    - *Hapus untuk Saya*: Selalu diizinkan kapan saja, menambahkan `userID` ke `deleted_for_users` JSON array.
    - *Hapus untuk Semua Orang*: Hanya diizinkan jika pesan dikirim oleh pemanggil (`from_id == userID`) DAN usia pesan **≤ 1 menit (60 detik)**. Melebihi 1 menit ditolak dengan HTTP 400 Bad Request.
    - Menghapus media fisik dari transit buffer jika pesan ditarik untuk semua orang, mengubah isi pesan menjadi `🚫 Pesan ini telah dihapus`, dan mengosongkan reaksi.
  - **Real-Time WebSocket Sync**: Broadcast event `message_deleted` (`TypeMessageDeleted`) ke seluruh client di room obrolan seketika tanpa refresh.
  - **Frontend UI & Interactive Countdown**:
    - Tombol tempat sampah (🗑️) pada floating action toolbar di `MessageBubble.tsx`.
    - Modal opsi hapus: *"Hapus untuk Semua Orang"* (dengan badge live countdown detik sisa waktu) & *"Hapus untuk Saya Saja"*.
    - Render balon chat terhapus dengan styling transparan bergaris putus-putus dan teks italic `🚫 Pesan ini telah dihapus`.
  - Unit test `TestDeleteMessage_Scenarios` lulus 100%.

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
  - **Registration Hardening & Anti-Impersonation Filter**: Modul validator terpusat (`validator.go`), pembatasan body 64 KB, batas username 3–30 karakter, password 6–128 karakter (Bcrypt DoS guard), display name maks 50 karakter, regex karakter `^[a-zA-Z0-9_.-]+$`, serta filter kata terlarang hybrid (substring: `jancok`, `puki`, `pepek`, `semantic`; brand/sensitif: `admin`, `official`, `support`, `wuzz`, `verified`; exact: `bot`, `dev`, `api`, `chat`).
  - Unit test `TestIPRateLimiter`, `TestRateLimitMiddleware`, `TestSQLUserStore_RoomAccessAuthorization`, `TestValidateRegistration`, dan `TestAuthHandler_RegisterValidation` lulus 100%.


---

### E. Fase 5: Rich Media, Voice Notes & Attachments (Sedang Berjalan 🎯)
- [x] **Milestone 5.1: Backend Storage Engine, Upload API & Dynamic Feature Flag**:
  - Interface `MediaStorage` mendukung multi-driver (`LocalStorage`, `SupabaseStorage`, `S3Storage`).
  - Endpoint `POST /api/media/upload` dengan otentikasi JWT, validasi MIME magic bytes, pembatasan ukuran berkas (25 MB), dan sanitasi UUID anti-traversal.
  - Endpoint publik `GET /api/config` menyajikan status dynamic toggle `media_upload_enabled`.
  - Auto-migration database non-destruktif menambah kolom `media_url`, `media_type`, `file_name`, dan `file_size` pada tabel `messages`.
  - Static file serving handler `/uploads/` dengan HTTP caching header.
  - Unit test `storage_test.go` dan `media_handler_test.go` lulus 100%.
- [x] **Milestone 5.2: Frontend Image Sharing, Drag & Drop, Paste `Ctrl + V`, dan Image Lightbox Modal**:
  - Tombol lampiran `📎` di MessageInput dengan pembacaan otomatis dynamic config toggle (`media_upload_enabled`).
  - Fitur Clipboard Paste (`Ctrl + V`): otomatis menangkap gambar dari clipboard (misal tangkapan layar/screenshot).
  - Drag & Drop Overlay Zone di `ChatWindow`: visual dropzone interaktif saat file diseret ke area obrolan.
  - Staging Media Preview Bar di atas textarea: menampilkan thumbnail, nama file, ukuran MB, tombol pembatalan `✕`, dan animasi pengunggahan.
  - Balon pesan gambar di linimasa chat (`MessageBubble`) dengan aspect-ratio rapi, lazy-loading, dan timestamp overlay.
  - Komponen `ImageLightboxModal` (React Portal): fullscreen image viewer dengan dark glassmorphism backdrop, Zoom In (`+`), Zoom Out (`-`), Reset Zoom (`100%`), Unduh Berkas langsung, dan penutupan via tombol `✕` / tombol `Esc` / backdrop click.

- [x] **Milestone 5.3: Document & File Sharing Card (PDF, Word, Excel, ZIP, TXT)**:
  - Ekstensi file otomatis terklasifikasi dengan tema warna ikon visual yang kaya (📕 Merah PDF, 📘 Biru DOC, 📗 Hijau Sheet, 📙 Oranye Slide, 🗜️ Ungu ZIP, 📄 Abu-abu Text/Code).
  - Format pembacaan ukuran berkas dinamis (`bytes` ➔ `KB` / `MB`).
  - Balon pesan kartu dokumen `message-doc-card` dengan nama file, metadata ukuran, dan tombol *Direct Download*.
  - Pemilihan berkas luas melalui file picker dialog di MessageInput.
- [x] **Milestone 5.4: Voice Note Recording (MediaRecorder API) & Waveform Audio Player Bubble**:
  - Perekam suara langsung di peramban via `VoiceRecorder.tsx`: permission guard, timer rekaman real-time (`00:05`), animasi live wave bar, tombol batal/hapus `🗑️`, dan tombol kirim `➤`.
  - Otomatis membuat blob berkas audio terkompresi (`.webm` / `.mp4` / `.ogg`), mengunggah via `uploadMedia()`, dan mengirim pesan tipe `audio`.
  - Pemutar audio kustom bergaya WhatsApp/Telegram (`AudioPlayerBubble.tsx`): tombol Play/Pause kustom, simulated dynamic waveform scrubber track, timer progres audio, dan toggle kecepatan pemutaran (`1x` / `1.5x` / `2x`).
  - Single-active player auto-pause saat audio lain diputar.
- [x] **Milestone 5.5: WhatsApp-Style Store-and-Forward Media Lifecycle, TTL Auto-Purge & Client-Side Caching**:
  - Arsitektur Store-and-Forward ($0 Storage Cost): File di server hanya berfungsi sebagai transit buffer dan otomatis dibersihkan.
  - Background Worker Auto-Purge (`PurgeWorker`): membersihkan berkas yang usianya melampaui `MEDIA_RETENTION_DAYS` (default 7 hari).
  - Download Acknowledgment (`POST /api/media/ack`): saat klien mengunduh file, server menghapus berkas fisik dari storage dan memperbarui `media_status`.
  - Client-Side Offline Storage (`IndexedDB` via `mediaCache.ts`): file tersimpan di cache lokal browser pengguna sehingga tetap dapat dibuka instan dan offline meskipun berkas di server telah dihapus.
  - Expired State Graceful UI: menampilkan placeholder blur dan badge *"Media telah kedaluwarsa"* jika file di server terhapus dan belum pernah di-cache lokal.
  - Client-Side Pre-Upload Image Compressor (`imageCompressor.ts`): kompresi otomatis gambar sebelum diunggah (resize max 1600px, WebP quality 0.82) dengan toggle on/off yang dapat dimatikan kapan saja di modal Profil.

---

### F. Fase 6: Distributed Scale & Reliability (100% Selesai & Terdeploy di Fly.io 🚀)
- [x] **Milestone 6.1: Redis Pub/Sub Broker Layer & Multi-Instance Go WebSocket Synchronization**:
  - Interface `MessageBroker` (`internal/broker/broker.go`) mendukung `Publish`, `Subscribe`, `Get`, `Set` (TTL cache), dan `Close`.
  - **Graceful Fallback Mode**: `InMemoryBroker` aktif otomatis ketika `REDIS_URL` tidak diisi (bebas error di lokal).
  - **Upstash & Production Ready**: `RedisBroker` (`internal/broker/redis_broker.go`) mendukung koneksi TCP TLS (`rediss://...`) dan standard TCP (`redis://...`) via `github.com/redis/go-redis/v9`.
  - **WebSocket Hub Multi-Instance Sync**: `Hub` Go otomatis tersinkronisasi antar instan server melalui channel Redis `wuzz:cluster:events`.
  - **Anti-Echo Loop Mechanism**: Setiap event disematkan `node_id` (UUID), node pengirim asal mengabaikan event miliknya sendiri saat kembali dari Redis.
  - **Deduplikasi Database Write**: Penyimpanan ke database hanya dilakukan oleh node pengirim awal sehingga data di database tidak terduplikasi.
  - Unit test `broker_test.go` & integration test `hub_cluster_test.go` lulus 100%.
- [x] **Milestone 6.2: Dynamic Multi-Origin CORS & WebSocket Whitelist Configuration**:
  - Struct `CORSValidator` (`internal/auth/cors.go`) mengelola whitelist domain dinamis untuk REST API dan WebSocket handshake.
  - **Dukungan Domain Fleksibel**: Mendukung wildcard `*`, exact match (`http://localhost:3047`, `https://wuzz-chat.vercel.app`), serta wildcard subdomain (`https://*.vercel.app` untuk branch preview Vercel).
  - **Integrasi Penuh**: `CheckWebSocketOrigin` terpasang di `upgrader` WebSocket handler dan `corsValidator.Middleware` membungkus seluruh REST API & static file serving di `main.go`.
  - Unit test `cors_test.go` lulus 100%.
- [x] **Milestone 6.3: OpenGraph Rich Link Previewer (WhatsApp / Telegram Grade)**:
  - **Backend Safe Scraper (`internal/api/link_preview.go`)**: Endpoint `GET /api/link-preview?url=...` dengan autentikasi JWT.
  - **Anti-SSRF Protection**: Validasi DNS resolution dan pemblokiran otomatis seluruh private IP subnets (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254`, `localhost`, `::1`).
  - **OpenGraph Metadata Extraction**: Ekstraksi meta tag `og:title`, `og:description`, `og:image`, `og:site_name`, dan favicon dengan batasan ukuran body 512KB.
  - **Redis & In-Memory Caching (TTL 24 Jam)**: Caching MD5 key untuk menghindari redundant scraping dari URL yang sama.
  - **Frontend UI Card (`LinkPreviewCard.tsx`)**: Menampilkan kartu preview thumbnail, judul, deskripsi, favicon, dan domain badge di dalam balon chat [`MessageBubble.tsx`](frontend/app/chat/MessageBubble.tsx).
  - Unit test `link_preview_test.go` lulus 100% dan frontend build `npm run build` sukses 100%.
- [x] **Milestone 6.4: Production Deployment Configuration & Live Launch**:
  - **Multi-Stage Dockerfile (`backend/Dockerfile`)**: Build Go Alpine super ringan (< 25MB image size), unprivileged non-root user `appuser`, dan sertifikat SSL bawaan.
  - **Live Production Backend di Fly.io**: App `wuzz-chat-backend` berhasil dideploy di region Singapura (`sin`) dengan auto-start/stop machine.
    - REST API URL: `https://wuzz-chat-backend.fly.dev`
    - WebSocket URL: `wss://wuzz-chat-backend.fly.dev/ws`
    - Health Check: `https://wuzz-chat-backend.fly.dev/health` (HTTP 200 OK)
  - **Live Production Frontend di Vercel & Custom Domain**:
    - URL Produksi: `https://chat.wuzzhub.id` & `https://wuzz-chat.vercel.app`
    - Cloudflare DNS unproxied (DNS-only CNAME ke `cname.vercel-dns.com`).
  - **CORS Whitelist Dinamis**: Dikonfigurasi di Fly.io secrets untuk membatasi origin terverifikasi (`chat.wuzzhub.id`, `wuzz-chat.vercel.app`, `*.vercel.app`, `localhost`).
  - **Security Hardening**:
    - Dynamic multi-cloud IP resolution (`CF-Connecting-IP`, `Fly-Client-IP`, `True-Client-IP`, `X-Forwarded-For`).
    - HTTP Security Headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`).
    - Input validation enforcement (username ≥ 3 karakter, password ≥ 6 karakter).

---

## ⏳ 3. Apa yang Sedang Dikerjakan & Peningkatan Terbaru (Current State)

- **Shared Media Hub for Group & Forum Topics (Fix Premature Media Expiration)**:
  - Mengatasi isu berkas gambar di obrolan grup (`grp_...`) dan forum topik (`sub_...`) yang langsung kedaluwarsa (*"Media telah kedaluwarsa"*) ketika salah satu anggota pertama selesai mengunduh.
  - Memperbarui `SQLMessageStore.AcknowledgeMediaDownload` dan `MemoryMessageStore.AcknowledgeMediaDownload` agar mendeteksi tipe obrolan grup dan forum.
  - Untuk percakapan grup dan forum, panggilan `POST /api/media/ack` dari anggota tidak lagi menghapus berkas fisik dari Supabase Storage dan tidak mengubah `media_status` menjadi `'expired'`, sehingga seluruh anggota grup memiliki kesempatan mengunduh gambar ke IndexedDB masing-masing kapan saja selama masa TTL aktif.
  - Direct message (1-on-1) tetap mempertahankan pola *Store-and-Forward* instan ($0 storage cost).
  - Teruji 100% pada suite pengujian `TestMediaHandler_AcknowledgeDownload_SharedMediaHub_GroupAndSubGroup`.

- **UI/UX Enhancement (WhatsApp Mobile Single-Screen & Dual-Platform Architecture)**:
  - Transformasi tampilan mobile dari konsep *sidebar drawer* menjadi **WhatsApp Single-Screen Flow**:
    - **Layar 1 (Daftar Chat Fullscreen)**: Header WuzzChat, Search Bar terintegrasi, Filter Pills (`Semua`, `Belum Dibaca`, `Langsung`, `Grup`), Floating Action Button (FAB) hijau, dan Bottom Navigation Bar.
    - **Layar 2 (Ruang Obrolan Fullscreen)**: Header kontak dengan tombol navigasi `← Back` untuk kembali ke daftar chat, timeline pesan responsif, dan sticky message input.
    - **Optimasi Browser Handphone**: Menerapkan Dynamic Viewport Height (`100dvh`), `position: sticky; top: 0;` pada status bar obrolan, safe area padding `env(safe-area-inset-bottom)` pada navigasi bawah, dan membersihkan teks shortcut desktop di layar HP.
    - **Real-Time Unread Badge & Read Receipts**: Sinkronisasi instan *unread counter* di Sidebar tanpa reload (Optimistic UI 0ms saat room dibuka), filter pill "Belum Dibaca" akurat, dan pengiriman bulk `read` receipt otomatis via WebSocket & Page Visibility API.
    - **Room Transition History State Fix**: Memperbaiki `chatReducer` agar riwayat pesan selalu tersinkronisasi bersih dari database (`messages: action.payload`) saat berpindah room tanpa menahan atau menggabungkan state lama, sehingga pesan terbaru langsung tampil seketika saat room dibuka dari home HP.
    - **Mobile Back Navigation Stale Message Guard**: Menambahkan `lastHandledMsgIdRef` pada `Sidebar.tsx` untuk mencegah pesan lama di-reprocess sebagai "pesan belum dibaca baru" saat pengguna menekan tombol `← Back` di handphone.
    - **Real-Time Read Receipt Sync in Sidebar**: Memisahkan listener event `receipt` di Sidebar agar status centang 2 biru langsung terupdate secara real-time pada daftar obrolan tanpa tertahan oleh filter ID, dan me-reload daftar obrolan saat kembali ke Home di HP.
    - **Mobile Backpress Modal Interception & Stale Lightbox Guard**: Menambahkan hook `useModalBackHandler` untuk mencegat event `popstate` browser mobile saat gambar (Lightbox) atau modal (MemberList, Profile, Contact, Reader, Delete) terbuka sehingga backpress HP hanya menutup modal tanpa keluar dari obrolan, serta mereset `lightboxData` saat perpindahan room untuk mencegah error gambar kadaluwarsa/revoked blob.
    - **Centered Delete Modal**: Memperbaiki posisi modal konfirmasi hapus percakapan agar presisi di tengah layar (fixed viewport backdrop).
    - **Modern Chat History Synchronization Indicator & Graceful Timeout**:
      - Menerapkan indikator sinkronisasi modern dengan dark-mode glassmorphic card (`.chat-sync-card`), spinner gradien halus, dan teks yang manusiawi (*"Menyinkronkan Percakapan - Mengambil riwayat pesan terbaru dengan aman..."*) untuk mengeliminasi efek kedipan *Flash of Empty State* saat room dibuka.
      - **Backend Guarantee (`internal/ws/hub.go`)**: Backend dipastikan selalu mengirim event `history` dengan payload list (meskipun room kosong) sehingga frontend mendapat sinyal pasti kapan proses fetch selesai.
      - **Graceful Timeout & Retry Action**: Dilengkapi safety timeout (7.5s) dan tombol interaktif *🔄 Coba Sinkronkan Lagi* jika koneksi database/jaringan terhambat, dengan jaminan pesan user tetap aman.
    - **Security Hardening, Stability Guards & Search Debouncing**:
      - **Backend SSRF Redirect Hardening (`internal/api/link_preview.go`)**: Menambahkan `CheckRedirect` pada OpenGraph scraper HTTP client yang memvalidasi host tujuan di setiap lompatan HTTP 30x untuk mencegah bypass SSRF menuju IP privat/internal loopback.
      - **Safe String Slice Bounds Panic Guard (`internal/store/user_store.go` & `internal/ws/client.go`)**: Menambahkan helper `safePrefix` pada pemotongan ID pengguna untuk menjamin server backend bebas dari fatal crash `runtime error: slice bounds out of range`.
      - **Frontend Contact Search Debouncing (`Sidebar.tsx`)**: Menerapkan debounce 450ms dan batas minimum 2 karakter pada pencarian kontak untuk menghemat beban query database dan lalu lintas jaringan.
- **Mandatory Dual-Platform Frontend Architecture SOP**:
  - Dituangkan secara permanen ke dalam [`.agents/AGENTS.md`](../.agents/AGENTS.md) agar seluruh modifikasi frontend di masa mendatang wajib memverifikasi kompatibilitas Desktop (2-Kolom Split) dan Mobile (WhatsApp Single-Screen).
- **Mandatory Backend Change Notification & Fly.io Deployment Warning SOP**:
  - Dituangkan ke dalam [`.agents/AGENTS.md`](../.agents/AGENTS.md) agar setiap modifikasi pada kode backend Go selalu menyertakan peringatan & konfirmasi deployment ulang ke Fly.io demi mencegah desinkronisasi protokol/query dengan frontend produksi.
- **Fase 7 (Bagian 1): End-to-End Encryption (E2EE) Signal Protocol / Web Crypto API (SELESAI)**:
  - **Arsitektur Kriptografi Standar Terbuka (Multi-Platform Ready)**:
    - Key Exchange: **ECDH (NIST P-256 / secp256r1)** via Web Crypto API.
    - Key Derivation: **HKDF-SHA256 (RFC 5869)** dengan room-level salt.
    - Symmetric Cipher: **AES-256-GCM (NIST SP 800-38D)** dengan 96-bit random initialization vector (IV).
    - Payload Format: `e2ee:v1:<base64_iv>:<base64_ciphertext>`.
    - 100% interoperabel dengan klien mobile masa depan (**Kotlin Android**, **Flutter**, **React Native**, **Swift iOS**).
  - **Backend Public Key Registry & Storage**:
    - Auto-migration kolom non-destruktif `public_key TEXT DEFAULT ''` pada tabel `users`.
    - Endpoint REST API: `PUT /api/users/public-key` (upload/update key) & `GET /api/users/profile?id=...` (retrieval).
    - Optimasi query `GetUserConversations` yang menyertakan `peer_public_key` untuk mengeliminasi extra HTTP round-trip saat membuka chat.
  - **Frontend KeyStore & Cryptographic Pipeline (`frontend/lib/crypto/`)**:
    - `e2ee.ts`: Primitif Web Crypto untuk generate key pair, derive AES key, encrypt, decrypt, dan fingerprint generation.
    - `keyStore.ts`: Manajemen penyimpanan aman private key di `IndexedDB` (`wuzz_crypto_db`) dan in-memory cache derived AES key.
    - Inisialisasi otomatis key pair saat user login atau registrasi.
  - **Integrasi Seamless di Chat & UI Indicator**:
    - Pengiriman pesan otomatis terenkripsi di kabel WebSocket & database Supabase (`e2ee:v1:...`).
    - Render lokal pengirim tetap optimistik (plaintext instan 0ms).
    - Riwayat pesan lama & pesan masuk baru otomatis terdekripsi di timeline penerima.
    - Banner edukasi gembok kuning/emas 🔒 di atas timeline obrolan (*"Pesan di ruang ini terenkripsi end-to-end..."*).
    - **Auto-Decryption Snippet Sidebar**: Cuplikan pesan terakhir di Sidebar daftar chat didekripsi otomatis secara paralel dan real-time menggunakan `foundConv.peer_id` & `foundConv.peer_public_key` untuk tampilan teks biasa yang mulus.
    - Modal Verifikasi Nomor Keamanan (*Safety Number Fingerprint 30-digit*) di `SafetyNumberModal.tsx` dengan integrasi tombol 🔒 di status bar dan tombol salin kode.
    - **Reactive Auto-Decryption & Ciphertext Preservation Engine**: Riwayat pesan (`raw_content`) disimpan aman di memori dan otomatis ter-dekripsi secara instan begitu kunci AES percakapan selesai dimuat tanpa terpengaruh race-condition jaringan.
- **Fase 7 (Bagian 2 - Milestone 7.2A): WebRTC 1-on-1 Voice / Audio Calling (SELESAI)**:
  - **Backend Go WebSocket Signaling Hub**:
    - Penambahan tipe pesan signaling: `call_offer`, `call_answer`, `ice_candidate`, `call_reject`, `call_end`, `call_busy`.
    - Payload forwarding ringan dengan atribut `sdp` dan `candidate` tanpa overhead penyimpanan database server.
  - **Procedural Ringtone Synthesizer (Web Audio API)**:
    - `playOutgoingRing()`: Nada sambung panggilan keluar (*tuuut... tuuut...*) frekuensi dual-sine 440Hz / 480Hz.
    - `playIncomingRing()`: Nada dering panggilan masuk harmonik C5-E5-G5-C6.
    - `stopCallSounds()`: Penghentian instan saat panggilan tersambung, ditolak, atau diakhiri.
  - **WebRTC Audio Session Engine (`webrtcAudio.ts`)**:
    - Manajemen koneksi P2P `RTCPeerConnection` dengan Google Public STUN (`stun:stun.l.google.com:19302`).
    - Auto-attach mikrofon lokal dengan *echo cancellation*, *noise suppression*, dan *auto gain control*.
    - Auto-playback remote audio stream, toggle mute lokal mikrofon, dan lifecycle cleanup hardware menyeluruh.
  - **UI Overlays & Modals**:
    - `IncomingCallModal.tsx`: Dialog pop-up panggilan masuk dengan animasi denyut avatar dan aksi Terima / Tolak.
    - `AudioCallOverlay.tsx`: Layar panggilan berlangsung dengan avatar wave, timer durasi live, tombol mute mikrofon, dan tombol akhiri panggilan.
    - Tombol panggil suara 📞 pada status bar obrolan direct 1-on-1.
- **Bug Fix & UI Polish**:
  - **Contact Search Persistence**: Memisahkan state loading API `isSearching` dengan state visibilitas panel pencarian `isSearchActive` di `Sidebar.tsx` sehingga hasil pencarian kontak tetap menetap dan tidak tertutup otomatis setelah 1 detik.
- [x] **Milestone Security & Scale Hardening (Tahap 1 s/d 5 Lengkap Selesai ✅)**:
  - **Tahap 1: BOLA / IDOR WebSocket Protection**: Memvalidasi kepemilikan dan hak akses keanggotaan room (`isAuthorizedForRoom`) pada seluruh event WebSocket (`call_offer`, `call_answer`, `ice_candidate`, `receipt`, `reaction`, `typing`, `message`, `join`) di `backend/internal/ws/client.go`.
  - **Tahap 1: End-to-End (E2E) Test Suite**: Dibuat suite pengujian live server komprehensif di `backend/internal/ws/e2e_full_flow_test.go` (`TestE2E_FullChatAndSecurityLifecycle`) yang menguji alur multi-user chat, WebRTC calling, dan penolakan penetrasi penyusup (attacker isolation).
  - **Tahap 1: SQLite Concurrency & Busy Timeout**: Konfigurasi `PRAGMA journal_mode=WAL` dan `PRAGMA busy_timeout=5000` di `backend/internal/store/sql.go` untuk keandalan concurrency multi-goroutine.
  - **Tahap 2: IDOR Media File ACK Deletion Protection**: Memvalidasi kepemilikan room pada endpoint `POST /api/media/ack` di `backend/internal/api/media_handler.go`. Mencegah penyerang (attacker/intruder) menghapus file fisik transit media milik percakapan privat user lain. Dilengkapi unit test `TestMediaHandler_AcknowledgeDownload_IDORProtection`.
  - **Tahap 3: Solusi Query $N+1$ pada `GetUserConversations` & Indeks Database**: Merefaktor pemuatan daftar percakapan sidebar dari $1 + 3N$ queries menjadi **$O(1)$ batched queries (tepat 3 query database)** menggunakan Common Table Expressions (CTE), `ROW_NUMBER() OVER (PARTITION BY ...)` dan `LEFT JOIN`. Menambahkan database performance index untuk `conversation_members` dan `messages` di PostgreSQL & SQLite.
  - **Tahap 4: Mitigasi TOCTOU / DNS Rebinding & SSRF Guard (`link_preview.go`)**: Mengimplementasikan `safeDialContext` dengan validasi IP level socket TCP (`validateIP`) yang mem-pin IP koneksi, memblokir subnet loopback, private (RFC 1918, RFC 4193), link-local, IPv4-mapped IPv6, Cloud Metadata (`169.254.169.254`), Carrier-Grade NAT (`100.64.0.0/10`), dan redirect chaining. Dilengkapi E2E test suite `TestE2E_Tahap4_SSRFAndDNSRebindingProtection`.
- [x] **Optimasi UX & Bug Fixes (E2EE Sidebar & Conversation Lifecycle ✅)**:
  - **Instant E2EE Sidebar Snippet Decryption**: Mengeliminasi ketergantungan *stale state closure* pada `useEffect` di `Sidebar.tsx` dengan memanfaatkan `conversationsRef`, fallback resolusi `peer_id` dari event WebSocket `lastIncomingMessage.from` / `to`, serta auto-fetch profil dan derivasi kunci AES secara reaktif. Cuplikan teks pesan terenkripsi langsung didekripsi seketika (0ms) menjadi teks asli tanpa perlu me-refresh halaman.
  - **Auto-Close Active Room on Conversation Deletion**: Memperbaiki logika penghapusan percakapan (`Delete for Me`) di `Sidebar.tsx` dengan pencocokan multi-identifier (`activeRoomId === conv.id`, `activeRoomId.includes(conv.peer_id)`, dan substring UUID). Menambahkan pembersihan state linimasa pesan dan room users pada `page.tsx` (`handleSelectRoom('')`), sehingga saat percakapan yang sedang dibuka dihapus, tampilan otomatis kembali ke layar Welcome Standby tanpa perlu navigasi manual.
- [x] **Milestone 8.1: Universal Push Notification Engine (Fase 8 - Selesai ✅)**:
  - **Standar W3C Web Push & VAPID RFC 8292**: Integrasi library `github.com/SherClockHolmes/webpush-go` di backend Golang dengan auto-generation keypair VAPID yang persisten.
  - **Skema Database Multi-Platform `push_subscriptions`**: Mendukung penyimpanan endpoint dan cryptographic keys untuk platform `'web'`, `'android'`, dan `'ios'` dengan relasi cascading ke `users`.
  - **Backend REST API**:
    - `GET /api/notifications/vapid-public-key`: Pengambilan public key untuk handshake browser.
    - `POST /api/notifications/subscribe`: Pendaftaran endpoint subscription (Protected JWT).
    - `POST /api/notifications/unsubscribe`: Pencabutan endpoint subscription saat logout atau toggle off.
  - **Asynchronous Offline Dispatcher di Go WebSocket Hub**: Saat pesan teks/media masuk (`TypeMessage`), Hub mendeteksi recipient yang sedang offline/tidak berada di room dan mengirimkan push notification via goroutine non-blocking (dengan auto-cleanup subscription expired HTTP 404/410).
  - **Frontend Service Worker & Helper**:
    - Service Worker standard di `frontend/public/sw.js` menangani event `push` dan `notificationclick` (deep link navigasi langsung ke room obrolan).
    - **Zero-Knowledge Client-Side Background Decryption**: Mengimplementasikan dekripsi kriptografi E2EE (Web Crypto ECDH P-256 + HKDF + AES-256-GCM) langsung di dalam Service Worker (`sw.js`) dengan membaca private key pengguna dari IndexedDB (`wuzz_crypto_db`). Server Go tetap memegang prinsip Zero-Knowledge (tidak mengetahui plaintext pesan), sementara notifikasi push OS menampilkan isi teks pesan asli secara aman dan transparan layaknya WhatsApp Web dan Signal.
    - Helper `lib/pushNotification.ts` untuk registrasi VAPID, subscribe, unsubscribe, dan auto-sync.
  - **UI/UX Pengaturan Notifikasi & PWA Install Engine**:
    - Toggle ON/OFF Push Notification di `ProfileModal.tsx` dengan indikator status izin (*Diizinkan / Diblokir Browser / Belum Diizinkan*).
    - Tombol Header **"📲 Instal App"** di `Sidebar.tsx` yang memicu dialog instalasi resmi sistem operasi via event `beforeinstallprompt`, serta otomatis tersembunyi 100% (*auto-hide*) saat aplikasi dibuka dalam Standalone PWA Mode.
  - **Pengujian E2E & Unit Test 100% PASS**:
    - `TestSQLUserStore_PushSubscriptions`: CRUD database SQLite.
    - `TestNotificationHandler_Endpoints`: Verifikasi REST handler VAPID, Subscribe, dan Unsubscribe.
    - `TestE2E_PushNotificationLifecycle`: Pengujian alur utuh registrasi -> offline push dispatch -> unsubscribe.
- [x] **Milestone 7.4: Android PWA Background Web Push Reliability & Key Persistence (SW v1.0.5)**:
  - **Static VAPID Key Persistence**: Mengonfigurasi pasangan kunci VAPID publik-privat statis permanen di Fly.io Secrets dan Go push engine fallback untuk mencegah rotasi kunci otomatis yang menggugurkan token FCM/Web Push browser.
  - **Dynamic Subscription Re-sync on Key Mismatch**: Menambahkan verifikasi `applicationServerKey` pada `frontend/lib/pushNotification.ts`. Jika kunci server berubah atau token lama tidak cocok, browser otomatis melakukan `unsubscribe()` dan registrasi ulang instan.
  - **Android LevelDB Lock Bypass via CacheStorage**: Memperbarui `frontend/public/sw.js` (v1.0.5) untuk membaca private key dari `CacheStorage` (`wuzz-crypto-keys`) dalam waktu < 1ms saat PWA di-kill atau dalam status background OS Android.
  - **Direct Message Recipient Fallback**: Menambahkan resolusi anggota direct room `dm_userA_userB` di `backend/internal/push/push.go` agar notifikasi push tetap terkirim meskipun entri relational table belum diinisialisasi.
- [x] **Milestone 7.5: E2EE Single Active Device & Key Conflict Guard (Opsi A)**:
  - **Database Schema Non-Destruktif**: Menambahkan kolom `key_version` (INTEGER DEFAULT 1) dan `active_device_id` (TEXT DEFAULT '') di tabel `users`.
  - **Device-Aware Key Management**: `UpdatePublicKeyWithDevice` menolak penimpaan kunci dari device berbeda dengan error `ErrKeyConflict` (HTTP 409 Conflict `KEY_ALREADY_REGISTERED`).
  - **Explicit Key Rotation**: Endpoint `POST /api/users/public-key/reset` untuk rotasi kunci resmi ke perangkat baru yang menginkrementasikan `key_version`.
  - **Frontend UI Conflict Modal (`DeviceConflictModal.tsx`)**: Dialog interaktif untuk memilih antara membatalkan sesi atau mereset kunci ke perangkat baru, serta penanganan sesi kedaluwarsa saat kunci dirotasi dari perangkat lain.
  - **Pencegahan Ketidaksinkronan Safety Number**: Menjamin fingerprint Safety Number selalu 100% konsisten antar perangkat dan percakapan.
- [x] **Milestone 7.6: Zero-Knowledge QR Code Key Migration (Opsi 2)**:
  - **Tabel `device_transfer_sessions`**: Penyimpanan paket ciphertext sesi sementara dengan batas waktu kedaluwarsa (`expires_at`, TTL 5 menit) dan status penggunaan sekali pakai (`is_used`).
  - **Atomic Transaction & One-Time Retrieval**: Endpoint `POST /api/users/transfer/create` dan `POST /api/users/transfer/consume` yang menandai status `is_used = true` dan mengalihkan `users.active_device_id` ke perangkat baru secara atomik dalam 1 transaksi database.
  - **Kriptografi Hybrid E2EE**: Menggunakan AES-256-GCM dengan kunci turunan PBKDF2 (100.000 iterasi, SHA-256) dari 256-bit entropy random token, menjamin private key tidak pernah menyentuh server dalam bentuk plaintext.
  - **Komponen Frontend & Deep Link**: `DeviceTransferModal.tsx` (mode QR generator dengan live countdown timer dan fallback salin kode manual), tombol integrasi di `ProfileModal.tsx` dan `DeviceConflictModal.tsx`, serta halaman deep link otomatis `/transfer?token=...`.
  - **Unit Test Komprehensif**: `TestTransferHandler_Lifecycle` dan `TestTransferHandler_ExpiredSession` lulus 100% (atomic consume, anti-replay 410 Gone, unauthorized 403 Forbidden, expired TTL).
- [x] **Milestone 7.7: Hard Blocker UI, In-App Camera QR Scanner, Fail-Closed E2EE Guard, & Single-Session WebSocket Kick**:
  - **Hard Blocker UI Guard**: Layar chat di belakang modal konflik terkunci total dan tidak dirender ke DOM saat terjadi konflik perangkat. Tombol back HP dan gestur dismissal otomatis diarahkan ke `logout()` bersih.
  - **In-App Camera QR Scanner (`html5-qrcode`)**: Terintegrasi viewfinder kamera pemindai QR langsung di dalam `DeviceTransferModal.tsx` dengan auto-detection token URL, eliminasi kebutuhan aplikasi luar, dan pembersihan stream kamera otomatis.
  - **Smart Tab Filtering**: Tab "Buat QR (Perangkat Lama)" otomatis disembunyikan pada perangkat baru (`hideGenerate={true}`), mencegah kebingungan dan menghilangkan pesan error *"Kunci keamanan lokal tidak ditemukan"*.
  - **Fail-Closed E2EE Guard**: Pengiriman pesan teks/media pada direct room otomatis dibatalkan jika kunci AES sesi belum terverifikasi di perangkat, menjamin 0% kebocoran pesan plaintext.
  - **Single-Session WebSocket Kick**: Backend Go `Hub.Register` mendeteksi login baru dari UserID yang sama, mengirim event `SESSION_REPLACED`, dan memutus koneksi WebSocket perangkat lama secara instan.
  - **Unit Test Baru**: `TestHub_SingleActiveDeviceKick` (100% PASS).

- **Backend Go & Frontend Next.js telah LIVE di Production!**
  - Backend: `https://wuzz-chat-backend.fly.dev`
  - Frontend: `https://chat.wuzzhub.id` & `https://wuzz-chat.vercel.app`
- Terhubung aktif ke:
  - Supabase PostgreSQL Database (`DATABASE_URL`)
  - Supabase Storage Bucket (`wuzz-chat-media`)
  - Upstash Redis Cluster Pub/Sub (`REDIS_URL`)
- Seluruh pengujian unit & integrasi E2E lulus 100%.

---

### 🚩 CHECKPOINT (16 September 2026, Sesi 1): E2EE Device Conflict & PWA Key Transfer

- **Status Pengerjaan (100% Sukses & Live di Production):**
  1. [x] **Single-Active Device E2EE Stabilization**: Masalah bentrok saling tendang antara Device 1 & Device 2 selesai total (Strict `e2eeVerified` socket gatekeeper & graceful 409 handling).
  2. [x] **Mobile Nested Modal History Decoupling**: Memperbaiki bug tombol *"Pindah Kunci via QR Code / Kode"* yang sebelumnya tertutup seketika (< 10ms) akibat benturan `window.history.back()` pada hook `useModalBackHandler`.
  3. [x] **PWA Offscreen Image QR Processor**: Mengeliminasi error *"Container pemindai tidak siap"* saat upload foto/screenshot QR code dengan membuat dedicated offscreen processor (`qr-file-scanner-box`).
  4. [x] **PWA Camera Gesture Guard**: Mematikan auto-start kamera background agar tidak diblokir oleh Android WebAPK Permissions Policy.
  5. [x] **Pengguna Mengonfirmasi**: Transfer sesi dan pemindahan kunci E2EE di PWA telah berhasil (**"oke berhasil"**).

---

### 🚩 CHECKPOINT (16 September 2026, Sesi 2): PWA Android Camera & Mobile Viewport Bug Fixes

- **Status Pengerjaan (100% Sukses & Live di Production via `main`):**

  #### 🔧 Bug Fix 1: Camera Permission Dialog Tidak Muncul di Android PWA
  1. [x] **Pre-Warm Permission Strategy** (`DeviceTransferModal.tsx`): Merefaktor `startScanner()` agar memanggil `navigator.mediaDevices.getUserMedia()` sebagai **langkah pertama sebelum `await` apapun**, sehingga gesture token user masih hidup dan dialog permission Android dapat muncul. Sebelumnya, 3+ lapisan `await` (`getCameras` → `Html5Qrcode.start`) memutus gesture token sehingga Chrome Android langsung `NotAllowedError` tanpa menampilkan dialog.
  2. [x] **Native Camera Intent Capture** (`DeviceTransferModal.tsx`): Menambahkan fallback tombol "📷 Foto via Kamera Native" yang menggunakan `<input type="file" accept="image/*" capture="environment">` — memicu intent kamera native Android system camera yang terbukti berhasil meski izin kamera WebView belum diberikan. Tombol ini tampil setelah error kamera terdeteksi.
  3. [x] **PWA Manifest Camera Permission Declaration** (`manifest.json`): Menambahkan `"permissions": ["camera"]` di manifest untuk deklarasi izin kamera pada saat instalasi WebAPK di Android, sehingga izin kamera muncul di daftar izin Pengaturan Aplikasi Android.
  4. [x] **Catatan Platform**: Kamera streaming/live scan tetap hanya bisa diaktifkan sepenuhnya via HTTPS dengan izin kamera di browser settings; tombol kamera native (`capture`) terbukti berhasil sebagai workaround yang solid. Jika ingin akses kamera native penuh (live scanner), solusi terbaik adalah Android Native App.

  #### 🔧 Bug Fix 2: Tampilan Chat Naik ke Atas Setelah Device Transfer
  5. [x] **Mobile Viewport Displacement Fix** (`globals.css`, `ChatWindow.tsx`, `DeviceTransferModal.tsx`, `page.tsx`): Mengunci `.chat-app-container` pada mobile dengan `position: fixed` dan `overscroll-behavior: none` untuk mencegah displacement viewport. Mengganti `bottomRef.scrollIntoView()` dengan `containerRef.scrollTo()` di ChatWindow agar scroll tidak menggeser window keseluruhan. Menambahkan `window.scrollTo(0, 0)` pada transisi room dan penutupan modal transfer untuk memastikan halaman kembali ke posisi teratas.

  #### 🔧 Bug Fix 3: Header Chat Keangkat Saat Keyboard Virtual Muncul
  6. [x] **Android Virtual Keyboard Header Fix** (`layout.tsx`, `globals.css`, `page.tsx`): Menambahkan `interactiveWidget: 'resizes-content'` pada viewport metadata agar layout di-resize (bukan di-pan) saat keyboard virtual muncul. Menghapus constraint `100dvh` yang rigid dari mobile container agar container beradaptasi smooth dengan ukuran keyboard. Menambahkan listener `visualViewport` dan `window scroll` di `page.tsx` untuk mengunci `window.scrollY` selalu di 0 sehingga header tidak pernah keluar dari viewport.

---

### 🚩 CHECKPOINT (16 September 2026, Sesi 3): Milestone 8.4 — IndexedDB Message Cache & E2EE Continuity

- **Status Pengerjaan (100% Selesai & Terverifikasi Build 0 Error):**
  1. [x] **Local Storage Engine (`messageCache.ts`)**: Modul IndexedDB kustom (`wuzzchat_msg_db`) dengan store `messages`, index `by_room`, anti-downgrade receipt status weight (`pending` < `sent` < `delivered` < `read`), dan fungsi batch `cacheMessages`, `getCachedMessages`, `updateCachedMessageStatus`, `revokeCachedMessage`, `deleteCachedMessage`, serta `clearRoomCache`.
  2. [x] **Cache-First Instant Room Load (`page.tsx`)**: Mengurangi perceived loading time menjadi 0ms saat room dibuka dengan memuat snapshot lokal IndexedDB terlebih dahulu ke reducer UI sebelum server response tiba.
  3. [x] **Write-Through Synchronization (`page.tsx`)**: Integrasi cache sinkron di seluruh titik mutasi pesan (pesan masuk WebSocket, pengiriman pesan mandiri optimistik & terkonfirmasi, pembaruan tanda terima, penarikan pesan untuk semua orang, penghapusan lokal untuk saya, dan hapus riwayat room).
  4. [x] **E2EE Readability Continuity**: Bob tetap dapat membaca seluruh pesan lama secara utuh meskipun Alice me-reset perangkat dan mengunggah pasangan kunci E2EE baru, karena pesan tersimpan persisten dalam status terdekripsi di IndexedDB Bob.
  5. [x] **Security Key Change Detection & UI (`page.tsx`, `MessageBubble.tsx`, `globals.css`)**: Deteksi perubahan public key lawan bicara via `localStorage` + `lastKnownPeerKeyRef` saat dekripsi, dengan penyisipan pesan sistem amber bertema `security-notice` ke timeline percakapan layaknya WhatsApp.
  6. [x] **Fix Bug 2-Device Conflict Reset Redirect & Anti-Race Condition (`page.tsx`)**:
     - Memperbaiki bug di hard blocker `DeviceConflictModal` di mana `onClose` salah mengarahkan ke `handleDeviceConflictLogout` saat user mengklik "Reset & Masuk di Perangkat Ini", yang menyebabkan Device 2 terlempar kembali ke `/login` dan menimbulkan perebutan sesi enkripsi (*ping-pong race condition*).
     - Diperbaiki menjadi `onClose={() => setDeviceConflict({ isOpen: false })}` sehingga Device 2 langsung masuk ke obrolan secara mulus.
     - Menambahkan pembersihan kunci lokal `clearLocalKeyPair(user.id)` saat logout konflik agar perangkat lama bersih dari sisa kunci usang saat user login ulang.
     - Menambahkan script pengujian simulasi otomatis 2-device ([`frontend/test-two-device-simulation.mjs`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/frontend/test-two-device-simulation.mjs)) yang memvalidasi otentikasi akun, 409 conflict detection, key reset, transfer sesi WebSocket, dan pengiriman `SESSION_REPLACED` ke Device 1 dengan 100% kelulusan.
  7. [x] **Decoupled WebSocket Connection & Room Switcher (Eliminasi Self-Kick & Race Condition `page.tsx`)**:
     - Memisahkan siklus hidup koneksi WebSocket dari state `roomId`. Sebelumnya, setiap kali user berpindah ruang obrolan atau menekan tombol `← Back` di mobile, koneksi WebSocket di-destroy dan dibuat ulang, yang memicu backend Hub mengirim `SESSION_REPLACED` ke koneksi lama yang belum tuntas di socket TCP (menendang diri sendiri).
     - WebSocket kini hanya diinisialisasi **SATU KALI** per sesi login, dan perpindahan ruang obrolan hanya mengirimkan event `{ type: 'join', room: roomId }` seketika (0ms reconnect).
  8. [x] **Anti-False-Logout on Slow Networks (`auth-context.tsx`)**:
     - Memperbaiki pengecekan `/api/auth/me` pada startup di mana `logout()` sebelumnya dipicu oleh sembarang nilai `error` (seperti koneksi lambat, timeout, atau status 500).
     - Kini `logout()` secara ketat **HANYA** dipanggil jika respon server adalah `status === 401` (Unauthorized/Token kadaluarsa sah), menjaga kestabilan sesi di jaringan seluler/HP yang lambat.
  9. [x] **Safe-Merge Server History with IndexedDB Cache (Anti-Ciphertext Overwrite `page.tsx`)**:
     - Mengatasi masalah di mana server history menimpa pesan yang sudah berhasil didekripsi di IndexedDB dengan placeholder `🔒 [Pesan Terenkripsi]` ketika lawan bicara pernah melakukan reset kunci di masa lalu.
     - Sistem safe-merge secara cerdas memeriksa cache lokal IndexedDB: jika hasil dekripsi server gagal tetapi teks asli tersedia di IndexedDB, teks asli dari cache lokal dipertahankan 100%.
  10. [x] **End-to-End Simulation 2-User (`test-two-user-e2ee-simulation.mjs`)**:
      - Pengujian live otomatis antara Alice dan Bob: Alice Device 1 chat ke Bob -> Alice pindah ke Device 2 (reset key) -> verifikasi chat lama di Bob tetap 100% terbaca jelas via IndexedDB Cache (tidak rusak/terenkripsi), dan chat baru dari Device 2 tetap sukses didekripsi dengan kunci baru. Hasil: 100% PASS.
  11. [x] **Android PWA vs Laptop Desktop Simulation (`test-android-pwa-simulation.mjs`)**:
      - Simulasi interaksi lintas platform: Laptop Desktop ThinkPad (Chrome) vs Handphone Samsung Galaxy S24 (Wuzz Chat PWA Standalone WebAPK).
      - Memvalidasi skenario Android OS Doze Mode / Background Sleep (socket teardown dan auto-reconnect tanpa memicu `SESSION_REPLACED` atau saling tendang).
      - Pengujian CacheStorage mock untuk Service Worker push background key caching.
      - Verifikasi kontinuitas linimasa di sisi Bob: pesan lama dari Laptop tetap terbaca jelas (IndexedDB cache) dan pesan baru dari Android PWA terdekripsi dengan kunci baru. Hasil: 100% PASS.
  12. [x] **Device Key Transfer & Anti-Race Condition Hardening**:
      - Backend Gatekeeper (`handler.go`): Validasi `device_id` saat HTTP upgrade handshake. Jika akun telah memiliki `active_device_id` di database dan klien yang mencoba konek memiliki `device_id` tidak cocok atau kosong, request ditolak langsung dengan status `HTTP 403 Forbidden` (`DEVICE_MISMATCH` / `SESSION_REPLACED`). Klien usang tidak akan pernah berhasil upgrade WebSocket dan tidak akan bisa menendang perangkat aktif yang sah.
      - Backend Hub (`hub.go`): Mengirim WebSocket Close Control Frame resmi `4001: SESSION_REPLACED` dan memperpanjang grace period flush ke 500ms (write timeout 1000ms) sebelum `conn.Close()`, mengeliminasi silent socket drop (code 1005) pada perangkat lama bahkan di lingkungan server lambat-medium atau latensi tinggi.
      - Frontend API Client (`api.ts`): Menambahkan safeguard timeout terkelola (15 detik untuk query REST umum, 60 detik untuk upload media) menggunakan `AbortController` agar UI tidak macet/menggantung jika server sedang lambat atau kelebihan beban.
      - Frontend (`ws-client.ts` & `page.tsx`): Menautkan `device_id` pada URL koneksi (`/ws?token=...&device_id=...`) dan menambahkan proteksi pada `onclose` untuk code 4001 / `SESSION_REPLACED`, menghentikan auto-reconnect permanen agar tidak terjadi ping-pong disconnect / saling tendang antar perangkat.
      - Frontend (`DeviceTransferModal.tsx`): Menambahkan helper `downscaleImageFile` yang otomatis mengompresi foto kamera HP beresolusi tinggi (12MP–50MP) ke dimensi optimal 1200px sebelum dipindai `Html5Qrcode`, menyelesaikan kegagalan deteksi barcode ZXing pada kamera smartphone modern.
      - Frontend (`DeviceConflictModal.tsx`): Menambahkan tombol *"📲 Ambil Alih Sesi Kembali ke Perangkat Ini via QR"* saat `isRotated: true`, mengeliminasi dead-end UX yang memaksa user logout dan mengetik password ulang.
      - Frontend (`keyStore.ts`): Memperbaiki `importAndSaveTransferredKeyPair` agar menggunakan `PUT /api/users/public-key` (zero-rotation) dan menambahkan safeguard pemulihan `userId` dari storage, menjaga versi kunci tetap konsisten tanpa rotasi semu.
      - Test (`test-qr-device-transfer-simulation.mjs`): Script simulasi transfer 2-arah lengkap (HP -> Laptop via Kamera, Laptop -> HP via Foto QR) dengan pesan Bob tetap terbaca 100% di semua siklus dan Key Version tetap konstan.
   13. [x] **Soft Tri-Color Glassmorphism Redesign & Modular Avatar Architecture**:
       - Frontend Tokens (`globals.css`): Implementasi palet 3 warna harmonis (Soft Azure `#3b82f6` utama, Soft Lavender `#818cf8` sekunder, Soft Coral `#f472b6` tersier) dengan specular border dan ambient background radial lighting.
       - Modular Avatar Generator (`avatarColor.ts`): Utilitas murni deterministik berbasis hash dengan 8 variasi warna pastel dan border glow, terintegrasi ke seluruh komponen (Sidebar, StatusBar, MemberListModal, ContactProfileModal, Call Modals).
       - Mobile & High-Contrast Polish: Slate Frosted Glass pada bubble pesan masuk (`rgba(30, 41, 59, 0.88)`), penajaman timestamp sendiri (`rgba(255, 255, 255, 0.88)`), read receipts Electric Cyan (`#67e8f9`), dan dark glass quote reply box (`rgba(0, 0, 0, 0.38)`).
   14. [x] **Peer Message Avatar & Glassmorphism Detailing (Option 4)**:
       - Peer Bubble Mini Avatar (`MessageBubble.tsx` & `globals.css`): Mini avatar deterministik (28px Desktop, 26px Mobile) di samping bubble pesan masuk (peer), terintegrasi dengan layout `.message-row-inner` dan `.message-content-wrapper` untuk pesan aktif maupun pesan ditarik/dihapus (`is_deleted`).
       - Sidebar User Profile Card Polish (`Sidebar.tsx` & `globals.css`): Specular top-border highlight, inset glass shadow, dan indikator panah chevron mini untuk interaksi modal profil.
       - Active Filter Pills Polish (`globals.css`): Soft Azure-Lavender specular gradient dengan glowing border pada pill kategori chat aktif.
   15. [x] **Ultra-Modern Aurora Glassmorphism Header Redesign**:
       - Ambient Aurora Mesh Lighting (`globals.css`): Pendaran radial halus Soft Azure (`rgba(59, 130, 246, 0.3)`) dan Soft Lavender (`rgba(168, 85, 247, 0.22)`) di belakang header dengan frosted glass `backdrop-filter: blur(20px) saturate(180%)`.
       - Integrated Profile Avatar Button (`Sidebar.tsx` & `globals.css`): Mengintegrasikan avatar profil pengguna langsung ke pojok kanan atas berdampingan dengan tombol lonceng notifikasi (dengan online dot dan specular ring), mengeliminasi kotak profil besar di tengah dan menghemat ~80px ruang vertikal di layar smartphone.
       - Futuristic Emblem Branding (`Sidebar.tsx` & `globals.css`): Emblem logo kilat berpendar dengan gradien modern di samping teks `WuzzChat` yang bersih dan minimalis.
   16. [x] **Modular Emoji Picker & Flagship Precision Chat Input Bar**:
       - Modular Emoji Catalog (`emojis.ts`): Modul katalog terisolasi dengan 5 kategori (Wajah, Gestur, Hati, Populer, Hewan & Alam) yang mudah diperluas tanpa menyentuh komponen UI.
       - Frosted Glass Emoji Picker Tray (`MessageInput.tsx` & `globals.css`): Panel popover pemilih emoticon dengan navigasi tab kategori, dismiss klik luar / Escape, dan penyisipan instan di kursor textarea.
       - Precision Flagship Input Layout: Placeholder `"Message"`, kapsul pil organik (`border-radius: 24px`), perataan optik seimbang (`😊` kiri, `📎` kanan teks), dan tombol aksi rekam suara / kirim melayang (*floating circular button 48x48px*) mandiri gaya WhatsApp & Telegram.
   17. [x] **High-Contrast SVG Read Receipt & Electric Neon Cyan Glow Engine**:
       - Reusable Vector Receipt Component (`ReceiptIcon.tsx`): Menggantikan karakter teks tipis `✓✓` dengan komponen vektor SVG standar WhatsApp/Telegram (`stroke-width: 2`, 45-degree parallel geometry) yang tajam di semua resolusi layar (baik di bubble chat maupun riwayat percakapan sidebar).
       - Electric Neon Cyan Contrast Guard (`globals.css`): Memperbaiki isu kontras rendah *blue-on-blue* pada bubble pesan keluar (Soft Blue-Indigo) menggunakan warna Electric Neon Cyan (`#00f2fe`) yang didukung filter ganda: dark drop shadow (`rgba(0, 0, 0, 0.95)`) sebagai garis tepi kontras dan neon glow aura (`rgba(0, 242, 254, 0.9)`) sehingga status terbaca menyala tajam dan terbaca seketika.
   18. [x] **Browser History Stack & Mobile Back Navigation Hardening (v0.1.1 / SW v1.0.6)**:
       - **Root Cause Resolution**: Mengeliminasi duplikasi entry browser history pada navigasi room di `frontend/app/chat/page.tsx` di mana sebelumnya `window.history.pushState` dieksekusi bersamaan dengan `router.push`, melipatgandakan entry history untuk setiap obrolan.
       - **Clean SPA History Flow**: Menggunakan `router.push` tunggal saat memasuki room dan `router.replace('/chat')` saat kembali ke home/sidebar. Tombol Back browser/HP kini keluar dari linimasa dengan bersih tanpa berputar-putar di history stack room sebelumnya.
       - **Cache Busting & Release**: Bump versi Frontend ke `0.1.1` (`package.json`) dan Service Worker cache ke `wuzzchat-sw-v1.0.6` (`sw.js`) dengan mekanisme auto-purge cache lama untuk memastikan pembaruan langsung aktif di browser seluler klien.
   19. [x] **Interactive Profile Studio, Verified Badge & Unified Real-Time Avatar Engine (17 September 2026)**:
       - **Redesain ProfileModal Bertab Modern**: Menata ulang modal profil menjadi 3 tab intuitif: *Profil* (nama tampilan, bio preset, upload foto asli & Avatar Studio), *Media* (toggle kompresi otomatis & pembersih cache media IndexedDB), dan *Keamanan* (Transfer Kunci QR, Safety Number).
       - **Interactive Avatar Studio (`AvatarStudio.tsx`)**: Studio pemilihan avatar interaktif dengan 3 opsi fleksibel: (1) Unggah Foto Asli (dengan kompresi WebP otomatis max 512px via `imageCompressor.ts`), (2) Pilihan 3D Preset Emoji Populer (Robot, Astronot, Kucing, Ninja, Alien, dsb.), dan (3) Pembuat Avatar Inisial Dinamis dengan 8 pilihan gradien warna elegan.
       - **Verified Badge Indicator (`VerifiedBadge.tsx`)**: Komponen visual centang biru (*blue checkmark*) dengan tooltip terpercaya untuk akun terverifikasi (`is_verified`), tampil harmonis di header profil, daftar percakapan, hasil pencarian user, dan modal profil kontak.
       - **Komponen Universal `UserAvatar.tsx`**: Komponen avatar terpusat yang menggantikan render inisial teks polos lama di seluruh aplikasi, mendukung tag `<img>` untuk foto asli/base64 dengan error fallback inisial cerdas, serta status dot online hijau terintegrasi.
       - **Sinkronisasi Backend SQL `peer_avatar_url`**: Memperbarui struct `ConversationItem` dan query SQL `GetUserConversations` di `backend/internal/store/user_store.go` (PostgreSQL & SQLite) agar menyertakan `peer.avatar_url`, mengatasi kendala foto kontak yang sebelumnya tidak tampil di daftar percakapan.
       - **End-to-End Chat Header Data Flow**: Menghubungkan `peerAvatarUrl` dan `peerUserId` ke `ChatState` di `frontend/app/chat/page.tsx`, mengalirkannya langsung ke `StatusBar.tsx` untuk menampilkan foto profil kontak secara real-time saat ruang chat dibuka.
   20. [x] **Anti-Stale History Overwrite & Offline Contact Profile Resolution (17 September 2026)**:
       - **Anti-Stale History Overwrite Guard**: Mengeliminasi bug penimpaan nama kontak di header chat dari event WebSocket `history` (`page.tsx`), mempertahankan nama resmi terbaru dari database/profil (`found.title`) agar tidak tertimpa snapshot nama lampau dari tabel `messages`.
       - **Offline Contact Profile Resolution (`StatusBar.tsx`)**: Memperbaiki modal Info Kontak (`ContactProfileModal`) agar mengutamakan `peerUserId` (UUID unik) alih-alih `peerNickname`, memastikan profil kontak selalu 100% ditemukan via `/api/users/profile?id=<UUID>` meskipun lawan bicara sedang offline.
       - **1-on-1 Direct Chat Sender Label Cleanup**: Menghilangkan label nama pengirim yang berlebihan di atas balon pesan pada percakapan 1-on-1 (`MessageBubble.tsx`) sesuai standar industri WhatsApp & Telegram, serta menghubungkan `UserAvatar` pada mini avatar pesan lawan bicara.


    21. [x] **Security Hardening Registration & Anti-Impersonation Filter (17 September 2026)**:
        - **Modular Validator Terpusat (`backend/internal/auth/validator.go`)**: Seluruh logika validasi pendaftaran dieksternalisasi ke `ValidateRegistration()` — dapat diuji secara mandiri.
        - **Batasan Karakter & Panjang**: `username` 3-30 karakter (regex `^[a-zA-Z0-9_.-]+$`), `password` 6-128 karakter (Bcrypt DoS guard), `display_name` maks 50 karakter.
        - **Filter Kata Terlarang Hybrid (3 Lapisan)**:
          - *Substring* (blokir jika mengandung): `jancok`, `puki`, `pepek`, `semantic`.
          - *Brand/sensitif prefix/suffix* (blokir jika diawali/diakhiri dengan pemisah): `admin`, `official`, `support`, `wuzz`, `verified`, `moderator`, `staff`, `helpdesk`, `security`, `team`, `service`, `contact`, `info`.
          - *Exact match* (blokir hanya jika persis sama): `bot`, `dev`, `api`, `chat`, `null`, `undefined`, `root`, `system`, `anonymous`.
        - **Anti-DoS Body Cap**: `http.MaxBytesReader` 64 KB pada endpoint registration.
        - **Fail-Closed BOLA Guard (`ws/client.go`)**: `isAuthorizedForRoom` menolak akses jika ada error DB.
        - **JWT Runtime Warning (`auth/jwt.go`)**: `sync.Once` warning jika `JWT_SECRET` kosong di environment.
        - **Tests**: `validator_test.go` (33 cases) & `auth_register_test.go` (11 cases) — 100% pass.
        - **Frontend Validation (`register/page.tsx`)**: Regex & batas panjang real-time sebelum request.
        - **Deployment**: Live di Fly.io production — health check `{"status":"ok"}` selesai.

- **🎯 Next Milestone:**
  1. [x] **Milestone 8.2: Group Chat Engine & Member Management** — Percakapan multi-user, role Admin/Member, multicast WebSocket broadcast, unread count per-anggota, dan Bad Words Sensor Filter.
  2. [x] **Milestone 8.3: Message Management Suite** — Edit pesan (15 menit), forward pesan, pin chat & pin message, starred message, dan in-chat search.
  3. [ ] *(Opsional Future)* Android Native App untuk akses kamera native penuh (Live QR Scanner tanpa batasan WebAPK permissions).


---

## 📂 Struktur File Utama Proyek

```text
wuzz-chat/
├── docs/
│   ├── ROADMAP.md                  -> Master Roadmap Fase 1 s/d 7
│   ├── ARCHITECTURE.md             -> Desain database (ERD), WS protocol, & REST API
│   ├── SECURITY_AND_PERFORMANCE.md -> Dokumentasi lengkap arsitektur keamanan & performa
│   └── PROGRESS.md                 -> Dokumen status pengerjaan ini
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
│   │   ├── avatarColor.ts  -> Modular Deterministic Soft Avatar Color Generator
│   │   ├── sound.ts        -> Web Audio API procedural sound synthesizer
│   │   ├── types.ts        -> TypeScript definitions
│   │   └── ws-client.ts    -> WebSocket abstraction
│   └── server.js           -> Custom Next.js server & proxy layer
└── README.md
```

---

## 🔮 Future Backlog — Catatan Teknis Pengembangan Mendatang

Bagian ini mencatat temuan arsitektur dan pekerjaan yang BELUM dikerjakan namun SUDAH dianalisa sehingga tidak perlu investigasi ulang saat waktunya tiba.

### 📌 [BACKLOG-1] User Verified Account — Milestone 9.1

**Tanggal Analisa & Implementasi**: 17 September 2026

**Status Engine**: ✅ **SELESAI DIIMPLEMENTASI SECARA END-TO-END (Core Engine Live)**

**Temuan & Detail Implementasi**:
- ✅ Backend `is_verified BOOLEAN` **sudah diimplementasi** di struct `User` Go (`user_store.go`) dan semua query SELECT (`GetUserByID`, `GetUserByUsername`, `GetUserByUsernameOrDisplayName`, `SearchUsers`)
- ✅ Backend `PeerIsVerified bool` (`peer_is_verified`) **sudah diimplementasi** di struct `ConversationItem` Go (`user_store.go`) dan query `GetUserConversations` (PostgreSQL & SQLite)
- ✅ Auto-migration `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false` sudah aktif di `sql.go`
- ✅ Frontend `is_verified?: boolean` dan `peer_is_verified?: boolean` terhubung di `frontend/lib/types.ts`
- ✅ Komponen `VerifiedBadge.tsx` terpasang dan live di seluruh touchpoint UI:
  - Sidebar daftar obrolan (`Sidebar.tsx`) membaca `peer_is_verified`
  - Header chat status bar (`StatusBar.tsx`) membaca `peerIsVerified`
  - Modal profil kontak lawan bicara (`ContactProfileModal.tsx`) membaca `is_verified`
  - Modal profil pengguna sendiri (`ProfileModal.tsx`) membaca `is_verified`
  - Chat state reducer (`page.tsx`) memelihara dan mendistribusikan `peerIsVerified`

**Pekerjaan Tersisa (Admin Tooling)**:
1. Buat endpoint admin: `PATCH /api/admin/users/:id/verify` → toggle `is_verified`
2. Buat tabel `admin_actions` untuk audit log setiap perubahan
3. Tentukan business logic kriteria verifikasi (pilihan: manual admin review / konfirmasi email domain / tier subscription)
4. Buat Admin Dashboard minimal untuk manajemen akun verified

**Estimasi Kompleksitas**: 🟡 Medium (backend 1-2 hari, frontend admin panel 1-2 hari)

---

### 📌 [BACKLOG-2] Avatar Premium Asset System — Milestone 9.2

**Tanggal Analisa**: 17 September 2026

**Temuan**:
- ✅ `users.avatar_url TEXT` sudah ada — ini tetap menjadi "slot aktif" yang dirender seluruh UI
- ❌ Tidak ada tabel `avatar_assets` / `user_avatar_inventory` — perlu dibuat dari nol
- ❌ Tidak ada sistem wallet / in-app currency — perlu desain terpisah
- ✅ Frontend `UserAvatar.tsx` sudah universal — tidak perlu diubah, tinggal mengisi `avatar_url` dari sistem baru

**Skema Tabel yang Perlu Dibuat (Migration)**:
```sql
-- Katalog avatar (dikelola admin)
CREATE TABLE avatar_assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    category    VARCHAR(50) NOT NULL,   -- 'emoji' | 'illustration' | 'animated'
    preview_url TEXT NOT NULL,
    asset_url   TEXT NOT NULL,
    price       INTEGER NOT NULL DEFAULT 0,  -- 0 = gratis
    is_free     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Inventory avatar per user
CREATE TABLE user_avatar_inventory (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_id    UUID NOT NULL REFERENCES avatar_assets(id),
    source      VARCHAR(20) NOT NULL DEFAULT 'purchased',  -- 'purchased' | 'gifted' | 'promo'
    acquired_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, asset_id)
);

-- Audit log aksi admin
CREATE TABLE admin_actions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id       UUID NOT NULL REFERENCES users(id),
    target_user_id UUID REFERENCES users(id),
    action         VARCHAR(50) NOT NULL,  -- 'verify' | 'unverify' | 'ban'
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT NOW()
);
```

**Endpoint REST yang Perlu Dibuat**:
| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/avatar/catalog` | Katalog + status `owned` user login |
| `GET` | `/api/avatar/inventory` | Daftar avatar milik user |
| `POST` | `/api/avatar/equip` | Aktifkan avatar dari inventory |
| `POST` | `/api/wallet/purchase/avatar` | Beli dengan in-app currency |
| `POST` | `/api/admin/avatar` | Upload avatar baru (admin) |
| `DELETE` | `/api/admin/avatar/:id` | Hapus dari katalog (admin) |

**Komponen Frontend yang Perlu Dibuat**:
- `AvatarMarketplace.tsx` — Grid katalog avatar premium
- `AvatarInventory.tsx` — Drawer koleksi milik user
- Integrasi ke `AvatarStudio.tsx` sebagai opsi ke-4: *"Koleksi Premium-ku"*

**Estimasi Kompleksitas**: 🔴 Tinggi (backend 3-5 hari, frontend 3-4 hari, payment/wallet design terpisah)

**Referensi Arsitektur**: Lihat [`docs/ARCHITECTURE.md#10-arsitektur-monetisasi--trust`](./ARCHITECTURE.md) untuk desain lengkap alur sistem.

---

### 📌 [MILESTONE] UUID-First Identity Architecture Migration (Full-Stack)

**Tanggal Implementasi**: 17 September 2026

**Status**: ✅ **SELESAI & DEPLOYED** (Live di Fly.io, Merged ke `main`)

**Latar Belakang & Motivasi**:
Sebelumnya, beberapa bagian sistem menggunakan `display_name` / `nickname` (string mutable) sebagai identifier untuk logika otorisasi, receipt tracking, dan ownership check. Ini menimbulkan risiko:
- User yang mengubah `display_name` akan menyebabkan riwayat chat dan receipt tracking salah identifikasi.
- Logika perbandingan berbasis string rentan terhadap edge case (case sensitivity, whitespace, dll.).
- Tidak ada jaminan immutability — dua user bisa berkolisi jika ada perubahan nama.

**Perubahan yang Diimplementasikan**:

**Backend**:
- `backend/internal/store/store.go`: Interface `MessageStore` diselaraskan:
  - `DeleteMessage(msgID, userID string, deleteForEveryone bool)`: Menghapus parameter `userNickname`. Validasi kepemilikan pesan untuk *Delete for Everyone* murni memverifikasi `msg.FromID == userID` (UUID).
  - `ToggleReaction(msgID, emoji, userID string)`: Parameter diganti menjadi `userID` (UUID). Reaksi emoji tersimpan dengan array UUID sehingga tidak pernah rusak jika user mengganti display name.
  - `MarkRoomMessagesAsRead(roomID, excludeUserID string)` & `MarkUserMessagesAsDelivered(userID string)`: Parameter murni UUID, query SQL memfilter menggunakan `from_id != ?`.
- `backend/internal/store/sql.go` & `memory.go`: Implementasi store mengadopsi interface UUID-first, menghilangkan klausa `LOWER(from_nickname)` dari SQL query, dan menambahkan guard `excludeUserID != ""` pada `MarkRoomMessagesAsRead`.
- `backend/internal/ws/client.go`:
  - `onReaction` meneruskan `c.ID` (UUID) ke `ToggleReaction`.
  - `onJoin` & `onReceipt` memanggil `MarkUserMessagesAsDelivered` dan `MarkRoomMessagesAsRead` menggunakan `c.ID` (UUID).
  - Siaran broadcast `delivered` receipt ke room lain saat user terhubung diproteksi guard `c.isAuthorizedForRoom(rID)` untuk mencegah kebocoran status ke room yang tidak sah.
- `backend/internal/api/chat_handler.go`: Endpoint `DeleteMessage` hanya meneruskan `claims.UserID` (UUID dari token JWT) tanpa passing `DisplayName`.
- `backend/internal/store/sql_test.go`: 4 skenario test `DeleteMessage` disesuaikan dengan signature baru (hanya UUID, tanpa DisplayName) — lulus 100%.

**Frontend**:
- `frontend/app/chat/page.tsx`: Peer discovery pada riwayat pesan room (`otherMsg`) diperbarui murni membandingkan `senderId !== myUserId` (UUID), menghapus seluruh fallback perbandingan teks `nickname`, `display_name`, dan `username`.
- `frontend/app/chat/MessageBubble.tsx`: `isSelf` logic memprioritaskan `msgSenderId === selfId` (UUID). `hasReacted` memprioritaskan kecocokan UUID `u === selfId`.
- `frontend/app/chat/Sidebar.tsx`: Tanda centang (`✓`/`✓✓`) di preview menggunakan `conv.last_sender_id === currentUser.id` (UUID).
- `frontend/app/chat/StatusBar.tsx`: `isPeerOnline` dan lookup peer menggunakan `peerUserId` (UUID).
- `frontend/app/chat/MemberListModal.tsx`: `isMe` check menggunakan `member.id === currentUser.id` (UUID).
- `frontend/lib/types.ts`: Interface `ConversationItem` diperkaya dengan field `last_sender_id?: string`.

**Efek Arsitektur**:
- Sistem kini **sepenuhnya tahan terhadap perubahan `display_name`** — riwayat chat, receipt tracking, dan ownership check tetap akurat.
- Tidak ada breaking change pada pesan-pesan lama — field `nickname`/`from_nickname` tetap ada sebagai display label, bukan identifier.
- **Anti-pattern** yang dibuang: `if (msg.from === user.nickname)` → **Pattern baru**: `if (msg.from === user.id)`

**Definition of Done (DoD) Checklist**:
- [x] Backend: `from_id` UUID sebagai primary identifier di semua query database
- [x] Backend: `c.ID` (UUID) di semua WebSocket event handling
- [x] Backend: `LastSenderID` di `ConversationItem`
- [x] Frontend: `isSelf` menggunakan UUID di `MessageBubble.tsx`
- [x] Frontend: `hasReacted` menggunakan UUID di `MessageBubble.tsx`
- [x] Frontend: `last_sender_id` di `Sidebar.tsx`
- [x] Frontend: UUID-based peer lookup di `StatusBar.tsx` & `page.tsx`
- [x] Frontend: UUID-based `isMe` di `MemberListModal.tsx`
- [x] Deployed ke Fly.io (backend live)
- [x] Merged `dev` → `main` → pushed ke GitHub
- [x] Dokumentasi diperbarui (ARCHITECTURE.md, BACKEND_API.md, SECURITY_AND_PERFORMANCE.md, PROGRESS.md, MOBILE_INTEGRATION_GUIDE.md)

---

### 🐛 Bugfix: Normalisasi Kontrak Payload Delete for Everyone (Frontend & Backend Sync)
**Tanggal**: 17 September 2026  
**Status**: ✅ **SELESAI & TERVERIFIKASI**

**Deskripsi Masalah**:
- Pengguna melaporkan bahwa saat menghapus pesan dengan opsi "Hapus untuk Semua Orang" (*Delete for Everyone*), teks pesan terhapus di layar pengirim (berubah jadi placeholder dihapus), namun lawan bicara masih dapat melihat teks pesan aslinya secara utuh.
- **Akar Masalah**:
  1. Frontend (`frontend/lib/api.ts`) mengirim body JSON `{ message_id, type: "for_everyone" }`.
  2. Backend Go (`backend/internal/api/chat_handler.go`) mencari struct field `DeleteForEveryone bool` (`json:"delete_for_everyone"`).
  3. Karena field `type` diabaikan oleh Go `json.Decoder`, nilai `DeleteForEveryone` selalu default `false`.
  4. Backend menganggap seluruh penghapusan sebagai *Delete for Me* (hanya menambahkan UUID pengirim ke `deleted_for_users` tanpa mengupdate kolom pesan atau memancarkan event WebSocket `message_deleted`).

**Solusi & Perbaikan**:
- **Backend (`backend/internal/api/chat_handler.go`)**: Memperluas parser request agar secara fleksibel membaca `type`, `delete_type`, `delete_for_everyone`, dan URL query parameters (`?for_everyone=true`).
- **Frontend (`frontend/lib/api.ts`)**: Memperbarui payload `deleteMessageApi` agar mengirimkan `delete_for_everyone: isForEveryone` sekaligus `type: deleteType` demi redundansi ganda (backward compatible dengan klien lama).
- **Automated Tests (`backend/internal/api/chat_handler_delete_test.go`)**: Menambahkan pengujian menyeluruh (4 skenario) untuk memverifikasi payload variasi format frontend, boolean, Delete for Me, dan proteksi otorisasi non-pengirim.

**Definition of Done (DoD) Checklist**:
- [x] Backend parser fleksibel: membaca `delete_for_everyone` (bool), `type` (string), `delete_type` (string), dan URL query `?for_everyone=true`
- [x] Frontend `deleteMessageApi` mengirim payload redundan ganda: `delete_for_everyone: true` + `type: "for_everyone"`
- [x] Backend broadcast event WebSocket `message_deleted` ke seluruh anggota room saat Delete for Everyone
- [x] Automated tests 4 skenario lulus 100% (`chat_handler_delete_test.go`)
- [x] Bug terverifikasi: lawan bicara sekarang menerima event `message_deleted` secara real-time
- [x] Deployed ke Fly.io production (`wuzz-chat-backend.fly.dev`) — Health check HTTP 200 OK
- [x] Merged `dev` → `main` → pushed ke GitHub remote

---

### 🚀 Milestone 8.2A: Core Group Chat Engine & Member Management (Subgroup-Ready, Public/Private, & E2EE-Ready)
**Tanggal**: 17 September 2026  
**Status**: ✅ **SELESAI & TERVERIFIKASI (Dev Branch)**  
**Branch Aktif**: `dev`

**Ringkasan Fitur & Perubahan Arsitektur**:
1. **Identitas & Skema Auto-Migration Database**:
   - Kolom baru pada tabel `conversations`: `title VARCHAR(255)`, `description TEXT`, `avatar_url TEXT`, `is_public BOOLEAN DEFAULT FALSE`, `group_username VARCHAR(64) DEFAULT NULL`, `parent_id VARCHAR(128) DEFAULT NULL`, `expires_at TIMESTAMP DEFAULT NULL`, `created_by VARCHAR(64) DEFAULT NULL`, `is_e2ee BOOLEAN DEFAULT FALSE`.
   - Kolom baru pada tabel `conversation_members`: `role VARCHAR(32) DEFAULT 'member'`.
   - Indeks performa baru: `idx_conv_parent`, `idx_conv_public`, `idx_conv_members_role`.
   - SQLite & PostgreSQL compatibility query: filter `WHERE (c.parent_id IS NULL OR c.parent_id = '')` pada `GetUserConversations` menjamin sub-grup masa depan tidak mengotori linimasa utama sidebar.
2. **Backend Group Store (`backend/internal/store/group_store.go`)**:
   - Transaksi database atomik (`*sql.Tx`): `CreateGroup`, `GetGroupDetails`, `GetGroupMembers`, `JoinPublicGroup`, `AddGroupMembers`, `RemoveGroupMember`, `UpdateMemberRole`, `UpdateGroupInfo`, `SearchPublicGroups`, `GetUserRoleInGroup`.
   - Unit test suite komprehensif (`group_store_test.go`) dengan SQLite in-memory: 100% lulus.
3. **Backend REST API (`backend/internal/api/group_handler.go`)**:
   - Endpoint terdaftar: `POST /api/groups`, `GET /api/groups/search`, `GET /api/groups/{id}`, `POST /api/groups/{id}/join`, `GET /api/groups/{id}/members`, `POST /api/groups/{id}/members`, `DELETE /api/groups/{id}/members/{userId}`, `PATCH /api/groups/{id}/members/{userId}/role`, `PATCH /api/groups/{id}`.
   - Unit test suite handler (`group_handler_test.go`): 100% lulus.
4. **Frontend Components**:
   - `CreateGroupModal.tsx`: Wizard 2 langkah pembuatan grup (Nama & toggle 🔒 Privat / 🌐 Publik + Pemilih anggota cerdas dengan tab Recent DM Contacts dan live user search via `/api/users/search`).
   - `GroupInfoDrawer.tsx`: Drawer profil grup, daftar anggota lengkap dengan badge role (`creator`, `admin`, `member`) dan centang biru verified, fitur promosi/demosi admin (hanya untuk creator), kick anggota, edit profil grup (creator/admin), dan leave group dengan konfirmasi aman.
   - `Sidebar.tsx`: Tombol "+ Grup" di header bar, integrasi pencarian grup publik pada filter global, render avatar grup (emoji / inisial).
   - `StatusBar.tsx`: Header chat dinamis mendukung grup (`groupDetails.title`), indikator `🔒 Wuzz Cloud` / `🌐 Grup Publik`, hitungan anggota, dan tombol aksi "Info Grup".
   - `MessageBubble.tsx`: Linimasa pesan grup dengan warna nickname deterministik unik per pengirim (`SENDER_COLORS`) ala WhatsApp / Telegram.
   - `page.tsx`: Pengambilan detail grup dinamis via `/api/groups/{id}`, bypass fail-closed pairwise ECDH crypto check untuk room grup, dan integrasi modal `GroupInfoDrawer`.

**Definition of Done (DoD) Checklist**:
- [x] Auto-migration database backend untuk kolom grup & peran anggota (`conversations` & `conversation_members`)
- [x] Indeks database `idx_conv_parent`, `idx_conv_public`, `idx_conv_members_role`
- [x] 9 REST Endpoints backend untuk grup diproteksi JWT & CORS
- [x] Automated tests backend: `go test -v ./...` 100% pass
- [x] Frontend build: `npm run build` 0 error (TypeScript & Turbopack)
- [x] Kompatibilitas Dual-Platform: Desktop split mode & Mobile single-screen mode
- [x] Proteksi slow/flaky server: `AbortController` 15 detik, disabled state tombol aksi, write-through offline cache
- [x] UI/UX Audit & Polish: Tampilan modal "+ Grup" (`CreateGroupModal.tsx`) dan "Info Grup" (`GroupInfoDrawer.tsx`) distandarisasi ke sistem desain Aurora Glassmorphic (fixed backdrop overlay `z-index: 1050`, modalScaleIn animation, dark form inputs, `.btn-secondary`, dan mobile bottom-sheet adaptation)
- [x] Dokumentasi Arsitektur Retensi Media Grup: Model Shared Media Hub berbasis TTL 7 hari di server (tanpa auto-delete saat first download ACK) dipadukan dengan auto-caching IndexedDB `wuzzchat_media_db` lokal
- [x] Dokumentasi Arsitektur Riwayat Pesan $O(\log N)$: Limitasi 50 pesan awal server via indeks komposit dipadukan dengan Cache-First load IndexedDB `wuzzchat_msg_db` dan rencana cursor pagination (Milestone 8.3)
- [x] Dokumentasi Semantik Tanda Terima Grup: Status `sent` / `delivered` ke room (pencegahan event storm tanpa tracking read per-anggota individu pada linimasa)

---

### 🚀 Milestone 8.2B: Ephemeral Sub-Groups & TTL Lifecycle Engine (Parent Gate, TTL Presets, AI Summary-Ready)
**Tanggal**: 18 September 2026  
**Status**: ✅ **SELESAI & TERVERIFIKASI (Dev Branch)**  
**Branch Aktif**: `dev`

**Ringkasan Fitur & Perubahan Arsitektur**:
1. **Identitas & Skema Auto-Migration Database**:
   - Kolom baru pada tabel `conversations`: `status VARCHAR(32) NOT NULL DEFAULT 'active'`, `ai_summary TEXT DEFAULT ''`.
   - Indeks komposit performa baru: `idx_subgroups_active ON conversations(parent_id, expires_at)`.
   - Identitas subgrup unik: Format `sub_<UUIDv4>` menjamin isolasi mutlak dari grup utama (`grp_<UUIDv4>`).
2. **Enforcement Identitas Immutable (DEC-008)**:
   - Seluruh logika otorisasi, relasi, perbandingan, dan filter di backend & frontend murni menggunakan variabel immutable (`user.id` / UUID, `conversation.id`, `parent_id`).
   - Tidak ada ketergantungan pada variabel mutable seperti `username`, `display_name`, atau nama grup.
3. **Parent-Membership Gate & RBAC Enforcement (Strict Fail-Closed)**:
   - Hanya Pembuat (`creator`) atau Admin (`admin`) grup induk yang dapat membuat topik forum baru (`handleCreateSubGroup` & `CreateSubGroup` -> HTTP 403 Forbidden bagi anggota biasa).
   - Bukan anggota grup induk tidak dapat melihat daftar subgrup (`handleGetSubGroups` -> HTTP 403 Forbidden).
   - Bukan anggota grup induk tidak dapat bergabung ke subgrup (`JoinSubGroup` -> HTTP 403 Forbidden).
   - Bukan anggota grup induk tidak dapat melihat detail subgrup (`GetGroupDetails` -> HTTP 403 Forbidden).
   - Bukan anggota grup induk tidak dapat mendengarkan WebSocket subgrup (`IsUserInConversation` -> fail-closed false).
4. **Preset Masa Aktif (TTL Presets)**:
   - Pilihan durasi terbatas hanya pada 1 minggu (`"7_days"`, default) dan 1 bulan (`"30_days"`).
5. **SubGroupTTLWorker (Background Go Daemon)**:
   - Worker Go non-blocking berkala dengan ticker 15 menit menjalankan `ExpireSubGroupsBatch` untuk mentransisikan subgrup kedaluwarsa ke status `'expired'`.
6. **Fail-Closed Write Gate & AI Summary Readiness**:
   - Subgrup yang kedaluwarsa dikunci menjadi *read-only*: WebSocket menolak pengiriman pesan baru (`sendError`) dan input textarea frontend di-disable.
   - Pesan dan riwayat subgrup tidak di-hard delete agar siap digunakan oleh worker AI Summarization di masa depan (`ai_summary`).
7. **Frontend Components & Dual-Platform Compatibility**:
   - `SubGroupListDrawer.tsx`: Drawer daftar topik aktif dengan hitungan mundur sisa waktu dinamis (`⏳ X hari lagi`), tombol gabung/buka, tombol buat topik yang di-hidden otomatis bagi anggota biasa, dan panel review izin bagi admin.
   - `CreateSubGroupModal.tsx`: Modal pembuatan subgrup bertema Aurora Glassmorphic dengan radio card preset durasi (1 minggu vs 1 bulan), validasi form, dan proteksi anti double-click.
   - `StatusBar.tsx`: Integrasi tombol `💬 Subgrup` pada grup utama, badge status subgrup, badge `Kedaluwarsa (Terkunci)`, dan tombol navigasi kembali `← [Nama Grup Utama]`.
   - `GroupInfoDrawer.tsx`: Tombol aksi `Lihat Topik & Subgrup Aktif`.

7. **Sub-Group Access Control Engine (Terbuka vs Privat)**:
   - Dukungan `is_public` boolean pada subgrup:
     - 🌐 **Terbuka**: Anggota grup induk dapat langsung bergabung secara mandiri (`Gabung & Buka`).
     - 🔒 **Privat**: Anggota grup induk harus mengajukan permohonan izin (`Minta Izin Gabung`) atau diundang oleh admin/creator.
   - **Tabel `conversation_join_requests`**: Skema relasional persisten mencatat antrean permohonan (`id`, `conversation_id`, `user_id`, `status`, `reviewed_by`, `created_at`, `updated_at`) dengan indeks komposit unik `(conversation_id, user_id)` untuk mencegah *duplicate requests*.
   - **Auto-Purge Kedaluwarsa**: Saat subgrup kedaluwarsa via `SubGroupTTLWorker` (`ExpireSubGroupsBatch`), seluruh data permohonan di `conversation_join_requests` langsung dihapus tuntas untuk menjaga kebersihan database.
   - **Panel Review Admin**: Admin/creator dapat melihat daftar permohonan pending via endpoint `GET /api/groups/{id}/join-requests` dan menyetujui/menolak via `POST /api/groups/{id}/join-requests/{requestId}/action`.
   - **Frontend Dynamic Action Buttons**: Kartu subgrup menampilkan badge 🌐 Terbuka vs 🔒 Privat, tombol `Gabung & Buka`, `🔒 Minta Izin Gabung`, `⏳ Menunggu Izin`, serta tombol `📋 Kelola Izin` bagi admin/creator.

**Definition of Done (DoD) Checklist**:
- [x] Auto-migration database: kolom `status`, `ai_summary`, composite index `idx_subgroups_active`, tabel `conversation_join_requests`, dan unique index `idx_join_requests_conv_user`
- [x] Parent-Membership Gate fail-closed di seluruh level (Store, REST API, WebSocket)
- [x] Endpoint REST baru:
  - `GET /api/groups/{id}/subgroups` (dengan `is_public` & `has_pending_request`)
  - `POST /api/groups/{id}/subgroups` (menerima `is_public`)
  - `POST /api/groups/{id}/join-request` (mengajukan izin bergabung)
  - `GET /api/groups/{id}/join-requests` (daftar permohonan pending)
  - `POST /api/groups/{id}/join-requests/{requestId}/action` (approve/reject izin)
- [x] Handler `POST /api/groups/{id}/join` memvalidasi `is_public` (subgrup privat tolak direct join)
- [x] Background Daemon `SubGroupTTLWorker` mengeksekusi `ExpireSubGroupsBatch` + auto-purge `conversation_join_requests`
- [x] Read-only lock saat subgrup kedaluwarsa di backend (WS gate) dan frontend (UI input disable)
- [x] Dual-platform compatibility: Desktop 2-column & Mobile single-screen flow
- [x] Proteksi Slow/Flaky Server: AbortController 15s, disabled state on submit
- [x] Automated tests: `go test ./...` 100% lulus (termasuk `TestSubGroup_AccessControlAndJoinRequests` dan auto-purge)
- [x] Frontend build: `npm run build` lulus 0 error

---

### 🎨 Milestone 8.2C: Forum & Topik Diskusi Rebranding & Mobile Header Redesign
**Tanggal**: 18 September 2026  
**Status**: ✅ **SELESAI & TERVERIFIKASI (Dev Branch)**  
**Branch Aktif**: `dev`

**Ringkasan Fitur & Perubahan UX**:
1. **Rebranding Resmi Menjadi "Forum & Topik Diskusi"**:
   - Istilah "Subgrup" resmi ditingkatkan menjadi **"Forum"** (mengikuti standar Telegram Forums & Topics) untuk memberikan kesan yang lebih terorganisir, profesional, dan berkelas.
   - Tombol pada grup induk: `🏛️ Forum` (selalu tampak di luar untuk akses 1-tap instan).
   - Panel Drawer: `🏛️ Forum & Topik Diskusi` dengan tombol `➕ Buat Topik Forum Baru`.
   - Modal Pembuatan: `Buat Topik Forum Baru` dengan pilihan durasi aktif dan hak akses 🌐 Terbuka vs 🔒 Privat.
2. **Redesain Total Header Obrolan (Spacious & Clean)**:
   - **Breadcrumb Interaktif di Subtitle**: Menghilangkan tombol melayang `← [Nama Parent]` di atas judul. Parent group dipindahkan ke subtitle obrolan: `[↖ Bacot Rumpi] • Forum • 4 anggota` yang dapat diklik untuk melompat kembali ke grup utama.
   - **Ruang Judul Lapang (3x Lebih Lebar)**: Nama topik obrolan kini memiliki ruang horizontal penuh tanpa terpotong konyol seperti `Khus...`.
   - **Collapsible Action Menu (Tombol Titik Tiga `⋮`)**: Di layar mobile, icon-icon aksi sekunder (`Info`, `Link`, `Sound`, `Call`, `E2EE`) dilipat rapi di dalam tombol `⋮` dan meluncur keluar dengan animasi halus saat ditekan, dilengkapi auto-close pada pemilihan aksi atau klik di luar.
3. **Navigasi Back Mobile yang Cerdas**:
   - Di tampilan mobile saat berada di dalam topik forum, tombol `←` otomatis kembali ke grup induk (jika masuk dari grup utama).
4. **Verifikasi Build**:
   - `npm run build` sukses 100% tanpa error TypeScript maupun CSS.

---

### 🔔 Milestone 8.5: Group & Subgroup Multi-User Mention Engine (@username)
**Tanggal**: 18 September 2026  
**Status**: ✅ **SELESAI & TERVERIFIKASI (Dev Branch)**  
**Branch Aktif**: `dev`

**Ringkasan Fitur & Keputusan Arsitektur**:
1. **Isolasi Keanggotaan Ketat (Group vs Forum Subgroup Scope)**:
   - Autocomplete dan mention di grup utama (`grp_<UUID>`) hanya mengizinkan anggota grup tersebut.
   - Di subgrup/forum (`sub_<UUID>`), hanya anggota yang telah bergabung ke subgrup tersebut yang dapat di-mention.
2. **Standardisasi Data Kekal Murni (DEC-013: 100% Immutable Identifiers)**:
   - Seluruh logika bisnis, otorisasi, filtering, targeting Web Push, dan persistensi database mutlak menggunakan UUID (`user.id` dan `room_id`).
   - Tidak ada logika yang menggunakan atribut yang dapat berubah seperti `username`, `display_name`, atau nama grup.
   - Kolom database: `messages.mentions TEXT DEFAULT '[]'` menyimpan array JSON UUID pengguna ter-mention (`["<UUID1>", "<UUID2>"]`).
3. **Komponen Autocomplete Aurora Glassmorphism (`MessageInput.tsx`)**:
   - Deteksi `@` realtime dengan pelacakan kursor.
   - Popover mengambang dengan filter nama/username, avatar, verified badge, role, dan navigasi keyboard lengkap (ArrowUp/Down/Enter/Tab/Esc) serta tap mobile (min 44px).
4. **Highlight Interaktif Linimasa (`MessageBubble.tsx`)**:
   - Token `@username` dirender sebagai `.mention-tag`.
   - Token yang menunjuk pada user sendiri di-highlight khusus dengan aksen `.mention-tag-self` dan bubble pesan bergaris tepi cyan `message-bubble-mentioned` berdasarkan pencocokan immutable `user_id === selfId`.
5. **Validasi Fail-Closed WebSocket Hub (`hub.go`)**:
   - Server Go WebSocket memeriksa setiap UUID pada `msg.Mentions` menggunakan `IsUserInConversation(roomID, mUID)`. Jika user bukan anggota sah, ID di-drop sebelum persistensi dan broadcast.
6. **Prioritized Web Push Notifications (`push.go`)**:
   - Penerima offline yang tercantum pada `mentions` menerima push notification prioritas bertag `chat-mention-[roomID]` dengan judul `🔔 [Pengirim] menyebut Anda`.
7. **Verifikasi Kualitas**:
   - Backend: `go test -count=1 ./...` lulus 100% di semua paket.
   - Frontend: `npm run build` lulus 0 error.

---

### 🛡️ RBAC Hardening: Restriksi Pembuatan Forum/Subgrup Hanya untuk Admin & Pembuat (DEC-011)

**Tanggal**: 18 September 2026  
**Status**: ✅ **SELESAI & TERVERIFIKASI (Dev Branch)**  
**Branch Aktif**: `dev`

**Ringkasan Perbaikan & Proteksi**:
1. **Pencegahan Topic Flooding & Spamming**:
   - Menutup celah otorisasi di mana anggota biasa (`member`) sebelumnya dapat membuat ruang topik forum baru.
2. **Backend Enforcement (Fail-Closed)**:
   - `backend/internal/store/group_store.go` (`CreateSubGroup`): Validasi role creator via `GetUserRoleInGroup`. Menolak peran selain `creator` dan `admin` dengan `ErrUnauthorizedGroup`.
   - `backend/internal/api/group_handler.go` (`handleCreateSubGroup`): Menolak pemanggilan pembuatan subgrup oleh anggota biasa dengan status `HTTP 403 Forbidden` (`"Akses ditolak: Hanya admin atau pembuat grup yang dapat membuat topik forum"`).
3. **Frontend UI Hidden & Anti-False Affordance**:
   - `frontend/app/chat/SubGroupListDrawer.tsx`: Tombol `➕ Buat Topik Forum Baru` di-hidden secara otomatis untuk pengguna dengan peran selain `creator` atau `admin`.
   - Pesan ramah ditampilkan jika daftar forum kosong (*"Belum ada ruang diskusi aktif. Hanya admin atau pembuat grup yang dapat membuat topik forum baru"*).
4. **Propagasi Role Akurat (`page.tsx`)**:
   - Menyimpan `parentGroupRole` saat membuka subgrup agar hak akses drawer forum tetap terkalibrasi akurat dari grup induk.
5. **Verifikasi Test Suite**:
   - Backend: Unit test `subgroup_test.go` & `group_handler_test.go` menguji penolakan `403` bagi anggota biasa dan kelulusan bagi admin (100% PASS).
   - Frontend: `npm run build` lulus 0 error.

---

### 🌐 Public Group Preview & Explicit Confirmation Modal (DEC-012)

**Tanggal**: 18 September 2026  
**Status**: ✅ **SELESAI & TERVERIFIKASI (Dev Branch)**  
**Branch Aktif**: `dev`

**Ringkasan Perbaikan & UX Hardening**:
1. **Eliminasi Auto-Join Instan**:
   - Menghilangkan perilaku *accidental auto-join* saat baris grup publik diklik pada hasil pencarian Sidebar. Pengguna kini disajikan pratinjau lengkap profil grup terlebih dahulu sebelum memutuskan bergabung.
2. **Komponen Pratinjau Interaktif (`GroupPreviewModal.tsx`)**:
   - Menampilkan Hero card bertema Aurora Glassmorphism: Avatar besar, judul grup, lencana 🌐 Grup Publik, handle `@group_username`, jumlah anggota, dan deskripsi grup lengkap.
   - Dilengkapi dua aksi: Tombol "Batal" dan "Gabung ke Grup" dengan indikator loading spinner dan penonaktifan tombol (*disabled state*) untuk mencegah *double-click race condition*.
3. **Ketahanan Jaringan (Slow/Flaky Network Resilience)**:
   - Pemanggilan `POST /api/groups/${id}/join` dibungkus dengan `AbortController` (batas waktu 15 detik) dan penanganan pesan error yang ramah.
4. **Dukungan Direct URL Navigation (`page.tsx`)**:
   - Pengguna yang membuka tautan grup publik langsung via URL query param (`/chat?room=grp_...`) saat belum menjadi anggota akan otomatis disajikan modal pratinjau konfirmasi sebelum ruang percakapan WebSocket aktif.
5. **Verifikasi Kualitas**:
   - Frontend: `npm run build` lulus 0 error (Turbopack, TypeScript 100% type-safe).
   - Backend: `go test -v ./...` lulus 100% di semua paket.

---

### 🔒 Private Group Direct Link Gate & Authorization Shield (DEC-013)

**Tanggal**: 18 September 2026  
**Status**: ✅ **SELESAI & TERVERIFIKASI (Dev Branch)**  
**Branch Aktif**: `dev`

**Ringkasan Masalah & Root Cause**:
1. **Masalah UX & Otorisasi**: Ketika tautan grup privat (`/chat?room=grp_xxx`) dibagikan dan dibuka oleh pengguna yang bukan anggota grup:
   - Halaman `/chat` langsung merender layar ruang obrolan kosong secara optimistik.
   - WebSocket client mengirim `{ type: "join", room: "grp_xxx" }` yang ditolak backend (BOLA protection).
   - Timer 7.5 detik timeout riwayat pesan terpicu, memunculkan kartu *"📡 Koneksi Sedang Terhambat"* seolah-olah terjadi masalah koneksi internet server.
   - Status bar menampilkan info palsu *"Grup 🔒 • 0 anggota"* dan input bar pesan tetap terbuka.
2. **Root Cause**: Inisialisasi optimistik `selectedRoomId` dari parameter URL `searchParams.get('room')` terjadi sebelum verifikasi keanggotaan grup HTTP selesai. Ketika `GET /api/groups/{id}` mengembalikan `HTTP 403 Forbidden` (`"Akses ditolak: Anda bukan anggota grup ini"`), kode lama hanya menampilkan `alert()` browser yang rentan terblokir, sementara timer riwayat terus berjalan.

**Solusi & Implementasi**:
1. **State Otorisasi Eksplisit (`privateGroupDenied`)**:
   - Menambahkan state `privateGroupDenied: { id: string; error?: string } | null` di `frontend/app/chat/page.tsx`.
   - Di-reset secara bersih saat pengguna berpindah room atau memilih obrolan lain.
2. **Penanganan HTTP 403 pada `fetchGroupDetails`**:
   - Ketika `res.status === 403` atau body response memuat pesan akses ditolak untuk room grup (`grp_`) maupun subgrup (`sub_`), set state `privateGroupDenied({ id: targetRoomId, error })`.
   - Batalkan timer timeout riwayat (`clearTimeout(historyTimeoutRef.current)`) dan set `isLoadingHistory(false)`, `setIsHistoryError(false)`.
3. **WebSocket Join Guard**:
   - Pada `useEffect` pergantian room: jika `privateGroupDenied?.id === roomId`, hentikan pengiriman `{ type: "join" }` ke server dan jangan jalankan timeout riwayat.
4. **Aurora Glassmorphism Authorization Shield UI**:
   - Jika `privateGroupDenied?.id === selectedRoomId`, gantikan seluruh tampilan linimasa obrolan (termasuk StatusBar, ChatWindow, dan MessageInput) dengan kartu proteksi otorisasi bertema Aurora Glassmorphic:
     - Ikon gembok 🔒 besar beraksen pendaran merah/merah-muda.
     - Judul: *"Grup Ini Bersifat Privat"*.
     - Deskripsi: *"Anda tidak dapat mengakses atau melihat pesan di dalam grup ini karena Anda bukan anggota. Hubungi admin atau pembuat grup untuk menambahkan akun Anda."*.
     - Tombol aksi utama: *"← Kembali ke Beranda Obrolan"* yang memanggil `handleSelectRoom('')` dan membersihkan query parameter URL via `router.replace('/chat')`.
5. **Verifikasi Kualitas**:
   - Frontend: `npm run build` lulus 0 error (Turbopack, TypeScript 100% type-safe).
   - Backend: `go test -v ./...` lulus 100% di semua paket.

---

### 🚀 Milestone 8.8: Realtime Engine Scalability & High-ROI Optimizations

**Tanggal**: 19 September 2026  
**Status**: ✅ **SELESAI & TERVERIFIKASI (Dev Branch)**  
**Branch Aktif**: `dev`

**Ringkasan Masalah & Bottleneck yang Diselesaikan**:
1. **$O(N)$ Fanout & Query SQL Berulang di Hub**:
   - `broadcastLocal` di `Hub` Go sebelumnya mengeksekusi query database `GetConversationMemberUsernames` dan melakukan scan linier ke seluruh koneksi aktif (`h.clients`) untuk setiap pesan masuk.
   - Solusi: Menerapkan `roomMembersCache map[string][]string` dengan lock RWMutex di `Hub`, dan mengubah algoritma broadcast menjadi direct lookup $O(M)$ berdasarkan daftar ID member. Cache di-invalidation otomatis saat event keanggotaan grup berubah.
2. **Flood Typing DoS Vulnerability**:
   - Handler `onTyping` tidak memiliki pembatasan laju, memungkinkan spam frame WebSocket yang membebani CPU server.
   - Solusi: Menerapkan sliding-window rate limiter (maks 3 event per 2 detik per koneksi) di `onTyping()`.
3. **Overhead Sinkronisasi Riwayat Pesan**:
   - Saat pengguna reconnect, server selalu mengirim ulang 50 pesan penuh meskipun sebagian besar sudah ada di IndexedDB klien.
   - Solusi: Menambahkan query checkpoint `GetRoomHistorySince(roomID, userID, since, limit)` di database layer (`store/sql.go` & `store/memory.go`), serta menyertakan `since` timestamp dari IndexedDB lokal saat klien mengirim event `join`.
4. **Hilangnya Pesan Klien saat Jaringan Labil**:
   - Klien web/PWA sebelumnya langsung membuang pesan jika socket belum dalam state `OPEN`.
   - Solusi: Menambahkan FIFO `outboundQueue` (maks 100 pesan) di `frontend/lib/ws-client.ts` yang menahan pesan saat socket terputus dan mem-flush otomatis seketika saat `onopen` terpicu.

**Verifikasi & Test Suite**:
- Backend: Unit test `scalability_optimizations_test.go` (`TestHub_DirectMemberLookupO_M`, `TestClient_TypingRateLimit`, `TestHub_DeltaHistorySince`) — **100% PASS**.
- `go test -v ./...` di seluruh direktori `backend/` — **100% PASS**.
- Frontend: `npm run build` di direktori `frontend/` — **100% PASS (0 error, 0 warning)**.

---

### 🛡️ Milestone 8.9: Mobile-Ready Reliability (Request ID + ACK Protocol & Server-Side In-Memory Idempotency)

**Tanggal**: 19 September 2026  
**Status**: ✅ **SELESAI & TERVERIFIKASI (Dev Branch)**  
**Branch Aktif**: `dev`

**Ringkasan Masalah & Solusi Arsitektur**:
1. **Transport Delivery Uncertainty**:
   - Sebelumnya, pengiriman pesan hanya mengandalkan respon `TypeReceipt` (yang mencerminkan apakah peer sedang online), bukan transport acknowledgment bahwa payload telah divalidasi dan di-commit di database.
   - Solusi: Menambahkan konstanta `TypeAck = "ack"` dan field `RequestID string` pada struct `ws.Message`. Setiap pesan masuk yang memiliki `request_id` langsung dibalas secara deterministik dengan paket transport `{ type: "ack", request_id: "...", status: "ok" }`.
2. **Duplicate Broadcast saat Mobile Reconnect**:
   - `outboundQueue` klien melakukan retransmission otomatis saat reconnect. Jika soket terputus setelah server memproses pesan namun sebelum klien menerima broadcast balik, pengiriman ulang memicu server membroadcast pesan yang sama dua kali ke anggota room.
   - Solusi: Mengimplementasikan **Server-Side Idempotency Guard (DEC-015)** di `Hub` Go menggunakan in-memory cache `dedupHistory` dengan presisi `UnixNano()` dan TTL 2 menit. Jika `msg.ID` terdeteksi duplikat, server membatalkan broadcast ganda dan publish Redis, namun langsung mengirimkan ACK kembali ke pengirim.
3. **Pemberhentian Blind Pop di Client Outbound Queue**:
   - `WsClient.ts` sebelumnya melakukan `shift()` langsung saat flush `onopen`.
   - Solusi: Pesan durable dipertahankan di antrean dan hanya di-pop jika event `ack` atau `receipt` yang cocok diterima dari server, menjamin *at-least-once delivery* pada jaringan seluler tidak stabil.

**Verifikasi & Test Suite**:
- Backend: Unit test `ack_idempotency_test.go` (`TestClient_MessageAckDispatch`, `TestHub_ServerSideIdempotency`, `TestHub_IdempotencyTTL`) — **100% PASS**.
- `go test -v ./...` di seluruh modul backend — **100% PASS**.
- Frontend: `npm run build` — **100% PASS (0 error, 0 warning)**.

---

### 💬 Milestone 8.3: Message Management Suite (Edit, Forward, Pin Chat, Pin Message, In-Chat Search)

**Tanggal**: 19 September 2026  
**Status**: ✅ **SELESAI & TERVERIFIKASI (Dev Branch)**  
**Branch Aktif**: `dev`

**Ringkasan Fitur & Arsitektur yang Diimplementasikan**:
1. **Sub-8.3.A: Edit Pesan (Window 15 Menit)**:
   - REST API `PUT /api/messages/edit` dengan body `{"message_id": "...", "content": "..."}`.
   - Otorisasi ketat UUID: hanya pengirim asli (`from_id == user.id`) yang berhak mengedit.
   - Window 15 menit ditegakkan di backend (`time.Since(CreatedAt) > 15*time.Minute` mengembalikan HTTP 400).
   - Penolakan pesan ditarik (`is_deleted` = true).
   - Kolom `is_edited BOOLEAN DEFAULT false` dan `edited_at TIMESTAMP` pada tabel `messages` dengan auto-migration SQLite/Postgres.
   - Real-time event WebSocket `type: "message_edited"` disiarkan ke seluruh anggota room dan diteruskan ke Redis pub/sub.
   - Frontend inline editing di `MessageInput.tsx` dengan preview tombol Batal/Simpan, penyesuaian cache lokal `messageCache.ts`, dan label visual `(diedit)` di `MessageBubble.tsx`.
2. **Sub-8.3.B: Forward Pesan (Multi-Kontak 1–5 Target)**:
   - REST API `POST /api/messages/forward` dengan body `{"message_id": "...", "target_room_ids": [...]}`.
   - Validasi batas 1 s/d 5 room tujuan sekaligus.
   - Validasi BOLA per room: pengguna wajib merupakan anggota di setiap target room (HTTP 403 jika melanggar).
   - Penandaan kekal `is_forwarded: true` pada pesan hasil forward di database dan cache.
   - Siaran real-time via WebSocket Hub ke masing-masing target room.
   - Komponen modal interaktif `ForwardMessageModal.tsx` bertema Aurora Glassmorphic dengan filter pencarian kontak/grup dan counter target.
   - Lencana visual `↪ Diteruskan` di bagian atas bubble pesan.
3. **Sub-8.3.C: Pin Chat (Sidebar Per-User)**:
   - Kolom `is_pinned BOOLEAN DEFAULT false` dan `pinned_at TIMESTAMP` pada tabel `conversation_members`.
   - Terisolasi penuh per user: menyematkan chat tidak mempengaruhi urutan obrolan user lain di room yang sama.
   - REST API `POST /api/conversations/pin` dan `POST /api/conversations/unpin`.
   - Query `GetUserConversations` mengurutkan percakapan dengan prioritas: `ORDER BY is_pinned DESC, last_message_time DESC`.
   - Lencana pin 📌 di `Sidebar.tsx`, menu konteks desktop, dan aksi pin/unpin instan.
4. **Sub-8.3.D: Pin Message (Dalam Chat / Room Pinned Messages)**:
   - Tabel relasional `pinned_messages` (`id`, `conversation_id`, `message_id`, `pinned_by`, `created_at`) dengan composite index `idx_pinned_messages_conv(conversation_id, created_at)`.
   - Batas maksimal 3 pin per room ditegakkan secara FIFO otomatis di backend: saat pesan ke-4 disematkan, pesan terlama otomatis dilepas.
   - Proteksi integritas: pesan yang terhapus (`is_deleted = true`) ditolak untuk disematkan (HTTP 400).
   - Sinkronisasi penarikan pesan: saat pesan ditarik for everyone, backend otomatis menghapus sematan dari `pinned_messages`.
   - REST API: `POST /api/messages/pin`, `POST /api/messages/unpin`, `GET /api/messages/pinned?conversation_id=...`.
   - WebSocket event: `message_pinned` dan `message_unpinned` real-time broadcast ke room.
   - Banner interaktif `PinnedMessageBanner.tsx` dengan carousel navigasi multi-pin (1/3, 2/3), tombol unpin, dan aksi klik lompat (*jump-to-message*) dengan animasi pendaran emas `.msg-highlight-glow`.
5. **Sub-8.3.E: In-Chat Text Search**:
   - REST API `GET /api/messages/search?conversation_id=...&q=...`.
   - Mesin pencarian case-insensitive substring match di database store (`SearchMessages`).
   - Privasi mutlak: menghormati timestamp `cleared_at` milik pengguna agar riwayat yang sudah dibersihkan tidak bocor dalam hasil pencarian.
   - Mengecualikan pesan ditarik (`is_deleted = false`).
   - Integrasi search bar elegan di `StatusBar.tsx` dengan badge penghitung temuan (misal: "2 / 5"), tombol navigasi Atas/Bawah (ArrowUp/ArrowDown), shortcut Escape untuk menutup, dan otomatis scroll-into-view dengan animasi highlight biru pendar `.msg-search-highlight`.
6. **Security & Performance Audit**:
   - Analisis STRIDE menyeluruh lulus 100%.
   - Proteksi BOLA/IDOR pada seluruh endpoint pin, unpin, forward, edit, search.
   - Indeks database komposit mencegah full table scan saat query pinned messages dan search.

7. **Post-Release Hotfix — Forward Message Long Room ID (Postgres VARCHAR(64) Value Too Long)**:
   - Root cause: ID room Direct Message (`dm_<uuid1>_<uuid2>`) memiliki panjang 76 karakter. Pada fungsi `ForwardMessage`, field `ToID` secara keliru diisi dengan `targetRoomID` (76 karakter) sehingga ditolak oleh Postgres Supabase dengan error `pq: value too long for type character varying(64) (22001)`.
   - Solusi: Koreksi `ToID: ""` pada `ForwardMessage` (`sql.go` & `memory.go`) serta pelebaran kolom `to_id VARCHAR(128)` via auto-migration PostgreSQL. Skenario uji coba `Forward ke direct room dengan ID panjang > 64 karakter` ditambahkan ke `chat_handler_forward_test.go` (100% PASS).

**Verifikasi & Test Evidence**:
- Backend: `go test -count=1 ./...` — **100% PASS** (termasuk 8 skenario forward di `chat_handler_forward_test.go`).
- Frontend: `npm run build` di `frontend/` — **100% PASS** (0 TypeScript/ESLint error).


---

## Milestone 8.4 — Message Context Menu UI/UX Redesign (Discord-Style)
**Tanggal**: 2026-09-19
**Branch**: `dev`

### Latar Belakang
Floating hover toolbar (`bubble-action-bar`) yang menampilkan semua ikon sekaligus (emoji + reply + forward + pin + delete) dinilai terlalu padat dan tidak premium. Dilakukan redesign lengkap mengikuti pola Discord (Opsi B).

### Perubahan Implementasi

1. **Komponen Baru: `MessageContextMenu.tsx`**:
   - Di-render via `createPortal` langsung ke `document.body` agar tidak terpotong oleh `overflow: hidden` parent.
   - **Desktop**: right-click pada bubble → dropdown context menu muncul tepat di posisi kursor dengan auto-clamp ke viewport edge.
   - **Mobile**: long press 500ms → bottom sheet slide dari bawah dengan backdrop blur + safe-area-inset padding.
   - Deteksi platform via `window.matchMedia('(pointer: coarse)')`.
   - Proteksi scroll guard: `touchMovedRef` mencegah long press terpicu saat user scroll.

2. **Modifikasi `MessageBubble.tsx`**:
   - Dihapus: seluruh blok JSX `bubble-action-bar` (floating hover toolbar lama).
   - Ditambah: `onContextMenu` handler (right-click desktop) dan `onTouchStart` / `onTouchEnd` / `onTouchMove` handlers (long press mobile).
   - State baru: `contextMenu: { x, y } | null`, `longPressTimerRef`, `longPressFiredRef`, `touchMovedRef`.

3. **Modifikasi `globals.css`**:
   - Dihapus: `.bubble-action-bar`, `.quick-emoji-list`, `.quick-emoji-btn`, `.bubble-action-btn` (semua style toolbar lama).
   - Ditambah: sistem CSS `.ctx-*` — desktop dropdown dengan animasi `ctxFadeIn` (scale + opacity), mobile bottom sheet dengan animasi `ctxSheetUp` (translateY spring), emoji row dengan spring scale animation, separator, action items dengan `ctx-item--danger` (merah) untuk Hapus.

4. **Fitur Context Menu**:
   - Emoji reaction row: 👍❤️😂😮😢🙏 — dengan highlight `ctx-emoji-btn--active` jika user sudah bereaksi.
   - Aksi: Balas, Edit (jika dalam 15 menit), Teruskan, Sematkan/Lepas Sematan.
   - Hapus (warna merah, terpisah oleh separator — destruktif visual cue).

**Verifikasi & Test Evidence**:
- Frontend: `npm run build` di `frontend/` — **✓ Compiled successfully** (0 TypeScript error, 0 ESLint error).
- Backend: tidak ada perubahan kode backend pada milestone ini.

---

## Milestone 8.5 — Bugfix: Forward Message E2EE Cross-Room "Pesan Terenkripsi"
**Tanggal**: 2026-09-19
**Branch**: `dev` → `main`
**Commit**: `24d2d90`
**Deploy**: Fly.io `wuzz-chat-backend.fly.dev` ✅

### Latar Belakang & Root Cause
Pesan yang di-forward dari DM E2EE ke DM E2EE yang **berbeda** sering muncul sebagai "🔒 [Pesan Terenkripsi]" di kedua sisi (pengirim dan penerima).

**Root cause**: `ForwardMessage` backend menyalin `srcMsg.Content` dari database ke room tujuan. Namun `srcMsg.Content` adalah ciphertext E2EE dengan format `e2ee:v1:<iv>:<ciphertext>` yang di-enkripsi menggunakan **kunci AES room asal** (ECDH+HKDF dengan `roomSalt = room_id`). Ketika penerima mencoba mendekripsi dengan kunci AES **room tujuan** (berbeda), GCM authentication tag mismatch → dekripsi gagal → tampil "🔒 [Pesan Terenkripsi]".

**Intermittent** karena hanya terjadi pada skenario: forward teks dari DM E2EE → DM E2EE berbeda. Forward media, forward dari grup, atau forward ke room yang sama tetap berjalan normal.

### Solusi: `plaintext_content` Override

Frontend mengirim `plaintext_content` (teks yang sudah ter-decrypt di UI, diambil dari `forwardingMessage.content`) bersama request `POST /api/messages/forward`. Backend menggunakan plaintext ini sebagai konten pesan terusan, menggantikan `srcMsg.Content` dari DB.

### Perubahan File

1. **`backend/internal/store/store.go`**: Update interface `MessageStore.ForwardMessage` — tambah parameter `plaintextContent string`.
2. **`backend/internal/store/sql.go`**: `ForwardMessage` — hitung `forwardContent = plaintextContent` jika non-empty, fallback ke `srcMsg.Content`.
3. **`backend/internal/store/memory.go`**: Idem dengan sql.go.
4. **`backend/internal/api/chat_handler.go`**: Tambah field `PlaintextContent string` di request struct, teruskan ke store layer.
5. **`frontend/app/chat/page.tsx`**: `handleForwardMessage` — kirim `plaintext_content: forwardingMessage?.content` di POST body.
6. **`backend/internal/api/chat_handler_forward_test.go`**: Regression test baru *"Forward dengan plaintext_content override menggantikan ciphertext E2EE"* — assertion bahwa content pesan terusan adalah plaintext, bukan ciphertext room asal.

**Verifikasi & Test Evidence**:
- Backend: `go test -count=1 ./...` — **9/9 PASS** (semua skenario forward termasuk regression test E2EE baru).
- Frontend: `npm run build` — **✓ Compiled successfully** (0 TypeScript/ESLint error).
- Fly.io Health Check: `GET /health` → **HTTP/2 200 OK**.

---

## Milestone 8.6 — Design Debt Batch Fix #1: 112 Hex → Design Token
**Tanggal**: 2026-09-19
**Branch**: `feature/design-token-codemod` → `dev` → `main` → `origin/main`
**Commit**: `8693581` (merge `57ed585` ke dev, `1414a99` ke main)

### Latar Belakang
Audit design-debt via plugin Qoder **Design Review** (skill `design-debt-review`; artefak di `frontend/.design-qa/reports/design-debt.md`) menemukan 1000+ temuan; prioritas teratas: hex literal yang menduplikasi nilai token `:root` di 15 file.

### Perubahan Implementasi
- Codemod `hex → var(--token)` — hanya nilai yang PERSIS sama dengan token `:root` (peta divalidasi otomatis): **112 penggantian** (107 otomatis + 5 ternary multi-baris manual + 10 cleanup fallback `var()` redundan).
- Pengecualian konteks non-CSS: `themeColor` meta viewport, atribut SVG `stopColor`/`stroke`, opsi QR library, array `SENDER_COLORS`, `lib/avatarColor.ts`.

**Verifikasi & Test Evidence**:
- Frontend: `npm run build` — **✓ Compiled successfully** (0 TypeScript error).
- Backend: tidak ada perubahan kode backend.
- Render ekuivalen: fingerprint computed-styles **identik** sebelum/sesudah di `/` dan `/login`; screenshot login identik.
- Temuan sampingan: 6 token `var()` dangling pre-existing (`--border-focus`, `--bg-input`, `--bg-surface-hover`, `--transition-normal`, `--shadow-lg`, `--color-success`).

---

## Milestone 8.7 — Design Debt Batch Fix #2+#6: Standarisasi Warna Status + Hapus CSS Mati
**Tanggal**: 2026-09-19
**Branch**: `feature/design-debt-batch-6-2` (dipotong dari `dev`)
**Commit**: — *(menyusul pasca-merge; entri ditulis sebelum commit)*

### Latar Belakang
Warna status drift untuk peran semantik yang sama: merah error 5 nilai (`--color-error #f87171` vs `#ef4444/#dc2626/#fc8181/#fca5a5`), hijau sukses/online 3 nilai (`#34d399/#22c55e/#10b981`). Ditambah `app/page.module.css` (starter Next.js) yang mati (0 import) dan mendefinisikan tema terang yang berlawanan dengan design system dark-first. Keputusan semantik warna: lihat `docs/plans/active/DECISION_LOG.md` D-002.

### Perubahan File
1. **`frontend/app/globals.css`** — +3 token status di `:root` (`--color-success`, `--color-danger`, `--color-danger-strong`); 18 replacement sadar-properti (peran teks vs fill dibedakan); perbaikan fallback salah `var(--accent-500, #22c55e)`.
2. **`frontend/app/page.module.css`** — **dihapus** (150 baris dead code; batch #6).
3. **8 file TSX** (`DeviceTransferModal`, `ProfileModal`, `GroupInfoDrawer`, `CreateGroupModal`, `CreateSubGroupModal`, `GroupPreviewModal`, `SubGroupListDrawer`, `app/transfer/page.tsx`) — 14 replacement; perbaikan token dangling `var(--danger-color, #ef4444)` → `var(--color-error)`.
4. **`frontend/.design-qa/`** — codemod `codemod-status-colors.mjs` + laporan `codemod-batch2.json` + pembaruan laporan `design-debt.md` (total **32 replacement**).

**Verifikasi & Test Evidence**:
- Frontend: `npm run build` — **✓ Compiled successfully** (0 TypeScript error, 6 route static).
- Backend: `go test ./...` — **PASS** (8 paket ber-test ok; tidak ada perubahan kode backend).
- Browser (localhost:3047): 3 token baru resolve benar di computed styles; `varsMissing` 6 → 5; screenshot login normal.
- Sisa hex drift warna status di kode fitur: **0** (hanya definisi `:root` + 1 gradient palet avatar).
- Audit ulang: 52 file dipindai (−1 file mati); capped `hard-coded-color` 98 → 84.


---

## Milestone 8.8 (Design Debt) — Batch Fix #3–#7: Token Lengkap, Utility CSS, Unified Modal, DESIGN.md
**Tanggal**: 2026-09-19
**Branch**: `feature/design-debt-batch-3-to-7` (dipotong dari `dev`)

### Perubahan Implementasi

**Batch #3 — Token Baru + Codemod Sisa Hex (20 file):**
- `:root` globals.css +53 token baru: `--color-verified`, `--text-on-accent`, `--color-cyan-neon`, 10× tint aksen, 5× tint error, palet `--wa-*`, fix 5 dangling var, `--shadow-lg`, `--transition-normal`, z-index scale `--z-*`.
- Codemod `#ffffff/#fff` → `var(--text-on-accent)`, `#38bdf8` → `var(--color-verified)`, WA hex → `var(--wa-*)`, rgba() → `var(--tint-*)`.
- `zIndex: 99999` → **0** di seluruh codebase.

**Batch #4 — Utility CSS Classes (globals.css):**
- 120+ kelas: `u-flex`, `u-gap-*`, `u-text-*`, `u-fw-*`, spacing, scroll, `btn-ghost`, `u-bg-accent-tint`, `u-bg-error-tint`, z-class helpers `.z-modal/modal-top/dropdown`.

**Batch #5 — Unified Modal Primitive (globals.css + 4 TSX):**
- `.modal-overlay`, `.modal-card-unified`, `.modal-header/body/footer-unified`, `.modal-danger-zone`, `.modal-confirm-overlay`, animasi `slideUp` + `slideInRight`.
- `group-modal-backdrop` + class `z-modal` di 4 file TSX; hardcoded zIndex → `var(--z-modal/modal-top)`.

**Batch #7 — `frontend/DESIGN.md` [NEW] (173 baris):**
- Single source of truth design system: token palette, z-index scale, typography, unified modal API, utility catalog, exceptions, prevention checklist.

**Total**: 21 file (20 modified + 1 new), +497 insertions / −151 deletions.

### Test Evidence
- `npm run build` — **✓ PASS** 3× (gate #3, gate #4+#5, final). TypeScript clean, 6 routes.
- `go test ./...` — **PASS** 8 paket OK.
- `zIndex: 99999` → **0** ✅. Dangling `var()` → **0** ✅.

---

## Milestone 8.10 — Backend Logout Endpoint & Consolidated Encrypted Messages Banner
**Tanggal**: 2026-09-19
**Branch**: `dev`

### Latar Belakang & Masalah
1. **False Conflict pada Perangkat Baru Pasca-Logout**: Pengguna (Alice) logout dari Device 1, lalu mencoba login di Device 2. Device 2 terblokir pop-up *"Perangkat lain sedang aktif"* (409 Conflict) karena backend tidak memiliki endpoint logout dan `active_device_id` di database masih terkunci pada Device 1.
2. **Visual Clutter Pesan Terenkripsi**: Ketika akun login di perangkat baru setelah reset kunci, puluhan pesan masa lalu yang gagal didekripsi tampil sebagai deretan bubble `🔒 [Pesan Terenkripsi]` yang mengotori linimasa chat.

### Perubahan File
1. **`backend/internal/store/user_store.go`**: Menambahkan metode `ClearActiveDevice(userID string) error` pada interface `UserStore` dan struct `SQLUserStore` (`UPDATE users SET active_device_id = '' WHERE id = ?`).
2. **`backend/internal/api/auth_handler.go`**: Menambahkan handler `Logout(w, r)` yang mengekstrak identitas user dari JWT token dan mengosongkan `active_device_id`.
3. **`backend/main.go`**: Mendaftarkan endpoint `POST /api/auth/logout` dibungkus middleware CORS & `auth.RequireJWT()`.
4. **`backend/internal/api/auth_logout_test.go` [NEW]**: Test suite 5 skenario (unauthorized check, login Device 1, penolakan Device 2 sebelum logout, eksekusi logout, dan keberhasilan Device 2 registrasi setelah logout).
5. **`frontend/lib/auth-context.tsx`**: Menghubungkan fungsi `logout()` ke endpoint `POST /api/auth/logout`.
6. **`frontend/app/chat/ChatWindow.tsx`**: Mengganti deretan bubble pesan terenkripsi dengan **1 buah banner sistem terpadu** (`.encrypted-messages-banner`) di paling atas linimasa, serta optimasi $O(N)$ single-pass loop menggunakan `useMemo`.
7. **`frontend/app/globals.css`**: Menambahkan styling token design system resmi untuk `.encrypted-messages-banner`.

### Test Evidence
- **Backend Tests (`go test -count=1 ./...`)**: **100% PASS** di seluruh package (`api`, `auth`, `broker`, `push`, `storage`, `store`, `worker`, `ws`).
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully** (0 TypeScript/ESLint error, 8 static pages).

---

## Bugfix & Hardening — Device Conflict Cancellation & Device-Aware Logout Protection
**Tanggal**: 2026-09-19
**Branch**: `dev`

### Latar Belakang & Masalah
Ketika akun login di Device 1 (aktif), lalu mencoba login di Device 2 dan muncul modal `DeviceConflictModal`, pengguna menekan tombol *"Batalkan & Keluar"* di Device 2. Sebelumnya, tombol ini memanggil fungsi `logout()` dari `useAuth()`, yang mengirim request `POST /api/auth/logout` ke backend. Karena backend mengeksekusi pembersihan `active_device_id` tanpa mengecek device pemohon, `active_device_id` milik Device 1 di database terhapus secara tidak sengaja, membuka celah keamanan dan merusak integritas proteksi single active device Device 1.

### Solusi & Perubahan (Defense-in-Depth)
1. **`backend/internal/store/user_store.go`**:
   - Memperbarui `ClearActiveDevice(userID string, deviceID ...string) error` di interface `UserStore` dan struct `SQLUserStore`.
   - Menggunakan query kondisional: `UPDATE users SET active_device_id = '' WHERE id = $1 AND (active_device_id = $2 OR active_device_id = '')`.
   - Hanya menghapus sesi jika `deviceID` pemohon cocok dengan `active_device_id` di database.
2. **`backend/internal/api/auth_handler.go`**:
   - Handler `Logout` kini mengekstrak `device_id` dari JSON payload (`LogoutRequest`), header `X-Device-ID`, atau query parameter, lalu meneruskannya ke `ClearActiveDevice`.
3. **`backend/internal/api/auth_logout_test.go`**:
   - Menambahkan skenario uji Device 2 membatalkan login via `POST /api/auth/logout`: verifikasi ketat bahwa `active_device_id` di database tetap `"device_laptop"` (Device 1 aman).
4. **`frontend/lib/auth-context.tsx`**:
   - Menambahkan `localLogout()` untuk membersihkan sesi di browser lokal (hapus token dan profil di `localStorage`) tanpa memanggil server.
   - Mengirim `device_id` (dari `getOrCreateDeviceId()`) pada header dan body saat pemanggilan `logout()` resmi.
5. **`frontend/app/chat/page.tsx`**:
   - Pada `handleDeviceConflictLogout`, jika `!deviceConflict.isRotated` (perangkat penantang yang ditolak), aplikasi hanya memanggil `localLogout()` dan membersihkan IndexedDB lokal tanpa memanggil endpoint backend.

### Test Evidence
- **Backend Tests (`go test -count=1 ./...`)**: **100% PASS** di seluruh 8 package.
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully** (0 error).

---

## Milestone 8.11 — Anti-Infinite Reset Loop, 30s Server Timeout & Loading Logout UI
**Tanggal**: 2026-09-19  
**Branch**: `dev`

### Latar Belakang & Masalah
1. **Infinite Ping-Pong Reset Loop**:
   Ketika Device 1 aktif, lalu Device 2 login dan memilih *"Reset & masuk..."*, Device 1 menerima modal konflik rotasi (*"Kunci keamanan telah diperbarui"*). Jika pengguna di Device 1 mengklik *"🔄 Atau Keluar & Masuk Ulang Akun"*, sebelumnya terjadi navigasi prematur ke `/login` sebelum token lama di `localStorage` terhapus bersih. Akibatnya, `useEffect` di halaman login mendeteksi token masih tersimpan dan seketika melakukan auto-redirect kembali ke `/chat` tanpa meminta password. Di `/chat`, Device 1 mendeteksi konflik dan jika pengguna memilih reset, Device 1 mengambil alih kembali tanpa input kredensial, menciptakan siklus ping-pong tiada akhir.
2. **Ketiadaan Batas Waktu Terkelola & Indikator Loading**:
   Pemanggilan `POST /api/auth/logout` sebelumnya rentan menggantung jika koneksi seluler lambat. Selain itu, tidak ada feedback loading visual dan tombol tidak di-disable saat logout diproses, sehingga berisiko memicu *double-click race condition*.

### Solusi & Perubahan Terverifikasi
1. **`frontend/lib/auth-context.tsx`**:
   - **Synchronous 0ms Local Purge**: Memindahkan `localLogout()` ke baris pertama fungsi `logout()`. Token dan profil pengguna di `localStorage` serta auth state React dihapus seketika (0ms) sebelum request jaringan dijalankan.
   - **Saved Token Snapshot**: Mengambil snapshot token sebelum dihapus agar header `Authorization: Bearer <savedToken>` tetap terkirim secara sah ke backend.
   - **30-Second AbortController**: Membungkus API request logout dengan batas waktu terkelola 30.000 ms (30 detik). Jika server lambat atau timeout, error ditangani secara anggun (*graceful*) karena kredensial lokal sudah terhapus bersih.
2. **`frontend/app/chat/DeviceConflictModal.tsx` & `frontend/app/chat/ProfileModal.tsx`**:
   - Menambahkan state `isLoggingOut`.
   - Tombol logout di-disable (`disabled`, `opacity: 0.7`, `cursor: not-allowed`) dan menampilkan teks `⏳ Memproses Keluar...` saat proses logout sedang berjalan.
3. **`frontend/app/chat/page.tsx`**:
   - Pada handler `handleDeviceConflictLogout`, `localLogout()` dipanggil secara instan, menunggu `logout()` jika `isRotated`, lalu mengarahkan ke `/login?logout=1`.
4. **`frontend/app/login/page.tsx`**:
   - Menambahkan deteksi parameter `?logout=1` via `useSearchParams()`.
   - Mengabaikan auto-redirect ke `/chat` saat parameter `logout=1` terdeteksi, membersihkan sisa kredensial di storage, dan menampilkan banner notifikasi: *"ℹ️ Anda telah berhasil keluar. Silakan masuk kembali."*.
   - Pengguna diwajibkan memasukkan username dan password baru untuk masuk.

---

## Milestone 8.12 — Anti-Stale History Poisoning & `replaceState` Logout URL Sanitizer
**Tanggal**: 2026-09-19  
**Branch**: `dev`

### Latar Belakang & Masalah
Ketika pengguna telah berhasil login kembali setelah logout, riwayat URL di peramban sebelumnya masih dapat menyimpan entri `/login?logout=1` jika navigasi menggunakan `window.location.href` atau `router.push`. Jika pengguna kemudian menekan tombol *Back* berkali-kali di peramban hingga mencapai entri URL tersebut, `useEffect` di `/login` sebelumnya mengeksekusi `localLogout()` karena query parameter `?logout=1` masih terbawa, sehingga pengguna yang sedang aktif ter-logout secara tidak sengaja (*stale history poisoning*).

### Solusi & Perubahan Terverifikasi
1. **`frontend/app/login/page.tsx`**:
   - **Prioritas Autentikasi Utama**: Menempatkan pengecekan `!isAuthLoading && user` di baris pertama `useEffect`. Jika pengguna sudah dalam keadaan login sah dan menavigasi ke halaman login (misal via tombol Back peramban), sistem **tidak akan pernah memanggil `localLogout()`**, melainkan langsung memantulkan (*bounce back*) pengguna ke `/chat` via `router.replace('/chat')`.
   - **Instan URL Sanitization (`history.replaceState`)**: Saat baru saja tiba dari proses logout resmi (`isLogout === true` dan belum login), parameter `?logout=1` seketika disanitasi dari bilah URL menggunakan `window.history.replaceState(null, '', window.location.pathname + cleanSearch)` tanpa me-reload halaman. Dengan demikian, tombol *Back/Forward* browser di masa mendatang tidak akan pernah membawa parameter `?logout=1`.
   - **Navigasi Bersih Pasca-Login (`router.replace`)**: Saat submit form login berhasil, navigasi ke `/chat` dialihkan menggunakan `router.replace()` sehingga halaman login tidak meninggalkan jejak di history stack.
2. **`frontend/app/chat/page.tsx` & `frontend/app/chat/ProfileModal.tsx`**:
   - Seluruh pengalihan ke `/login?logout=1` diubah menggunakan `window.location.replace('/login?logout=1')` atau `router.replace('/login?logout=1')` untuk mencegah penumpukan riwayat halaman.

### Test Evidence
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully in 265ms** (0 TypeScript error, 0 lint error).
- **Backend Tests (`go test -v ./...`)**: **100% PASS** di seluruh package internal WebSocket & REST API.

---

## Milestone 8.13 — Direct WebSocket Kick on E2EE Key Transfer & Modal Hierarchy Hardening
**Tanggal**: 2026-09-20  
**Branch**: `dev`

### Latar Belakang & Masalah
Ketika akun login di browser laptop dan menghasilkan QR Code transfer kunci E2EE, lalu pengguna memindai QR Code tersebut dari aplikasi HP (PWA), login di HP berhasil dan sesi terambil alih. Namun di browser laptop:
1. Sesi WebSocket laptop tidak otomatis terlogout dan tetap terhubung karena endpoint `POST /api/users/transfer/consume` di backend belum memicu kick WebSocket langsung.
2. `DeviceConflictModal` di laptop memiliki z-index 150 yang tertutup secara visual di belakang backdrop modal `DeviceTransferModal` (z-index 1000).
3. `DeviceTransferModal` di laptop tidak mendengarkan event pergantian sesi (`wuzz:session_replaced`) dan tidak memiliki auto-dismiss/transition feedback.

### Solusi & Perubahan Terverifikasi
1. **`backend/internal/ws/hub.go`**:
   - Menambahkan method `KickClientByUserID(userID, exceptDeviceID, reason string)` pada WebSocket `Hub`.
   - Mengirim payload `SESSION_REPLACED` ke channel `send`, menerapkan jeda 500ms grace period untuk buffer flush, mengirim Close Frame (Code 4001), dan menutup koneksi socket secara tertib.
2. **`backend/internal/api/transfer_handler.go` & `backend/main.go`**:
   - Mendefinisikan interface `WebSocketHub` dan menginjeksi `Hub` ke `TransferHandler`.
   - Pada `ConsumeSession`, seketika bundle diverifikasi dan `active_device_id` diperbarui, backend langsung memanggil `h.hub.KickClientByUserID(session.UserID, req.DeviceID, "SESSION_REPLACED")`.
3. **`backend/internal/api/transfer_handler_test.go`**:
   - Menambahkan unit test `TestTransferHandler_DirectWebSocketKick` untuk memverifikasi pemanggilan `KickClientByUserID` saat sesi di-consume.
4. **`frontend/lib/ws-client.ts`**:
   - Memancarkan CustomEvent `wuzz:session_replaced` saat menerima Close Code 4001 atau event `SESSION_REPLACED`.
5. **`frontend/app/chat/DeviceTransferModal.tsx`**:
   - Menambahkan listener `wuzz:session_replaced`.
   - Menampilkan visual feedback *"✅ Kunci Keamanan Berhasil Dipindahkan!"* saat sesi terambil alih.
   - Mengotomatiskan auto-dismiss modal dalam 1.2 detik.
6. **`frontend/app/chat/DeviceConflictModal.tsx` & `frontend/app/chat/ProfileModal.tsx`**:
   - Menyelaraskan z-index `DeviceConflictModal` ke `1100` (`var(--z-modal-top)`) agar selalu berada di lapisan teratas.
   - Menambahkan auto-close `ProfileModal` saat event `wuzz:session_replaced` diterima.

### Test Evidence
- **Backend Tests (`go test -v ./...`)**: **100% PASS** di seluruh package internal (API, Crypto, DB, WS).
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully** (0 error, 0 lint warning).

---

## Milestone 8.14 — Root-Level React Portal Architecture & Z-Index Modal Stacking Hardening
**Tanggal**: 2026-09-20  
**Branch**: `dev`

### Latar Belakang & Masalah
1. **Bug Popup Profil Desktop/Laptop Tidak Bisa Ditutup**:
   - `ProfileModal.tsx` dirender di dalam `<aside className="chat-sidebar">`. Karena `.chat-sidebar` memiliki properti CSS `backdrop-filter: var(--glass-blur)` dan `transition: transform ...`, browser modern membentuk *new containing block* bagi elemen `position: fixed`.
   - Akibatnya, backdrop modal terkurung di dalam lebar sidebar 400px, kartu modal (480px) meluap ke kanan dan jatuh di bawah tumpukan `.chat-main-pane` / `.status-bar` (`z-index: 10/50`).
   - Tombol tutup (`✕`) di pojok kanan atas (`right: 12px` / x = 428px) berada tepat di bawah `.status-bar`, sehingga klik mouse tidak pernah mencapai tombol. Klik di luar kartu juga mengenai area chat, bukan backdrop. Modal tampak tidak bisa ditutup sama sekali di desktop.
2. **Bug Tombol "Pindah Kunci via QR / Kode" Tidak Beraksi di PWA HP**:
   - Pada `DeviceConflictModal.tsx` ("Perangkat Lain Sedang Aktif"), `zIndex` disetel ke `1100`, sementara modal pemindai QR `DeviceTransferModal.tsx` memiliki `zIndex: 1000`.
   - Karena `1000 < 1100`, saat tombol diklik, `DeviceTransferModal` sebenarnya terbuka tetapi tenggelam di belakang backdrop hitam 85% milik `DeviceConflictModal`. Pengguna di HP/PWA melihat tidak ada respon apa-apa.

### Solusi & Perubahan Terverifikasi
1. **Arsitektur Root-Level Portal (`createPortal`)**:
   - Membungkus modal-modal dengan `createPortal(..., document.body)` dari `react-dom` dengan null guard `typeof document === 'undefined'`:
     - `frontend/app/chat/ProfileModal.tsx`
     - `frontend/app/chat/ContactProfileModal.tsx`
     - `frontend/app/chat/DeviceConflictModal.tsx`
     - `frontend/app/chat/DeviceTransferModal.tsx`
     - `frontend/app/chat/CreateGroupModal.tsx`
     - `frontend/app/chat/GroupPreviewModal.tsx`
     - `frontend/app/chat/MemberListModal.tsx`
     - Modal konfirmasi hapus percakapan (`confirmDeleteConv`) di `frontend/app/chat/Sidebar.tsx`
   - Menjamin seluruh modal melepaskan diri dari stacking context dan clipping container lokal (sidebar, status bar, header).
2. **Restrukturisasi Skala Z-Index (Design System Compliant)**:
   - Menyelaraskan seluruh modal dasar (`DeviceConflictModal`, `ProfileModal`, `ContactProfileModal`, dll) ke `zIndex: 'var(--z-modal)' as any` (1000).
   - Menyelaraskan modal anak / overlay bertingkat (`DeviceTransferModal`) ke `zIndex: 'var(--z-modal-top)' as any` (1100).
   - Menjamin `DeviceTransferModal` selalu tampil 100 level di atas modal konflik maupun profil.
3. **Event Isolation & Bubbling Guard**:
   - Menambahkan `onClick={e => e.stopPropagation()}` pada seluruh `.modal-card` dan tombol aksi agar klik di dalam konten modal tidak memicu trigger backdrop.

### Test Evidence
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully in 1692ms** (0 error TypeScript & Turbopack).
- **Backend Tests (`go test ./...`)**: **100% PASS** di seluruh unit & integration test.

---

## 🚀 Milestone 8.10: Dual-Tier Background Delivery Receipt (20 September 2026)

### Latar Belakang Masalah
Pesan yang dikirimkan ke penerima yang sedang menutup aplikasi PWA/web tertahan di status **Centang 1 (✓ `sent`)**, meskipun notifikasi push sudah masuk dan tampil di HP penerima. Pesan baru berubah menjadi **Centang 2 abu-abu (✓✓ `delivered`)** saat penerima membuka aplikasi PWA / web (karena status delivered sebelumnya hanya dipicu pada event WebSocket `onJoin`).

### Solusi & Perubahan Terverifikasi
1. **Backend Go — Web Push & Gateway Delivery ACK**:
   - Menambahkan parameter `msgID string` ke `NotifyOfflineRecipients` di `backend/internal/push/push.go` dan menyertakannya ke payload push notification (`"message_id": msgID`).
   - Mendaftarkan `SetDeliveryCallback` di `backend/internal/ws/hub.go`: seketika gateway WebPush (Google FCM / Apple APNs) menerima pesan (HTTP 201/200), server Go langsung menandai pesan sebagai `delivered` di DB dan mem-broadcast `TypeReceipt (status: delivered)` ke room pengirim via WebSocket Hub.
   - Menambahkan **Anti-Downgrade Status Guard** pada `backend/internal/store/sql.go` dan `backend/internal/store/memory.go` agar status `read` (centang 2 biru) tidak pernah ter-downgrade menjadi `delivered`.
2. **Backend Go — REST API Delivery Receipt Endpoint**:
   - Menambahkan method `UpdateReceipt(w, r)` di `backend/internal/api/chat_handler.go` untuk menangani `POST /api/messages/receipt`.
   - Mendaftarkan route di `backend/main.go` dengan proteksi middleware `auth.RequireJWT()` dan validasi BOLA `IsUserInConversation`.
   - Menambahkan unit test `backend/internal/api/chat_handler_receipt_test.go` (lulus 100%).
3. **Frontend Next.js — CacheStorage & Service Worker ACK**:
   - Menambahkan `saveAuthTokenToCache` dan `clearAuthTokenFromCache` di `frontend/lib/pushNotification.ts`.
   - Sinkronisasi token autentikasi ke `CacheStorage` browser (`wuzz-auth-cache`) pada `frontend/lib/auth-context.tsx`.
   - Memperbarui Service Worker di `frontend/public/sw.js` (bump ke `v1.0.7`): saat event `push` aktif, Service Worker melakukan background `fetch('/api/messages/receipt')` dengan token dari CacheStorage.

### Test Evidence
- **Backend Tests (`go test -count=1 ./...`)**: **100% PASS** di seluruh unit & integration test.
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully** (0 error TypeScript & Turbopack).

---

## 🚀 Milestone 8.11: Scoped Real-Time Join Request Notification & Badge Counter (20 September 2026)

### Latar Belakang Masalah
Ketika pengguna mengajukan izin bergabung (*join request*) ke subgrup/forum privat (`POST /api/groups/{id}/join-request`), permohonan hanya tersimpan diam di database relasional `conversation_join_requests`. Tidak ada notifikasi real-time WebSocket, tidak ada Web Push notification, dan tidak ada indikator badge jumlah permohonan tertunda di tombol `📋 Kelola Izin`. Admin hanya dapat mengetahui adanya permohonan jika membuka subgrup drawer dan mengklik tombol tersebut secara berkala.

### Solusi & Perubahan Terverifikasi (DEC-014)
1. **Penyaringan Ketat Penerima Notifikasi (*Scoped Recipient Model*)**:
   - Menambahkan method `GetSubGroupAdmins(subGroupID)` di `backend/internal/store/group_store.go`: hanya mengambil `creator` subgrup dan anggota dengan role `admin` atau `creator` di dalam subgrup tersebut.
   - Admin grup induk yang **tidak bergabung** ke subgrup privat **TIDAK dikirimi notifikasi**, mencegah spam notifikasi dan menjaga privasi ruang diskusi.
2. **Pengiriman Notifikasi Real-Time Ganda (WebSocket + Web Push)**:
   - Menambahkan method `NotifyUsers` di `backend/internal/push/push.go` dan `backend/internal/ws/hub.go`.
   - Menambahkan `TypeJoinRequest` di `backend/internal/ws/message.go` dan `types.ts`.
   - Pada `handleRequestToJoinSubGroup`: dispatch WebSocket event dan Web Push notification langsung ke admin/creator subgrup terkait.
   - Pada `handleRespondJoinRequest`: dispatch notifikasi balik secara live ke pemohon (`targetUserID`) saat permohonan disetujui atau ditolak.
3. **Pending Requests Counter di Endpoint Subgrup**:
   - Menambahkan kolom `pending_requests_count` pada kueri `GetActiveSubGroups` di `backend/internal/store/group_store.go`.
   - Menambahkan `pending_requests_count?: number` pada interface `SubGroupItem` di `frontend/lib/types.ts`.
4. **Indikator Badge & In-App Banner di Frontend**:
   - Pada `frontend/app/chat/SubGroupListDrawer.tsx`: tombol `📋 Kelola Izin` kini menampilkan badge counter permohonan pending (misal `📋 Kelola Izin 🔴 1`), serta memperbarui counter secara optimistik saat aksi setujui/tolak dieksekusi.
   - Pada `frontend/app/chat/page.tsx`: WebSocket listener menangkap event `join_request` dan memunculkan toast banner in-app serta notifikasi native peramban jika tab sedang di latar belakang.

### Test Evidence
- **Backend Tests (`go test ./...`)**: **100% PASS** di seluruh unit, store, api, dan integration test suite (termasuk unit test join request di `subgroup_test.go` dan `group_handler_test.go`).
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully** (0 error TypeScript & Turbopack).

---

## 🚀 Milestone 8.12: Production Load Testing, Dual-Tier Rate Limiting & Scalability Optimizations (20 September 2026)

### Latar Belakang & Hasil Load Test Production
Pengujian beban (load & stress test) menggunakan Grafana k6 v0.55.0 dijalankan secara langsung ke production Fly.io (`wuzz-chat-backend.fly.dev`) dan Supabase PostgreSQL (`ap-northeast-2`):
- **Skenario 1b (14 DM Users)**: 100% stabil, latensi WS 244ms, zero disconnect.
- **Skenario 1 (100 Concurrent DM Users)**: Berhasil mentransmisikan 7.778 pesan (~11.7 msg/s), latensi WS p(95) 1.75s.
- **Skenario 2 (Group Chat 10 Users)**: 12.445 pesan tersalurkan (Fanout 10.35x), 0% packet loss.
- **Skenario 3 (Stress 250 Users)**: 37.020 pesan diterima live (23 MB throughput), 100% WS handshake success.
- **Skenario 4 (Spike DDoS Test)**: Memblokir lonjakan 50 login/detik dengan 0 server error (500).

### Solusi & Optimasi Backend Terverifikasi
1. **Dual-Tier Rate Limiting (`backend/internal/auth/ratelimit.go`)**:
   - **Layer 1 (Per-IP / Anti-DDoS)**: Batas dilonggarkan ke **100 request/menit per IP** untuk mencegah false-positive pada jaringan kantor/kampus (shared NAT).
   - **Layer 2 (Per-Username / Anti-Brute Force)**: Dibatasi maksimal **15 request/menit per username** dengan pesan penolakan yang presisi.
   - **Body Stream Preservation**: Membaca field `username` dari body JSON secara aman (dibatasi 4KB) dan me-restore `r.Body` (`io.NopCloser`) untuk downstream handler.
2. **Database Connection Pool Tuning (`backend/internal/store/sql.go`)**:
   - `db.SetMaxOpenConns(25)` dan `db.SetMaxIdleConns(10)`.
   - `db.SetConnMaxIdleTime(2 * time.Minute)` dan `db.SetConnMaxLifetime(5 * time.Minute)`.
3. **Live Redis Pub/Sub Cluster Verification (`backend/internal/broker/`, `backend/internal/ws/`)**:
   - Streaming channel `ReceiveMessage(r.ctx)` pada `redis_broker.go` tanpa perantara channel buffer wrapper.
   - Uji E2E Live Redis (`TestHub_LiveRedisClusterSync` & `TestRedisBroker_Integration`) PASS 100% antar-instance node via Upstash Redis.
4. **Deploy Fly.io Production**:
   - Berhasil di-deploy ke `wuzz-chat-backend.fly.dev` (Health check: HTTP/2 200 OK).

### Test Evidence
- **Backend Tests (`go test -v ./...`)**: **100% PASS** di seluruh unit, store, api, broker, ws, dan integration test suite.
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully** (0 error TypeScript & Turbopack).
- **Production Health Check**: `curl -sI https://wuzz-chat-backend.fly.dev/health` ➔ `HTTP/2 200 OK`.

---

## 🚀 Milestone 8.13: Real-Time Read Receipt Fix & Bulk Status Storage Sync (20 September 2026)

### Latar Belakang Masalah
Saat User A mengirim pesan dan terkirim (centang 2 abu-abu), ketika User B membuka chat, status di device User A tidak langsung berubah menjadi centang 2 biru dan baru berubah saat User B membalas pesan. Penyebabnya adalah:
1. Guard `if (currentRoom && ...)` di WebSocket listener frontend membuang event `TypeReceipt` saat User A berada di halaman Home / Daftar Chat / Sidebar.
2. Bulk read receipt (`!msg.id`) saat membuka room tidak memperbarui status di IndexedDB lokal pengirim.

### Solusi & Implementasi
1. **IndexedDB Batch Status Update (`frontend/lib/messageCache.ts`)**:
   - Menambahkan fungsi `updateRoomCachedMessagesStatus(roomId, newStatus)` yang memanfaatkan index `by_room` untuk iterasi cepat non-blocking.
   - Menerapkan *anti-regression guard* berbasis `STATUS_WEIGHT` (mencegah status `read` tertimpa kembali menjadi `delivered`/`sent`).
2. **WebSocket Event Routing (`frontend/app/chat/page.tsx`)**:
   - Menyesuaikan penanganan `case 'receipt':` agar selalu meneruskan event ke `setLastIncomingMessage(msg)` sehingga snippet dan icon di `Sidebar.tsx` langsung ter-update secara real-time.
   - Mengintegrasikan pembaruan status bulk ke IndexedDB lokal saat menerima `TypeReceipt` tingkat room.
3. **Automated Test Suite (`frontend/test-message-cache.mjs`)**:
   - Menambahkan skenario Test 6b untuk memverifikasi `updateRoomCachedMessagesStatus` dan proteksi anti-downgrade.

### Test Evidence
- **Frontend IndexedDB Tests (`node frontend/test-message-cache.mjs`)**: **100% PASS** (9 skenario uji).
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully** (0 error TypeScript & Turbopack).
- **Backend Tests (`go test ./...`)**: **100% PASS**.

---

## 🚀 Milestone 9.0: Architecture Discovery, Refinement & Technical Specification for Group Memory AI (20 September 2026)

### Latar Belakang & Visi Produk
Merumuskan arsitektur dan spesifikasi teknis fitur pembeda utama WuzzChat: **Group Memory AI** dengan filosofi:
*"AI captures. Humans validate. Wuzz remembers."*
Forum diskusi sementara (sub-group) yang memiliki batas waktu (TTL 1 minggu / 1 bulan) akan diubah menjadi memori pengetahuan grup permanen setelah melalui gerbang validasi Admin grup.

### Keputusan Produk & Desain Kunci (Approved)
1. **Journey Lite Masuk MVP**: Rekonstruksi perjalanan diskusi secara kausal (Awalnya... → Kemudian... → Akhirnya...) untuk menangkap perubahan pemikiran kelompok, bukan sekadar rangkuman statis.
2. **Evidence-Backed Decisions**: Setiap poin keputusan (*decision*) wajib memiliki bukti kutipan pesan (*evidence snapshot*) yang tahan terhadap penghapusan pesan asli.
3. **Structured Confidence Level**: AI menghasilkan level keyakinan (`HIGH`, `MEDIUM`, `LOW`) dengan rubrik deterministic scoring.
4. **Batas Pesan Terproses**: Limit maksimum 1.000 pesan per forum untuk menjaga kualitas memori dan biaya token.
5. **Human Review Flow Cepat (<30 Detik)**: Admin grup diberikan 4 aksi: *Setujui Semua (Approve All)*, *Edit Per-Artefak*, *Hapus Journey Lite*, atau *Tolak Draft*.
6. **Strict Group-Scoped Isolation**: Data memori terisolasi penuh pada grup induk terkait; dilarang keras terjadi kebocoran lintas grup atau memori global.

### Hasil Deliverable Spesifikasi Teknis
- **`docs/GROUP_MEMORY_AI_SPEC.md`**: Dokumen spesifikasi teknis komprehensif (1.408 baris) mencakup 16 area arsitektural:
  1. Domain Model
  2. State Machine (Job & Draft)
  3. Database Schema Proposal (7 Tabel SQL PostgreSQL)
  4. Job Queue Design (PostgreSQL `FOR UPDATE SKIP LOCKED`)
  5. AI Prompt Contract (System Prompt & Boundary `[DATA DISKUSI]`)
  6. Structured Output Contract (JSON Schema & TypeScript Interfaces)
  7. Evidence Model (Self-contained snapshot)
  8. Confidence Model (Deterministic scoring)
  9. Review Flow Backend (5 REST API endpoints)
  10. Review Flow Frontend (Client state machine & modal drawer)
  11. Notification Flow (WebSocket & push events)
  12. Publication Flow (Draft → Immutable read-model `approved_memories`)
  13. Failure Handling & Fallback
  14. Retry Strategy (Exponential backoff 3x)
  15. Metrics & Analytics tracking
  16. Security & Privacy (Prompt injection defense, data minimization)
- **Pembaruan Roadmap & Arsitektur**:
  - `docs/ROADMAP.md`: Menambahkan **Fase 10: Group Memory AI** beserta milestone M1 s/d M7.
  - `docs/ARCHITECTURE.md`: Menambahkan bab arsitektur antrean worker PostgreSQL `SKIP LOCKED` dan relasi 7 tabel memori.

### Status Implementasi
- Dokumen spesifikasi teknis: **100% SELESAI & DISETUJUI**.
- Rencana eksekusi: Milestone M1 & M2 SELESAI di branch `feature/group-memory-ai`.

---

## 🚀 Milestone 10.1: Group Memory AI — Foundation & Data Model (20 September 2026)

### Latar Belakang & Implementasi
Membangun fondasi data persisten dan layer Go repository untuk mendukung 7 tabel entitas Group Memory AI:
1. **Auto-Migration DDL 7 Tabel (`backend/internal/store/sql.go`)**:
   - `forum_memory_jobs`: Job antrean AI asinkron (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`).
   - `memory_drafts`: Kontainer draft hasil AI sebelum disetujui.
   - `memory_artifacts`: Butir memori (`SUMMARY`, `DECISION`, `JOURNEY_LITE`) dengan confidence level.
   - `artifact_evidences`: Kutipan pesan asli pendukung keputusan yang tahan terhadap penghapusan pesan asli.
   - `approved_memories`: Read-model terdenormalisasi berkecepatan tinggi dengan snapshot JSONB keputusan.
   - `memory_review_actions`: Audit log append-only merekam tindakan validasi admin.
   - `memory_view_events`: Analitik pembacaan memori oleh anggota grup.
2. **Domain Models & SQL Repository (`backend/internal/store/memory_store.go`)**:
   - Interface `MemoryStore` dan implementasi `SQLMemoryStore` kompatibel PostgreSQL & SQLite.
   - Integrasi inisialisasi `memoryStore` di `backend/main.go`.
3. **Automated Test Suite**:
   - `memory_store_test.go`: 100% PASS (Job lifecycle, Draft & Artifacts, Approval/Rejection, View Events).

---

## 🚀 Milestone 10.2: Group Memory AI — Job Queue & Expiry Trigger (20 September 2026)

### Latar Belakang & Implementasi
Menghubungkan trigger kedaluwarsa forum ke antrean AI dan membangun background daemon Go untuk memproses antrean job secara atomik dan non-blocking:
1. **Ekstensi `ExpireSubGroupsBatchDetailed` (`backend/internal/store/group_store.go`)**:
   - Mengembalikan daftar forum dan grup induk yang baru saja expired secara atomik dan membersihkan join request.
2. **Pemicu Otomatis di `SubGroupTTLWorker` (`backend/internal/worker/subgroup_ttl_worker.go`)**:
   - Injeksi `memoryStore` ke `SubGroupTTLWorker`.
   - Saat subgrup kedaluwarsa, otomatis membuat `ForumMemoryJob` (`status = 'QUEUED'`) dengan guard idempotency.
3. **Daemon Background Worker `MemoryJobWorker` (`backend/internal/worker/memory_worker.go`)**:
   - Polling antrean `forum_memory_jobs` berstatus `QUEUED` secara berkala (default 15 detik).
   - Operasi klaim atomik `ClaimJob` (`QUEUED` → `PROCESSING`) aman untuk multi-instance cluster.
   - Menghitung jumlah pesan percakapan di forum dan menyediakan interface hook `MemoryJobProcessor` (siap diinjeksi modul AI di M3).
   - Retry scheduler dengan exponential backoff bertingkat (30 detik, 2 menit, 8 menit / terminal fail).
4. **Wiring Lifecycle Server (`backend/main.go`)**:
   - Menjalankan `MemoryJobWorker` secara concurrent saat booting dengan graceful shutdown terkelola.
5. **Automated Test Suite**:
   - `subgroup_ttl_worker_test.go` & `memory_worker_test.go`: 100% PASS.

---

## 🚀 Milestone 10.3: Group Memory AI — AI Service Integration & Structured Output (20 September 2026)

### Latar Belakang & Implementasi
Mengintegrasikan layanan AI dan pemrosesan terstruktur untuk menyaring riwayat diskusi forum expired menjadi draft pengetahuan yang komprehensif, tahan injeksi prompt, dan terverifikasi bukti snapshot:
1. **Definisi Kontrak & Immutable Prompt Engine (`backend/internal/ai/service.go`)**:
   - Tipe data kontrak `MemoryGenerationInput`, `MemoryGenerationOutput`, `DecisionWithEvidence`, `JourneyPhaseInput`.
   - System prompt immutabel dengan pembatas `[DATA DISKUSI]` untuk pencegahan prompt injection dari pesan pengguna.
   - Interface `AIService` untuk abstraksi provider model kecerdasan buatan.
2. **Parser JSON, Normalizer & Providers (`backend/internal/ai/provider.go`)**:
   - `ParseStructuredOutput()` yang membersihkan markdown fence, memvalidasi JSON schema, serta menormalisasi confidence score (0.0 - 1.0).
   - `MockAIService` untuk pengujian offline dan `GeminiProvider` untuk integrasi REST API Google Gemini (`gemini-1.5-flash`).
   - Pabrik instansiasi `NewAIServiceFromEnv()` yang mendeteksi `GEMINI_API_KEY` / `AI_API_KEY` dengan fallback otomatis ke mock provider saat dev/test.
3. **Pipeline Pemrosesan & Evidence Resolver (`backend/internal/ai/processor.go`)**:
   - Implementasi `MemoryProcessor` yang memenuhi interface `worker.MemoryJobProcessor`.
   - Mengambil hingga 1.000 riwayat pesan forum dan mengirimkannya ke AI Service.
   - Resolusi bukti snapshot pesan (`message_preview` max 200 karakter, `message_sender_name`, dan `message_sent_at`) yang memastikan integritas bukti keputusan meskipun pesan asli dihapus (`delete for everyone`).
   - Menyimpan seluruh artefak (Summary, Decisions + Evidences, Journey Lite) secara atomik ke dalam `MemoryDraft` berstatus `pending_review`.
4. **Wiring System & Test Suite (`backend/main.go` & `backend/internal/ai/service_test.go`)**:
   - Menghubungkan `MemoryProcessor` ke `MemoryJobWorker` via `memoryWorker.SetProcessor(memoryProcessor)`.
   - Pengujian unit dan full pipeline (`service_test.go`) lulus 100%.

### Test Evidence
- **Backend Tests (`go test ./...`)**: **100% PASS** di seluruh unit, store, worker, broker, api, dan ai package.
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully** (0 error TypeScript & Turbopack).

---

## 🚀 Milestone 10.4: Group Memory AI — Review Backend API & Knowledge Endpoints (20 September 2026)

### Latar Belakang & Implementasi
Membangun REST API terproteksi dengan kontrol akses multi-tier (RBAC) untuk validasi/kurasi draft memori oleh Admin serta konsumsi pengetahuan permanen bagi seluruh anggota grup:
1. **Helper Kueri Store (`backend/internal/store/memory_store.go`)**:
   - Menambahkan `GetArtifactByID` untuk validasi scope kepemilikan draft dan manipulasi artefak.
   - Menambahkan `GetApprovedMemoryByID` untuk pemuatan detail memori terkurasi.
2. **REST API Handler & Controller (`backend/internal/api/memory_handler.go`)**:
   - **Admin Review Endpoints (Hanya Role Admin/Creator)**:
     - `GET /api/memory/drafts?group_id={id}`: Mengambil daftar draft pending review di grup.
     - `GET /api/memory/drafts/{draft_id}`: Detail draft lengkap dengan artefak dan evidence snapshot.
     - `POST /api/memory/drafts/{draft_id}/approve`: Persetujuan draft secara atomik, publikasi `ApprovedMemory`, pencatatan `MemoryReviewAction`, dan broadcast WebSocket real-time ke grup.
     - `POST /api/memory/drafts/{draft_id}/reject`: Penolakan draft dengan alasan dan pencatatan audit log `REJECTED`.
     - `PATCH /api/memory/drafts/{draft_id}/artifacts/{artifact_id}`: Penyuntingan teks artefak, menandai `is_human_edited = true`, dan mencatat action audit `EDITED_*`.
     - `DELETE /api/memory/drafts/{draft_id}/journey`: Penghapusan Journey Lite (`is_removed = true`) dan pencatatan action audit `REMOVED_JOURNEY_LITE`.
     - `POST /api/memory/drafts/{draft_id}/approve-with-changes`: Persetujuan dengan penanda eksplisit `has_human_edits = true`.
   - **Member Knowledge Endpoints (Semua Anggota Grup)**:
     - `GET /api/groups/{id}/memories`: Daftar memori grup terkurasi dengan pagination limit & offset.
     - `GET /api/memories/{memory_id}`: Detail memori terkurasi lengkap beserta snapshot keputusan dan perjalanan diskusi, sekaligus mencatat `memory_view_events` analitik secara async non-blocking.
3. **Router Wiring & Sub-path Integration (`backend/main.go` & `backend/internal/api/group_handler.go`)**:
   - Pendaftaran rute `/api/memory/` dan `/api/memories/` dengan middleware autentikasi JWT.
   - Dispatching rute `/api/groups/{id}/memories` langsung di `RouteGroupRequest`.
4. **Automated Test Suite (`backend/internal/api/memory_handler_test.go`)**:
   - Pengujian otorisasi berlapis (Admin 200 OK vs Member/Outsider 403 Forbidden).
   - Pengujian siklus hidup review penuh (List, Detail, Edit, Delete Journey, Approve with Changes, Reject, View List & Detail, View Events Tracking) 100% PASS.

### Test Evidence
- **Backend Tests (`go test ./...`)**: **100% PASS** di seluruh unit, store, worker, broker, api, dan ai package (termasuk `TestMemoryHandler_AdminReviewLifecycle` & `TestMemoryHandler_RejectDraft`).
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully** (0 error TypeScript & Turbopack).

---

## 🚀 Milestone 10.5: Group Memory AI — Admin Review UI (20 September 2026)

### Latar Belakang & Implementasi
Membangun antarmuka web (UI/UX) bagi Admin dan Creator grup untuk meninjau, menyunting, dan memvalidasi draft memori AI sebelum dipublikasikan secara permanen:
1. **Definisi Tipe & Kontrak TypeScript (`frontend/lib/types.ts`)**:
   - `MemoryConfidence`, `ArtifactEvidenceItem`, `MemoryArtifactItem`, `MemoryDraftDetail`, `MemoryDraftListItem`.
   - `ApprovedEvidenceItem`, `ApprovedDecisionItem`, `ApprovedMemoryListItem`, `ApprovedMemoryDetail`.
2. **Klien REST API Helper (`frontend/lib/api.ts`)**:
   - `fetchMemoryDrafts`, `fetchMemoryDraftDetail`, `approveMemoryDraft`, `rejectMemoryDraft`, `updateMemoryArtifact`, `removeJourneyLite`.
   - Terintegrasi dengan mekanisme `AbortController` timeout 15 detik dan otomatis token recovery.
3. **Komponen Kartu Review (`frontend/app/chat/memory/`)**:
   - `ConfidenceBadge`: Badge visual tingkat keyakinan (HIGH: hijau ●, MEDIUM: amber ◐, LOW: merah ○).
   - `SummaryReviewCard`: Menampilkan teks ringkasan diskusi AI dengan mode penyuntingan inline.
   - `DecisionReviewCard`: Menampilkan poin keputusan terstruktur beserta kutipan bukti sumber percakapan (`message_preview`, pengirim, tanggal) dan link tautan "Buka di diskusi asli →".
   - `JourneyLiteReviewCard`: Menampilkan kronologi alur diskusi (*Awalnya... Kemudian... Akhirnya...*) serta opsi tombol [🗑 Hapus dari Memori] dengan dialog konfirmasi aman.
   - `JourneyLiteSkippedCard`: Komponen placeholder saat forum singkat langsung mencapai konsensus.
4. **Modal Container & Sticky Action Bar (`frontend/app/chat/memory/MemoryDraftReviewModal.tsx`)**:
   - Mengikuti kaidah *Dual-Platform (Mobile 100dvh & Desktop Modal)* dengan sticky header dan sticky action bar berpadding safe-area insets.
   - Tombol `[✅ Setujui & Publikasikan]` (otomatis mendeteksi suntingan untuk `approve-with-changes`).
   - Tombol `[❌ Tolak Draft]` dengan dialog input alasan penolakan.
   - Perlindungan loading state & disabled button untuk mencegah duplikasi submit (*double-click race condition*).
5. **Integrasi Entry Point di Chat UI (`SubGroupListDrawer.tsx` & `page.tsx`)**:
   - Banner **"Draft Memori AI Siap Direview"** otomatis tampil di drawer topik forum bagi Admin saat ada forum kedaluwarsa yang siap divalidasi.
   - Integrasi modal review ke state utama chat dengan feedback in-app toast saat disetujui/ditolak.

### Test Evidence
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully** (0 error TypeScript & Turbopack).
- **Backend Tests (`go test ./...`)**: **100% PASS** di seluruh paket backend.

---

## 🚀 Milestone 10.6: Group Memory AI — Member Knowledge Viewer (20 September 2026)

### Latar Belakang & Implementasi
Membangun antarmuka bagi seluruh anggota grup untuk menelusuri, membaca, dan mempelajari memori pengetahuan yang telah divalidasi dan dipublikasikan oleh admin:
1. **Modal Arsip Linimasa Memori (`frontend/app/chat/memory/GroupMemoryListModal.tsx`)**:
   - Menampilkan daftar linimasa arsip memori grup dengan kartu ringkasan interaktif.
   - Fitur pencarian instan klien (filtering judul forum, ringkasan, atau nama admin validator).
   - Badge jumlah keputusan dan indikator status penyuntingan (*Telah Disunting*).
2. **Modal Detail Pengetahuan Terpublikasi (`frontend/app/chat/memory/GroupMemoryDetailModal.tsx`)**:
   - Menampilkan ringkasan eksekutif (*Snapshot Summary*), kartu butir keputusan terverifikasi (*Decisions*), kutipan bukti asli (*Evidence Citations*) dengan metadata pengirim dan cap waktu lokal.
   - Menampilkan visualisasi *Journey Lite* (*Awalnya... Kemudian... Akhirnya...*) jika tersedia.
   - Signature verifikasi admin dengan nama validator dan tanggal persetujuan.
   - Deep-linking interaktif "Buka di percakapan asli →" dan "Buka Forum Asli" yang langsung menavigasi pengguna ke riwayat pesan forum terkait.
3. **Integrasi Entry Point Pengguna (`frontend/app/chat/`)**:
   - **Status Bar (`StatusBar.tsx`)**: Menambahkan tombol aksi `🧠 Memori` pada header grup untuk akses langsung satu ketukan ke koleksi pengetahuan AI.
   - **Drawer Topik Forum (`SubGroupListDrawer.tsx`)**: Menambahkan tombol permanen **"🧠 Arsip Memori Pengetahuan AI"** bagi seluruh anggota grup.
   - **Banner Forum Kedaluwarsa (`page.tsx`)**: Menampilkan banner informatif otomatis saat anggota membuka forum yang telah kedaluwarsa dengan tombol **"🧠 Lihat Memori Grup →"**.
   - **Wiring State Global (`page.tsx`)**: State `isMemoryListOpen` dan `selectedApprovedMemoryId` terhubung mulus dengan routing chat.

### Test Evidence
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully in 2.4s** (Next.js 16.3.5 Turbopack, 0 TypeScript & lint error).
- **Backend Tests (`go test -v ./...`)**: **100% PASS** di seluruh modul backend Go.
- **Server Lifecycle**: 0 listening ports terabaikan (`ss -tulpn` bersih).

---

## 🚀 Milestone 10.7: Group Memory AI — E2E Integration, Web Push Notifications & Final Polish (20 September 2026)

### Latar Belakang & Implementasi
Menuntaskan seluruh rangkaian implementasi fitur Group Memory AI ("AI captures. Humans validate. Wuzz remembers.") dengan menghubungkan orkestrasi notifikasi push, pemisahan dependensi provider AI, dan integrasi deep-linking PWA:
1. **Multi-Vendor Provider Factory & Universal Error Taxonomy (`backend/internal/ai/`)**:
   - `NewAIServiceFromEnv()` mendukung konfigurasi dinamis via environment variable `AI_PROVIDER` (default `gemini`, opsi `openai`, `ollama`, `mock`) dan `AI_MODEL`.
   - Fallback otomatis ke `MockAIService` saat API key tidak tersedia untuk menjamin keamanan continuous integration dan pengujian lokal tanpa internet/kuota.
   - Taksonomi error: membedakan `ErrAIRateLimited` (429, timeout) sebagai *retryable error* untuk dieksekusi ulang dengan exponential backoff, serta `ErrAIBadAuth` (401, 403) sebagai *fatal terminal failure*.
2. **Helper Web Push Notification Terstruktur (`backend/internal/push/`)**:
   - Menambahkan `NotifyMemoryEvent(userIDs, title, body, tag, data)` pada `push.Service` untuk dispatch notifikasi Web Push VAPID terenkripsi.
   - Mengintegrasikan fallback otomatis parameter `deep_link` ke field `url` payload push.
3. **Dispatch Notifikasi Siklus Hidup Memori AI (`backend/internal/ai/` & `backend/internal/api/`)**:
   - **`MemoryProcessor.ProcessMemoryJob`**: Mengirim push notification `memory_draft_ready` ke seluruh Admin dan Creator grup saat pemrosesan ringkasan AI selesai.
   - **`MemoryHandler.handleApproveDraft`**: Mengirim push notification `memory_published` ke seluruh anggota grup (`user_id != approved_admin_id`) seketika saat draft divalidasi dan dipublikasikan, serta menyiarkan pesan sistem `BroadcastGroupSystemEvent`.
4. **PWA Deep-Linking & Dynamic Search Param Routing (`frontend/`)**:
   - **Service Worker (`public/sw.js`)**: Memperbarui event listener `notificationclick` untuk memprioritaskan navigasi ke `data.deep_link` jika tersedia.
   - **Chat Page (`frontend/app/chat/page.tsx`)**: Mendukung URL query parameter `?openDraft=<id>` dan `?openMemory=<id>` untuk membuka modal review atau modal memori secara otomatis saat aplikasi dibuka dari push notification.

### Test Evidence
- **Frontend Turbopack Build (`npm run build`)**: **✓ Compiled successfully in 2.2s** (0 TypeScript & Turbopack error).
- **Backend Test Suite (`go test -v ./...`)**: **100% PASS** di seluruh modul (`internal/store`, `internal/worker`, `internal/ai`, `internal/api`, `internal/ws`, `internal/push`).
- **Server Lifecycle**: 0 listening ports terabaikan (`ss -tulpn` bersih).

---

## 🚀 Milestone 10.8: Group Memory AI — Groq Provider Integration, Instant Expiry Bypass & Full Config Modularization (20 September 2026)

### Latar Belakang & Implementasi
Menyempurnakan keandalan operasional, fleksibilitas integrasi, serta kecepatan respons dari ekosistem Group Memory AI:
1. **Groq LPU Provider Engine (`backend/internal/ai/provider.go`)**:
   - Menambahkan implementasi `GroqProvider` yang kompatibel dengan protokol OpenAI Chat Completions dan format keluaran `response_format: {"type": "json_object"}`.
   - Model aktif terverifikasi: `qwen/qwen3.8-27b` dengan waktu pemrosesan inferensi ~2 detik per ringkasan forum.
   - Menambahkan dukungan URL base modular (`GROQ_BASE_URL`, `GEMINI_BASE_URL`, `AI_BASE_URL`).
2. **Instant Expiry & TTL Bypass Flow (`backend/` & `frontend/`)**:
   - **Database Store (`backend/internal/store/group_store.go`)**: Method `ExpireSubGroupNow(subGroupID string)` untuk memanipulasi `expires_at` ke masa lampau.
   - **REST API (`backend/internal/api/group_handler.go`)**: Endpoint `POST /api/groups/{id}/subgroups/{subId}/expire` yang secara atomik mengunci forum dan langsung menjadwalkan `ForumMemoryJob`.
   - **Frontend UI (`frontend/app/chat/SubGroupListDrawer.tsx`)**: Tombol aksi admin **"⚡ Akhiri & AI"** pada setiap kartu forum topik.
3. **Pembersihan Seluruh Hardcoded Constants Menjadi Modular**:
   - Seluruh batasan, timeout, interval, dan parameter dihubungkan ke environment variables:
     - Hyperparameter AI: `AI_TIMEOUT_SECONDS` (default 45s), `AI_TEMPERATURE` (default 0.2).
     - Pemrosesan Pesan: `MEMORY_MAX_MESSAGES_ANALYSIS` (default 1000), `MEMORY_EVIDENCE_MAX_PREVIEW_LEN` (default 200).
     - Background Worker: `MEMORY_WORKER_INTERVAL_SECONDS` (default 15s), `MEMORY_JOB_BATCH_SIZE` (default 5), `MEMORY_JOB_MAX_ATTEMPTS` (default 3).
     - Negative Error Recovery: `MEMORY_RETRY_DELAY_1` (30s), `MEMORY_RETRY_DELAY_2` (2m), `MEMORY_RETRY_DELAY_3` (8m).
   - Pemutakhiran menyeluruh pada `backend/.env.example` dan `backend/.env`.
4. **Verifikasi Simulasi Live End-to-End Headless**:
   - Menjalankan simulasi penuh tanpa browser: Registrasi user, pembentukan grup, pembuatan forum, pengiriman 5 chat interaktif via WebSocket, instant expire bypass, ekstraksi AI Groq (2 decisions + snapshot evidence + summary), validasi dan publikasi admin, serta pembacaan linimasa memori oleh anggota grup.

### Test Evidence
- **Backend Tests (`go test ./...`)**: **100% PASS** di seluruh modul backend Go.
- **Frontend Build (`npm run build`)**: **✓ Compiled successfully** (0 error TypeScript & Turbopack).
- **Server Lifecycle**: 0 listening ports terabaikan (`fuser 8080/tcp 3000/tcp` bersih).

---

## 🐛 Bug Fix: SubGroupListDrawer React Hooks Order Violation (20 September 2026)

### Latar Belakang & Perbaikan
- **Isu**: Mengklik tombol `🏛️ Forum` di status bar menyebabkan seluruh halaman crash ke error boundary (*"This page couldn't load"*).
- **Root Cause**: Deklarasi hook `const [expiringId, setExpiringId] = useState<string | null>(null)` berada di bawah *early return* `if (!isOpen) return null`, melanggar aturan urutan rendering React (*Rendered more hooks than during previous render*).
- **Solusi**: Memindahkan hook `expiringId` ke puncak komponen (sebelum pengecekan `isOpen`) di [`frontend/app/chat/SubGroupListDrawer.tsx`](../frontend/app/chat/SubGroupListDrawer.tsx).
- **Verifikasi**: `npm run build` Turbopack lulus 100% tanpa error.



---

## 🐛 Bug Fix: Modal Memori Terpotong di Mobile & Banner Draft Tidak Muncul (20 September 2026)

### Bug 1 — Banner "Draft Siap Direview" tidak muncul untuk Admin
- **Isu**: Setelah forum expired dan AI memproses draft, banner review di `SubGroupListDrawer` tidak muncul meskipun draft sudah ada di database.
- **Root Cause**: `canCreateTopic` dipakai di dalam `useCallback` tapi tidak masuk dependency array `[parentGroupId]` → fetch draft tidak pernah dipicu ulang saat role user ter-load setelah render pertama.
- **Solusi**: Pisahkan fetch draft dari `fetchSubgroups` ke `useEffect` tersendiri dengan dependency `[isOpen, canCreateTopic, parentGroupId]` agar reaktif terhadap perubahan role. Juga reset `memoryDrafts` saat drawer ditutup.
- **File**: [`frontend/app/chat/SubGroupListDrawer.tsx`](../frontend/app/chat/SubGroupListDrawer.tsx)

### Bug 2 — Modal "Arsip Memori" terpotong/berantakan di mobile
- **Isu**: Saat klik "Buka Arsip →", modal `GroupMemoryListModal` muncul hanya setengah layar dan tidak punya overlay penuh di mobile.
- **Root Cause**: `.chat-main-pane` di CSS memiliki `overflow: hidden` + `position: relative` + `z-index: 10` → menciptakan **stacking context baru** yang menjebak `position: fixed` child. Modal `fixed inset-0` menjadi relatif terhadap container, bukan viewport.
- **Solusi**: Gunakan `createPortal(modalContent, document.body)` di ketiga modal memory (`GroupMemoryListModal`, `GroupMemoryDetailModal`, `MemoryDraftReviewModal`) agar di-render langsung ke `<body>`, bebas dari stacking context parent.
- **Files**: `frontend/app/chat/memory/GroupMemoryListModal.tsx`, `GroupMemoryDetailModal.tsx`, `MemoryDraftReviewModal.tsx`

### Bug 3 — Drawer & modal terbuka bersamaan (visual clash)
- **Isu**: Saat klik "Buka Arsip" atau "Review →" di drawer, drawer dan modal tampil bersamaan sebelum animasi tutup selesai.
- **Solusi**: Tambah `setTimeout(..., 300ms)` di handler `onOpenMemoryList` dan `onOpenReviewModal` di `page.tsx` agar drawer selesai animasi menutup sebelum modal terbuka.
- **File**: [`frontend/app/chat/page.tsx`](../frontend/app/chat/page.tsx)

### Test Evidence
- `npm run build` (Turbopack Next.js 16) lulus ✅ — 0 TypeScript error, 0 kompilasi error.

---

## 🎨 UI/UX Refactor: AI Memory Modals Design System Compliance & Portal Root Isolation (20 September 2026)

### Latar Belakang & Masalah
- **Isu**: Tampilan modal "Arsip Memori" dan "Review Draft Memori AI" di mobile melayang tidak beraturan, backdrop tidak muncul, dan card terhimpit di bagian atas layar.
- **Root Cause**: Komponen modal memori sebelumnya ditulis menggunakan utility classes Tailwind CSS (`fixed inset-0 z-[1000]`, `bg-slate-900`, dll) padahal proyek `wuzz-chat` menggunakan Custom Design System berbasis CSS Variables di `globals.css` tanpa Tailwind CSS compiler, sehingga seluruh class styling tersebut tidak dirender oleh browser.

### Perbaikan yang Dilakukan
1. **Portal Root Isolation (`frontend/app/layout.tsx` & `frontend/lib/usePortalTarget.ts`)**:
   - Menambahkan `<div id="modal-portal-root" />` di luar konteks `.chat-app-container`.
   - Mengimplementasikan custom hook `usePortalTarget()` untuk binding portal modal ke target elemen yang valid.
2. **Standardisasi Design System Primitives**:
   - Mengonversi `GroupMemoryListModal.tsx` dan `GroupMemoryDetailModal.tsx` ke primitive `.group-modal-backdrop.z-modal`, `.group-modal-card`, `.group-modal-header`, `.group-modal-close-btn`, `.group-form-input`, dan `.group-modal-body`.
   - Di mobile (`@media (max-width: 640px)`), modal otomatis tampil sebagai bottom sheet dengan transisi halus (`modalSlideUp`).
3. **Kartu Tinjauan & Komponen Pendukung (`ReviewCards.tsx`, `MemoryDraftReviewModal.tsx`, `ConfidenceBadge.tsx`, `globals.css`)**:
   - Menambahkan utility classes `.memory-review-card`, `.memory-textarea`, dan `.memory-evidence-item` di `globals.css`.
   - Mengganti seluruh sisa class Tailwind di `ConfidenceBadge` dan dialog tolak draft dengan styling berbasis token CSS (`var(--bg-elevated)`, `var(--border-default)`, `var(--accent-500)`).

### Test Evidence
- `npm run build` (Turbopack Next.js 16) lulus ✅ — 0 TypeScript error, 0 linting error.
- `go test ./...` (Backend Go) lulus ✅ — 100% test passed.

---

## 🛡️ Fase 0: Identity & Auth Hardening (Quick Wins) (21 September 2026)

### Latar Belakang & Masalah
Berdasarkan Audit Arsitektur Identitas dan Autentikasi WuzzChat, ditemukan 3 kerentanan kritis yang perlu diselesaikan tanpa memicu breaking change:
1. **R1: JWT Stateless Tanpa Revocation**: Logout tidak mencabut JWT, token tetap valid 7 hari setelah logout.
2. **R2: ForceResetPublicKey Tanpa Re-Auth**: Siapapun yang memiliki token JWT valid dapat mengganti public key dan ID perangkat E2EE tanpa verifikasi ulang password.
3. **R3: Tidak Ada Fitur Ganti Password**: Tidak ada endpoint untuk mengubah password atau memutus semua sesi aktif saat kredensial akun dicurigai bocor.

### Solusi & Implementasi Teknis
1. **JWT Revocation & Blacklist Management (R1)**:
   - Membuat tabel non-destruktif `revoked_tokens` dan `user_token_revocations` di [`store/sql.go`](../backend/internal/store/sql.go).
   - Menambahkan kontrak & implementasi `TokenStore` (`SQLTokenStore`) dengan fast-path memory cache `sync.Map` di [`store/token_store.go`](../backend/internal/store/token_store.go).
   - Menyematkan JTI UUID (`uuid.New()`) pada `jwt.RegisteredClaims` di [`auth/jwt.go`](../backend/internal/auth/jwt.go).
   - Middleware `RequireJWT` di [`auth/middleware.go`](../backend/internal/auth/middleware.go) memvalidasi status pencabutan token (JTI blacklist dan global user token revocation) berstatus `401 Unauthorized`.
   - Menjalankan background cleanup worker setiap 1 jam di [`main.go`](../backend/main.go) untuk membersihkan token kedaluwarsa.
2. **Re-Auth Gate pada Reset Kunci E2EE (R2)**:
   - `ResetPublicKey` (`POST /api/users/public-key/reset`) kini mewajibkan kolom `password` dan memverifikasinya via `userStore.VerifyPassword` sebelum mengizinkan rotasi kunci perangkat di [`api/auth_handler.go`](../backend/internal/api/auth_handler.go).
   - Menambahkan endpoint pre-check `POST /api/auth/verify-password` untuk re-autentikasi tindakan sensitif.
3. **Change Password & Global Invalidation (R3)**:
   - Menambahkan endpoint `POST /api/auth/change-password` di [`api/auth_handler.go`](../backend/internal/api/auth_handler.go).
   - Memvalidasi password lama, memvalidasi kekuatan password baru (6–128 karakter via `auth.ValidatePassword`), memperbarui hash bcrypt di database, dan mencabut semua token JWT aktif pengguna tersebut (`RevokeAllUserTokens`).
4. **Frontend Synchronization (Auth, Logout, Device Conflict & Password UI)**:
   - **API Interceptor Safe 401 Handling (`frontend/lib/api.ts`)**: Menambahkan whitelist endpoint verifikasi kredensial (`verify-password`, `change-password`, `public-key/reset`, `login`, `register`) agar kegagalan password (status 401) tidak memicu auto-logout dan redirect ke `/login?expired=1`.
   - **Re-Auth E2EE Key Reset (`frontend/lib/crypto/keyStore.ts`)**: Fungsi `forceResetUserE2EE(userId, password)` kini mengirimkan field `password` ke `POST /api/users/public-key/reset`. Menghapus fallback reset tanpa password pada `importAndSaveTransferredKeyPair` karena transfer kunci via QR sudah didukung native oleh `PUT /api/users/public-key`.
   - **Password Prompt pada Konflik Perangkat (`frontend/app/chat/DeviceConflictModal.tsx` & `page.tsx`)**: Menambahkan input password saat pengguna mengklik "🔑 Reset & Masuk di Perangkat Ini", meneruskan kredensial ke `forceResetUserE2EE`.
   - **UI Ganti Password (`frontend/app/chat/ProfileModal.tsx`)**: Menambahkan form interaktif "🔑 Ganti Password Akun" di tab Keamanan & Akun. Terintegrasi dengan `POST /api/auth/change-password`, mengonfirmasi pengalihan, dan melakukan logout otomatis saat seluruh sesi lama dicabut.
   - **Pembaruan Skrip Simulasi Pengujian (`frontend/test-*.mjs`)**: Menambahkan field `password` pada seluruh panggilan reset kunci di `test-two-device-simulation.mjs`, `test-group-simulation.mjs`, `test-two-user-e2ee-simulation.mjs`, `test-qr-device-transfer-simulation.mjs`, dan `test-android-pwa-simulation.mjs`.

### Test Evidence
- `go test -v ./...` di backend: **PASS 100%** (Termasuk `internal/api/auth_phase0_test.go` dan `internal/api/auth_e2ee_test.go`).
- `npm run build` di frontend: **PASS 100%** (Next.js 16.3.5 Turbopack compilation 0 error).
- **Live Curl Testing**: **PASS 100%** (12/12 skenario live curl lulus sempurna terhadap server backend nyata).

---

## 🖥️ Phase 1: Session Foundation & Remote Logout (22 September 2026)

### Latar Belakang & Masalah
Sebagai kelanjutan dari Phase 0 (JWT Revocation & Password Hardening), pengguna memerlukan visibilitas penuh atas sesi aktif mereka dan kemampuan untuk melakukan pencabutan sesi secara jarak jauh (*Remote Logout*):
1. **R5: Tidak Ada Session Inventory**: Pengguna tidak dapat melihat di perangkat atau peramban mana saja akun mereka sedang masuk.
2. **Kebutuhan Remote Logout**: Pengguna tidak dapat mengeluarkan akun dari satu perangkat tertentu (misal: laptop kantor yang tertinggal) tanpa harus mengubah password akun.
3. **Pencatatan Sesi Terpusat**: Perlunya tabel `sessions` terikat pada JTI token JWT untuk Stateful Session Tracking non-destruktif.

### Solusi & Implementasi Teknis
1. **Skema Basis Data & Auto-Migration (`backend/internal/store/sql.go`)**:
   - Menambahkan tabel `sessions` di PostgreSQL dan SQLite:
     ```sql
     CREATE TABLE IF NOT EXISTS sessions (
         id VARCHAR(64) PRIMARY KEY,              -- JTI dari JWT
         user_id VARCHAR(64) NOT NULL,
         device_id TEXT DEFAULT '',
         user_agent TEXT DEFAULT '',
         ip_address VARCHAR(45) DEFAULT '',
         is_revoked BOOLEAN DEFAULT FALSE,
         created_at TIMESTAMP NOT NULL,
         expires_at TIMESTAMP NOT NULL,
         last_active_at TIMESTAMP NOT NULL
     );
     CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, is_revoked);
     CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
     ```
2. **Session Store & Domain Layer (`backend/internal/store/session_store.go` [NEW])**:
   - Definisikan struct `Session` dan interface `SessionStore`.
   - Implementasi `SQLSessionStore` dengan method: `CreateSession`, `GetActiveSessions`, `RevokeSession`, `RevokeAllOtherSessions`, `IsSessionRevoked`, `TouchSession`, dan `CleanupExpiredSessions`.
   - Menyelaraskan `IsTokenRevoked` di [`backend/internal/store/token_store.go`](../backend/internal/store/token_store.go) agar langsung mendeteksi sesi yang dicabut di tabel `sessions`.
3. **JWT Helper & REST API Handlers (`backend/internal/auth/jwt.go`, `api/auth_handler.go`, `main.go`)**:
   - Menambahkan `GenerateTokenDetailed` di `jwt.go` untuk mengekstraksi JTI dan masa kedaluwarsa secara langsung.
   - Perekaman sesi login & register (`CreateSession`) dengan ekstraksi client IP (`CF-Connecting-IP`, `X-Forwarded-For`, `RemoteAddr`) dan `User-Agent`.
   - Menambahkan endpoint REST baru:
     - `GET /api/auth/sessions`: Menampilkan inventaris sesi aktif dengan penanda `is_current: true`.
     - `DELETE /api/auth/sessions/:id`: Mencabut sesi tertentu dari jarak jauh.
     - `POST /api/auth/sessions/revoke-others`: Mencabut seluruh sesi lain kecuali sesi saat ini.
   - Mengintegrasikan pencabutan sesi di `Logout` dan `ChangePassword`.
   - Background worker periodik (setiap 1 jam) di `main.go` untuk membersihkan sesi kedaluwarsa.
4. **Frontend UI Manajemen Sesi Aktif (`frontend/lib/types.ts`, `frontend/app/chat/ProfileModal.tsx`)**:
   - Menambahkan interface `AuthSession` di `types.ts`.
   - Menambahkan kartu interaktif **"🖥️ Sesi Login Aktif"** pada Tab Keamanan di modal profil.
   - Parsing User-Agent otomatis (label & icon Chrome di Windows, Safari di iOS, Firefox di Linux, dll).
   - Indikator badge *"🟢 Sesi Ini"* pada sesi aktif perangkat saat ini.
   - Tombol *"Cabut"* per-sesi dengan proteksi konfirmasi dan loading spinner.
   - Tombol *"🚪 Keluar dari Semua Perangkat Lain"* jika terdapat lebih dari satu sesi aktif.

### Test Evidence
- **Backend Unit & Integration Tests (`backend/internal/api/auth_session_test.go` [NEW])**: **PASS 100%** (5 skenario pengujian sesi aktif, penanda `is_current`, remote revoke, revoke all others, dan expired cleanup).
- **Full Backend Suite (`go test ./...`)**: **PASS 100%** across all packages.
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 TypeScript error, 0 lint error).

---

## 2026-09-22: Fix React Hook Order Violation on ProfileModal Open

### Problem Description
Saat pengguna mengklik tombol avatar profil di header obrolan, aplikasi frontend Next.js mengalami crash dengan pesan *"This page couldn't load. Reload to try again, or go back."*.

### Root Cause
Di [`frontend/app/chat/ProfileModal.tsx`](../frontend/app/chat/ProfileModal.tsx), terdapat guard kondisional awal `if (!isOpen || !user || typeof document === 'undefined') return null` di baris 109. Ketika fitur manajemen sesi aktif ditambahkan di Phase 1, hooks baru (`useCallback` untuk `fetchSessions` dan `useEffect` untuk listener event) diletakkan di bawah baris 109. Akibatnya, saat modal tertutup dieksekusi 13 hooks, namun saat dibuka dieksekusi 15 hooks, melanggar *Rules of Hooks* React (`Rendered more hooks than during the previous render`) dan memicu fatal Error Boundary Next.js.

### Implementation Details
- Menghapus guard conditional return prematur dari baris 109 di [`frontend/app/chat/ProfileModal.tsx`](../frontend/app/chat/ProfileModal.tsx).
- Memindahkan guard return `if (!isOpen || !user || typeof document === 'undefined') return null` ke posisi paling bawah komponen tepat sebelum pemanggilan `return createPortal(...)`.
- Memastikan `user?.is_verified` aman dari NPE (`null-safe`).
- Seluruh hooks kini selalu dieksekusi secara seragam dan tanpa syarat (*unconditionally*) di setiap render.

### Test Evidence
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 TypeScript error, 0 lint error).
- **Backend Test Suite (`go test ./...`)**: **PASS 100%**.

---

## 2026-09-22: Otomatisasi Pencabutan Sesi (Session Revocation) pada Transfer, Reset, dan Keluar

### Problem Description
1. Saat transfer perangkat berhasil (`ConsumeSession`), sesi perangkat lama di tabel `sessions` tidak ter-revoke dan frontend modal QR hanya menutup modal tanpa memanggil `logout()`.
2. Saat reset kunci publik (`ResetPublicKey`), sesi perangkat lain tidak ter-revoke dan WebSocket perangkat lain tidak ditendang.
3. Saat pengguna membatalkan konflik perangkat (`!isRotated`) di `DeviceConflictModal`, `await logout()` tidak dipanggil ke server sehingga sesi tetap menggantung.

### Implementation Details
1. **Backend Transfer Handler (`backend/internal/api/transfer_handler.go`, `backend/main.go`)**:
   - Menambahkan method `SetSessionStore(ss store.SessionStore)` pada `TransferHandler`.
   - Pada `ConsumeSession`, saat transfer sukses dikonsumsi perangkat baru, otomatis memanggil `sessionStore.RevokeAllOtherSessions(claims.UserID, claims.ID)`. Sesi perangkat lama langsung ditandai `is_revoked = TRUE` di tabel database `sessions`.
2. **Backend Auth Handler (`backend/internal/api/auth_handler.go`, `backend/main.go`)**:
   - Menambahkan method `SetHub(hub WebSocketHub)` pada `AuthHandler`.
   - Pada `ResetPublicKey`, saat kunci publik di-reset dengan verifikasi password:
     - Memutus koneksi WebSocket perangkat lama seketika dengan sinyal `SESSION_REPLACED` melalui `hub.KickClientByUserID()`.
     - Mencabut seluruh sesi perangkat lain di database via `sessionStore.RevokeAllOtherSessions(claims.UserID, claims.ID)`.
   - Pada `RevokeAllOtherSessions`, backend juga menendang koneksi WebSocket perangkat lain secara live.
   - Menyambungkan dependensi `sessionStore` dan `hub` di `backend/main.go`.
3. **Frontend Auto-Logout & Clean Navigation (`frontend/app/chat/DeviceTransferModal.tsx`, `frontend/app/chat/page.tsx`)**:
   - Di `DeviceTransferModal.tsx`, saat menerima sinyal transfer berhasil (`handleSessionReplaced`), status sukses ditampilkan selama 1,5 detik lalu mengeksekusi `await logout()` dan mengarahkan browser ke `/login?logout=1`.
   - Di `page.tsx`, memastikan `await logout()` selalu dipanggil pada `handleDeviceConflictLogout` baik untuk kasus rotasi maupun pembatalan login baru.
4. **Backend Automated Tests (`backend/internal/api/transfer_handler_test.go`, `backend/internal/api/auth_e2ee_test.go`)**:
   - `TestTransferHandler_SessionRevocationOnConsume`: Memvalidasi sesi lama otomatis dicabut saat transfer selesai.
   - `TestAuthHandler_ResetPublicKey_RevokesOtherSessionsAndKicksWebsocket`: Memvalidasi sesi lama dicabut dan WebSocket ditendang saat reset kunci.

### Test Evidence
- **Backend Unit & Integration Tests (`go test -v ./...`)**: **PASS 100%** across all packages.
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 TypeScript error, 0 lint error).

---

## 2026-09-22: Arsitektur Multi-Device Level 1 (Device Registry & Remote Logout)

### Problem Description
1. Database backend sebelumnya hanya menyimpan 1 string `active_device_id` di tabel `users`, tanpa riwayat perangkat yang pernah terhubung, metadata User-Agent/OS/browser, atau IP address.
2. Pengguna tidak memiliki visibilitas perangkat apa saja yang sedang aktif dan tidak bisa mengeluarkan perangkat lama/hilang dari jarak jauh (*remote logout*).
3. Pengiriman `device_id` di frontend belum diintegrasikan ke halaman login dan registrasi awal.

### Implementation Details
1. **Skema & Store Perangkat (`backend/internal/store/sql.go`, `backend/internal/store/device_store.go`)**:
   - DDL non-destruktif tabel `devices` (`id`, `user_id`, `name`, `platform`, `user_agent`, `ip_address`, `is_active`, `last_seen_at`, `created_at`) dan index `idx_devices_user_active`.
   - Interface `DeviceStore` dan implementasi `SQLDeviceStore` dengan dukungan upsert dan pembaruan timestamp `last_seen_at`.
2. **WebSocket Remote Kick (`backend/internal/ws/hub.go`, `backend/internal/ws/handler.go`, `backend/internal/api/transfer_handler.go`)**:
   - Method `KickClientByDeviceID(userID, deviceID, reason)` pada Hub untuk memutuskan koneksi perangkat tertentu secara seketika dengan kode Close `4001: DEVICE_KICKED`.
   - Injeksi `deviceStore` ke WebSocket handler untuk memperbarui `last_seen_at` otomatis saat upgrade HTTP ke WS berhasil.
3. **REST API Device Management (`backend/internal/api/device_handler.go`, `backend/internal/api/auth_handler.go`, `backend/main.go`)**:
   - `GET /api/auth/devices`: Mengembalikan daftar seluruh perangkat aktif milik pengguna.
   - `DELETE /api/auth/devices/:id`: Mengeluarkan perangkat dari jarak jauh (guard: tolak jika perangkat saat ini).
   - Injeksi pencatatan perangkat otomatis pada handler `Login` dan `Register`, lengkap dengan helper deteksi User-Agent ramah (`parseDeviceName`).
4. **Frontend UI & State (`frontend/app/chat/ProfileModal.tsx`, `frontend/lib/types.ts`, `frontend/lib/auth-context.tsx`, `frontend/app/login/page.tsx`, `frontend/app/register/page.tsx`)**:
   - Tab navigasi baru **"📱 Perangkat"** pada `ProfileModal.tsx` dengan daftar perangkat aktif, penanda *"Perangkat Ini"*, tombol *"Keluarkan"* per perangkat lain, dan tautan ke QR Device Transfer.
   - Sinkronisasi pembacaan `currentDeviceId` dengan fungsi kanonikal `getOrCreateDeviceId()` (`wuzz_device_id`).
   - Injeksi `device_id` pada form submit login & register.

### Test Evidence
- **Backend Unit & API Tests (`backend/internal/store/device_store_test.go`, `backend/internal/api/device_handler_test.go`)**: **PASS 100%**.
- **Backend Full Test Suite (`go test -v -count=1 ./...`)**: **PASS 100%**.
- **Frontend IndexedDB & Continuity Cache Tests (`npm run test:cache`)**: **PASS 100% (9/9)**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors)**.

---

## 2026-09-22: Arsitektur Multi-Device Level 2 (Multi-Session HP + Laptop Bersamaan)

### Problem Description
1. Sebelumnya in-memory Hub hanya mengizinkan 1 koneksi WebSocket per user (`clients map[string]*Client` dengan key `userID`), sehingga ketika user login di Laptop lalu membuka HP, koneksi Laptop langsung tertimpa dan terputus (*single active device limitation*).
2. Pesan yang dikirim dari satu perangkat (misal Laptop) tidak diforward kembali ke perangkat lain milik user yang sama (HP), menyebabkan linimasa pesan antar perangkat tidak sinkron secara real-time.
3. Saat perangkat dikeluarkan dari jarak jauh (*remote logout*), private key E2EE lokal di browser perangkat yang dikeluarkan belum dimusnahkan secara otomatis dari `IndexedDB`.

### Implementation Details
1. **Multi-Device Hub Architecture (`backend/internal/ws/hub.go`)**:
   - Menambahkan konstanta `DefaultMaxActiveDevicesPerUser = 2` dan method konfigurasi dinamis `SetMaxActiveDevices(limit int)`.
   - Mengubah struktur pemetaan koneksi menjadi `clients map[string]*Client` (key: `sessionKey`) dan `userClients map[string]map[string]*Client` (key: `userID -> deviceID -> *Client`).
   - Penegakan **FIFO Session Eviction**: Ketika user yang sudah memiliki 2 perangkat aktif menghubungkan perangkat ke-3, perangkat yang paling awal aktif (`JoinedAt` tertua) otomatis menerima Close Code `4001` dengan pesan `SESSION_REPLACED: Akun Anda dibuka dari perangkat lain.`.
   - **Broadcast Fanout & Self-Sync**: `broadcastLocal()` mengirim pesan ke seluruh perangkat aktif setiap anggota room. Untuk pengirim pesan (`mID == senderUserID`), pesan tetap diteruskan ke perangkat pengirim yang lain sehingga linimasa chat HP & Laptop seketika sinkron.
2. **WebSocket Client & Handler Routing (`backend/internal/ws/client.go`, `backend/internal/ws/handler.go`)**:
   - Menambahkan field `SessionKey` dan helper `getSenderKey()` pada struct `Client`.
   - Seluruh pemanggilan `BroadcastRoom` menggunakan `c.getSenderKey()` agar socket pengirim asal tidak menerima echo pesannya sendiri, namun perangkat lain milik pengirim tetap menerima pesan.
   - Relaksasi gatekeeper: memvalidasi status keaktifan perangkat di `deviceStore` (menolak dengan status 403 jika `is_active = false`).
3. **Frontend Terminal Kick & Keypair Cleanup (`frontend/lib/ws-client.ts`, `frontend/app/chat/page.tsx`)**:
   - `ws-client.ts`: Penanganan Close Code 4001 (`SESSION_REPLACED` & `DEVICE_KICKED`) menghentikan loop reconnect otomatis secara terminal (`destroyed = true`).
   - `page.tsx`: Memanggil `clearLocalKeyPair(user.id)` saat sinyal `DEVICE_KICKED` diterima untuk menghapus private key lokal dari `IndexedDB` (`wuzz_crypto_db`) dan `CacheStorage`.
4. **Automated Testing (`backend/internal/ws/hub_multisession_test.go`, `frontend/test-multi-device-frontend.mjs`)**:
   - Backend unit tests untuk kuota 2 perangkat, FIFO eviction perangkat ke-3, broadcast fanout, remote kick per-device, dan configurable limit (`PASS 100%`).
   - Frontend integration tests untuk pemusnahan kunci lokal saat kick, penanganan terminal code 4001, dan deteksi pesan keluar self-sync (`PASS 100%`).

### Test Evidence
- **Backend Multi-Session Tests (`go test -v -run TestHub_MultiSession ./internal/ws/...`)**: **PASS 100%**.
- **Backend Full Test Suite (`go test ./...`)**: **PASS 100%** (seluruh paket lulus tanpa regresi).
- **Frontend Multi-Device Test (`npm run test:multi-device`)**: **PASS 100% (4/4 skenario)**.
- **Frontend Cache Continuity Test (`npm run test:cache`)**: **PASS 100% (9/9 skenario)**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 error TypeScript/lint)**.

---

## 2026-09-23: Phase 5 — Multi-Device E2EE Continuity (Shared Master Key Pattern)

### Problem Description
1. Setelah Phase 2 mengizinkan 2 koneksi WebSocket paralel, login perangkat kedua (Laptop) tetap memicu `DeviceConflictModal` yang mengunci layar karena `UpdatePublicKeyWithDevice` di `user_store.go` menolak update kunci dengan HTTP 409 `ErrKeyConflict`.
2. Handler `ConsumeSession` di `transfer_handler.go` secara otomatis memanggil `KickClientByUserID` dan `RevokeAllOtherSessions` yang menendang perangkat lama (HP) saat QR transfer berhasil.
3. Alur transfer di frontend mengasumsikan pemindahan kunci 1 arah dengan melakukan logout perangkat lama.

### Implementation Details
1. **Backend Key-Matching Store (`backend/internal/store/user_store.go`)**:
   - Menambahkan relaksasi key-matching pada `UpdatePublicKeyWithDevice`. Jika kunci publik yang dikirim oleh perangkat ke-2 identik dengan yang tersimpan di server (`strings.TrimSpace(pubKey) == trimmedKey`), kembalikan `(keyVer, nil)` (200 OK) tanpa menimpa `active_device_id`.
2. **Transfer Handler Non-Destructive Continuity (`backend/internal/api/transfer_handler.go`)**:
   - Menghapus pemanggilan `KickClientByUserID` dan `RevokeAllOtherSessions` saat transfer dikonsumsi. Kedua perangkat tetap aktif berdampingan.
3. **Frontend Synchronized Flow (`frontend/app/chat/DeviceTransferModal.tsx`, `frontend/package.json`)**:
   - Memperbarui teks pada modal transfer agar mencerminkan sinkronisasi multi-device.
   - Menambahkan script verifikasi frontend `test:phase5` (`test-phase5-key-transfer.mjs`).
4. **Automated Testing**:
   - Backend unit tests (`backend/internal/store/user_store_multidevice_test.go`): Key-matching, reconnect, 409 conflict.
   - Backend integration tests (`backend/internal/api/multidevice_e2ee_test.go`): HTTP 200 OK identik, expired 410, wrong user 403, replay 410, payload 400, unauthorized 401.
   - Backend transfer test update (`backend/internal/api/transfer_handler_test.go`): Memastikan `kickCalled == false` dan sesi tetap aktif.
   - Frontend tests: `npm run test:phase5` (3/3), `npm run test:multi-device` (4/4), `npm run test:cache` (9/9), dan `npm run build`.

### Test Evidence
- **Backend Unit & API Tests (`go test -v ./internal/store ./internal/api`)**: **PASS 100%**.
- **Backend Full Test Suite (`go test ./...`)**: **PASS 100%**.
- **Frontend Phase 5 Test (`npm run test:phase5`)**: **PASS 100% (3/3)**.
- **Frontend Multi-Device Test (`npm run test:multi-device`)**: **PASS 100% (4/4)**.
- **Frontend Cache Continuity Test (`npm run test:cache`)**: **PASS 100% (9/9)**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors)**.

---

## 2026-09-23: Phase 3 — Credential Separation (Multi-Credential Architecture)

### Problem Description
1. Kredensial password (`password_hash`) disimpan bercampur di tabel `users`.
2. Hal ini menyulitkan penambahan metode login baru di masa depan (Passkey / WebAuthn, OAuth/SSO, atau OTP) tanpa menambah kolom kustom di tabel `users`.
3. Diperlukan tabel terpisah `user_credentials` dan pola transisi Dual-Read/Dual-Write agar transisi berjalan mulus tanpa downtime (zero-downtime & non-destructive).

### Implementation Details
1. **Auto-Migration DDL (`backend/internal/store/sql.go`)**:
   - Menambahkan DDL tabel `user_credentials` (`id`, `user_id`, `type`, `identifier`, `secret_data`, `name`, `created_at`, `updated_at`).
   - Menambahkan indeks `idx_credentials_user(user_id, type)` dan `idx_credentials_ident(identifier)`.
   - Menjaga kolom `users.password_hash` tetap utuh untuk non-destructive compatibility.
2. **Credential Store (`backend/internal/store/credential_store.go`)**:
   - Model `UserCredential` dan interface `CredentialStore`.
   - Implementasi `SQLCredentialStore` dengan query SQL adaptif untuk Postgres dan SQLite.
   - Mengikuti DEC-003: `GetPasswordCredential` mengembalikan `(nil, nil)` jika tidak ditemukan (bukan error).
3. **Dual-Read & Dual-Write (`backend/internal/store/user_store.go`)**:
   - Menambahkan dependency `credentialStore CredentialStore` pada `SQLUserStore` dan method `SetCredentialStore`.
   - `Register`: Menyimpan akun ke tabel `users` dan dual-write ke `user_credentials`.
   - `Authenticate`: Menerapkan strategi Dual-Read: mencoba verifikasi via `user_credentials` terlebih dahulu; jika belum ada, fallback ke `users.password_hash` dan otomatis melakukan auto-backfill ke `user_credentials`.
   - `ChangePassword`: Melakukan update password ke `users` dan `user_credentials`.
4. **Credential API Handler (`backend/internal/api/credential_handler.go`)**:
   - Handler `ListCredentials` untuk endpoint `GET /api/auth/credentials` yang mengembalikan daftar metode login user terautentikasi tanpa membocorkan `secret_data`.
5. **Main Wire-Up (`backend/main.go`)**:
   - Inisialisasi `store.NewSQLCredentialStore`, penyuntikan ke `SQLUserStore`, dan registrasi route `GET /api/auth/credentials` dengan middleware `auth.RequireJWT()`.
6. **Automated Unit Testing (`backend/internal/store/credential_store_test.go`)**:
   - 4 skenario test: Create & Get, Not Found (nil return), Update Password, dan List Credentials (secret sanitization).

### Test Evidence
- **Backend Credential Unit Tests (`go test -v -run TestCredentialStore ./internal/store/...`)**: **PASS 100% (4/4 skenario)**.
- **Backend Store Package Tests (`go test ./internal/store/...`)**: **PASS 100%**.
- **Backend API Package Tests (`go test ./internal/api/...`)**: **PASS 100%**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors)**.

---

## 2026-09-23: Login Device Limit Guard & Interactive Device Eviction Modal

### Problem Description
1. Pengguna dapat login di perangkat ke-3 tanpa ada peringatan awal di form login, namun saat masuk ke `/chat`, perangkat ke-3 tidak dapat beroperasi secara normal akibat terbentur proteksi kunci E2EE (`KEY_ALREADY_REGISTERED` / `DeviceConflictModal`) dan batas koneksi WebSocket Hub (`DefaultMaxActiveDevicesPerUser = 2`).
2. Ketiadaan validasi dini di endpoint `POST /api/auth/login` menimbulkan ambiguitas bagi pengguna.

### Implementation Details
1. **Backend Device Limit Gate (`backend/internal/api/auth_handler.go`)**:
   - Memperluas `LoginRequest` dengan parameter `confirm_override` (bool) dan `kick_device_id` (string).
   - Menambahkan pengecekan kuota perangkat aktif (`GetUserDevices`).
   - Jika kuota 2 perangkat terpenuhi dan perangkat yang mencoba login adalah perangkat baru ke-3:
     - Jika `confirm_override == false`: Mengembalikan HTTP 409 Conflict dengan kode `DEVICE_LIMIT_REACHED` dan payload daftar perangkat aktif (`active_devices`).
     - Jika `confirm_override == true`: Menonaktifkan perangkat yang dipilih (`DeactivateDevice`), mencabut sesi perangkat terkait (`RevokeDeviceSessions`), dan memutuskan koneksi WebSocket secara real-time (`KickClientByDeviceID`).
2. **Session Store Device Revocation (`backend/internal/store/session_store.go`)**:
   - Menambahkan method `RevokeDeviceSessions(deviceID, userID string) error` untuk mencabut seluruh sesi JWT yang terikat pada perangkat yang dikeluarkan.
3. **Backend Unit Testing (`backend/internal/api/auth_handler_device_limit_test.go`)**:
   - Menambahkan skenario test komprehensif: registrasi, login device ke-2, re-login device ke-1 (tanpa error), penolakan device ke-3 (409 Conflict), dan pergantian perangkat berhasil via `confirm_override`.
4. **Frontend Device Limit Modal (`frontend/app/login/DeviceLimitModal.tsx`)**:
   - Komponen modal interaktif menggunakan token primitives `DESIGN.md` (`.modal-overlay`, `.modal-card-unified`, `.modal-header-unified`, dst).
   - Menampilkan daftar perangkat aktif dengan ikon platform, nama OS/peramban, waktu aktif terakhir, dan penanda "Paling Lama".
   - Mengintegrasikan `useModalBackHandler` untuk penanganan tombol Back di browser mobile.
5. **Frontend Login Integration (`frontend/app/login/page.tsx`, `frontend/lib/api.ts`)**:
   - Memperbarui `apiRequest` agar menyertakan data respons pada kondisi non-OK (`!res.ok`).
   - Menangkap error `DEVICE_LIMIT_REACHED` di halaman login dan membuka modal pemilihan perangkat.
   - Mengirim ulang login dengan `confirm_override: true` dan `kick_device_id`.

### Test Evidence
- **Backend Unit Tests (`go test -v ./internal/api/ -run TestAuthHandler_DeviceLimitFlow`)**: **PASS 100%**.
- **Backend Full Test Suite (`go test -v ./...`)**: **PASS 100%**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors)**.

---

## 2026-09-23: Modular Monolith Refactoring (Fase 1: Pemisahan GroupStore dari SQLUserStore)

### Problem Description
1. Implementasi `store.GroupStore` (22 method untuk operasi grup & forum) sebelumnya digabungkan di dalam `SQLUserStore` pada `backend/internal/store/group_store.go`.
2. Hal ini mencampurkan batasan domain antara Identity/Auth (pengguna, sesi, kunci, profil) dengan Group Domain (grup, subgrup/forum, join request, peran keanggotaan).
3. Untuk evolusi jangka panjang WuzzChat sebagai messaging engine yang reusable (Modular Monolith), domain boundaries perlu dipisahkan secara bersih tanpa merusak database schema dan tanpa mengubah behavior aplikasi.

### Implementation Details
1. **Dedicated SQL Group Store (`backend/internal/store/sql_group_store.go`)**:
   - Membuat struct `SQLGroupStore` mandiri dengan konstruktor `NewSQLGroupStore(db *sql.DB, driverName string) *SQLGroupStore`.
   - Memindahkan seluruh 22 method publik `GroupStore` dan helper internal (`touchConversation`, `groupGroupID`) ke `SQLGroupStore`.
   - Menggunakan pool koneksi `*sql.DB` bersama dari `SQLMessageStore` sehingga tidak menimbulkan koneksi database tambahan.
2. **Interface & Entity Extraction (`backend/internal/store/group_store.go`)**:
   - Membersihkan seluruh implementasi konkret method pada `SQLUserStore`.
   - File `group_store.go` kini murni berfungsi sebagai kontrak interface `GroupStore`, types, dan error sentinels.
3. **Application Entrypoint Wiring (`backend/main.go`)**:
   - Memperbarui inisialisasi `groupStore` agar menggunakan `store.NewSQLGroupStore(sqlStore.DB(), sqlStore.DriverName())` secara terpisah dari `sqlUserStore`.
4. **Dependency Inversion & Test Suites Alignment**:
   - Memperbarui test suite (`internal/worker`, `internal/ws`, `internal/api`, `internal/ai`, `internal/store`) agar mengonsumsi `SQLGroupStore` untuk operasi grup/forum dan `SQLUserStore` untuk operasi akun/pengguna.

### Test Evidence
- **Backend Full Test Suite (`go test -count=1 ./...`)**: **PASS 100% (Semua 9 package lulus tanpa cache)**.
- **Backend Compilation (`go build ./...`)**: **PASS 100% (0 errors)**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors)**.

---

## 2026-09-23: Bug Fix: Multi-Device Remote Logout & WebSocket Reconnect Resilience

### Problem Description
1. Saat user berada di perangkat aktif (Device 1) dan mengeluarkan perangkat lain (Device 2) via menu Profil ➔ Tab Perangkat (`DELETE /api/auth/devices/{id}`), Device 2 berhasil dikeluarkan.
2. Namun, Device 1 mengalami kegagalan koneksi: indikator koneksi di bar atas menjadi kuning (`reconnecting`/`connecting`) berulang kali hingga timeout dan tidak dapat terhubung lagi ke WebSocket.
3. Root cause:
   - Endpoint `RemoveDevice` hanya menonaktifkan Device 2 di tabel `devices` tanpa memperbarui kolom `users.active_device_id`.
   - Di WebSocket handshake (`internal/ws/handler.go`), jika Device 1 belum tercatat di tabel `devices` (misal login lama sebelum migrasi), query `GetUserDevices` menghasilkan 0 perangkat aktif karena Device 2 sudah dinonaktifkan.
   - Sistem jatuh ke fallback *single-device* dan membandingkan ID Device 1 dengan `users.active_device_id` yang masih berisi ID Device 2, menyebabkan penolakan HTTP 403 Forbidden berulang kali.

### Implementation Details
1. **DeviceStore & UserStore Extension (`backend/internal/store/`)**:
   - Menambahkan method `GetDeviceByID(deviceID string) (*Device, error)` di `DeviceStore` dan `SQLDeviceStore` untuk membaca status perangkat tanpa terhalang filter `is_active`.
   - Menambahkan method `SetActiveDevice(userID, deviceID string) error` di `UserStore` dan `SQLUserStore` untuk mengalihkan otoritas perangkat aktif.
2. **Device Handler Resilience (`backend/internal/api/device_handler.go`)**:
   - Menyuntikkan `UserStore` ke `DeviceHandler`.
   - Di `RemoveDevice`: jika perangkat yang dikeluarkan merupakan `active_device_id`, sistem otomatis mengalihkan otoritas `active_device_id` ke perangkat pemanggil (`currentDeviceID`).
   - Memastikan perangkat pemanggil terdaftar aktif di `deviceStore`.
   - Mencabut seluruh sesi token JWT perangkat yang dikeluarkan (`RevokeDeviceSessions`).
3. **WebSocket Handshake Gatekeeper Update (`backend/internal/ws/handler.go`)**:
   - Memanfaatkan `GetDeviceByID` untuk mengecek apakah perangkat yang terhubung berstatus nonaktif (`is_active == false` ➔ tolak HTTP 403 `DEVICE_DEACTIVATED`).
   - Otomatis mendaftarkan (*auto-register*) perangkat sah dengan token JWT valid jika belum ada di tabel `devices`.
   - Otomatis menyinkronkan `active_device_id` ke perangkat yang sedang terhubung jika `active_device_id` lama kosong atau menunjuk ke perangkat yang sudah nonaktif.
   - Membatasi fallback single-device hanya jika `deviceStore` bernilai `nil`.
4. **Integration Test Suite (`backend/internal/api/multi_device_lifecycle_test.go`)**:
   - Menambahkan pengujian integrasi lifecycle lengkap: login Device 1, link Device 2 via QR, remote logout Device 2 dari Device 1, verifikasi WebSocket reconnect Device 1 sukses (101 Switching Protocols / Indikator Hijau), penolakan Device 2 (403 Forbidden), dan sinkronisasi `active_device_id`.

5. **Atomic UPSERT on Conflict & Cross-User Device Rebinding (`backend/internal/store/device_store.go`, `backend/internal/ws/handler.go`)**:
   - Memperbaiki `RegisterOrUpdateDevice` agar menggunakan query atomic `INSERT ... ON CONFLICT (id) DO UPDATE SET user_id=EXCLUDED.user_id, is_active=TRUE...` di PostgreSQL dan SQLite. Ini mencegah error `pq: duplicate key value violates unique constraint "devices_pkey" (23505)` ketika satu browser/device ID digunakan bergantian oleh akun yang berbeda.
   - Memperbaiki WebSocket handshake: jika perangkat sebelumnya tercatat di bawah user lain, sistem otomatis melakukan rebind kepemilikan perangkat ke akun yang sedang login dan mengaktifkannya, alih-alih menolak koneksi secara keliru.

### Test Evidence
- **Backend Lifecycle Test (`go test -v ./internal/api -run TestMultiDevice_CompleteUserFlow`)**: **PASS 100%**.
- **Backend Device Rebind Test (`go test -v ./internal/store -run TestSQLDeviceStore_SQLite`)**: **PASS 100%**.
- **Backend Full Test Suite (`go test -count=1 ./...`)**: **PASS 100% (Semua package lulus)**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors)**.

---

## 2026-09-23: Roadmap v2.0 Harmonization & Context Primer (PROMPT.md) Synchronization

### Description
1. Melakukan harmonisasi master roadmap tanpa membuang artefak historis maupun rencana fitur masa depan, bertransformasi menjadi **Dual-Track Evolving Architecture v2.0**:
   - **Track A (Product Features & Platform Parity)**: Mempertahankan kontinuitas fitur Fase 1–8, Fase 10 (Group Memory AI), Fase 11 (Multi-Device Sessions & Continuity), serta rencana Fase 9 (Avatar & Monetisasi) dan Mobile Native.
   - **Track B (Modular Monolith & DDD Engine)**: Mengintegrasikan transisi arsitektur backend Go menjadi Reusable Messaging Engine (Fase 1 GroupStore Decoupling [Done], Fase 2 Auth Application Service [Next]).
2. Menyinkronkan [PROMPT.md](file:///home/bms-del112/BMS/personal-project/wuzz-chat/PROMPT.md) sebagai Single Source of Truth context primer AI:
   - Menambahkan rujukan dokumen [`docs/MODULAR_MONOLITH_DDD.md`](MODULAR_MONOLITH_DDD.md), [`docs/ARCHITECTURE_AUDIT.md`](ARCHITECTURE_AUDIT.md), dan [`docs/GROUP_MEMORY_AI_SPEC.md`](GROUP_MEMORY_AI_SPEC.md).
   - Memperbarui tabel tech stack dan daftar kemajuan terkini (Fase 9, 10, 11, serta Track Modular Monolith).

### Test Evidence
- **Backend Full Test Suite (`go test ./...`)**: **PASS 100%**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors)**.

---

## 2026-09-23: Multi-Node WebSocket Cluster Session Kick via Redis Pub/Sub (Post-Milestone 8)

### Problem Description
1. Pada konfigurasi multi-instance Fly.io (misal Instance A di Singapura dan Instance B di Tokyo), koneksi WebSocket klien terikat pada mesin fisik tempat socket di-upgrade.
2. Jika pengguna login dari perangkat baru atau mereset kunci keamanan di Instance A, pemanggilan `KickClientByUserID` atau `KickClientByDeviceID` sebelumnya hanya menendang koneksi yang terhubung secara fisik di Instance A (`h.userClients[userID]`).
3. Jika perangkat lama pengguna terhubung ke Instance B, koneksi tersebut tidak terputus dan tetap aktif, menyebabkan desinkronisasi sesi dan celah pergantian perangkat (*ghost active session*).

### Implementation Details
1. **ClusterEvent Struct Extension (`backend/internal/ws/hub.go`)**:
   - Menambahkan field `EventType string` (`"session_kick"`, `"device_kick"`), `ExceptDeviceID string`, dan `KickReason string` dengan tag `omitempty` untuk kompatibilitas penuh dengan event cluster yang sudah ada.
2. **Cluster Subscriber Dispatcher (`backend/internal/ws/hub.go`)**:
   - Mengganti handler `SetBroker` dengan `switch event.EventType`:
     - `"session_kick"`: Memanggil `h.kickClientByUserIDLocal(event.TargetUserID, event.ExceptDeviceID, event.KickReason)`.
     - `"device_kick"`: Memanggil `h.kickClientByDeviceIDLocal(event.TargetUserID, event.SenderID, event.KickReason)`.
     - `default`: Memproses broadcast room / direct message seperti sebelumnya.
3. **Local Disconnect vs Cluster Broadcast Separation (`backend/internal/ws/hub.go`)**:
   - Memisahkan eksekusi lokal ke `kickClientByUserIDLocal` dan `kickClientByDeviceIDLocal`.
   - `KickClientByUserID` dan `KickClientByDeviceID` mengeksekusi penutupan soket lokal dan mem-publish `ClusterEvent` ke Redis channel `wuzz:cluster:events`.
   - Pemisahan ini mencegah *re-publishing loop* antar node cluster sekaligus memastikan node pengirim tetap mem-broadcast event ke Redis walaupun target tidak memiliki koneksi lokal di node tersebut.
4. **Unit Test Suite Komprehensif (`backend/internal/ws/hub_cross_instance_kick_test.go`)**:
   - `TestHub_CrossInstanceSessionKick`: Menguji 2 Hub (Node A dan Node B) dengan broker bersama. Node A memanggil `KickClientByUserID`, memastikan perangkat di Node B terputus dan perangkat pengecualian di Node A tetap aman.
   - `TestHub_CrossInstanceDeviceKick`: Node A dengan 0 koneksi lokal untuk user berhasil menendang perangkat spesifik di Node B via Redis Pub/Sub.
   - `TestHub_AntiEchoLoop_SessionKick`: Memastikan node pemanggil tidak menerima duplikasi kick akibat echo loop dari Redis.

### Test Evidence
- **Cross-Instance Kick Tests (`go test -v -run "TestHub_Cross|TestHub_AntiEchoLoop" ./internal/ws/...`)**: **PASS 100% (3/3 tests)**.
- **Backend Full Test Suite (`go test ./...`)**: **PASS 100% (Semua paket internal)**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors)**.

---

## 2026-09-23: Track B Modular Monolith — Tahap 1 (Shared Package) & Tahap 2 (Auth Application Service)

### Problem Description
1. Backend Go sebelumnya memiliki arsitektur 1-layer flat di mana utilitas cross-cutting (CORS, Rate Limiting, Validasi) bercampur di dalam `internal/auth/`, menimbulkan potensi circular dependency saat domain-domain baru ditambahkan.
2. Handler HTTP `api/auth_handler.go` berukuran masif (860+ baris) memuat business logic (registrasi, login, kuota multi-device, revocations, session kicks) bercampur dengan HTTP transport layer, sehingga sulit diuji tanpa transport HTTP.

### Implementation Details
1. **Tahap 1: Shared Package Refactoring (`backend/internal/shared/`)**:
   - Memindahkan utilitas umum ke package mandiri:
     - `internal/shared/cors`: Validator asal domain (CORS) & HTTP middleware.
     - `internal/shared/ratelimit`: IP Rate Limiter & Dual-Tier Limiter (IP + Username anti-brute force dengan preservasi body stream).
     - `internal/shared/validator`: Validasi format akun, username, password, dan filter kata terlarang.
     - `internal/shared/errors`: Kontrak domain errors terpadu.
   - Mengalihkan seluruh consumer import di `main.go`, `ws/handler.go`, dan `api/auth_handler.go` ke package `shared/`.
   - Menghapus file usang di `internal/auth/` (`cors.go`, `ratelimit.go`, `validator.go`, dan unit test terkait).
2. **Tahap 2: Auth Application Service (`backend/internal/authz/`)**:
   - **Domain Entities & Repository Contract (`internal/authz/entity.go`, `internal/authz/repository.go`)**:
     - Menetapkan kontrak `AuthRepository` untuk abstraksi penyimpanan data identitas, kredensial, sesi, perangkat, token revocation, dan transfer kunci.
   - **Application Service (`internal/authz/service.go`)**:
     - Mengorkestrasi use case: `Register`, `Login` (dengan aturan multi-device max 2 perangkat), `Logout`, `GetActiveSessions`, `RevokeSession`, `RevokeAllOtherSessions`, `ChangePassword`, dan `CreateTransferToken` / `ConsumeTransferToken`.
     - Menggunakan interface `SessionKicker` untuk memutus circular dependency antara `authz` dan `ws.Hub`.
   - **Infrastructure Adapter (`internal/authz/infra/sql_repository.go`)**:
     - Menerapkan Strangler Fig Pattern: adapter tipis yang mendelegasikan pemanggilan ke store yang sudah ada (`UserStore`, `SessionStore`, `DeviceStore`, `TokenStore`, `TransferStore`) tanpa mengubah store sama sekali.
   - **Unit Test Suite (`internal/authz/service_test.go`)**:
     - Menguji use case pendaftaran, validasi duplikat, login sukses/gagal, kuota multi-device 2 perangkat, eviksi perangkat ke-3 via override, pencabutan sesi, dan ganti password.
3. **Transport Layer & Main Wiring (`backend/internal/api/auth_handler.go`, `backend/main.go`)**:
   - Menambahkan dukungan injeksi `AuthService` ke `AuthHandler` via `NewAuthHandlerWithService` dan `SetAuthService`.
   - Handler bertransformasi menjadi *thin transport layer*: parse HTTP request ➔ panggil `AuthService` ➔ kembalikan respons JSON.
   - Menginjeksi `SQLAuthRepository` dan `AuthService` di `main.go`.

### Test Evidence
- **Domain & Service Unit Tests (`go test -v ./internal/authz/...`)**: **PASS 100% (3/3 test suite)**.
- **Shared Packages Tests (`go test -v ./internal/shared/...`)**: **PASS 100% (cors, ratelimit, validator)**.
- **API & Multi-Device End-to-End Tests (`go test -v -run "TestAuth|TestMultiDevice|TestDevice|TestTransfer" ./internal/api/...`)**: **PASS 100%**.
- **Backend Full Test Suite (`go test -v ./...`)**: **PASS 100% (Semua paket internal)**.
- **Frontend Payload Simulation (Live HTTP against Backend Go port 8080)**: **PASS 100% (8/8 skenario frontend)**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors)**.

---

## 2026-09-24: Track B Modular Monolith — Tahap 3 (Messaging Application Service & Hub Decoupling)

### Problem Description
1. Handler pesan HTTP `api/chat_handler.go` berukuran masif (900+ baris) memuat business logic (edit window 15 menit, kuota forward 5 percakapan, batas 3 sematan pin, validasi kepemilikan dan hak akses pesan) yang bercampur aduk dengan layer transport HTTP.
2. WebSocket Hub (`ws/hub.go`) dan Client (`ws/client.go`) memiliki dependensi erat ke database melalui injeksi langsung `store.UserStore`, yang menyulitkan pengujian terisolasi dan perancangan clustering.

### Implementation Details
1. **Domain Messaging (`backend/internal/messaging/`)**:
   - `entity.go`: Mendefinisikan model domain (`Message`, `PinnedMessage`, `Conversation`) dan input DTOs (`EditMessageInput`, `DeleteMessageInput`, `ForwardMessageInput`, `PinMessageInput`, `UnpinMessageInput`, `UpdateReceiptInput`).
   - `repository.go`: Kontrak interface murni `MessageRepository`, `ConversationRepository`, dan `UserLookupRepository`.
   - `infra/sql_repository.go`: Adapter Strangler Fig Pattern yang membungkus `store.MessageStore` & `store.UserStore` tanpa menyentuh struktur tabel SQL atau migrasi database baru.
2. **Application Service (`backend/internal/messaging/service.go`)**:
   - Mengorkestrasi use cases pesan: `EditMessage` (dengan broadcast real-time), `DeleteMessage` (delete for me vs everyone), `ForwardMessage` (validasi kuota 1-5 target room), `PinMessage` / `UnpinMessage` (kuota 3 pin per room), `GetPinnedMessages`, `UpdateReceipt` (delivered / read), `SearchMessages`, `GetConversations`, `StartDirectChat`, dan `ClearConversation`.
   - Menggunakan interface `MessageBroadcaster` untuk menjaga decoupling dari implementasi `ws.Hub`.
3. **WebSocket Hub Decoupling (`backend/internal/ws/hub.go`, `backend/internal/ws/client.go`)**:
   - Memperkenalkan interface otorisasi minimal `RoomAuthorizationChecker` (`GetConversationMemberUsernames`, `IsUserInConversation`, `IsConversationExpired`).
   - Menggantikan field `h.userStore` dengan `h.roomAuth RoomAuthorizationChecker`.
   - Menyediakan method `SetRoomAuth` dan mempertahankan `SetUserStore` sebagai backward-compatible bridge.
4. **Transport Layer & Main Wiring (`backend/internal/api/chat_handler.go`, `backend/main.go`)**:
   - Menjadikan `ChatHandler` sebagai *thin transport layer* yang mendelegasikan use cases ke `MessageService`.
   - Tetap mempertahankan fallback alur lama jika `service == nil` demi transisi bertahap yang aman.
   - Menghubungkan `SQLMessagingRepository` dan `MessageService` di `backend/main.go`.

### Test Evidence
- **Domain & Service Unit Tests (`go test -v ./internal/messaging/...`)**: **PASS 100% (5/5 unit test suites)**.
- **WebSocket & Hub Tests (`go test -v ./internal/ws/...`)**: **PASS 100% (Semua skenario cluster, mentions, rate limits, push)**.
- **API Handler Tests (`go test -v ./internal/api/...`)**: **PASS 100%**.
- **Backend Full Test Suite (`go test -v ./...`)**: **PASS 100% (Seluruh paket backend Go)**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors)**.

---

## 2026-09-24: Track B Modular Monolith — Tahap 4 (Group & Forum Application Service & Domain Refactor)

### Problem Description
1. Handler grup `api/group_handler.go` berukuran masif (948 baris) mencampuradukkan parsing HTTP, validasi hak akses role (`creator`, `admin`, `member`), mutasi database `store.GroupStore`, dan pemicu broadcast WebSocket `ws.Hub` serta Web Push `push.Service`.
2. Domain grup menggabungkan dua konsep dengan karakteristik berbeda: Grup Persisten dan Forum/Subgrup *ephemeral* bertempo waktu (TTL lifecycle) yang terintegrasi dengan ekstraksi memori AI.
3. Background worker auto-expire (`SubGroupTTLWorker`) masih berada di package umum `internal/worker/`.

### Implementation Details
1. **Domain Group & Contracts (`backend/internal/group/`)**:
   - `entity.go`: Mendefinisikan konstanta role (`RoleCreator`, `RoleAdmin`, `RoleMember`), alias entitas domain (`GroupDetails`, `GroupMemberItem`, `SubGroupItem`, `JoinRequestItem`, `ExpiredSubGroupItem`), sentinel error domain (`ErrCannotKickCreator`, `ErrParentMemberOnly`, dll.), dan use case input DTOs.
   - `repository.go`: Kontrak interface murni `GroupRepository` dan `UserLookupRepository`.
   - `infra/sql_repository.go`: Strangler Fig Adapter yang mengimplementasikan `GroupRepository` dan `UserLookupRepository` membungkus `store.GroupStore` dan `store.UserStore` (zero schema changes).
2. **Application Services (`backend/internal/group/service.go`)**:
   - `GroupBroadcaster` (WebSocket), `GroupNotifier` (Web Push), dan `MemoryJobCreator` (AI Memory Engine) sebagai interface komunikasi decoupled.
   - `GroupService`: Mengorkestrasi use cases grup persisten (`CreateGroup`, `GetGroupDetails`, `GetGroupMembers`, `JoinPublicGroup`, `AddGroupMembers`, `RemoveGroupMember`, `UpdateMemberRole`, `UpdateGroupInfo`, `SearchPublicGroups`).
   - `ForumService`: Mengorkestrasi use cases forum/subgrup *ephemeral* (`CreateSubGroup`, `GetActiveSubGroups`, `JoinSubGroup`, `RequestToJoinSubGroup`, `GetPendingJoinRequests`, `RespondJoinRequest`, `InstantExpireSubGroup`, `ExpireSubGroupsBatchDetailed`).
3. **Domain Background Worker (`backend/internal/group/worker/ttl_worker.go`)**:
   - Migrasi `SubGroupTTLWorker` ke domain `group/worker` dengan dependensi `GroupRepository` dan `MemoryJobCreator`.
4. **Thin Transport Handler & Main Wiring (`backend/internal/api/group_handler.go`, `backend/main.go`)**:
   - `GroupHandler` disederhanakan murni menjadi *thin transport layer* yang mendelegasikan use cases ke `GroupService` dan `ForumService`.
   - Menyediakan `NewGroupHandlerWithServices` dan tetap mempertahankan backward-compatible constructor `NewGroupHandler`.
   - Wiring dependency injection di `backend/main.go`.

### Test Evidence
- **Domain & Service Unit Tests (`go test -v ./internal/group/...`)**: **PASS 100% (7/7 test suites)**.
- **API Handler Integration Tests (`go test -v ./internal/api -run "TestGroupHandler|TestMemoryHandler"`)**: **PASS 100% (semua subtests)**.
- **Backend Full Test Suite (`go test ./...`)**: **PASS 100% (seluruh paket internal backend)**.
- **Real Frontend Client Simulation (`frontend/test-group-simulation.mjs`)**: **PASS 100% (9/9 skenario lifecycle grup, WebSocket live system events diterima lengkap)**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors, 8/8 routes prerendered)**.

---

## 2026-09-24: Track B Modular Monolith — Tahap 5 (Memory Engine Generalization & ContextSource Abstraction)

### Problem Description
1. Domain Memory AI sebelumnya terikat erat (*tightly coupled*) secara langsung ke tabel `conversations` subgrup/forum dan `store.GroupStore` serta `store.MessageStore`, menyulitkan penggunaan kembali engine memori untuk konteks lain (misal percakapan 1-on-1, transkrip call, channel pengumuman, atau thread spesifik).
2. Handler `api/memory_handler.go` (432 baris) mencampuradukkan parsing HTTP, verifikasi hak akses admin grup, manipulasi artefak memori, dan pembuatan snapshot.
3. Ketiadaan lapisan domain entity murni dan application service yang mandiri untuk siklus hidup review draft memori.

### Implementation Details
1. **Domain Memory Core & ContextSource Abstraction (`backend/internal/memory/`)**:
   - `entity.go`: Mendefinisikan entitas domain murni (`MemoryContext`, `ContextType`, `MemoryJob`, `MemoryDraft`, `MemoryArtifact`, `ApprovedMemory`) beserta helper mapper domain-to-store / store-to-domain.
   - `context_source.go`: Interface `ContextSource` (`GetMessages`, `GetContextMeta`, `GetAuthorizedViewers`) dan thread-safe `Registry` untuk mendaftarkan dan menyelesaikan sumber konteks berdasarkan tipe (`ContextTypeForum`, dll.).
   - `repository.go`: Kontrak interface murni `MemoryRepository`.
   - `infra/sql_repository.go`: Strangler Fig Adapter yang mengimplementasikan `MemoryRepository` membungkus `store.MemoryStore` dengan penerjemahan error domain bersih.
2. **ContextSource Implementation untuk Forum Ephemeral (`backend/internal/group/infra/`)**:
   - `forum_context_source.go`: Mengimplementasikan `memory.ContextSource` untuk forum / subgrup ephemeral, menghubungkan ke `group.GroupRepository` dan `store.MessageStore`.
3. **Refactoring AI Memory Processor (`backend/internal/ai/processor.go`)**:
   - `MemoryProcessor` dimodifikasi agar menarik pesan riwayat dan metadata percakapan via `ContextSource` yang diselesaikan secara dinamis dari `Registry`, memutus hardcoded coupling ke `store.GroupStore`.
4. **Application Service (`backend/internal/memory/service.go`)**:
   - `MemoryService`: Mengorkestrasikan seluruh use cases: listing draft antrean admin, detail draft beserta artefak, penyuntingan artefak, penghapusan journey lite, approval draft dengan denormalisasi snapshot, penolakan draft (reject), pemuatan arsip memori grup, dan pencatatan view event analitik.
5. **Thin Transport Handler & Main Wiring (`backend/internal/api/memory_handler.go`, `backend/main.go`)**:
   - `MemoryHandler` disederhanakan murni menjadi *thin transport layer* yang mendelegasikan use cases ke `MemoryService`.
   - Registrasi dependency injection `ForumContextSource`, `ContextSourceRegistry`, dan `MemoryProcessor` di `backend/main.go`.

### Test Evidence
- **Memory Domain & Service Unit Tests (`go test -v ./internal/memory/...`)**: **PASS 100% (10/10 use cases)**.
- **AI ContextSource Registry Unit Tests (`go test -v ./internal/ai -run "TestAI_MemoryProcessor_WithContextSourceRegistry"`)**: **PASS 100%**.
- **Backend Full Test Suite (`go test ./...`)**: **PASS 100% (seluruh paket internal backend)**.
- **Real Frontend Client Simulation (`frontend/test-memory-simulation.mjs`)**: **PASS 100% (14 langkah end-to-end lifecycle penuh: expire forum, worker AI draft generation, draft detail, patch artifact, approve draft, read memory archive & detail, RBAC/BOLA validation)**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors, 8/8 routes prerendered)**.

---

## 2026-09-24: Bug Fix — AI Memory Draft Curation Queue & Drawer Notification Desync

### Problem Description
1. Pada `SubGroupListDrawer`, banner "Draft Memori AI Siap Direview" menampilkan jumlah draf yang tidak nol (misal 3) padahal seluruh draf forum telah disetujui sebelumnya dan sudah muncul di tab Arsip Memori.
2. Ketika admin membuka antrean tersebut dan mengklik "Setujui & Publikasikan", muncul error `HTTP 409 Conflict: "Draft telah disetujui atau ditolak sebelumnya"`.
3. **Penyebab Akar**: Endpoint backend `GET /api/memory/drafts?group_id={id}` (`MemoryService.ListDrafts`) sebelumnya tidak menerapkan default filter status saat query parameter `status` kosong, sehingga mengambil seluruh draf di database (termasuk `APPROVED` dan `REJECTED`). Modal review di frontend juga tidak menangani kondisi status draf non-`DRAFT` secara anggun.

### Implementation Details
1. **Backend Default Status Filter (`backend/internal/memory/service.go`)**:
   - `filterStatus` diinisialisasi default ke `DraftStatusDraft` ("`DRAFT`") jika `status == ""`. Klien dapat meneruskan `status=all` untuk mematikan filter jika memerlukan riwayat penuh.
2. **Backend Unit Test (`backend/internal/memory/service_test.go`)**:
   - Menambahkan assertion lifecycle: setelah draf diapprove, `ListDrafts(groupID, "")` harus mengembalikan `0` pending draf, dan `ListDrafts(groupID, "all")` mengembalikan `1` draf.
3. **Frontend Drawer Sanitasi (`frontend/app/chat/SubGroupListDrawer.tsx`)**:
   - Menerapkan defense-in-depth: `res.data.filter((d) => d.status === 'DRAFT')` sebelum dimasukkan ke state `memoryDrafts`.
4. **Frontend Modal Fallback (`frontend/app/chat/memory/MemoryDraftReviewModal.tsx`)**:
   - Menampilkan badge status di header ("Sudah Disetujui" / "Ditolak").
   - Menampilkan banner alert di body yang ramah pengguna jika draf telah divalidasi.
   - Mengganti tombol aksi footer menjadi hanya tombol "Tutup" jika status draf bukan `DRAFT` (mencegah double-approval & HTTP 409).

### Test Evidence
- **Memory Unit Tests (`go test -v ./internal/memory/...`)**: **PASS 100%**.
- **Backend Full Suite (`go test ./...`)**: **PASS 100%**.
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors, 8/8 routes prerendered)**.

---

## 2026-09-24: Bug Fix — AI Memory Review Toast Sticking & Header Collision (Mobile & Desktop)

### Problem Description
1. Setelah admin/creator menyetujui atau menolak draf memori AI, muncul notifikasi floating toast `🔔 🧠 Memori grup berhasil divalidasi dan dipublikasikan!`.
2. **Bug 1 (Stuck Permanen)**: Toast tidak pernah hilang karena dipanggil tanpa timer `setTimeout`.
3. **Bug 2 (Tabrakan Header di Mobile)**: Menggunakan `top: 16px; left: 50%`, toast bertumpuk tepat di atas sticky header chat (menutupi tombol back, avatar, nama grup, dan tombol forum).
4. **Bug 3 (Teks Transparan & Bertumpuk)**: Properti background memakai `var(--bg-card)` yang belum terdaftar di `:root` CSS variables sehingga bernilai transparan, menyebabkan teks toast bertabrakan dengan elemen di belakangnya.
5. **Bug 4 (Posisi Canggung di Laptop)**: Pada layar desktop, `top: 16px` menaruh toast tepat di bilah header obrolan di antara judul grup dan deretan tombol aksi.

### Implementation Details
1. **Design System & CSS Tokens (`frontend/app/globals.css`, `frontend/DESIGN.md`)**:
   - Mendaftarkan token `--bg-card: rgba(30, 41, 59, 0.95);` di `:root`.
   - Menambahkan utility class `.in-app-toast-banner` dengan latar *opaque frosted glass* (`rgba(15, 23, 42, 0.94)` + `backdrop-filter: blur(16px)`), specular border token, shadow lembut, animasi `@keyframes inAppToastSlideDown`, dan *safe header offset* (`top: calc(56px + env(safe-area-inset-top, 0px) + 12px)` pada desktop dan `+ 8px` pada mobile).
2. **Centralized Toast Lifecycle & Handlers (`frontend/app/chat/page.tsx`)**:
   - Mengimplementasikan helper terpusat `showInAppToast(message, duration, icon)` dengan `inAppToastTimeoutRef` dan cleanup saat unmount.
   - Mengintegrasikan auto-dismiss 4 detik serta interaksi tap/click dan tombol tutup `✕` untuk dismiss seketika.
   - Merapikan callback `onApproved` (ikon `🧠`), `onRejected` (ikon `ℹ️`), dan `join_request` (ikon `🔔`).
   - Menyempurnakan callback `onJumpToMessage` di modal review dan detail memori dengan navigasi `messageId`.

### Test Evidence
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100% (0 errors, 8/8 routes prerendered)**.
- **Backend Full Suite (`go test -v ./...`)**: **PASS 100%**.

---

## 2026-09-24: Track B Modular Monolith — Tahap 6 (Cleanup & Slim Entrypoint Wiring)

### Problem Description
1. Entrypoint utama `backend/main.go` sebelumnya berukuran 598 baris dan bertindak sebagai *God Object* yang mencampuradukkan pembacaan variabel lingkungan OS, inisialisasi database dan storage, perakitan puluhan dependensi DDD, 3 goroutine pembersih background tanpa lifecycle terkelola, 50+ registrasi rute HTTP mux, dan loop HTTP server.
2. Kondisi ini menyulitkan pemahaman dan kolaborasi bagi pengembang junior, serta meningkatkan risiko regresi saat menambahkan fitur baru.

### Implementation Details
1. **Sentralisasi Konfigurasi Runtime (`backend/internal/shared/config/`)**:
   - `config.go`: Struct `Config` terpadu memuat konfigurasi Server, Storage, Auth, Rate Limit, dan Background Worker Intervals dengan default fallback yang aman.
   - `config_test.go`: Unit test parser konfigurasi (100% PASS).
2. **Sentralisasi Background Cleaner Worker (`backend/internal/authz/worker/`)**:
   - `cleaner_worker.go`: Struct terkelola `AuthCleanupWorker` yang mengelola siklus hidup pembersihan token revoked, sesi login expired, dan sesi transfer QR via channel selector dan `sync.WaitGroup`.
   - `cleaner_worker_test.go`: Unit test lifecycle worker `Start()`, `Stop()`, dan `RunOnce()` (100% PASS).
3. **Application Container & Dependency Injection Wiring (`backend/internal/app/`)**:
   - `wire.go`: Struct container `Application` yang merakit dependensi secara berurutan dalam 7 tahap terstruktur (Storage, Infrastructure, Repositories, Services, Workers, Handlers, WebSocket Hub) disertai komentar panduan yang jelas bagi programmer junior.
   - `router.go`: Pemetaan 50+ rute HTTP mux dan WebSocket dikelompokkan secara tematik per domain fungsional.
   - `app_test.go`: Unit test inisialisasi aplikasi container dan health check `/health` (100% PASS).
4. **Refactoring Slim Entrypoint (`backend/main.go`)**:
   - Berhasil memangkas `backend/main.go` dari 598 baris menjadi 55 baris.
   - Menerapkan Go idiomatic *Graceful Shutdown* menggunakan `signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)` dan `application.Shutdown(ctx)` dengan batas waktu 10 detik.
   - Kompatibilitas 100% dengan `Dockerfile` (`go build -ldflags="-w -s" -o /app/wuzz-backend main.go`) dan eksekusi lokal `go run main.go`.

### Test Evidence
- **Backend Full Suite Tests (`go test -count=1 ./...`)**: **PASS 100%** pada seluruh 19 internal package (`ai`, `api`, `app`, `auth`, `authz`, `authz/worker`, `broker`, `group`, `memory`, `messaging`, `push`, `shared/config`, `shared/cors`, `shared/ratelimit`, `shared/validator`, `storage`, `store`, `worker`, `ws`).
- **Frontend Turbopack Compilation (`npm run build`)**: **PASS 100%** (0 lint/TS errors, 8/8 static routes prerendered).
- **Frontend Client-Side Test Suites**: `test-message-cache.mjs` (9/9 PASS), `test-multi-device-frontend.mjs` (4/4 PASS), `test-login-device-limit.mjs` (3/3 PASS), `test-phase5-key-transfer.mjs` (3/3 PASS).
- **Real Client End-to-End Simulation terhadap Server Backend Asli**:
  - `test-group-simulation.mjs` (100% PASS: auth, group CRUD, WebSocket live system event, RBAC/BOLA).
  - `test-memory-simulation.mjs` (100% PASS: 14/14 langkah end-to-end lifecycle Memory AI & Groq LLM processing).

---

## 2026-09-24: Post-Audit Modular Monolith Hardening — Milestone 1 (Zero-Risk Handler Cleanup)

### Problem Description
1. Pasca-refactor Track B, beberapa HTTP handler di `backend/internal/api/` (`AuthHandler`, `ChatHandler`, `GroupHandler`, `MemoryHandler`) masih mempertahankan jalur ganda (*dual-path debt*): memeriksa apakah application service bernilai non-nil, dan jika nil mengeksekusi logika fallback warisan langsung ke store.
2. Pola cabang ganda ini membingungkan pengembang junior, menambah beban pemeliharaan kode (code debt), dan meningkatkan risiko desinkronisasi logika bisnis antara handler dan domain service.

### Implementation Details
1. **Auto-Wiring Application Services di Konstruktor Handler**:
   - `AuthHandler` (`backend/internal/api/auth_handler.go`): `NewAuthHandler` otomatis menginisialisasi `authz.AuthService` menggunakan `authzinfra.NewSQLAuthRepository(us, ...)`.
   - `ChatHandler` (`backend/internal/api/chat_handler.go`): `NewChatHandler` dan `NewChatHandlerWithService` otomatis menginisialisasi `messaging.MessageService` menggunakan `messaginginfra.NewSQLMessagingRepository(ms, us)`.
2. **Pembersihan Jalur Ganda (Eliminasi Fallback Store)**:
   - `auth_handler.go`: Menghapus seluruh blok fallback store pada `Register`, `Login`, `Logout`, `ChangePassword`, `GetActiveSessions`, `RevokeSession`, dan `RevokeAllOtherSessions`. Menghapus duplikasi update aktivitas perangkat.
   - `chat_handler.go`: Menghapus seluruh blok fallback store pada `GetConversations`, `StartDirectChat`, `ClearConversation`, `DeleteMessage`, `EditMessage`, `ForwardMessage`, `PinConversation`, `UnpinConversation`, `PinMessage`, `UnpinMessage`, `GetPinnedMessages`, `SearchMessages`, dan `UpdateReceipt`.
   - `group_handler.go`: Menghapus field mati `groupStore` dari struct dan konstruktor.
   - `memory_handler.go`: Menghapus field mati `groupStore` dan `userStore` dari struct dan konstruktor.
   - `authz/service.go`: Menambahkan helper `SetRepository(repo AuthRepository)`.
   - Net pengurangan: **-599 baris kode mati/fallback**.
3. **Penyusunan Script Verifikasi Integrasi Frontend Asli (`frontend/test-frontend-real-e2e.mjs`)**:
   - Menguji langsung Next.js SSR server (`server.js` port 3047) dan WebSocket proxy terhadap backend Go (port 8080) pada 19 skenario (SSR pages, auth, sessions, devices, conversations, direct chat, WebSocket connect, message send, edit, pin, unpin, receipts, search, delete, clear, logout).

### Test Evidence
- **Backend Full Suite (`go test ./...`)**: **PASS 100%** (seluruh 19 internal package lolos).
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 errors, 8/8 routes prerendered).
- **Frontend Real Integration E2E (`test-frontend-real-e2e.mjs`)**: **PASS 100%** (seluruh 19 alur fungsi berjalan mulus melalui Next.js proxy).
- **Simulasi Klien Frontend**: `test-two-user-e2ee-simulation.mjs` (PASS 100%), `test-multi-device-frontend.mjs` (PASS 100%), `test-group-simulation.mjs` (PASS 100%).

---

## 2026-09-24: Post-Audit Modular Monolith Hardening — Milestone 2 (Realtime Message Ingestion Decoupling)

### Problem Description
1. Pada layer WebSocket real-time, `ws.Hub` dan `ws.Client` masih mengonsumsi persistensi pesan langsung melalui `store.MessageStore` alih-alih melalui domain repository `messaging`.
2. Paket `messaging` sudah mengimpor `ws` untuk broadcasting pesan, sehingga jika `ws` mengimpor `messaging`, Go compiler akan menolak kompilasi dengan error `import cycle not allowed`. Diperlukan decoupling yang elegan tanpa circular dependency.

### Implementation Details
1. **Interface Decoupling di WebSocket Hub (`backend/internal/ws/hub.go`)**:
   - Mendefinisikan interface `RealtimeMessageManager` di dalam package `ws` yang mencakup method: `Save`, `UpdateMessageStatus`, `MarkRoomMessagesAsRead`, `MarkUserMessagesAsDelivered`, `ToggleReaction`, `GetRoomHistoryForUser`, `GetRoomHistorySince`.
   - Menambahkan method setter `SetMessageManager(mm RealtimeMessageManager)` serta helper methods aman secara thread-safe (`SaveMessage`, `UpdateMessageStatus`, `MarkRoomMessagesAsRead`, `MarkUserMessagesAsDelivered`, `ToggleReaction`, `GetRoomHistoryForUser`, `GetRoomHistorySince`).
   - Menerapkan isolasi mutex: `h.mu.RLock()` hanya ditahan saat meng-copy pointer manager ke local variable dan langsung dilepas sebelum pemanggilan I/O database, mencegah lock contention dan deadlock.
2. **Refactor Pemrosesan Pesan Client (`backend/internal/ws/client.go`)**:
   - Menghapus akses langsung `c.hub.messageStore.*` pada event receipt (`read`/`delivered`) dan reaction toggle (`onReaction`), menggantikannya dengan delegasi aman ke `c.hub.*`.
3. **Ekspansi Domain Messaging (`backend/internal/messaging/`)**:
   - Menambahkan method `SaveMessage(msg Message) error` pada `MessageRepository`.
   - Mengimplementasikan `SaveMessage` dan `Save` pada adapter `messaginginfra.SQLMessagingRepository`.
   - Menambahkan use cases pada `messaging.MessageService`: `SaveIncomingMessage`, `ToggleReaction`, `GetRoomHistory`, `GetRoomHistorySince`, `MarkUserMessagesAsDelivered`, `MarkRoomMessagesAsRead`.
   - Menambahkan unit test baru di `service_test.go` (100% pass).
4. **Wiring Domain Repository ke WebSocket Hub (`backend/internal/app/wire.go`)**:
   - Menyuntikkan `messagingRepo` ke WebSocket Hub via `hub.SetMessageManager(messagingRepo)`.

### Test Evidence
- **Backend Full Suite (`go test ./...`)**: **PASS 100%** (seluruh internal package lolos).
- **Go Race Detector (`go test -race ./internal/ws ./internal/messaging ./internal/app`)**: **PASS 100%** (0 data races detected).
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 errors, 8/8 routes prerendered).
- **Frontend Real Integration E2E (`node test-frontend-real-e2e.mjs`)**: **PASS 100%** (seluruh 19 alur integrasi Next.js proxy ⇄ backend Go lolos sempurna).
- **Server Lifecycle Guard**: Seluruh server uji lokal (port 8080 & 3047) dimatikan tuntas.

---

## 2026-09-24: Post-Audit Modular Monolith Hardening — Milestone 3 (Mobile Gateway Readiness & Multi-Platform Support)

### Problem Description
1. Aplikasi sebelumnya belum memiliki penanganan eksplisit untuk platform perangkat (`web`, `android`, `ios`) pada layer autentikasi domain `authz`, sehingga seluruh login secara implisit dianggap sebagai browser web generik.
2. Layer push notification (`push.Service`) terikat langsung pada standar WebPush VAPID (RFC 8291/8292) dengan endpoint URL Google/Apple/Mozilla. Ketika aplikasi native Android/iOS (misal Flutter/React Native/Kotlin) mengirimkan native FCM Device Token langsung (`dK4x...`), engine WebPush akan gagal dan memunculkan error parsing URL.
3. Kesiapan arsitektur gerbang mobile (Mobile Gateway Readiness) diperlukan agar aplikasi Android Native, iOS Native, dan PWA Mobile dapat terhubung bersamaan dengan Desktop Laptop tanpa konflik atau degradasi fitur.

### Implementation Details
1. **Device Platform Resolution & User-Agent Detection (`backend/internal/authz/`)**:
   - Menambahkan field `Platform` pada `RegisterInput` dan `LoginInput`.
   - Mengimplementasikan `resolvePlatform(explicitPlatform, userAgent)`: prioritas diberikan pada flag platform eksplisit (`"android"`, `"ios"`, `"web"`), dengan fallback otomatis mendeteksi OS dari User-Agent jika tidak disediakan.
   - Memperbarui `parseDeviceName(userAgent, platform)` untuk memberikan label ramah perangkat mobile (`"Android Device"`, `"iOS Device"`).
   - Menambahkan method use case baru pada `AuthService`: `GetUserDevices(ctx, userID)` dan `DeactivateDevice(ctx, userID, deviceID)`.
   - Unit test `TestAuthService_DevicePlatformHandling` mencakup pengujian registrasi eksplisit Android, iOS, dan deteksi otomatis User-Agent (100% PASS).
2. **HTTP Handler Multi-Platform Adapter (`backend/internal/api/auth_handler.go`)**:
   - Memperbarui `RegisterRequest` dan `LoginRequest` untuk mengekstrak field `platform` dari body JSON atau dari HTTP header `X-Device-Platform`.
3. **Pluggable Multi-Push Architecture (`backend/internal/push/`)**:
   - Memperkenalkan interface `PushProvider` (`Name() string`, `Send(ctx, sub, payload) error`).
   - Mengimplementasikan `VAPIDWebPushProvider` (RFC 8291/8292 untuk browser Desktop & mobile PWA).
   - Mengimplementasikan `FCMv1PushProvider` (scaffolding siap pakai untuk FCM HTTP v1 native token).
   - Menambahkan mekanisme dynamic routing pada `push.Service`: jika endpoint berupa URL HTTP (`https://...`), notifikasi dialirkan ke WebPush VAPID; jika berupa device token native (`dK4x...`), dialirkan ke provider native FCM.
   - Unit test `TestPushProviders_RoutingAndMultiPlatform` mencakup routing provider dan verifikasi multi-platform (100% PASS).
4. **Verifikasi Frontend Asli Multi-Platform (`frontend/test-multiplatform-real-frontend.mjs`)**:
   - Menguji koneksi nyata frontend Next.js (port 3047) dan backend Go (port 8080) pada 5 skenario multi-device:
     1. Login Desktop Browser (`platform: "web"`, Chrome on Windows).
     2. Login Mobile PWA Android (`platform: "android"`, Chrome on Android) dan berdampingan dengan laptop.
     3. Login iPhone Safari (`platform: "ios"`, Safari on iPhone).
     4. Registrasi push subscription multi-platform (WebPush VAPID + Native FCM Token).
     5. WebSocket multi-device live chat: PWA Android mengirim pesan langsung diterima seketika oleh iPhone iOS via Next.js proxy.

### Test Evidence
- **Backend Full Suite (`go test ./...`)**: **PASS 100%** (seluruh 19 internal package lolos).
- **Go Race Detector (`go test -race ./internal/authz/... ./internal/push/...`)**: **PASS 100%** (0 data race).
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 errors, 8/8 routes prerendered).
- **Real Multi-Platform Integration (`test-multiplatform-real-frontend.mjs`)**: **PASS 100%** (5/5 multi-platform scenario lolos).
- **Server Lifecycle Guard**: Seluruh server port 8080 dan 3047 dipastikan mati.

---

## 2026-09-24: Single Source of Truth (SSOT) Documentation Alignment & Canonical Architecture Setup (Milestone 5)

### Problem Description
1. Pasca-penyelesaian Track B (Modular Monolith Fase 1–6) dan Post-Audit Hardening (Milestones 1–3), dokumentasi repositori mengalami desinkronisasi (*stale context*).
2. `README.md` masih menyebutkan aplikasi chat 1-on-1 dengan 5 package backend internal lama, `ROADMAP.md` memiliki kontradiksi internal (Track B ditandai selesai di tabel namun narasi bawah masih menyebutkan "Fase 3: TAHAP BERIKUTNYA"), dan `GROUP_MEMORY_AI_SPEC.md` masih berstatus "Specification Only" padahal sudah 100% diimplementasikan.
3. Diperlukan dokumen kanonikal tunggal (*Single Source of Truth*) yang merangkum kondisi produk aktual, arsitektur modular monolit, domain map, kesiapan mobile, utang teknis (TD-01 s/d TD-05), dan panduan AI developer agar sesi kerja berikutnya tidak perlu melakukan audit ulang dari nol.

### Implementation Details
1. **Penyusunan Dokumen Kanonikal Utama (`docs/PROJECT_STATE.md`)**:
   - Merangkum 14 bagian esensial: Product Context & Philosophy (*"AI captures. Humans validate. Wuzz remembers."*), Matriks Kapabilitas Produk Aktual (status eksplisit `IMPLEMENTED`, `PARTIAL`, `NOT IMPLEMENTED`, `BLOCKED`), Batas Domain Modular Monolith, Peta Domain, Arsitektur Memori AI, Model Identitas & Perangkat, Batasan Kluster Real-Time, Matriks Kesiapan Mobile (`BACKEND READY` vs `CLIENT NOT YET IMPLEMENTED`), Model Keamanan Zero-Trust, Register Utang Teknis (TD-01 s/d TD-05), Roadmap Milestone, Snapshot 2 Menit, Aturan Main AI Developer, dan Tata Kelola Dokumentasi.
2. **Penyelarasan Seluruh Dokumentasi Proyek**:
   - `README.md`: Diperbarui dengan positioning baru (*Actionable Knowledge Messaging Engine*), pohon direktori monorepo aktual (15 internal packages Go), dan tautan SSOT.
   - `docs/ARCHITECTURE.md`: Ditambahkan banner SSOT dan Bagian 11 dilengkapi dengan dokumentasi kontainer aplikasi (`app/wire.go`), *slim bootstrap* (`main.go`), serta Milestones 1–3.
   - `docs/ROADMAP.md`: Menghapus kontradiksi internal, menetapkan Track B selesai 100%, dan menetapkan **Milestone 6 (Mobile Client App)** sebagai fokus berikutnya (*NEXT*).
   - `docs/MOBILE_INTEGRATION_GUIDE.md`: Menegaskan status `BACKEND READY` vs `CLIENT NOT YET IMPLEMENTED`, serta memperbarui payload registrasi push token FCM native via `PushProvider`.
   - `docs/SECURITY_AND_PERFORMANCE.md`: Menambahkan banner SSOT yang merujuk pada analisis batasan arsitektur realtime kluster.
   - `docs/GROUP_MEMORY_AI_SPEC.md`: Status diperbarui menjadi **100% IMPLEMENTED & DEPLOYED ✅**.
   - `docs/MODULAR_MONOLITH_DDD.md`: Ditandai secara resmi sebagai **HISTORICAL ARCHITECTURAL PROPOSAL — 100% IMPLEMENTED & DEPLOYED ✅**.
   - `PROMPT.md`: Memposisikan `docs/PROJECT_STATE.md` sebagai rujukan #1 Single Source of Truth, dan memperbarui ringkasan fase dengan penyelesaian Post-Audit Hardening (Milestones 1–3).

### Test Evidence
- **Backend Full Suite (`go test ./...`)**: **PASS 100%** (seluruh internal package lolos).
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 errors, 8/8 routes prerendered).
- **Server Lifecycle Guard**: Seluruh server port 8080 dan 3047 dipastikan mati.

---

## 2026-09-24: WuzzChat Engine Evolution — Milestone 0: Codebase & Hub Prerequisite Stabilization

### Problem Description
1. In-Memory WebSocket Hub (`ws.Hub`) menyimpan map `clientsByNick` yang memetakan koneksi berdasarkan username. Dalam lingkungan tenant-aware di masa depan, dua tenant dapat memiliki username yang sama (`@admin`, `@budi`) sehingga berisiko tabrakan koneksi real-time.
2. Handler pencarian kontak (`SearchUsers`) dan pengambilan profil publik (`GetUserProfile`, `GetUserPublicKey`) di `ChatHandler` memotong langsung ke `store.UserStore` tanpa melalui Application Service layer (`AuthService`), sehingga tidak dapat diproteksi isolasi tenant secara tersentralisasi.
3. Ketiadaan carrier konteks tenant standar pada `context.Context` Go untuk propagasi HTTP request ke database.

### Implementation Details
1. **Tenant Context Carrier Abstraction (`backend/internal/shared/tenant/`)**:
   - Dibuat package `tenant` dengan tipe data immutable `TenantContext` (`WithTenant`, `WithTenantContext`, `FromContext`, `DefaultTenant`, `MustFromContext`).
   - Dilengkapi unit test dengan statement coverage 100%.
2. **Purifikasi In-Memory UUID Routing di WebSocket Hub (`backend/internal/ws/hub.go`)**:
   - Dihapus map `clientsByNick` dari struct `Hub`, constructor `NewHub`, alur `registerClient`, `unregisterClient`, dan `findClientsLocked`.
   - Routing perpesanan unicast dan broadcast murni berbasis User UUID (`userClients[userID]`).
   - Ditambahkan unit test `TestHub_UUIDPurification_NoNickCollision` yang membuktikan dua pengguna dengan username sama tidak mengalami tabrakan pesan.
3. **Enkapsulasi Identitas & User Lookup di Domain `authz`**:
   - Ditambahkan entitas `UserSummary` dan `UserProfile` pada `backend/internal/authz/entity.go`.
   - Ditambahkan kontrak `SearchUsers`, `GetUserByID`, dan `GetUserByUsernameOrDisplayName` pada `AuthRepository` dan adapter `backend/internal/authz/infra/sql_repository.go`.
   - Ditambahkan use case `SearchUsers` dan `GetUserProfile` pada `backend/internal/authz/service.go`.
   - Ditambahkan unit test `TestAuthService_SearchUsersAndProfile` di `backend/internal/authz/service_test.go`.
4. **Refactor ChatHandler & Wire Injection**:
   - Injeksi `authSvc *authz.AuthService` ke `ChatHandler` di `backend/internal/api/chat_handler.go`.
   - `SearchUsers`, `GetUserProfile`, dan `GetUserPublicKey` dialihkan murni ke `AuthService`.
   - Injeksi dependensi dimutakhirkan di `backend/internal/app/wire.go`.
   - Ditambahkan unit test komprehensif `backend/internal/api/chat_handler_identity_test.go`.

### Test Evidence
- **Backend Full Suite (`go test ./...`)**: **PASS 100%** (seluruh unit dan integrasi test internal lolos).
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 error, 8/8 routes prerendered).
- **Real Frontend Integration E2E (`node test-frontend-real-e2e.mjs`)**: **PASS 100%** (19/19 alur Next.js proxy ⇄ Go Backend lolos sempurna).
- **Real Multi-Platform Integration (`node test-multiplatform-real-frontend.mjs`)**: **PASS 100%** (Desktop, Android PWA, iOS Safari, realtime chat lolos).
- **Server Lifecycle Guard**: Seluruh server port 8080 dan 3047 dimatikan bersih (0 lingering open ports).

---

## 2026-09-24: WuzzChat Engine Evolution — Milestone 1: Additive Schema Migration & Tenant Registry

### Problem Description
1. Evolusi WuzzChat Engine menuju Multi-Tenancy B2B menuntut pemisahan data per organisasi/klien mandiri tanpa menimbulkan risiko *data loss* atau *downtime* pada basis data produksi eksisting.
2. Dibutuhkan registri tenant master (`tenants`), entitas kredensial otentikasi API pihak ketiga (`tenant_api_keys`), serta penyisipan kolom batas logis `tenant_id` pada seluruh entitas relasional utama (`users`, `conversations`, `forum_memory_jobs`, `memory_drafts`, `approved_memories`).
3. Seluruh pengguna dan obrolan lama wajib tetap beroperasi normal tanpa intervensi manual dengan mengasosiasikannya ke tenant bawaan (`default`).

### Implementation Details
1. **Additive Schema Migration & Zero-Downtime Seeder (`backend/internal/store/sql.go`)**:
   - DDL tabel master `tenants` (`id`, `name`, `slug` UNIQUE, `is_active`, timestamps).
   - DDL tabel `tenant_api_keys` (`id`, `tenant_id`, `app_id` UNIQUE, `secret_hash`, `name`, `is_active`, `created_at`) beserta indeks komposit.
   - Kolom aditif non-destruktif `tenant_id VARCHAR(64) DEFAULT 'default'` pada 5 tabel relasional (`users`, `conversations`, `forum_memory_jobs`, `memory_drafts`, `approved_memories`) untuk PostgreSQL dan SQLite.
   - Indeks komposit `idx_users_tenant_username (tenant_id, username)` dan indeks relasi `idx_*_tenant`.
   - Seeder otomatis startup (`seedDefaultTenant`): jika record tenant `default` belum ada, sistem langsung membuatnya secara otomatis (`id: "default"`, `name: "Default Tenant"`, `slug: "default"`).
2. **Domain Package Tenant DDD (`backend/internal/tenant/`)**:
   - `entity.go`: Model `Tenant` dan `TenantAPIKey` beserta metode validasi internal.
   - `repository.go`: Kontrak interface `TenantRepository` dan sentinel error domain.
   - `infra/sql_repository.go`: Implementasi adapter SQL yang mendukung PostgreSQL (`$1`) dan SQLite (`?`).
   - `service.go`: Use-case service `TenantService` untuk registrasi tenant, validasi keaktifan, pembuatan pasangan kredensial API (`app_*` & `sec_*` dengan bcrypt hashing), serta validasi API Key.
3. **Container Dependency Injection (`backend/internal/app/wire.go`)**:
   - Injeksi `TenantRepo` dan `TenantService` ke struct `Application`.
4. **Automated Verification Suites**:
   - Dibuat unit & integration test komprehensif di `backend/internal/tenant/tenant_test.go` (4 skenario test: seeder otomatis, repository CRUD, API key repository, tenant service flow).

### Test Evidence
- **Tenant Test Suite (`go test -v ./internal/tenant/...`)**: **PASS 100%** (4/4 tests passed).
- **Backend Full Suite (`go test ./...`)**: **PASS 100%** (seluruh internal package lolos).
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 errors, 8/8 routes prerendered).
- **Frontend Functional Test Suites**:
  - `npm run test:cache`: **PASS 100%** (9/9 skenario IndexedDB cache & E2EE).
  - `npm run test:multi-device`: **PASS 100%** (4/4 skenario multi-device level 2).
  - `npm run test:phase5`: **PASS 100%** (3/3 skenario QR key transfer).
  - `npm run test:device-limit`: **PASS 100%** (3/3 skenario HTTP 409 & modal limit).
- **Live Frontend & Backend Proxy Smoke Test**: Next.js custom server (`:3047`) ⇄ Go Backend (`:8080`) aktif melayani `GET /login`, `GET /chat`, `POST /api/auth/register`, dan `POST /api/auth/login` secara real dengan status `HTTP 200 OK`.
- **Server Lifecycle Guard**: Seluruh server port 8080 dan 3047 dimatikan bersih (`fuser -k <port>/tcp`).

---

## 2026-09-24: WuzzChat Engine Evolution — Milestone 2: Tenant Context Propagation in Services & Repositories

### Problem Description
1. Pada Milestone 1, skema tabel relasional telah diperluas dengan kolom `tenant_id` dan tabel master `tenants`. Namun, context tenant belum dipropagasikan secara end-to-end melalui HTTP middleware, service layer, dan repository queries.
2. Dibutuhkan HTTP Tenant Middleware yang mampu mengekstrak konteks tenant secara fleksibel (prioritas: header `X-Tenant-ID` ➔ JWT claim `tenant_id` ➔ default fallback `"default"`), memvalidasi status keaktifan tenant, dan menginjeksi `TenantContext` ke `r.Context()`.
3. Seluruh lapisan repository SQL (`UserStore`, `SQLAuthRepository`, `SQLGroupStore`, `SQLGroupRepository`, `SQLMessagingRepository`, `ConversationRepository`, dan `SQLMemoryStore`) wajib menerapkan filter ketat `WHERE tenant_id = ?` untuk menjamin isolasi data mutlak antar tenant (*zero cross-tenant leak*).
4. Pengguna eksisting pada versi default tanpa header `X-Tenant-ID` (klien frontend lama) wajib beroperasi 100% normal tanpa breaking change (*zero regressions*).

### Implementation Details
1. **HTTP Tenant Middleware & Context Injection (`backend/internal/api/tenant_middleware.go`)**:
   - Dibuat `TenantMiddleware(tenantSvc *tenant.TenantService)` yang dipasang di pipeline router root HTTP (`router.go`).
   - Resolusi prioritas bertingkat:
     1. Header `X-Tenant-ID` (jika ada).
     2. JWT Claim `tenant_id` (di-decode via `auth.ExtractTenantFromToken`).
     3. Fallback tenant `"default"` (menjamin 100% backward compatibility dengan frontend existing).
   - Validasi keaktifan tenant melalui `tenantSvc.ValidateTenantActive(ctx, tenantID)`. Jika tenant tidak aktif/tersuspend, mengembalikan HTTP `403 Forbidden` (`{"error": "tenant is suspended or inactive"}`).
   - Injeksi aman `tenantshared.WithTenant(r.Context(), tenantID)` ke `r.Context()`.
   - Ditambahkan unit test lengkap `backend/internal/api/tenant_middleware_test.go` (100% PASS).
2. **JWT Tenant Claims (`backend/internal/auth/jwt.go`)**:
   - Struct `UserClaims` diperkaya dengan field `TenantID string`.
   - Ditambahkan fungsi helper `GenerateTokenDetailedWithTenant` dan `ExtractTenantFromToken`.
3. **Repository Layer Data Isolation (`WHERE tenant_id = ?`)**:
   - **Users & Auth (`backend/internal/store/user_store.go` & `backend/internal/authz/infra/sql_repository.go`)**:
     - Ditambahkan composite unique constraint `(tenant_id, username)` pada skema SQL.
     - Ditambahkan context-aware methods: `RegisterWithContext`, `GetUserByUsernameWithContext`, `SearchUsersWithContext`, `GetOrCreateDirectConversationWithContext`, `GetUserConversationsWithContext`.
     - Query dibatasi ketat dengan `tenant_id = ?` (dengan fallback backward compatibility `(tenant_id = ? OR tenant_id = 'default')`).
   - **Groups & Forums (`backend/internal/store/group_store.go`, `sql_group_store.go`, & `backend/internal/group/infra/sql_repository.go`)**:
     - Ditambahkan `CreateGroupWithContext`, `SearchPublicGroupsWithContext`, `CreateSubGroupWithContext`, `GetActiveSubGroupsWithContext`.
     - Pewarisan tenant otomatis: grup mewarisi tenant creator/parent jika context `"default"`.
   - **Messaging (`backend/internal/messaging/infra/sql_repository.go` & `repository.go`)**:
     - Context propagation pada pembuatan obrolan dan pengiriman pesan.
     - Deterministik room ID terisolasi: `dm_<tenantID>_<userA>_<userB>`.
   - **AI Memory (`backend/internal/store/memory_store.go`)**:
     - `CreateJob`, `CreateDraftWithArtifacts`, dan `ApproveDraft` kini menyisipkan `tenant_id` dari context.
4. **Service Layer Context Propagation**:
   - `authz.AuthService` (`Register`, `Login` menerima context via input DTO, menghasilkan token dengan `tenant_id`).
   - `group.GroupService` dan `group.ForumService` mempropagasi `ctx` ke repository layer.
   - `messaging.MessageService` mempropagasi `ctx` ke `ConversationRepository`.
5. **Multi-Tenant Anti-Leak Test Suite (`backend/internal/tenant/isolation_test.go`)**:
   - Dibuat 8 skenario pengujian komprehensif:
     - `TestMultiTenant_UserIsolation_SameUsername`: Membuktikan dua tenant dapat memiliki username identik secara terisolasi tanpa bentrok.
     - `TestMultiTenant_SearchUsers_Isolation`: Membuktikan pencarian kontak hanya menampilkan user dalam tenant yang sama.
     - `TestMultiTenant_DirectConversation_Isolation`: Membuktikan direct chat room ID `dm_tenant_...` terisolasi dan tidak dapat diakses lintas tenant.
     - `TestMultiTenant_PublicGroup_SearchIsolation`: Membuktikan pencarian grup publik hanya menampilkan grup milik tenant yang sama.
     - `TestMultiTenant_GroupInheritance`: Membuktikan sub-grup mewarisi `tenant_id` dari induknya.
     - `TestMultiTenant_JWTClaims_TenantPersistence`: Membuktikan JWT token menyimpan dan merefleksikan claim tenant secara akurat.
     - `TestMultiTenant_Middleware_SuspendedTenantBlocked`: Membuktikan middleware memblokir tenant tersuspensi dengan HTTP 403.
     - `TestMultiTenant_LegacyClient_BackwardCompatibility`: Membuktikan klien warisan tanpa header tenant beroperasi mulus di tenant "default".

### Test Evidence
- **Multi-Tenant Anti-Leak Suite (`go test -v ./internal/tenant/...`)**: **PASS 100%** (8 skenario isolasi lolos).
- **Backend Full Suite (`go test ./...`)**: **PASS 100%** (seluruh internal package lolos tanpa regresi).
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 errors, 8/8 routes prerendered).
- **Live Real Frontend Integration E2E (`node test-frontend-real-e2e.mjs`)**: **PASS 100%** (Next.js SSR, REST Auth, direct chat, WebSocket 101 handshake, message send/edit/pin/delete/logout lolos pada tenant default).
- **Live Real Multi-Platform Verification (`node test-multiplatform-real-frontend.mjs`)**: **PASS 100%** (Desktop, Android PWA, iPhone Safari).
- **Live Real Group Simulation (`node test-group-simulation.mjs`)**: **PASS 100%** (Group creation, public search, WebSocket fanout, BOLA guard).
- **Server Lifecycle Guard**: Seluruh server port 8080 dan 3047 dimatikan bersih (`fuser -k 8080/tcp 3047/tcp` -> 0 lingering ports).

---

## 🚀 Milestone 3: External Provisioning & B2B Auth Gateway (24 September 2026) — SELESAI ✅

### 1. Deskripsi & Arsitektur
Membangun gerbang autentikasi B2B Server-to-Server dan alur Client Token Exchange untuk integrasi headless chat tanpa mengharuskan pendaftaran manual pengguna:
- **B2B API Key Authentication Guard (`backend/internal/api/b2b_middleware.go`)**: Memvalidasi kredensial `X-App-ID` & `X-App-Secret` menggunakan `TenantService.ValidateAPIKey` dan menginjeksi `TenantContext` ke request context.
- **JIT User Provisioning Endpoint (`POST /api/v1/auth/provision-token`)**: Atomic upsert user pada tenant (`UpsertExternalUserWithContext`), penerbitan one-time exchange token (`ext_...`, TTL 60 detik).
- **Client Token Exchange Endpoint (`POST /api/v1/auth/exchange`)**: Penukaran atomic single-use exchange token, pendaftaran perangkat ke Level 2 Multi-Device registry, penerbitan Session JWT ber-claim lengkap (`user_id`, `tenant_id`, `device_id`, `jti`).
- **Skema Database Additive (`backend/internal/store/sql.go`)**:
  - Kolom `external_user_id VARCHAR(128)` dan indeks `idx_users_tenant_ext` pada tabel `users`.
  - Tabel baru `exchange_tokens` dengan indeks pencarian cepat.
- **Backward Compatibility & WebSocket Ingestion**:
  - Token JWT exchange dapat langsung digunakan untuk koneksi `/ws?token=<JWT>&device_id=<device_id>`.
  - Alur registrasi/login eksisting (`/api/auth/register`, `/api/auth/login`) tetap berjalan 100% tanpa regresi.

### 2. Bukti Pengujian Otomatis
- **Unit & Integration Suite (`go test -v ./internal/tenant/...`)**: **PASS 100%** (Guard validation, JIT creation/update, exchange single-use, anti-expired, anti double-spend, E2E WebSocket handshake).
---

## ⚡ Milestone 4: Realtime & Cluster Envelope Tenant Isolation (24 September 2026) — SELESAI ✅

### 1. Deskripsi & Arsitektur
Mengisolasi seluruh alur pengiriman pesan realtime (WebSocket In-Memory Hub) dan sinkronisasi multi-instance (Redis Pub/Sub Cluster) agar strictly tenant-scoped, mencegah segala potensi kebocoran pesan (*cross-tenant message leak*) antar tenant:
- **In-Memory WebSocket Client Scoping (`backend/internal/ws/client.go` & `handler.go`)**:
  - Struct `Client` diperkaya dengan field `TenantID string` (fallback default `"default"`).
  - Pada saat handshake HTTP Upgrade WebSocket (`ServeHTTP`), `tenant_id` diekstrak dari Session JWT Claims dan diikatkan ke struct `Client`.
  - Pada `ReadPump`, server secara paksa menimpa `msg.TenantID = c.getTenantID()` dan `msg.From = c.ID` untuk mencegah manipulasi/spoofing tenant dari payload JSON mentah klien.
  - Seluruh event handler internal (`onJoin`, `onMessage`, `onReceipt`, `onTyping`, `onReaction`, `onCallSignaling`) menyertakan `msg.TenantID = c.getTenantID()`.
- **Multicast Room & Direct Message Tenant Isolation (`backend/internal/ws/hub.go`)**:
  - `broadcastLocal`: Menambahkan filter ketat pada `targetMap` loop sehingga klien dari tenant berbeda dilarang menerima pesan room, meskipun room ID-nya identik.
  - `BroadcastRoomUsers`: Mengelompokkan klien aktif per tenant sehingga event `room_users` (presence) terisolasi dan tidak membocorkan daftar pengguna ke tenant lain.
  - `NotifyUser` & `NotifyUsers`: Memfilter pengiriman pesan langsung dan notifikasi hanya ke klien lokal yang memiliki `TenantID` yang cocok.
  - `KickClientByUserID` & `KickClientByDeviceID`: Didukung varian `WithTenant` untuk menendang perangkat dengan isolasi tenant yang aman tanpa memutus koneksi pengguna ber-ID sama di tenant lain.
- **Cluster Event Envelope Tenant Scoping (`backend/internal/ws/hub.go`)**:
  - Struct `ClusterEvent` diperkaya dengan field `TenantID string json:"tenant_id,omitempty"`.
  - Seluruh publikasi ke channel Redis `ClusterEventsChannel` (`wuzz:cluster:events`) menyertakan `TenantID`.
  - Listener Redis Pub/Sub pada node penerima memeriksa `event.TenantID` dan menyuntikkannya ke `event.Message.TenantID` sebelum mendistribusikan ke klien lokal, memastikan sinkronisasi multi-instance terisolasi penuh per tenant.

### 2. Bukti Pengujian Otomatis
- **Dedicated Suite (`hub_tenant_isolation_test.go`)**: **PASS 100%**
  - `TestHub_LocalRoom_TenantIsolation`: Klien `tenant-alpha` dan `tenant-beta` di room `"shared-lobby"` yang sama terisolasi sempurna.
  - `TestHub_BroadcastRoomUsers_TenantIsolation`: Daftar kehadiran pengguna (*room presence*) terpisah per tenant.
  - `TestHub_ClusterSync_TenantIsolation`: Event cluster Redis dari Node 1 tidak bocor ke klien di Node 2 yang berbeda tenant.
  - `TestHub_DirectMessage_TenantIsolation`: Panggilan langsung dan WebRTC signaling terisolasi per tenant.
  - `TestHub_ClusterKick_TenantIsolation`: Sinyal session kick cluster hanya menendang koneksi tenant target.
- **Full Backend Test Suite (`go test -v ./...`)**: **PASS 100%** di seluruh packages internal (`api`, `auth`, `authz`, `group`, `messaging`, `push`, `store`, `tenant`, `ws`).
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 errors, 8/8 routes prerendered).

---

## 🧠 Milestone 5: AI Memory Context Tenant Scoping (24 September 2026) — SELESAI ✅

### 1. Deskripsi & Arsitektur
Mengisolasi seluruh siklus hidup AI Memory Engine (antrean job worker, ekstraksi konteks percakapan, review/validasi draft memori, penyimpanan artefak, hingga retrieval memory) agar strictly tenant-scoped untuk mencegah kebocoran konteks data AI (*cross-tenant memory leak*):
- **Domain Entity & DTO Isolation (`backend/internal/memory/entity.go` & `backend/internal/store/memory_store.go`)**:
  - Menyematkan `TenantID string` pada entity domain `MemoryJob`, `MemoryDraft`, dan `ApprovedMemory`.
  - Menyematkan `TenantID string` pada store entities `ForumMemoryJob`, `MemoryDraft`, dan `ApprovedMemory`.
  - Menyematkan `TenantID string` pada `GroupDetails` (`group_store.go`) dan membaca `COALESCE(tenant_id, 'default')` pada `sql_group_store.go`.
- **Storage & Queue Layer Isolation (`backend/internal/store/memory_store.go`)**:
  - `GetPendingJobs`: Memfilter `AND tenant_id = $X` dan menerapkan PostgreSQL row-level locking `FOR UPDATE SKIP LOCKED` untuk konkurensi cluster bebas race condition.
  - `ClaimJob`: Memfilter `WHERE id = $2 AND tenant_id = $3 AND status = 'QUEUED'`.
  - `CompleteJob` & `FailJob`: Memfilter berdasarkan `id` dan `tenant_id`.
  - `GetDraftByID`, `GetDraftByForumID`, `GetDraftsByGroupID`: Memfilter `AND tenant_id = $X` dan membaca `draft.TenantID`.
  - `GetArtifactByID` & `GetArtifactsByDraftID`: Menggunakan `INNER JOIN memory_drafts md ON a.draft_id = md.id WHERE md.tenant_id = $X`.
  - `UpdateArtifact` & `RemoveJourneyLite`: Menggunakan subquery filter `draft_id IN (SELECT id FROM memory_drafts WHERE tenant_id = $X)`.
  - `ApproveDraft` & `RejectDraft`: Memvalidasi `tenant_id` dan menyematkan `approvedMemory.TenantID`.
  - `GetApprovedMemoryByID`, `GetApprovedMemoryByForumID`, `GetApprovedMemoriesByGroupID`: Memfilter `AND tenant_id = $X`.
- **ContextSource & Service Scoping (`backend/internal/group/infra/` & `backend/internal/memory/service.go`)**:
  - `ForumContextSource`: Memvalidasi kecocokan tenant pada `GetMessages`, `GetContextMeta`, dan `GetAuthorizedViewers`, menolak akses cross-tenant dengan `ErrUnauthorizedAccess`.
  - `MemoryService`: Menerapkan Two-Tier Defense di mana seluruh aksi review (`ListDrafts`, `GetDraftDetail`, `UpdateArtifactContent`, `RemoveJourneyLite`, `ApproveDraft`, `RejectDraft`, `GetGroupMemories`, `GetApprovedMemoryDetail`) memvalidasi kecocokan tenant pemanggil dengan entitas draft, grup, dan memori.
  - Background notification goroutine pada `ApproveDraft` didekorasi dengan tenant context (`bgCtx := tenantshared.WithTenant(context.Background(), draftTenant)`) agar panggilan metadata forum tetap membawa boundary tenant yang valid.
- **Worker Scoping (`backend/internal/worker/memory_worker.go`)**:
  - Menambahkan dukungan `SetTenantID(tenantID string)` pada `MemoryJobWorker`.
  - `ProcessOnce` dan `processSingleJob` secara otomatis mendekorasi context eksekusi dengan `job.TenantID` untuk processor AI dan operasi complete/fail job.

### 2. Bukti Pengujian Otomatis
- **Dedicated Suite (`memory_tenant_isolation_test.go`)**: **PASS 100%**
  - `TestMemoryTenantIsolation_JobQueue`: Pemisahan antrean pending jobs dan proteksi cross-tenant claim.
  - `TestMemoryTenantIsolation_DraftReviewSecurityGate`: Penolakan review, penyuntingan artefak, persetujuan, dan penolakan draf lintas tenant.
  - `TestMemoryTenantIsolation_MemoryRetrievalScoping`: Penolakan pembacaan linimasa memori dan detail memori terpublikasi lintas tenant.
  - `TestMemoryTenantIsolation_ServiceDefenseInDepth`: Pembuktian bahwa sekalipun repository mengembalikan data, service layer tetap menolak dengan `ErrUnauthorizedAccess`.
  - `TestMemoryTenantIsolation_ContextSource`: Penolakan ekstraksi riwayat pesan dan metadata forum lintas tenant.
- **Full Backend Test Suite (`go test ./...`)**: **PASS 100%** di seluruh packages internal (`ai`, `api`, `app`, `auth`, `authz`, `broker`, `group`, `memory`, `messaging`, `push`, `shared`, `storage`, `store`, `tenant`, `worker`, `ws`).
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 errors, 8/8 routes prerendered).

---

## 📜 Milestone 6: OpenAPI Contract & Headless Integration Guide (25 September 2026) — SELESAI ✅

### 1. Deskripsi & Arsitektur
Menyediakan spesifikasi kontrak mesin terstandarisasi, panduan integrasi headless B2B yang menyeluruh, serta endpoint dokumentasi API mandiri pada backend Go:
- **Canonical OpenAPI 3.1.0 Contract (`docs/openapi.yaml` & `backend/internal/api/openapi.yaml`)**:
  - Memetakan 100% surface area REST API backend Go (12 kategori modul: B2B Gateway, Identity & Auth, Multi-Device Sessions, E2EE Keys, Conversations, Messages, Media Store-and-Forward, Groups, Ephemeral Fora/Subgroups ber-TTL, AI Memory Engine, Push Notifications, Utility & Diagnostics).
  - Skema otorisasi terstandar: `BearerAuth` (JWT 7 hari), `B2BAppID` (`X-App-ID`), `B2BAppSecret` (`X-App-Secret`), dan `HeaderTenantID` (`X-Tenant-ID`).
  - Standarisasi format error envelope RFC 7807 Problem Details (`ProblemDetails`).
  - Salinan identik tertanam di `backend/internal/api/openapi.yaml` menggunakan `//go:embed` untuk menjamin portabilitas binary tanpa ketergantungan file eksternal pada kontainer runtime.
- **Headless B2B Integration Guide (`docs/HEADLESS_INTEGRATION_GUIDE.md`)**:
  - Arsitektur headless WuzzChat Engine dan prinsip isolasi data tenant.
  - Alur Server-to-Server JIT User Provisioning (`POST /api/v1/auth/provision-token`) dan 60s Token Exchange (`POST /api/v1/auth/exchange`) lengkap dengan sequence diagram Mermaid dan contoh kode Node.js/TypeScript menggunakan environment variable dinamis.
  - Realtime WebSocket RFC 6455 Event Catalog & Wire Format (`message`, `typing`, `receipt`, `reaction`, `memory_approved`), keep-alive ping/pong 30s, dan penanganan WebSocket Close Code `4001: SESSION_REPLACED`.
  - Panduan implementasi enkripsi end-to-end (ECDH NIST P-256 + HKDF-SHA256 + AES-256-GCM).
  - Siklus hidup forum ephemeral (subgroup) ber-TTL dan integrasi AI Memory review.
- **Self-Hosted Documentation Endpoints (`backend/internal/api/openapi_handler.go`)**:
  - `GET /api/openapi.yaml`: Menyajikan file spesifikasi mentah dengan MIME type `application/yaml; charset=utf-8` dan dukungan CORS.
  - `GET /api/docs`: Menyajikan halaman web interaktif mandiri (*embedded*) yang memuat UI dokumentasi Scalar API Reference modern dengan built-in offline fallback UI.
  - Pendaftaran rute dan integrasi CORS pada `backend/internal/app/router.go` dan `backend/internal/app/wire.go`.

### 2. Bukti Pengujian Otomatis
- **OpenAPI Unit Tests (`backend/internal/api/openapi_test.go`)**: **PASS 100%**
  - `TestOpenAPIHandler_ServeOpenAPISpec`: Validasi ketersediaan spesifikasi, format YAML, parsing rute, verifikasi header MIME, dan penolakan method yang tidak diizinkan (`405 Method Not Allowed`).
  - `TestOpenAPIHandler_ServeDocsUI`: Validasi penyajian UI HTML, referensi skrip `/api/openapi.yaml`, dan penanganan method `HEAD` & `GET`.
- **Full Backend Test Suite (`go test ./...`)**: **PASS 100%** di seluruh package backend.
- **Frontend Turbopack Build (`npm run build`)**: **PASS 100%** (0 lint/typecheck error, 8/8 static routes).






