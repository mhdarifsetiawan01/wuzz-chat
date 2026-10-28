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
   - Pilihan masa aktif topik: **7 hari** (default) atau **30 hari**. Daftar nilai yang diterima hanya ada di satu tempat, `store.SubGroupDurationDays` (`7_days`/`7d`/`1_week`/`week`, `30_days`/`30d`/`1_month`/`month`, kosong = 7 hari); service dan store memakainya bersama. Selain itu HTTP 400 (`ErrSubGroupDurationInvalid`). Sebelum 21 Okt 2026 service menerima `1h`…`3d` tetapi store selalu menolaknya; sudah disatukan.
   - **Perpanjang masa aktif (24 Okt 2026)**: `POST /api/groups/{id}/subgroups/{sub_id}/extend` body `{"days": 1..3}`. Hanya **pembuat forum** (`conversations.created_by`) yang berpaket **Pro**; 1 sampai 3 hari per perpanjangan, **total maksimal 30 hari per forum** (kolom `conversations.extended_days`, ikut dikirim sebagai `extended_days` di daftar topik). Forum yang sudah `expired` atau lewat `expires_at` **tidak dapat diperpanjang dan tidak ada jalur aktifkan ulang** (sengaja; bisa ditambah kelak). Gerbang Pro mengikuti `FORUM_LIMITS_ENABLED` dan hanya di tenant `default` (sama seperti batas forum); aturan 1..3 hari dan 30 hari selalu berlaku. Pemeriksaan dan UPDATE bersyarat dalam satu transaksi (`SELECT ... FOR UPDATE` di Postgres), aman terhadap permintaan bersamaan. Galat memakai `code`: `invalid_days` 400, `extend_pro_required`/`extend_not_creator`/`forbidden` 403, `not_found` 404, `forum_expired`/`extend_limit_reached` 409. Pesan sistem grup `subgroup_extended`. Kode: `store.ExtendSubGroup`, `ForumService.ExtendSubGroup`, konstanta `entitlement.ForumExtend*` dan `Limits.CanExtendForum`. Perpanjangan tidak mengubah hitungan forum aktif maupun kuota AI.
   - Background worker (`15m ticker`) mengeksekusi kedaluwarsa massal atomic (`ExpireSubGroupsBatch`).
   - **Fail-Closed Read-Only Lock**: Saat `status = 'expired'`, input pesan terkunci (*disabled*) dan soket menolak pengiriman pesan baru, tetapi riwayat chat tetap terbaca (*persistent read*).
5. **Mode Pratinjau Grup Publik (Anti-Accidental Join)**:
   - Membuka tautan grup publik atau hasil pencarian memunculkan bottom sheet / modal konfirmasi pratinjau (`GroupPreviewModal.tsx`), bukan langsung auto-join.
6. **Gerbang Otorisasi Tautan Privat (Authorization Shield)**:
   - Non-anggota yang membuka link grup privat ditolak di gerbang HTTP 403 dan disajikan layar proteksi (*Private Group Shield*), tidak diizinkan masuk ke ruang obrolan kosong.
8. **Tautan Pendek (28 Okt 2026)**:
   - Tautan bagikan memakai kode acak 8 karakter (`conversations.short_code`, indeks unik), mis. `chat.wuzzhub.id/g/Ab3xK9qz` dan `/sub/Ab3xK9qz`. Kode dibuat malas oleh `POST /api/links` (hanya anggota), tidak pernah berganti, dan diterjemahkan publik oleh `GET /api/links/{code}` (akses ruang tetap lewat gerbang 403 di atas). Untuk **grup utama publik** respons menyertakan `preview` (nama + avatar) yang dipakai landing web; grup privat dan forum tidak pernah mengeluarkan metadata tanpa login. Landing menampilkan avatar hanya bila `https://`, path relatif, atau `emoji:`; selain itu inisial.
   - Tautan panjang `/g/grp_<uuid>` dan `wuzzchat://g/...` tetap diterima (kompatibilitas tautan lama). Klien membedakan kode pendek dari ID lewat pola `^[2-9a-hj-km-np-zA-HJ-NP-Z]{8}$` (ID selalu berawalan `grp_/sub_/dm_`).
   - Kode: `store.ShortLinkStore`, `api.ShortLinkHandler`, `mobile/src/api/links.ts`, `frontend/app/OpenInAppLanding.tsx`. Slug kustom sengaja ditunda (kandidat fitur Pro; cek `ADS_AND_REWARDS_PLAN.md` dulu).
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
| `POST` | `/api/groups/{id}/subgroups/{sub_id}/extend` | Perpanjang masa aktif 1-3 hari (pembuat forum berpaket Pro, total maks 30 hari; forum expired tidak bisa) |
| `POST` | `/api/groups/{id}/subgroups/{sub_id}/expire` | Mengakhiri topik seketika (Admin/Creator grup induk). Respons memuat `memory`: `queued` / `quota_exceeded` / `not_queued` |
| `GET` | `/api/forums/mine` | Forum yang diikuti user (aktif dan berakhir) beserta `memory_state` |
| `GET` | `/api/me/entitlement` | Paket, jatah forum aktif, durasi yang diizinkan, dan kuota ringkasan AI milik pemanggil |
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

Hasil tes dan batas verifikasi: [rencana Forum Completion Loop](../plans/archived/28-10-2026-backlog-selesai/FORUM_COMPLETION_LOOP.md). Paket B belum diuji di perangkat; uji notifikasi nyata Paket A tetap ditunda pengguna. Deploy/APK dilakukan pengguna; tidak ada perubahan versi atau data produksi.

## Forum Completion Loop — Paket C (19 Oktober 2026, lokal)

`GET /api/messages?room_id=sub_…&message_id=…` memperluas history untuk konteks sumber: maksimal 20 pesan sebelum/sesudah + anchor, berurutan waktu/ID. SQL memeriksa pasangan room/message, tenant user/forum/induk, membership forum dan induk, cutoff history viewer, serta penghapusan viewer/semua. Memori tidak memberikan akses tambahan ke forum privat. Forum berakhir tetap readable; aturan mutasi lama dipertahankan.

Detail/review Memori mobile/web menyediakan **Lihat Pesan Asli**, navigasi forum, scroll/highlight sementara, serta galat sumber tidak tersedia atau coba lagi manual untuk gangguan jaringan. Jendela konteks terpisah dari cache history terbaru; request dibatalkan saat target/sesi berganti dan hasil terlambat diabaikan. Web memakai lifecycle Forum Saya, istilah yang sama, dan gate `memory_enabled`; deep link/notifikasi A dan lifecycle/badge B dipertahankan.

Tes otomatis lulus; Paket C belum diuji di APK/browser interaktif/E2E atau PostgreSQL produksi. Deploy backend/frontend dan APK baru dilakukan pengguna. Rincian kontrak, tes, dan batas verifikasi: [rencana Forum Completion Loop](../plans/archived/28-10-2026-backlog-selesai/FORUM_COMPLETION_LOOP.md#paket-c--implementasi-lokal-19-oktober-2026). Catatan “Paket B belum diuji di perangkat” di entri historis sebelumnya sudah digantikan oleh hasil HP B pada akhir rencana; badge >0/review B dan notifikasi nyata A tetap belum terverifikasi.

## Paket & batas forum (monetisasi, 21 Oktober 2026)

Rencana lengkap, keputusan, dan hasil uji: [`docs/plans/backlog/FORUM_MONETIZATION_PLAN.md`](../plans/backlog/FORUM_MONETIZATION_PLAN.md).

- **Paket:** `free` (1 forum aktif, hanya 7 hari, 2 ringkasan AI/bulan) dan `pro` (5 forum aktif, 7 atau 30 hari, 20 ringkasan AI/bulan). Angka ada di `internal/entitlement/plan.go`; baris per user di tabel `user_entitlements` (`plan`, `status`, `valid_until`, `source` = `manual`/`grandfather`). Tanpa baris, dicabut, atau `valid_until` lewat = Gratis. Riwayat perubahan di `entitlement_events` (append-only).
- **Penegakan di backend, di dalam transaksi pembuatan forum** (`SQLGroupStore.CreateSubGroupWithContext` → `enforceForumLimit`): durasi harus termasuk paket dan jumlah forum aktif milik pembuat (`created_by`) belum mencapai batas. Postgres memakai advisory lock per `(tenant, user)`, SQLite memakai mutex proses. UI hanya informatif.
- **Forum aktif** = `status = 'active'` DAN belum lewat `expires_at` (jeda worker TTL ±15 menit tidak menahan pembuatan forum baru). Dihitung per pembuat di seluruh grup, bukan per grup.
- **Penolakan:** HTTP 403 dengan `code` `forum_limit_reached` (`plan`, `limit`, `active`) atau `duration_not_in_plan`. Teks pesan netral; tidak mengajak membayar.
- **Sakelar env (default MATI):** `FORUM_LIMITS_ENABLED=true` (batas forum + durasi) dan `MEMORY_QUOTA_ENABLED=true` (kuota AI, lihat [`AI_MEMORY.md`](AI_MEMORY.md)). Hanya tenant `default`.
- **Downgrade:** tidak menghapus apa pun. Forum aktif berjalan sampai selesai; hanya pembuatan baru dan ringkasan AI berikutnya yang mengikuti paket Gratis.
- **Admin (khusus `wuzz_admin`):** `GET/POST /api/admin/entitlements` (cari akun, beri Pro N hari, cabut) dan `POST /api/admin/entitlements/grandfather` (pratinjau lalu terapkan Pro sementara untuk admin/pembuat grup yang sudah ada; terapkan wajib `confirm` + `expected_eligible`). UI: `/admin/plans`.

