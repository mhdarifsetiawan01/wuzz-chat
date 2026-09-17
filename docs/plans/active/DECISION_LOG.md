# Decision Log: Milestone 8.2 — Group Chat Engine & Member Management

## DEC-001: Arsitektur Transmisi & Enkripsi Konten Group Chat
- **Status**: Accepted
- **Context**: Obrolan 1-on-1 saat ini menggunakan full E2EE (ECDH NIST P-256 + HKDF + AES-256-GCM). Untuk grup multi-user, diperlukan keputusan arsitektur terkait enkripsi vs kompleksitas distribusi kunci Signal Sender Keys.
- **Decision**: Memilih **Opsi C (Hybrid / E2EE-Ready Foundation)**:
  1. Pada Milestone 8.2 (v1), grup menggunakan transmisi Server-Relayed terlindungi TLS in-transit (WSS/HTTPS), di mana server Go memvalidasi keanggotaan dan mem-broadcast pesan via WebSocket multicast.
  2. Skema database (`conversations.is_e2ee`, `encryption_mode`) dan routing backend dirancang *content-agnostic*, sehingga siap di-upgrade langsung ke E2EE Sender Keys di fase mendatang tanpa merombak skema DB atau memutus kompatibilitas UI.
- **Consequences**:
  - Pengerjaan Milestone 8.2 fokus pada kesempurnaan fitur grup (bikin grup, admin/member management, group drawer, multicast unread badge).
  - UI menampilkan status transparan: `🛡️ Wuzz Cloud Group`.

## DEC-002: Penundaan (Skipping) Fitur Bad Words Sensor Filter
- **Status**: Accepted
- **Context**: Milestone 8.2 pada awalnya mencakup Group Chat Engine dan Bad Words Sensor Filter.
- **Decision**: Fitur sensor kata-kata kasar ditunda/di-skip terlebih dahulu sesuai instruksi eksplisit pengguna, guna memusatkan sumber daya pada keandalan engine grup multi-user.

## DEC-003: Strategi Bertahap 8.2A (Core Group) & 8.2B (Ephemeral Sub-Groups / Topics)
- **Status**: Accepted
- **Context**: Diskusi kebutuhan bisnis / kerja tim untuk membuat sub-grup / topik diskusi mini di dalam grup yang memiliki masa kedaluwarsa otomatis (TTL / Ephemeral).
- **Decision**: Mengadopsi rilis bertahap:
  - **Milestone 8.2A**: Membangun Core Group Chat Engine dengan fondasi skema `parent_id VARCHAR(128) DEFAULT NULL` dan `expires_at TIMESTAMP DEFAULT NULL`. Untuk semua grup utama & DM di 8.2A, kedua kolom ini bernilai `NULL` (permanen & top-level).
  - **Milestone 8.2B**: Membangun UI Subgrup/Topik di dalam grup induk, pembuatan mini diskusi dengan opsi TTL (misal 7 hari / 30 hari), dan Background Purge Worker otomatis.
- **Consequences**:
  - Sidebar utama di 8.2A difilter dengan `WHERE parent_id IS NULL`, sehingga siap menerima ribuan subgrup di masa depan tanpa membuat daftar chat utama berantakan.
  - Zero schema migration ulang saat masuk ke 8.2B.

## DEC-004: Visibilitas Grup (Privat vs Publik) & Handle Username Grup
- **Status**: Accepted
- **Context**: Diperlukan pemisahan akses antara grup internal tertutup dan komunitas terbuka.
- **Decision**:
  1. Tabel `conversations` dilengkapi kolom `is_public BOOLEAN NOT NULL DEFAULT false` dan `group_username VARCHAR(64) DEFAULT ''`.
  2. **Grup Privat (Default)**: Hanya dapat dimasuki via undangan Admin/Member yang sudah ada.
  3. **Grup Publik**: Dapat dicari di pencarian global berdasarkan Nama Grup maupun `@username` grup. Pengguna luar dapat melakukan *self-join* (`POST /api/groups/:id/join`).
- **Consequences**:
  - Validasi keunikan `group_username` untuk grup publik.
  - Pencarian global diperluas untuk mengembalikan entri pengguna dan grup publik.

## DEC-005: Mekanisme Pemilihan Anggota (Recent DM Contacts + Live Search)
- **Status**: Accepted
- **Context**: Wuzz Chat adalah web chat tanpa sinkronisasi address book native HP.
- **Decision**:
  1. **Default Picker**: Menampilkan daftar lawan bicara dari obrolan terkini (*Recent DM Contacts*) secara instan tanpa perlu mengetik.
  2. **Live Search**: Kolom input untuk mencari kontak lain berdasarkan `@username` atau `display_name` via endpoint `/api/users/search`.
  3. **Tautan Undangan (Cara #3)**: Dicatat untuk milestone lanjutan.

## DEC-006: Standar Identitas Unik Grup (grp_<UUIDv4> & group_username)
- **Status**: Accepted
- **Context**: Penentuan identifier unik grup di database dan layer WebSocket.
- **Decision**:
  1. **System Primary Key**: Disimpan di `conversations.id` dengan format `grp_` + UUID v4 (contoh: `grp_a1b2c3d4-e5f6-7890-abcd-ef1234567890`). Nilai ini *immutable* dan digunakan sebagai `room_id` WebSocket serta foreign key di `conversation_members` dan `messages`.
  2. **Public Handle / Human-Readable ID**: Disimpan di `conversations.group_username` (khusus grup publik), unik, digunakan untuk pencarian `@komunitas_golang` dan link undangan.
- **Consequences**:
  - Konsisten dengan UUID-First Architecture di tabel `users`.
  - Prefix `grp_` mempermudah pembedaan dengan `dm_` di sisi frontend dan backend router.
