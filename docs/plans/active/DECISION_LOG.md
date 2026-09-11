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
