# Rencana Monetisasi Forum (Freemium) — Hasil Audit & Keputusan MVP

> **Status:** Fase 1-3 selesai (Fase 2 `7b957a4`, Fase 3 `8fb96df`). **Fase 4 (UI mobile + web) diimplementasi lokal 20 Oktober 2026**, belum commit, belum diuji di HP/browser, belum di-deploy/build. Batas forum dan kuota AI mati secara default (`FORUM_LIMITS_ENABLED`, `MEMORY_QUOTA_ENABLED`). Fase 5 ditunda. Disusun dari audit read-only pada branch `dev` (commit `4ae842b`).
> **Aturan kerja:** deploy backend/frontend dan build APK dilakukan pengguna. Jangan menaikkan versi/build number. Tidak ada `git push` tanpa persetujuan tertulis terpisah.

---

## 1. Keputusan yang sudah disepakati

| Topik | Keputusan |
|---|---|
| Unit batas forum | **Per user pembuat** (`conversations.created_by`) dalam satu tenant |
| Free | 1 forum aktif, durasi 7 hari, AI Memory 2 ringkasan/bulan |
| Pro | 5 forum aktif, durasi 7 atau 30 hari, AI Memory 20 ringkasan/bulan |
| Business | **Ditunda**, hanya dicatat sebagai rencana |
| Pemilik kuota AI | Pembuat forum |
| Pemberian Pro | Manual lewat `/admin`, tanpa pembayaran |
| Whitelist `MEMORY_ENABLED_GROUPS` | Dipertahankan sebagai sakelar darurat; kuota paket berlaku di atasnya |
| Saat batas tercapai | Backend menolak dengan pesan jelas; UI memberi info netral |
| Downgrade / Pro berakhir | Tidak ada penghapusan. Forum aktif berjalan sampai selesai; hanya pembuatan baru diblokir |
| Kuota AI habis | Forum tetap berakhir normal, job tidak dibuat, pesan jelas (bukan janji palsu) |
| Pengguna lama | Grandfather sementara dengan Pro gratis |
| Target uji | Beberapa admin komunitas yang dikenal |
| Angka batas | Hipotesis (1 / 5; 2 / 20), dievaluasi setelah uji |
| Pembayaran | Ditunda; aturan Play Billing diperiksa lebih dulu (lihat bagian 8) |

## 2. Usulan untuk tiga hal yang masih terbuka

1. **Lama Pro gratis untuk pengguna lama: 60 hari** sejak entitlement diisi. Setelah itu otomatis kembali ke Free tanpa menghapus data. Cukup untuk mengumpulkan masukan; angka dapat diubah per baris.
2. **Periode kuota AI: bulan kalender (UTC).** Kuota dihitung dari jumlah job milik pembuat yang dibuat pada bulan berjalan. Tidak butuh counter baru dan tidak ada tugas reset. Konsekuensi: user di UTC+7 melihat pergantian bulan pukul 07.00 WIB; dicatat di teks UI.
3. **Forum yang lewat `expires_at` tidak dihitung aktif**, walau `status` belum berubah menjadi `expired` (worker TTL jalan tiap 15 menit; akhiri-manual hanya memajukan `expires_at`). Definisi aktif: `status = 'active' AND (expires_at IS NULL OR expires_at > now)`.

Catatan tambahan (audit): `ForumService.validDurations` menerima `1h`…`3d`, tetapi `SQLGroupStore.CreateSubGroupWithContext` hanya menerima 7 hari atau 30 hari, sehingga durasi pendek selalu ditolak 400. Usulan: saat implementasi, samakan daftar durasi di service dengan store dan perbaiki teks `ErrSubGroupDurationInvalid`. Durasi 30 hari untuk Free ditolak di lapisan yang sama dengan pemeriksaan batas paket.

## 3. Fakta hasil audit (rujukan kode)

**Siklus hidup forum**
- Dibuat lewat `POST /api/groups/{id}/subgroups` → `handleCreateSubGroup` (`api/group_handler.go`) → `ForumService.CreateSubGroup` (`group/service.go`) → `SQLGroupStore.CreateSubGroupWithContext` (`store/sql_group_store.go`). Satu-satunya jalur pembuatan; satu transaksi `BeginTx`.
- Forum = baris `conversations` (`sub_<uuid>`, `parent_id`, `created_by`, `expires_at`, `status`). Status hanya `active` dan `expired`.
- Hak membuat: `creator` atau `admin` grup induk (dicek di service dan store).
- Kedaluwarsa: `SubGroupTTLWorker` (15 menit) memanggil `ExpireSubGroupsBatchDetailed`; tombol akhiri manual = `ExpireSubGroupNow` + `CreateJob`.
- Tidak ada endpoint perpanjang, aktifkan ulang, atau hapus forum. Tidak ada batas jumlah forum.

**Tenant & peran**
- `tenants` hanya punya `is_active`; tidak ada kolom plan/subscription di tabel mana pun. `users.system_role` hanya untuk staf (`user`, `wuzz_admin`, `wuzz_moderator`).
- Skema dibangun dari DDL inline di `store/sql.go` (`CREATE TABLE IF NOT EXISTS`, `ALTER … ADD COLUMN IF NOT EXISTS`); tidak ada direktori migrations.

**AI Memory**
- Job dibuat saat forum berakhir; `forum_memory_jobs.forum_id` bersifat `UNIQUE` (satu job per forum).
- `MemoryJobWorker` (interval 15 dtk, batch 5) mengambil maksimal 1.000 pesan (`GetRoomHistory`), tiap pesan dipotong 1.000 karakter, satu panggilan LLM (Gemini atau Groq, dipilih lewat env).
- Review/persetujuan hanya admin/creator grup induk (`MemoryService.checkAdminRole`).
- Satu-satunya gerbang: `GatedMemoryStore` (`store/memory_gate.go`) berbasis env `MEMORY_ENABLED_GROUPS`. Semua jalur pembuat/pemroses job melewatinya.
- Tidak ada embeddings/vektor, pencatatan token/biaya, maupun kuota.

## 4. Rancangan teknis minimum

**Tabel baru `user_entitlements`** (DDL inline di `store/sql.go`, mengikuti pola yang ada):

| Kolom | Keterangan |
|---|---|
| `user_id` | PK bersama `tenant_id` |
| `tenant_id` | Default `default` |
| `plan` | `free` / `pro` (nanti `business`) |
| `status` | `active` / `revoked` |
| `valid_until` | NULL = tanpa batas; lewat = diperlakukan Free |
| `source` | `manual` / `grandfather` (nanti `play`/lainnya) |
| `created_at`, `updated_at` | Audit |

- Tidak ada baris = Free. Entitlement kedaluwarsa = Free (dievaluasi saat dibaca, tanpa worker).
- Batas paket sebagai konstanta/peta di satu paket Go (mis. `internal/entitlement`), bukan di DB, agar mudah diubah sesudah uji.

**Pemeriksaan batas forum aktif** — di dalam transaksi `CreateSubGroupWithContext`, sebelum insert:
- Kunci per user (Postgres: `pg_advisory_xact_lock` pada hash `tenant_id + user_id`; SQLite: transaksi sudah serial) agar dua request bersamaan tidak sama-sama lolos.
- `COUNT(*)` forum aktif milik `created_by` di tenant itu (definisi aktif pada bagian 2).
- Jika ≥ batas: kembalikan `ErrForumLimitReached`; handler memetakannya ke HTTP 403 dengan kode galat terstruktur (mis. `forum_limit_reached`) dan nilai `limit`/`active`.
- Cek durasi: Free yang meminta 30 hari → `ErrDurationNotInPlan`.
- Indeks baru: `conversations(created_by, status)` (atau yang setara) agar hitungan murah.

**Kuota AI** — di `GatedMemoryStore.CreateJob` (satu titik untuk TTL worker, akhiri manual, dan worker):
- Hitung job yang dibuat pembuat forum pada bulan kalender berjalan; bila ≥ kuota → `ErrMemoryQuotaExceeded`, job tidak dibuat.
- Perlu mengetahui pembuat forum: ambil dari `conversations.created_by` atas `forum_id` (satu query ringan, hanya saat job dibuat).
- Pemanggil menampilkan pesan yang jujur: “Topik forum telah berakhir. Memori AI tidak dibuat karena kuota bulan ini habis.” (menyesuaikan logika `jobCreated` yang sudah ada di `InstantExpireSubGroup`).
- Pencatatan token/biaya: opsional (kolom di `forum_memory_jobs`), bukan syarat MVP; biaya per forum sudah berbatas atas karena 1 job/forum dan 1.000 pesan × 1.000 karakter.

**Endpoint status**: `GET /api/me/entitlement` → `{plan, valid_until, forums: {active, limit}, ai: {used, limit, period_end}, allowed_durations}`. Hanya data milik pemanggil. Dipakai UI.

**Admin**: ekstensi `/admin` yang ada (alat moderasi) untuk memberi/mencabut paket user secara manual dengan jejak audit (siapa, kapan). Menggunakan peran staf yang sudah ada; tidak ada peran baru.

**Pengguna lama (grandfather)**: skrip/aksi admin sekali jalan yang mengisi `user_entitlements` (`plan=pro`, `source=grandfather`, `valid_until = sekarang + 60 hari`) untuk admin/creator grup yang sudah ada. Dijalankan pengguna dengan konfirmasi eksplisit; tidak dijalankan otomatis oleh migrasi DDL.

## 5. Perilaku untuk edge case

| # | Skenario | Perilaku |
|---|---|---|
| 1 | Dua request bersamaan di ambang batas | Kunci per user + hitung dalam transaksi; yang kedua ditolak |
| 2 | Free menjadi anggota forum milik Pro | Boleh; batas hanya untuk pembuatan |
| 3 | User membuat forum di banyak grup | Dihitung total per user |
| 4 | Pro → Free | Forum aktif jalan sampai selesai; pembuatan baru diblokir |
| 5 | Subscription berakhir saat forum aktif | Sama seperti nomor 4; tanpa penghapusan |
| 6 | Forum berakhir, job AI belum selesai | Kuota dicek hanya saat `CreateJob`; job yang sudah dibuat tetap diproses |
| 7 | Mencoba melewati batas lewat API | Pemeriksaan di store/transaksi; UI hanya informatif |
| 8 | Akses AI Memory tanpa izin | Tidak berubah (`checkAdminRole`); entitlement tidak melonggarkan akses |
| 9 | Forum dihapus/diarsipkan | Belum ada fiturnya; bila ditambah, forum non-aktif tidak dihitung |
| 10 | Paket berubah saat forum aktif | Berlaku untuk pembuatan berikutnya saja |

## 6. Perubahan UI minimum

- Layar/modal **Buat Topik** (mobile `CreateSubGroupModal.tsx`; web padanannya): tampilkan “Forum aktif x/y”; opsi 30 hari dinonaktifkan untuk Free dengan keterangan netral.
- Saat ditolak `forum_limit_reached`: pesan jelas berisi batas paket dan saran mengakhiri forum lama atau menghubungi admin Wuzz untuk akses Pro. **Jangan** memuat ajakan membayar di luar Play (lihat bagian 8).
- Detail/riwayat forum berakhir: pesan “memori tidak dibuat karena kuota” bila relevan.
- Indikator kuota AI sederhana (terpakai/batas) pada Info Grup atau layar Forum Saya.
- Tidak ada perombakan desain. Web mengikuti token `frontend/app/globals.css` dan `frontend/DESIGN.md`.

## 7. Roadmap

| Fase | Isi | Keluaran |
|---|---|---|
| 1 | Keputusan desain | Dokumen ini disetujui, tiga usulan bagian 2 dikonfirmasi |
| 2 | Entitlement + batas forum aktif | Tabel, paket `entitlement`, cek transaksional, endpoint status, admin manual, tes konkurensi/downgrade/lintas tenant |
| 3 | Kuota AI | Cek di `CreateJob`, pesan jujur, tes kuota |
| 4 | UI batas & kuota | Mobile dan web, pesan netral |
| 4b | Grandfather | Aksi admin sekali jalan, dijalankan pengguna |
| 5 | Pembayaran | **Ditunda** sampai model terbukti dan aturan Play diperiksa |

Urutan rilis: Fase 2 dan 3 dapat berjalan dengan perilaku tidak berubah bagi pengguna selama batas belum diaktifkan lewat konfigurasi (lihat risiko). Deploy backend dan build APK dilakukan pengguna.

## 8. Risiko & catatan

- **Aturan Google Play.** Dari riset sekunder (bukan teks resmi): fitur/layanan digital yang dijual di aplikasi Play pada dasarnya wajib memakai Google Play Billing, termasuk perangkat lunak produktivitas bisnis; mengarahkan pengguna ke metode bayar lain juga dibatasi. Sejak Maret 2026 ada pelonggaran setelah penyelesaian Epic v. Google, tetapi cakupan wilayah dan biayanya belum terverifikasi (sumber saling bertentangan) dan belum jelas berlaku untuk Indonesia. Tindakan: periksa halaman kebijakan resmi dan Play Console sebelum Fase 5; pada Fase 4 gunakan teks UI netral.
- **Pengguna lama.** Admin yang kini bebas membuat forum akan terkena batas Free setelah masa grandfather; sampaikan sebelum berakhir.
- **Efektivitas batas 1 forum.** Hanya admin yang membuat forum, jadi banyak pengguna mungkin tidak pernah menyentuh batas. Validasi lewat uji; sebelum mengunci angka, hitung read-only distribusi forum per admin di produksi (butuh izin akses data produksi dari pengguna).
- **Biaya AI.** Terkendali: 1 job/forum, input berbatas. Whitelist tetap menjadi sakelar darurat. Membuka whitelist ke semua grup berarti biaya mengikuti kuota paket (Free 2, Pro 20 per bulan per pembuat).
- **Jeda worker.** Status `expired` bisa terlambat hingga ±15 menit; ditangani oleh definisi aktif berbasis `expires_at`.
- **Akurasi hitungan Postgres vs SQLite.** Kunci advisory hanya ada di Postgres; tes harus mencakup kedua driver karena kode memakai percabangan `driverName`.
- **Dokumentasi yang tidak sinkron** (dicatat agar tidak membingungkan): `docs/domains/MULTI_TENANT.md` menyebut `tenants.status`, sedangkan skema memakai `is_active`; daftar durasi service vs store berbeda (bagian 2).

## 9. Kriteria penerimaan

1. User Free dengan 1 forum aktif yang membuat forum kedua ditolak backend (termasuk lewat panggilan API langsung) dengan kode galat `forum_limit_reached`.
2. 20 request pembuatan forum bersamaan dari satu user Free menghasilkan tepat 1 forum (diuji pada Postgres dan SQLite).
3. Setelah forum diakhiri atau lewat `expires_at`, user Free dapat membuat forum baru tanpa menunggu worker.
4. Forum di banyak grup dihitung total per user; user lain tidak terpengaruh.
5. User Pro dapat memiliki 5 forum aktif; yang ke-6 ditolak.
6. Free meminta durasi 30 hari ditolak; Pro diterima.
7. Pro → Free (atau `valid_until` lewat) tidak menghapus forum, memori, atau draf; hanya pembuatan baru yang diblokir.
8. Member Free tetap dapat bergabung dan menulis di forum milik user Pro.
9. Job AI melebihi kuota bulan kalender tidak dibuat; forum tetap berakhir normal; pesan sistem tidak menjanjikan memori diproses.
10. Kuota Free = 2 dan Pro = 20 per pembuat per bulan kalender; bulan baru menghitung ulang tanpa tugas reset.
11. Akses review/baca memori (`checkAdminRole`) dan isolasi lintas tenant tidak berubah; seluruh tes yang ada tetap lulus.
12. `GET /api/me/entitlement` hanya mengembalikan data milik pemanggil.
13. Aksi admin memberi/mencabut paket tercatat (siapa, kapan) dan hanya dapat dilakukan staf.
14. `go test -v ./...` (backend), `npm run build` (frontend), dan `npx tsc --noEmit` (mobile) lulus.
15. Teks UI tidak memuat ajakan membayar di luar Play.

## 10. Di luar cakupan MVP

Paket Business dan fitur organisasi, integrasi pembayaran/langganan, perpanjang atau aktifkan ulang forum, embeddings dan pencarian arsip, pencatatan token/biaya terperinci, pengunduran batas per grup atau tenant.

## 11. Catatan implementasi Fase 4 (20 Oktober 2026)

- **Dikerjakan:** info jatah forum aktif, opsi 30 hari dikunci untuk Free, tombol buat dinonaktifkan saat jatah habis, kuota ringkasan AI di keterangan AI Memory, dan pesan akhiri manual yang sesuai hasil server (mobile dan web). UI hanya menampilkan bila server menyatakan batas ditegakkan.
- **Belum dikerjakan (sengaja):** (a) ~~pemberitahuan untuk forum yang berakhir otomatis tanpa ringkasan karena kuota habis~~ **sudah dikerjakan 21 Oktober 2026** (baris job `SKIPPED` + `memory_state: quota_exceeded` + label di Forum Saya mobile/web). Banner di dalam layar chat forum yang berakhir belum diubah; (b) ~~halaman admin web untuk memberi paket~~ **sudah dikerjakan 21 Oktober 2026** (`/admin/plans`: cari akun, beri/cabut Pro, pratinjau + terapkan grandfather; belum diuji di browser); (c) layar upgrade/entry point pembayaran, menunggu Fase 5 dan pemeriksaan kebijakan Google Play.
- **Teks:** hanya "hubungi admin Wuzz untuk akses Pro" dan "Tersedia di paket Pro"; tidak ada ajakan membayar, harga, atau tautan luar.

## 12. Aksi grandfather (20 Oktober 2026, lokal)

`POST /api/admin/entitlements/grandfather` (token `wuzz_admin`). Urutan pemakaian yang disarankan, **tepat sebelum** `FORUM_LIMITS_ENABLED=true` karena masa Pro dihitung sejak aksi dijalankan, bukan sejak batas diaktifkan:

1. Pratinjau: `{"days":60}` → mengembalikan `eligible` dan contoh username; tidak menulis apa pun.
2. Terapkan: `{"days":60,"confirm":true,"expected_eligible":<nilai eligible>,"note":"rilis batas paket"}`. Bila jumlah berubah sejak pratinjau → 409 dan tidak ada yang tertulis.
3. Jalan ulang aman (0 kandidat). Akun baru yang kemudian menjadi admin grup tidak otomatis mendapat Pro; berikan manual lewat `POST /api/admin/entitlements` bila perlu.

Syarat kandidat: admin/pembuat grup induk atau pernah membuat forum, di tenant `default`, dan **belum punya baris entitlement apa pun** (paket manual dan paket yang sengaja dicabut tidak disentuh). Riwayat tercatat di `entitlement_events` (`source=grandfather`, aktor admin).
