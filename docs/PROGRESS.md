# Laporan Status & Dokumentasi Proyek — Wuzz Chat

**Tanggal:** 17 September 2026  
**Status Proyek:** Fase 1 s/d 7 Selesai + UUID-First Identity Architecture (Full-Stack, Merged ke `main`)  
**Branch Aktif:** `main`

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
  1. [ ] **Milestone 8.2: Group Chat Engine & Member Management** / Bad Words Sensor Filter.
  2. [ ] *(Opsional Future)* Android Native App untuk akses kamera native penuh (Live QR Scanner tanpa batasan WebAPK permissions).


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
- `backend/internal/store/sql.go`: Query `MarkRoomMessagesAsRead` diperbarui menggunakan `from_id` (UUID) sebagai filter primer, menghilangkan ketergantungan pada `from_nickname`.
- `backend/internal/ws/client.go`: Read receipt update menggunakan `c.ID` (UUID) bukan `c.Nickname`.
- `backend/internal/store/user_store.go`: Struct `ConversationItem` diperkaya dengan field `LastSenderID` (UUID). Field `LastSender` (username) menjadi display-only.

**Frontend**:
- `frontend/app/chat/page.tsx`: Peer resolution, incoming message event handling, dan call signaling diperbarui ke UUID-first. Cache mapping menggunakan `sender_id` (UUID).
- `frontend/app/chat/MessageBubble.tsx`: `isSelf` logic menggunakan `msg.from === currentUser.id` (UUID). `hasReacted` menggunakan `users.includes(currentUser.id)` (UUID).
- `frontend/app/chat/Sidebar.tsx`: Tanda centang (`✓`/`✓✓`) di preview menggunakan `conv.last_sender_id === currentUser.id` (UUID).
- `frontend/app/chat/StatusBar.tsx`: `isPeerOnline` dan lookup peer menggunakan UUID.
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
