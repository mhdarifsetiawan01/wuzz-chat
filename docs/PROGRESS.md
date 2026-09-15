# Laporan Status & Dokumentasi Proyek — Wuzz Chat

**Tanggal:** 13 September 2026  
**Status Proyek:** Fase 1 s/d 6 Selesai + Optimasi Dual-Platform Mobile/Desktop (100% Berfungsi & Terverifikasi)  
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
- Seluruh pengujian unit & integrasi E2E lulus 100%. Siap melangkah ke fitur berikutnya (**Milestone 8.2: Group Chat Engine & Member Management**).


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
│   │   ├── sound.ts        -> Web Audio API procedural sound synthesizer
│   │   ├── types.ts        -> TypeScript definitions
│   │   └── ws-client.ts    -> WebSocket abstraction
│   └── server.js           -> Custom Next.js server & proxy layer
└── README.md
```
