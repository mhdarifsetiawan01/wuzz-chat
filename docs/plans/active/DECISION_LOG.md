# Decision Log

### DEC-001: Monorepo dengan Custom Proxy Server
- **Konteks:** Perlu menyembunyikan port/origin backend Go dari browser client demi keamanan & CORS.
- **Keputusan:** Menggunakan custom server Node.js (`server.js`) dengan `http-proxy` untuk menangkap upgrade WebSocket dan forward `/api/*` requests.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-002: Multi-Driver Database Store dengan Supabase Pooler
- **Konteks:** Supabase direct host (`db.xxx.supabase.co`) memerlukan IPv6 yang sering gagal di jaringan IPv4 lokal.
- **Keputusan:** Menggunakan connection string Supabase **Session Pooler** (`aws-0-xxx.pooler.supabase.com:5432`) dengan auto-migration saat backend start.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-003: JWT Authentication & WhatsApp-Grade 2-Column UI
- **Konteks:** Mengubah sistem dari obrolan anonim menjadi percakapan permanen antar user terdaftar.
- **Keputusan:** Menggunakan JWT token 7 hari, layout 2-kolom (Sidebar daftar chat + Chat window), dan Standby / Welcome Screen saat belum ada room yang dipilih.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-004: Procedural Web Audio API Sound FX Synthesizer
- **Konteks:** Membutuhkan efek audio notifikasi pesan (kirim & terima) yang ringan, instan, dan bebas kegagalan jaringan atau file asset hilang.
- **Keputusan:** Menggunakan Web Audio API oscillator synthesis (`lib/sound.ts`) untuk menghasilkan suara nada *pop* (880Hz->320Hz) dan nada lonceng ganda *ding* (E5 + B5) tanpa memerlukan file MP3 eksternal.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-005: Ephemeral Live Typing Protocol & Debounce Auto-Reset
- **Konteks:** Indikator mengetik (*"Alice sedang mengetik..."*) harus real-time tanpa membebani database ataupun bandwidth WebSocket.
- **Keputusan:** Event `TypeTyping` di-broadcast murni di memori Hub (tidak disimpan ke Database). Input client di-throttle 2 detik saat mengetik, dan recipient memiliki auto-reset timer 2.5 detik serta reset instan saat pesan baru diterima (`TypeMessage`).
- **Status:** Diimplementasikan & Berfungsi.

### DEC-006: Client-Side Live Snippet Dispatcher & Unread Count State
- **Konteks:** Sidebar percakapan harus mengupdate pesan terakhir, timestamp, dan badge belum dibaca secara live tanpa polling berulang ke database `/api/conversations`.
- **Keputusan:** State `lastIncomingMessage` di `page.tsx` diteruskan ke `Sidebar.tsx`. Setiap pesan masuk/terkirim seketika mengupdate state lokal daftar percakapan, menaikkan unread badge jika room tidak aktif dibuka, dan menggeser percakapan aktif ke urutan paling atas.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-007: 4-Stage Weighted Message Receipt Transitions
- **Konteks:** Status tanda terima pesan (`pending` ➔ `sent` ➔ `delivered` ➔ `read`) memerlukan kepastian status tidak pernah menurun (*downgrade*) akibat latensi pengiriman atau keterlambatan ACK WebSocket.
- **Keputusan:** Menggunakan sistem bobot integer pada reducer frontend (`pending`: 0, `sent`: 1, `delivered`: 2, `read`: 3) sehingga update status hanya diaplikasikan jika nilai bobot lebih tinggi atau sama. Server Go melakukan auto-ACK `sent` ke pengirim, client penerima otomatis mengirim `delivered` receipt saat pesan sampai di socket, dan mengirim `read` receipt saat jendela obrolan aktif dibuka.
- **Status:** Diimplementasikan & Berfungsi.

### DEC-008: Quoted Replies & In-Place Emoji Reaction Toggling
- **Konteks:** Fitur balas pesan dan reaksi emoji membutuhkan struktur data yang fleksibel, kompatibel dengan skema SQL relasional yang ada, serta responsif secara real-time.
- **Keputusan:** Menyimpan konteks `reply_to` (`reply_to_id`, `reply_to_nickname`, `reply_to_content`) dan array reaksi `reactions` (JSON serialized: `[{emoji, users, count}]`) langsung di tabel `messages`. WebSocket event `TypeReaction` men-toggle user ID/nickname pada array reaksi dan mem-broadcast update instan ke semua anggota room.
- **Status:** Diimplementasikan & Berfungsi.


