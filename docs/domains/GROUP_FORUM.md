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
| `GET` | `/api/groups/{id}/subgroups` | Daftar forum aktif dan berakhir di grup induk |
| `POST` | `/api/groups/{id}/subgroups` | Membuat topik forum baru (Admin/Creator only) |
| `POST` | `/api/groups/{sub_id}/join-request` | Mengajukan izin gabung ke forum privat |
| `GET` | `/api/groups/{sub_id}/join-requests` | Daftar pengajuan izin (Admin only) |
| `POST` | `/api/groups/{sub_id}/join-requests/{req_id}/action` | Setujui / tolak pengajuan izin |

---

## 💻📱 5. Antarmuka Pengguna (Web & Mobile)
- **Breadcrumb Header Interaktif**: `↖ [Nama Grup Induk] • Forum • X anggota` (tap untuk navigasi kembali).
- **Collapsible Action Menu (`⋮`)**: Icon-icon sekunder terlipat rapi di layar mobile agar judul room tidak terpotong.
- **Drawer Forum**: `SubGroupListDrawer.tsx` menampilkan daftar topik, badge sisa waktu TTL, dan panel peninjauan izin admin.

---

## 🧭 6. Backlog: Izin Gabung Grup Privat (`grp_`) via Tautan

**Status saat ini**: Tombol "Bagikan Grup" mobile sudah ada (`GroupInfoScreen.tsx`; publik: semua anggota, privat: admin/creator). Non-anggota yang membuka tautan grup privat `grp_` mendapat 403 + `AuthorizationShield` (buntu, hanya disuruh minta admin menambahkan). `join-request` backend baru berlaku untuk `sub_`.

**Rencana (ditunda)**: non-anggota bisa **Ajukan Gabung** lalu disetujui admin.
- **Backend**: buka `join-request` untuk `grp_` (tenant sama); sesuaikan `join-requests` & `/action`; `GetGroupDetails` mengembalikan pratinjau minimal untuk non-anggota (bukan 403); satu pending per user + rate limit.
- **Mobile**: ganti `AuthorizationShield` dengan alur "Ajukan Gabung" (status menunggu/ditolak); admin meninjau di panel yang sudah ada.
- **Dokumen**: ubah aturan 6 di atas setelah diimplementasi.
- **Keputusan terbuka**: pratinjau privat menampilkan jumlah anggota & deskripsi, atau hanya nama + avatar?
- Deploy backend butuh izin eksplisit pengguna.

## Keputusan Paket A — Forum Completion Loop (18 Oktober 2026)

- Forum berakhir tetap tampil di daftar grup dan dapat dibuka anggota forum untuk membaca riwayat. Daftar tidak memberikan akses baru kepada non-anggota; join ke forum berakhir tetap ditolak. Forum Saya tetap memakai akses forum yang sudah ada.
- Pengiriman pesan baru melalui WS dan forward ke forum berakhir tetap ditolak backend. **Edit, hapus, dan reaksi dipertahankan sesuai perilaku yang ada**; perlu keputusan bisnis lanjutan sebelum memperluas pengunciannya. Istilah read-only pada sesi ini menjelaskan larangan pesan baru/forward, bukan perubahan seluruh operasi pesan lama.
- Paket A sudah di-commit ke dev, digabung ke main, dan main dipush. APK pengguna 1.39.1 build 70 lulus uji akses riwayat/read-only dari Forum Saya serta daftar forum di Info Grup. Uji notifikasi Memori nyata ditunda pengguna. Berikutnya Paket B; deploy dan build APK/AAB hanya dikerjakan pengguna.

## Forum Completion Loop — Paket B (18 Oktober 2026)

Forum Saya menambah lifecycle Memori melalui satu query join tenant/grup/forum, dengan membership topik dan induk serta batas 300 tetap berlaku. Izin review memakai `parent_role` admin/creator, bukan role forum. Badge mobile menghitung draf yang dapat ditinjau dalam daftar ini. Tidak mengubah aturan mutasi forum berakhir.

Hasil tes dan batas verifikasi: [rencana Forum Completion Loop](../plans/backlog/FORUM_COMPLETION_LOOP.md). Paket B belum diuji di perangkat; uji notifikasi nyata Paket A tetap ditunda pengguna. Deploy/APK dilakukan pengguna; tidak ada perubahan versi atau data produksi.
