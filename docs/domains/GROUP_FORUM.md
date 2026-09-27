# 👥 Domain: Group Chat & Forum Topics (`GROUP_FORUM`)

Dokumen ini adalah spesifikasi definitif untuk domain **Obrolan Grup, Forum Topik Diskusi, RBAC, dan Siklus TTL** pada Wuzz Chat.

---

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **Format Identitas Ruang**:
   - Grup Induk: Berawalan `grp_` (`grp_<UUIDv4>`).
   - Forum Topik: Berawalan `sub_` (`sub_<UUIDv4>`) dengan relasi `parent_id` menunjuk ke grup induk.
2. **Peran & Akses RBAC (Role-Based Access Control)**:
   - `creator`: Pembuat grup, hak penuh (mengubah info grup, menambah/mengangkat admin, membubarkan grup).
   - `admin`: Mengatur anggota, menyetujui izin gabung, dan **membuat forum topik baru**.
   - `member`: Anggota biasa. Tombol "Buat Topik Baru" **disembunyikan** bagi member biasa.
3. **Kontrol Akses Topik Forum (Terbuka vs Privat)**:
   - 🌐 **Terbuka (`is_public = true`)**: Seluruh anggota grup induk dapat langsung bergabung (`join`).
   - 🔒 **Privat (`is_public = false`)**: Wajib mengajukan izin gabung (`join-request`), ditinjau oleh Admin.
4. **Siklus Hidup & TTL Otomatis (*SubGroupTTLWorker*)**:
   - Pilihan masa aktif topik: **7 hari** (default) atau **30 hari**.
   - Background worker (`15m ticker`) mengeksekusi kedaluwarsa massal atomic (`ExpireSubGroupsBatch`).
   - **Fail-Closed Read-Only Lock**: Saat `status = 'expired'`, input pesan terkunci (*disabled*) dan soket menolak pengiriman pesan baru, tetapi riwayat chat tetap terbaca (*persistent read*).
5. **Mode Pratinjau Grup Publik (Anti-Accidental Join)**:
   - Membuka tautan grup publik atau hasil pencarian memunculkan bottom sheet / modal konfirmasi pratinjau (`GroupPreviewModal.tsx`), bukan langsung auto-join.
6. **Gerbang Otorisasi Tautan Privat (Authorization Shield)**:
   - Non-anggota yang membuka link grup privat ditolak di gerbang HTTP 403 dan disajikan layar proteksi (*Private Group Shield*), tidak diizinkan masuk ke ruang obrolan kosong.
7. **Penyebutan Multi-User (@mentions)**:
   - Autocomplete popover `@username` dengan validasi fail-closed keanggotaan room di WebSocket Hub.

---

## 🏛️ 2. Model Backend DDD (`backend/internal/group/`)

```text
backend/internal/group/
├── entity.go         # Group, SubGroup, GroupMember, JoinRequest
├── repository.go     # Interface GroupRepository
├── service.go        # GroupService & ForumService
├── worker/           # SubGroupTTLWorker (Background auto-expire batch)
└── infra/            # SQL Group Repository Adapter
```

---

## 🗄️ 3. Skema Basis Data

- `conversations`: Kolom `parent_id` (UUID), `title`, `group_username`, `is_public`, `expires_at`, `status` (`active`/`expired`), `ai_summary`.
- `conversation_members`: Kolom `role` (`creator`/`admin`/`member`).
- `conversation_join_requests`: `id`, `conversation_id`, `user_id`, `status` (`pending`/`approved`/`rejected`), `created_at`.

---

## 🔌 4. Kontrak REST API

| Method | Endpoint | Keterangan |
|---|---|---|
| `POST` | `/api/groups` | Membuat grup induk baru |
| `GET` | `/api/groups/search?q={query}` | Mencari grup publik |
| `GET` | `/api/groups/{id}` | Detail informasi grup |
| `GET` | `/api/groups/{id}/members` | Daftar anggota grup & peran |
| `POST` | `/api/groups/{id}/join` | Bergabung ke grup terbuka |
| `GET` | `/api/groups/{id}/subgroups` | Daftar topik forum aktif di grup induk |
| `POST` | `/api/groups/{id}/subgroups` | Membuat topik forum baru (Admin/Creator only) |
| `POST` | `/api/groups/{sub_id}/join-request` | Mengajukan izin gabung ke forum privat |
| `GET` | `/api/groups/{sub_id}/join-requests` | Daftar pengajuan izin (Admin only) |
| `POST` | `/api/groups/{sub_id}/join-requests/{req_id}/action` | Setujui / tolak pengajuan izin |

---

## 💻📱 5. Antarmuka Pengguna (Web & Mobile)
- **Breadcrumb Header Interaktif**: `↖ [Nama Grup Induk] • Forum • X anggota` (tap untuk navigasi kembali).
- **Collapsible Action Menu (`⋮`)**: Icon-icon sekunder terlipat rapi di layar mobile agar judul room tidak terpotong.
- **Drawer Forum**: `SubGroupListDrawer.tsx` menampilkan daftar topik, badge sisa waktu TTL, dan panel peninjauan izin admin.
