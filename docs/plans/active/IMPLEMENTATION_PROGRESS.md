# Implementation Progress: Milestone 8.2A — Core Group Chat Engine (Subgroup, Public/Private & E2EE Ready)

- [x] **Tahap 1: Database Schema & Auto-Migration**
  - [x] Kolom baru `conversations`: `is_public BOOLEAN DEFAULT false`, `group_username VARCHAR(64) DEFAULT ''`, `parent_id VARCHAR(128) DEFAULT NULL`, `expires_at TIMESTAMP DEFAULT NULL`, `created_by VARCHAR(64) DEFAULT ''`, `avatar_url TEXT DEFAULT ''`, `description TEXT DEFAULT ''`, `is_e2ee BOOLEAN DEFAULT false` (PostgreSQL & SQLite)
  - [x] Kolom baru `conversation_members`: `role VARCHAR(32) NOT NULL DEFAULT 'member'` (`'creator' | 'admin' | 'member'`)
  - [x] Indeks: `idx_conv_parent`, `idx_conv_members_role`, `idx_conv_public`
  - [x] Perbarui query `GetUserConversations`: filter `WHERE (c.parent_id IS NULL OR c.parent_id = '')`

- [x] **Tahap 2: Backend Group Store & REST API (Anti-Race, BOLA Protected & Public Search)**
  - [x] `group_store.go`: transaksi atomik `*sql.Tx` untuk `CreateGroup`
  - [x] Validasi `group_username` unik alfanumerik jika grup dibuat dengan `is_public = true`
  - [x] Endpoint `POST /api/groups`: pembuatan grup privat / publik
  - [x] Endpoint `GET /api/groups/:id` & `GET /api/groups/:id/members` (proteksi BOLA: privat wajib member, publik terbuka)
  - [x] Endpoint `POST /api/groups/:id/join`: self-join untuk grup publik
  - [x] Endpoint `POST /api/groups/:id/members`: tambah member oleh Admin
  - [x] Endpoint `DELETE /api/groups/:id/members/:userId`: kick oleh Admin/Creator atau self-leave
  - [x] Endpoint `PATCH /api/groups/:id/members/:userId/role`: ubah role (Creator tidak bisa di-demote oleh Admin)
  - [x] Endpoint `PATCH /api/groups/:id`: update nama, deskripsi, avatar, dan visibilitas
  - [x] Endpoint search terintegrasi / `/api/groups/search`: pencarian grup publik berdasarkan nama dan `@username`
  - [x] Unit & integration tests Go (100% pass)

- [x] **Tahap 3: WebSocket Multicast Relay & System Events**
  - [x] Multicast broadcast pesan grup ke anggota aktif
  - [x] System events: `group_member_joined`, `group_member_removed`, `group_role_updated`, `group_info_updated`
  - [x] Gatekeeping status keanggotaan aktif pengirim pesan
  - [x] Push notification dispatch untuk anggota grup offline

- [x] **Tahap 4: Frontend State & Group Creation Wizard (Privat / Publik)**
  - [x] Interface tipe: `is_public`, `group_username`, `GroupRole`, `GroupMember`, `GroupDetails` di `types.ts`
  - [x] Modal `CreateGroupModal.tsx`:
    - Toggle pilihan: 🔒 **Grup Privat** vs 🌐 **Grup Publik**
    - Input `group_username` jika opsi publik aktif
    - Kontak picker: Tab/Daftar **Recent DM Contacts** (instan) + Kolom **Live Search `@username`**
    - State `disabled` instan & `AbortController` (15 detik)
  - [x] Tombol "+ Grup Baru" di Sidebar

- [x] **Tahap 5: Chat Timeline, Bubble Header & Public Group Discovery**
  - [x] Bubble header pengirim berwarna di room grup
  - [x] Bypass graceful enkripsi 1-on-1 untuk pesan grup
  - [x] Snippet pesan terakhir di Sidebar: `NamaPengirim: IsiPesan`
  - [x] Search bar Sidebar: Menampilkan hasil pencarian kontak DAN grup publik yang bisa di-join
  - [x] Filter tab "Grup" di Sidebar: Menampilkan grup aktif user

- [x] **Tahap 6: Group Info Drawer & Member Management UI**
  - [x] `GroupInfoDrawer.tsx`: detail grup, status Privat/Publik, daftar member, role badge, verified badge
  - [x] Menu Admin: Tambah Member, Jadikan Admin, Hapus Member
  - [x] Tombol "Keluar dari Grup" (Leave Group)
  - [x] Tombol "Gabung Grup" pada grup publik yang ditemukan di pencarian

- [x] **Tahap 7: Testing, Quality Gate & Documentation 360°**
  - [x] Backend `go test -v ./...`
  - [x] Frontend `npm run build`
  - [x] Uji skenario latensi tinggi & double-click guard
  - [x] Uji Dual-Platform (Desktop & Mobile)
  - [x] Sinkronisasi 8 dokumen wajib
