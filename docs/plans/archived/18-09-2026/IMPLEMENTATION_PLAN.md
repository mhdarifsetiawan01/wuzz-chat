# Implementation Plan — Milestone 8.2B: Ephemeral Sub-Groups & TTL Lifecycle

Membangun fitur **Ephemeral Sub-Groups (Topik Diskusi Bertopik di dalam Grup Induk)** dengan sistem masa aktif otomatis (**Time-To-Live / TTL: 1 Minggu & 1 Bulan**), identitas unik (`sub_<UUIDv4>`), daftar subgrup aktif di ruang obrolan grup utama, fondasi skema untuk **AI Summary di masa depan**, serta proteksi keamanan berlapis (*Parent-Membership Gate*) dan optimasi performa tinggi ($O(1)$ composite index & non-blocking background worker).

---

## 🛡️ 1. Analisis Keamanan Mendalam (Security Hardening)

| Vektor Risiko / Serangan | Potensi Dampak | Strategi Mitigasi & Enforcing |
|---|---|---|
| **BOLA / IDOR Bypass: Akses Subgrup oleh Non-Member Induk** | Pengguna luar yang tahu ID subgrup mencoba mengakses pesan, join, atau kirim chat tanpa masuk grup utama. | **Strict Parent-Membership Gate**: Di setiap REST endpoint subgrup dan WebSocket room admission (`isAuthorizedForRoom`), server Go memvalidasi keanggotaan aktif di grup induk (`conversations.parent_id`). Jika tidak terdaftar, **Fail-Closed (HTTP 403 Forbidden)**. |
| **Manipulasi Parameter TTL oleh Client** | Client nakal mengirim payload manipulatif (misal `expires_at = tahun 2099` atau durasi sembarangan). | **Strict Server-Side TTL Calculation**: Client hanya boleh mengirim enum pilihan durasi (`"7_days"` atau `"30_days"`). Backend yang secara deterministik menghitung `time.Now().UTC().Add(...)`. |
| **Pesan Terkirim ke Subgrup Kedaluwarsa (*Zombie Writes*)** | Client mengirim pesan ke subgrup yang sudah lewat waktu (`expires_at <= NOW()`). | **Fail-Closed Write Gate**: Handler REST dan WebSocket Hub menolak penulisan pesan jika `expires_at <= NOW()` atau `status = 'expired'` dengan status HTTP 410 Gone / WebSocket System Notice. |
| **Cascade Revocation saat Member Di-Kick / Leave dari Grup Utama** | User yang di-kick dari grup induk masih bisa membuka subgrup karena record membership subgrup tertinggal. | **Parent Active Check**: Otorisasi subgrup selalu melakukan join check ke tabel `conversation_members` induk. Sekali user keluar dari grup utama, akses ke seluruh subgrup otomatis terputus seketika. |
| **Sub-Group Flooding / Resource Exhaustion (DoS)** | Pengguna membuat ratusan subgrup sekaligus untuk memenuhi kapasitas memori dan database. | **Role Gate & Rate Limit**: Hanya `creator` dan `admin` grup utama yang dapat membuat subgrup. Ditambah batas kuota subgrup aktif per grup induk (misal maks 20 subgrup aktif). |
| **Input Injection & Dirty Content** | Nama subgrup berisi karakter kontrol berbahaya, spasi kosong, atau string ekstra panjang. | Sanitasi ketat: `title` dipangkas spasi, divalidasi minimal 2 karakter, maksimal 128 karakter, anti-HTML XSS. |

---

## ⚡ 2. Analisis Performa & Skalabilitas (Performance Optimization)

| Tantangan Performa | Solusi Arsitektur & Optimasi |
|---|---|
| **Full Table Scan saat Query Subgrup Aktif** | Tambahkan indeks komposit teroptimasi: <br>`CREATE INDEX IF NOT EXISTS idx_subgroups_active ON conversations(parent_id, expires_at);`<br>Memastikan query `WHERE parent_id = $1 AND (expires_at > NOW())` dieksekusi dengan $O(1)$ Index Scan. |
| **$N+1$ Database Query saat Memuat List Subgrup** | Dilarang melakukan loop query hitungan anggota atau pesan terakhir. Gunakan query tunggal dengan `COUNT(DISTINCT cm.user_id)` dan aggregasi subquery untuk mengambil daftar subgrup lengkap dalam satu putaran I/O database. |
| **Database Lock Contention pada Background TTL Worker** | Background worker Go yang mengecek subgrup kedaluwarsa dijalankan via goroutine terisolasi dengan `time.NewTicker(15 * time.Minute)`. Update status dilakukan dalam batch ber-timeout (context 5 detik) agar tidak mengganggu operasional chat aktif. |
| **Network Latency & Flaky Mobile Connections** | Request frontend dibungkus dengan `AbortController` (timeout 15 detik), UI menerapkan pola **Optimistic Local Response** dan caching lokal di memory/IndexedDB. |

---

## 🤖 3. Arsitektur Masa Depan: AI Summary Ready

Agar fitur **AI Summary** di masa depan dapat membaca seluruh obrolan subgrup yang telah kedaluwarsa tanpa merusak skema atau kehilangan data:
1. **Kolom Database Baru**:
   - `conversations.status VARCHAR(32) NOT NULL DEFAULT 'active'` — Nilai: `'active'`, `'expired'`, `'archived'`, `'summarized'`.
   - `conversations.ai_summary TEXT DEFAULT ''` — Menyimpan teks ringkasan hasil AI di masa depan.
2. **Siklus Hidup Subgrup (Soft Lifecycle, Bukan Hard Delete Seketika)**:
   - Saat `expires_at <= NOW()`, subgrup beralih status menjadi `'expired'`.
   - Subgrup `'expired'` tidak muncul di daftar subgrup aktif reguler.
   - Pesan-pesan di dalamnya **tetap utuh tersimpan** agar siap dibaca oleh pipeline AI Summary.
   - Subgrup terkunci menjadi **Read-Only**.

---

## 📋 4. Tahapan Eksekusi

1. **Tahap 1: Backend Database & Schema Hardening (`store/sql.go` & `store/group_store.go`)**
   - Tambah kolom `status` & `ai_summary` pada auto-migration PostgreSQL & SQLite.
   - Tambah composite index `idx_subgroups_active ON conversations(parent_id, expires_at)`.
   - Implementasikan method `CreateSubGroup`, `GetActiveSubGroups`, `IsParentMember`, dan `ExpireSubGroupsBatch`.

2. **Tahap 2: REST API Endpoints & Parent Gate Security (`api/group_handler.go`)**
   - Tambah endpoint `GET /api/groups/:id/subgroups` dengan validasi ketat membership induk.
   - Tambah endpoint `POST /api/groups/:id/subgroups` dengan validasi durasi (hanya 7 & 30 hari) dan role admin/creator.
   - Perketat endpoint `POST /api/groups/:id/join` agar menolak non-member grup induk jika target adalah subgrup.

3. **Tahap 3: WebSocket Hub Gatekeeping & Background TTL Worker (`ws/client.go` & `worker/ttl_worker.go`)**
   - Otorisasi room subgrup di WebSocket Hub (`isAuthorizedForRoom`).
   - Tolak pengiriman pesan jika subgrup sudah `status = 'expired'` atau `expires_at <= NOW()`.
   - Background worker goroutine untuk auto-expire subgrup secara berkala.

4. **Tahap 4: Frontend Types & SubGroup Management Components (`frontend/app/chat/`)**
   - Type `SubGroupItem` di `types.ts`.
   - Modal `CreateSubGroupModal.tsx` dengan pilihan durasi (1 Minggu default, 1 Bulan).
   - Drawer / list `SubGroupListDrawer.tsx` dengan badge sisa waktu real-time.
   - Tombol pill subgrup di `StatusBar.tsx` dan tombol navigasi kembali ke grup induk.

5. **Tahap 5: Verifikasi Komprehensif & Test Suite**
   - Unit & integration test Go (`group_subgroup_test.go`).
   - Build frontend (`npm run build`) & backend test (`go test ./...`).
