# Implementation Plan — Milestone 8.2A: Core Group Chat Engine (Subgroup, Public/Private & E2EE-Ready)

Membangun fondasi engine percakapan multi-user (Group Chat) dengan manajemen peran (Creator, Admin, Member), visibilitas grup (**Grup Privat vs Grup Publik dengan `@username`**), mekanisme pemilihan anggota kombinasi (**Recent DM Contacts + Live Username Search**), penyiapan skema relasional Subgrup (`parent_id`) dan TTL (`expires_at`) untuk persiapan Milestone 8.2B, serta arsitektur tangguh terhadap kondisi server lambat (latensi 200–800ms+), jaringan seluler *flaky*, dan kegagalan transaksi data.

---

## ⚠️ Analisis Risiko, Skenario Terburuk & Mitigasi SOP

1. **Server Lambat / Timeout saat Pembuatan Grup**:
   - *Mitigasi*: Tombol submit langsung masuk state `disabled` dengan spinner seketika saat diklik pertama kali.
2. **Transaksi Database Parsial (Orphan Records)**:
   - *Mitigasi*: Seluruh pembuatan record grup dan member dibungkus dalam 1 transaksi atomik database (`tx.Commit()` / `tx.Rollback()`).
3. **Konflik `@username` Grup Publik saat Concurrency Tinggi**:
   - *Mitigasi*: Indeks unik parsial pada `group_username`, respon HTTP 409 Conflict ramah jika username sudah ada.
4. **Flaky Network & WebSocket Reconnect Loops**:
   - *Mitigasi*: Deduplikasi pesan masuk berbasis UUID unik di frontend, clean state sync dari IndexedDB (`wuzzchat_msg_db`).
5. **Race Condition: Member Di-Kick Saat Masih Mengirim Pesan**:
   - *Mitigasi*: Gatekeeping keanggotaan aktif pengirim di WebSocket Hub sebelum pesan disimpan dan disalurkan. Tolak dengan HTTP 403 / error frame jika sudah di-kick.
6. **Request REST Menggantung (*Hanging Request*)**:
   - *Mitigasi*: Seluruh pemanggilan `fetch` grup dibungkus dengan `AbortController` (timeout 15 detik).
7. **Keamanan Akses (BOLA/IDOR)**:
   - *Mitigasi*: Validasi hierarki role di server Go: Hanya `creator` dan `admin` yang boleh kick member; `admin` dilarang kick `creator`; member biasa hanya boleh self-leave.

---

## 🎯 Lingkup Milestone 8.2A
1. **Visibilitas Grup**:
   - **Grup Privat (Default)**: Hanya via undangan Admin/Member.
   - **Grup Publik**: Memiliki `@username` unik, dapat dicari di global search, mendukung *Self-Join*.
2. **Mekanisme Pemilihan Anggota**:
   - **Recent DM Contacts**: Menampilkan daftar teman yang pernah chat 1-on-1 sebelumnya secara instan di modal picker.
   - **Live Username Search**: Kotak pencarian untuk menemukan pengguna lain berdasarkan `@username` atau nama lengkap.
3. **Fondasi Skema Subgrup & TTL**: Kolom `parent_id VARCHAR(128) DEFAULT NULL` dan `expires_at TIMESTAMP DEFAULT NULL` langsung ditambahkan pada tabel `conversations`.
4. **Sidebar Filtering**: Query percakapan utama difilter dengan `WHERE (c.parent_id IS NULL OR c.parent_id = '')`.
5. **E2EE Readiness**: Menggunakan pendekatan Opsi C (Server-Relayed terenkripsi TLS/WSS in-transit dengan flag `is_e2ee = false`).

---

## 📋 Tahapan Eksekusi
1. **Tahap 1: Database Schema & Auto-Migration (`backend/internal/store/`)**
   - Kolom baru `conversations`: `is_public`, `group_username`, `parent_id`, `expires_at`, `created_by`, `avatar_url`, `description`, `is_e2ee`
   - Kolom baru `conversation_members`: `role` (`'creator' | 'admin' | 'member'`)
   - Indeks: `idx_conv_parent`, `idx_conv_members_role`, `idx_conv_public`
   - Filter `GetUserConversations`: `parent_id IS NULL`
2. **Tahap 2: Backend Group Store & REST API (`backend/internal/api/` & `backend/internal/store/`)**
   - Implementasi `group_store.go` dengan transaksi atomik `*sql.Tx`
   - Endpoint: `POST /api/groups`, `GET /api/groups/:id`, `GET /api/groups/:id/members`, `POST /api/groups/:id/join`, `POST /api/groups/:id/members`, `DELETE /api/groups/:id/members/:userId`, `PATCH /api/groups/:id/members/:userId/role`, `PATCH /api/groups/:id`, `GET /api/groups/search`
   - Proteksi BOLA/IDOR dan batas timeout query 5 detik
3. **Tahap 3: WebSocket Hub Relay & Group Presence (`backend/internal/ws/`)**
   - Multicast broadcast pesan grup & system events (`group_member_joined`, `group_member_removed`, `group_role_updated`, `group_info_updated`)
   - Gatekeeping akses anggota aktif
   - Push notification dispatch untuk anggota grup offline
4. **Tahap 4: Frontend State & Group Creation Wizard (`frontend/app/chat/`)**
   - Type definitions di `types.ts`
   - Modal `CreateGroupModal.tsx` dengan toggle Privat/Publik, input `@username`, dan kontak picker (Recent DM Contacts + Live Search)
   - Tombol "+ Grup Baru" di Sidebar
5. **Tahap 5: Chat Timeline, Bubble Header & Public Group Discovery (`frontend/app/chat/`)**
   - Nama pengirim berwarna di atas bubble pesan dalam room grup
   - Pencarian terpadu di Sidebar (Pengguna & Grup Publik dengan tombol Gabung)
   - Bypass graceful enkripsi 1-on-1 untuk pesan grup
   - Snippet pesan terakhir di Sidebar (`Sender: Message`)
   - IndexedDB caching untuk pesan grup
6. **Tahap 6: Group Info Drawer & Member Management UI (`frontend/app/chat/`)**
   - Drawer profil grup `GroupInfoDrawer.tsx`
   - Manajemen role & tindakan kick/leave
7. **Tahap 7: Testing, Quality Gate & Documentation 360°**
   - Backend `go test -v ./...` & Frontend `npm run build`
   - Simulasi jaringan lambat & disconnect
   - Sinkronisasi 8 dokumen wajib
