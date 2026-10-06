# Backlog: Alat Moderasi Laporan (Halaman Web Moderator)

> Dibuat 2026-10-05. **Status (2026-10-06): P0 backend di-commit di `dev` (`9ffb183`, belum dideploy); P1 halaman web di-commit di `dev` (`64f7f88`, belum dideploy); P2 notifikasi Telegram selesai di `dev` (belum di-commit/dideploy); P3 belum dikerjakan.** Lihat bagian 9, 10, dan 11. Keputusan pemilik proyek: **Pilihan 1 (halaman web khusus moderator)**.
> Dokumen ini ditulis agar developer berikutnya (atau sesi AI berikutnya) bisa langsung mengerjakan tanpa konteks percakapan.
> Fakta bertanda **(terverifikasi)** sudah dicek di kode per tanggal di atas; bertanda **(belum diverifikasi)** harus dicek dulu.

## 1. Latar belakang dan tujuan

Pengguna dapat menekan **Laporkan** pada pesan, postingan, komentar, profil, atau grup. Laporan tersimpan di tabel `content_reports`, tetapi **tidak ada tempat untuk membaca dan menindaklanjutinya**:
satu-satunya cara saat ini adalah memanggil API dengan token moderator atau SQL langsung. Akibatnya:
- Janji di `https://chat.wuzzhub.id/child-safety` ("laporan keselamatan anak ditinjau dengan prioritas tertinggi") tidak bisa dipenuhi secara praktis.
- Kebijakan konten buatan pengguna Google Play mengharapkan proses moderasi yang benar-benar berjalan.

**Tujuan:** halaman web (hanya untuk moderator) untuk melihat laporan, membaca isi yang dilaporkan, mengambil tindakan, dan mencatat keputusan (jejak audit). Tidak butuh build APK.

**Bukan tujuan (di luar lingkup tahap ini):** layar moderator di aplikasi mobile, moderasi otomatis/AI, banding oleh pengguna, dasbor analitik, pemindaian konten pesan langsung (E2EE, mustahil).

## 2. Kondisi saat ini (terverifikasi)

| Komponen | Lokasi | Keterangan |
|---|---|---|
| Tabel laporan | `backend/internal/store/report_store.go` (`content_reports`) | kolom: `id, tenant_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, status, created_at`; unik per `(reporter_id, target_type, target_id)`; indeks `(tenant_id, status, created_at DESC)` |
| Jenis target | `ReportTarget*` | `message`, `user`, `post`, `comment`, `group` |
| Status | `ReportStatus*` | `open`, `resolved`, `dismissed` |
| Alasan | `report_handler.go` (`validReportReasons`) | `spam, harassment, hate, sexual, violence, illegal, impersonation, other` |
| Endpoint | `report_handler.go` | `POST /api/reports` (pengguna, 20/jam), `GET /api/reports?status=` (moderator), `PATCH /api/reports/{id}` (moderator: ubah status) |
| Pemeriksaan moderator | `report_handler.go` `isModerator` | `wuzz_moderator`, `admin`, `superadmin` |
| Peran di JWT | `auth/jwt.go` klaim `system_role` | disalin saat refresh |
| Peran di fitur Linimasa | `feed/entity.go` | `wuzz_admin` dan `wuzz_moderator`; staf boleh menghapus postingan tenant yang sama (`feed/service.go` `DeletePost`) |
| Cara mengangkat moderator | **hanya SQL** | tidak ada kode yang mengubah `users.system_role` |
| Gate web | `frontend/lib/app-download.ts` | web sedang dijeda; route yang dikecualikan harus ditambah agar halaman admin tetap terbuka |
| Bukti pesan E2EE | kolom `evidence` | satu-satunya bukti untuk pesan langsung; **server tidak bisa membaca DM** |

**Ketidakkonsistenan yang harus dibereskan:** `isModerator` di laporan menyebut `admin`/`superadmin` yang tidak dipakai di tempat lain, sedangkan Linimasa memakai `wuzz_admin`. Samakan (satu fungsi `IsStaff(role)` bersama).

**Belum ada sama sekali (terverifikasi):** mekanisme menangguhkan/memblokir akun (tidak ada kolom status/`suspended` di `users`, login tidak memeriksanya), jejak audit keputusan moderator, pemberitahuan laporan baru, dan akses baca ke konten yang dilaporkan lewat satu pintu.
**(belum diverifikasi)** apakah ada rute hapus komentar dan hapus pesan grup oleh staf (di `feed_handler.go` ada penanganan `comments`, tetapi belum diperiksa untuk DELETE).

## 3. Rancangan

### 3.1 Backend

**Migrasi (SQLite dan PostgreSQL, `CREATE ... IF NOT EXISTS` / `ALTER` idempoten seperti pola `autoMigrate`):**
- `users`: tambah `suspended_at TIMESTAMP NULL`, `suspended_reason VARCHAR(255) DEFAULT ''`, `suspended_by VARCHAR(64) DEFAULT ''`.
- `moderation_actions` (jejak audit, append-only): `id, tenant_id, report_id, moderator_id, action, target_type, target_id, target_user_id, note, created_at`.
  Aksi: `dismiss`, `resolve`, `delete_content`, `suspend_user`, `unsuspend_user`, `reopen`.
- `content_reports`: tambah `reviewed_by VARCHAR(64)`, `reviewed_at TIMESTAMP NULL`, `resolution_note TEXT` (atau cukup lewat `moderation_actions`; pilih satu, jangan ganda).

**Endpoint baru (semua `RequireJWT` + `IsStaff`, tenant-scoped, rate limit per moderator):**
| Endpoint | Fungsi |
|---|---|
| `GET /api/admin/reports?status=&target_type=&reason=&cursor=` | daftar berpaginasi; urutkan **keselamatan anak/seksual dan `illegal` dulu**, lalu terbaru |
| `GET /api/admin/reports/{id}` | detail: laporan + isi target (lihat 3.2) + laporan lain pada target yang sama + riwayat tindakan |
| `POST /api/admin/reports/{id}/action` | `{action, note}` untuk `dismiss`/`resolve`/`delete_content`/`suspend_user`; satu transaksi: ubah konten/akun + tutup laporan + tulis `moderation_actions` |
| `POST /api/admin/users/{id}/unsuspend` | buka tangguhan (tulis audit) |

**Penangguhan akun (efek yang harus ada):** (1) login ditolak dengan pesan jelas; (2) JWT yang sudah terbit dicabut (pakai `RevokeAllUserTokens`, seperti hapus akun) dan koneksi WebSocket ditendang; (3) pemeriksaan di `RequireJWT`/refresh agar token baru tidak bisa diterbitkan; (4) konten pengguna tetap, tetapi pengirim tidak bisa mengirim baru.
Penangguhan **tidak** menghapus data (beda dengan hapus akun); harus bisa dibalik.

### 3.2 Membaca isi yang dilaporkan, per jenis target
| Target | Cara mengambil isi | Catatan |
|---|---|---|
| `post` / `comment` | baca dari `feed_posts` / `feed_comments` (tenant-scoped) | tindakan: hapus (pakai logika yang ada di `feed/service.go`) |
| `message` grup/forum | baca `messages` (teks terbaca di server) + konteks beberapa pesan sebelum/sesudah | tindakan: hapus pesan |
| `message` DM (E2EE) | **tampilkan hanya `evidence` dari pelapor**, beri label "tidak dapat diverifikasi server" | tindakan terbatas pada penangguhan akun; jangan pernah mencoba mendekripsi |
| `user` | profil publik (nama, bio, avatar) | tindakan: tangguhkan |
| `group` | info grup dan beberapa pesan terakhir | tindakan: **(belum diputuskan)** menutup grup atau menangguhkan pembuatnya |
Jika konten sudah dihapus oleh pemiliknya, tampilkan "konten sudah dihapus" dan simpan `evidence` sebagai satu-satunya bukti; jangan mengembalikan 404 yang membingungkan.

### 3.3 Frontend (Next.js, `frontend/app/admin/reports/`)
- Halaman `/admin/reports` (daftar) dan `/admin/reports/[id]` (detail + tombol tindakan + catatan wajib untuk hapus/tangguhkan).
- **Autentikasi:** memakai sesi web yang sudah ada (JWT di `localStorage`); halaman memeriksa `system_role` dan menampilkan "akses ditolak" untuk non-staf. Pemeriksaan **sebenarnya ada di backend**, UI hanya kosmetik.
- Tambahkan `/admin` ke `WEB_PAUSED_EXEMPT_PREFIXES` (`frontend/lib/app-download.ts`) agar terbuka walau web pengguna dijeda; **jangan** mengaktifkan fitur chat web.
- Gaya mengikuti `frontend/DESIGN.md` (token CSS, tanpa hex mentah). Tidak diindeks mesin pencari (`robots: noindex`).
- **Keamanan tampilan:** semua teks pengguna (isi laporan, evidence, bio) dirender sebagai teks biasa (React meng-escape); jangan `dangerouslySetInnerHTML`; tautan dari konten pengguna diberi `rel="noopener noreferrer nofollow"` dan tidak dibuka otomatis.

### 3.4 Pemberitahuan (tahap 2)
Pilih satu (keputusan terbuka): **email** ke `SUPPORT_EMAIL` (butuh SMTP/penyedia email, belum ada), **webhook Telegram/Slack** (paling murah, satu env `MODERATION_WEBHOOK_URL`), atau hanya lencana jumlah laporan terbuka di halaman admin.
Laporan `sexual` yang menyebut anak, atau `illegal`, harus memicu pemberitahuan langsung. Tanpa pemberitahuan, laporan baru tidak akan dilihat tepat waktu.

## 4. Keamanan dan privasi (wajib)
- **Akses minimal:** hanya `wuzz_moderator`/`wuzz_admin`; peran diberikan lewat SQL oleh pemilik (`UPDATE users SET system_role='wuzz_moderator' WHERE username=...`) dan **dicatat**. Jangan membuat akun admin bawaan.
- **Isolasi tenant:** setiap kueri membawa `tenant_id` dari klaim; moderator satu tenant tidak melihat laporan tenant lain (pola yang sama dengan `ReportStore.List/SetStatus`). Uji lintas tenant.
- **Rate limit** per moderator (`api.UserRateLimitMsg`) dan **jejak audit** untuk setiap tindakan yang mengubah data.
- **Minimalkan data:** halaman hanya memuat yang diperlukan untuk memutuskan; jangan menampilkan alamat IP, token, kata sandi, atau kunci. `evidence` dari pelapor bisa memuat data pribadi: perlakukan sebagai data sensitif, batasi retensi (usulan: hapus `evidence` laporan yang sudah selesai setelah 90 hari, kecuali terkait kasus yang diteruskan ke pihak berwenang).
- **Penghapusan akun:** `account_eraser` tidak menghapus laporan (sengaja, untuk keamanan). Jika pelapor menghapus akun, `reporter_id` menjadi tombstone; laporan tetap valid. Dokumentasikan di `/privacy` bila retensi ini berubah.
- **Perbarui `/privacy`** dan `docs/PLAY_STORE_LISTING.md` (Data Safety) bila ada data baru (catatan moderasi, tanggal tangguhan).
- Kasus CSAM: **jangan** menyimpan salinan media di luar sistem; ikuti prosedur pelaporan ke pihak berwenang (lihat `/child-safety`); keputusan hukum di luar lingkup perangkat lunak.

## 5. Proses operasional (SOP) yang harus diputuskan pemilik
| Keputusan terbuka | Pilihan | Usulan awal |
|---|---|---|
| Siapa moderator pertama | pemilik sendiri, atau orang tepercaya | pemilik + satu cadangan |
| Target waktu tinjau | umum / keselamatan anak | umum <= 72 jam; `sexual`/`illegal`/anak: secepatnya, target <= 24 jam (selaras dengan janji di `/child-safety`) |
| Pelanggaran berat | tangguh permanen tanpa peringatan | ya, untuk CSAE; selain itu peringatan dulu |
| Banding | lewat email `SUPPORT_EMAIL`; belum ada UI | catat di `/terms` (sudah menyebut kontak banding) |
| Pemberitahuan laporan baru | email / webhook / lencana | webhook (paling murah) |
| Retensi `evidence` | 90 hari setelah selesai | sesuaikan dengan kebijakan hukum setempat |

## 6. Tahapan kerja yang disarankan
1. **P0 Backend (inti):** migrasi (`suspended_*`, `moderation_actions`), `IsStaff` bersama, endpoint admin (daftar, detail, aksi, unsuspend), pemeriksaan penangguhan di login/refresh/WS, transaksi aksi, tes (otorisasi, lintas tenant, rate limit, E2EE evidence-only, penangguhan mencabut token, aksi idempoten).
2. **P1 Frontend:** `/admin/reports` (daftar + filter + urutan prioritas), detail + tindakan + catatan, guard peran, `noindex`, pengecualian gate web, tes build.
3. **P2 Pemberitahuan:** webhook/email untuk laporan prioritas, ringkasan harian laporan terbuka.
4. **P3 Penyempurnaan:** kebijakan retensi `evidence` (pekerja pembersih), pencarian laporan per pengguna, opsi layar moderator di aplikasi bila dibutuhkan, UI banding.
Perkiraan: P0 sedang-besar (±1-2 hari kerja bersama tes), P1 sedang, P2 kecil, P3 bervariasi.

## 7. Kriteria penerimaan
- [ ] Moderator melihat daftar laporan terbuka, yang berisiko tinggi di atas, tanpa SQL.
- [ ] Detail memperlihatkan isi yang dilaporkan sesuai jenisnya; DM hanya menampilkan `evidence` dengan label yang jelas.
- [ ] Tindakan hapus/tangguhkan/tolak bekerja, menutup laporan, dan tercatat di `moderation_actions` (siapa, kapan, catatan).
- [ ] Akun yang ditangguhkan tidak bisa login atau memakai token lama, WebSocket-nya terputus, dan bisa dipulihkan (`unsuspend`).
- [ ] Pengguna non-moderator mendapat 403 di semua endpoint admin; moderator tenant lain tidak melihat data tenant ini (tes otomatis).
- [ ] Tidak ada data sensitif yang tampil berlebihan; semua teks pengguna aman dari XSS (tes render).
- [ ] `go test ./...`, `tsc`, `npm run test:unit` (mobile jika tersentuh), dan `npm run build` frontend lulus.
- [ ] `/privacy`, Data Safety, dan `docs/PLAY_STORE_LISTING.md` diperbarui bila ada data baru; SOP (bagian 5) disepakati dan dicatat.

## 8. Titik awal untuk pengerjaan
Mulai dari `backend/internal/api/report_handler.go` dan `backend/internal/store/report_store.go` (pola handler/store/test: `report_handler_test.go`), pola penangguhan token dari `store/account_eraser.go` dan `api/auth_handler.go` (`DeleteAccount`),
pola rate limit di `backend/internal/app/router.go`, dan pola halaman publik statis di `frontend/app/_legal/`. Dokumen terkait: `docs/PLAY_STORE_LISTING.md`, `docs/domains/AUTH_SESSION.md` (invarian 6), `docs/SECURITY_AND_PERFORMANCE.md`, `/child-safety` (`frontend/app/child-safety/page.tsx`).

## 9. Status P0 backend (2026-10-06)

**Selesai dan teruji** (SQLite dan PostgreSQL 16; seluruh `go test ./...` lulus; 4 mutasi pemeriksaan keamanan tertangkap tes):
- `store/moderation_store.go`: kolom `users.suspended_at/_reason/_by` (migrasi idempoten), tabel `moderation_actions` (audit), `IsStaff` (satu definisi staf: `wuzz_admin`, `wuzz_moderator`; `admin`/`superadmin` lama tidak lagi diakui), daftar berprioritas (`sexual`/`illegal` dulu, lalu `violence`/`hate`/`harassment`), detail dengan isi per jenis target, `ApplyAction` transaksional (ubah konten/akun + tutup laporan + audit sekaligus), `Unsuspend`.
- `authz/suspension.go` + `api/suspension_middleware.go` + gerbang WS 4004 + filter push + penolakan login/refresh (invarian 8 di `docs/domains/AUTH_SESSION.md`).
- `api/moderation_handler.go`, rute di `app/router.go` (JWT + rate limit 120/menit per moderator):

| Endpoint | Fungsi |
|---|---|
| `GET /api/admin/reports?status=&target_type=&reason=&limit=&offset=` | daftar ringkas (tanpa bukti/pelapor) |
| `GET /api/admin/reports/{id}` | laporan + isi target + laporan terkait + riwayat tindakan + status tangguh pemilik |
| `POST /api/admin/reports/{id}/action` | `{action: dismiss/resolve/reopen/delete_content/suspend_user, note}`; catatan wajib untuk hapus/tangguhkan |
| `POST /api/admin/users/{id}/unsuspend` | pulihkan akun |

**Keputusan implementasi yang menyimpang atau menjelaskan rencana:**
- Paginasi memakai `offset` (bukan kursor): volume laporan kecil.
- `delete_content` mendukung `post`, `comment`, dan pesan **grup/forum non-E2EE** (ditandai `is_deleted`, belum ada siaran realtime ke klien yang sedang terbuka; muncul saat memuat ulang). DM E2EE: dijawab 422, isi tidak pernah dibaca atau disentuh; gunakan tangguhkan akun. Laporan `user`/`group`: hanya `dismiss`/`resolve`/`suspend_user` (aksi untuk target `group` masih keputusan terbuka, tidak ada tindakan khusus).
- Pencabutan token massal memakai resolusi detik: token yang terbit di detik yang sama dengan penangguhan lolos dari pencabutan, tetapi tetap diblokir `SuspensionMiddleware`.
- Cache status tangguh 15 dtk (60 dtk bila tertangguh) per instans; `Invalidate` dipanggil pada instans yang menjalankan aksi. Pada multi-instans instans lain paling lambat 15-60 dtk menyusul.
- Klien mobile: belum ada layar khusus untuk `ACCOUNT_SUSPENDED` (403 di rute biasa tampil sebagai galat umum; login menampilkan pesan dari server). Perlu build mobile baru bila ingin layar tersendiri.

**Belum:** P1 halaman web (`/admin/reports`), pengecualian gate web `/admin`, P2 pemberitahuan (webhook), retensi `evidence` 90 hari, pembaruan `/privacy` dan Data Safety (data baru: catatan moderasi, tanggal tangguh), SOP bagian 5, cara mengangkat moderator pertama (hanya SQL).
**Sebelum deploy:** ini mengubah skema produksi (3 kolom `users` + 1 tabel, idempoten) dan menambah jalur penolakan login; deploy hanya dengan izin eksplisit.

## 10. Status P1 halaman web (2026-10-06)

**Selesai dan teruji di browser nyata** (Chrome headless via CDP terhadap backend lokal SQLite terisolasi; `tsc` dan `npm run build` lulus):
- Rute: `/admin` (alihkan), `/admin/reports` (daftar: tab status, filter jenis/alasan, urutan prioritas, "muat lebih banyak"), `/admin/reports/[id]` (isi target, bukti pelapor, laporan terkait, riwayat, tindakan dengan catatan wajib dan dialog konfirmasi). Kode: `frontend/app/admin/`, `frontend/lib/admin-api.ts`, gaya `app/admin/admin.css`, dokumentasi `frontend/DESIGN.md` bagian 9.
- **Login sendiri** di `/admin` (bukan `/login`): gerbang jeda web memblokir `/login`, dan login chat memakai slot 2 perangkat serta kunci E2EE. Login admin tanpa `device_id`, token di `sessionStorage` (hilang saat tab ditutup, berlaku maks 30 hari), sesi chat tidak tersentuh. Token dicabut/kedaluwarsa (401) mengembalikan ke form masuk dengan pesan.
- `/admin` dikecualikan dari gerbang jeda web; `robots: noindex`.
- Terbukti di browser: DM E2EE tidak menampilkan isi (hanya bukti pelapor + label), HTML/`javascript:` di konten tidak dirender dan tidak jadi tautan, hanya tautan https dengan `rel` aman dan tanpa gambar otomatis, hapus/tangguh nonaktif tanpa catatan, suspend membuat login korban `403 ACCOUNT_SUSPENDED` dan pemulihan membukanya, tanpa scroll horizontal di 390px, laporan `group` hanya punya Tolak/Selesai.

**Batasan:** moderator harus punya akun berpassword (login Google web belum ada, backlog #5) dan, setelah pembekuan 30 Okt 2026, akunnya wajib sudah menautkan Google (di aplikasi) agar tidak `GOOGLE_LINK_REQUIRED`. Tidak ada pengganti tes otomatis di repo untuk UI (skrip CDP ada di scratchpad sesi, bukan di repo).
**Sebelum dipakai di produksi:** deploy backend P0 (migrasi skema), build/deploy frontend (Vercel), angkat moderator pertama lewat SQL (`UPDATE users SET system_role='wuzz_moderator' WHERE username='...'`), lalu masuk di `/admin`.

## 11. Status P2 notifikasi laporan baru, Telegram (2026-10-06)

**Keputusan (disetujui pemilik):** hanya **notifikasi + tautan ke halaman web**; keputusan (hapus/tangguh) tetap di web. Tidak ada aksi lewat bot (menambah celah: webhook publik dan pemetaan akun Telegram ke moderator). Opsi tahap 2 bila nanti dibutuhkan: tombol "Tolak"/"Selesai" saja, dengan verifikasi secret token Telegram, daftar putih ID Telegram, data tombol bertanda tangan, aksi idempoten dan tercatat audit.

**Selesai dan teruji** (`go test ./...` lulus, paket `notify` dengan `-race`, 5 mutasi tertangkap; uji nyata ke api.telegram.org dengan token palsu):
- `internal/notify`: antarmuka **`Notifier`** (`Name`, `Notify`) agar saluran baru (email, webhook) cukup satu implementasi; `Telegram` (Bot API `sendMessage`, teks polos tanpa `parse_mode`); `Dispatcher` (antrean latar belakang 256, tidak pernah memblokir, percobaan ulang 3x dengan jeda berlipat, `429 retry_after` dihormati, galat permanen seperti token/chat salah tidak diulang, saluran dikirim paralel sehingga satu yang lambat/gagal/panik tidak menahan yang lain, antrean disapu saat berhenti); `Build` dari konfigurasi.
- **Isi pesan hanya metadata**: jenis target, alasan, penanda prioritas, jumlah laporan pada target yang sama, dan tautan `.../admin/reports/{id}`. Tidak ada isi pesan/postingan, bukti, rincian pelapor, username, atau ID pengguna/target (diuji).
- **Anti-banjir**: `sexual`/`illegal` selalu dikirim langsung; laporan biasa maksimal 5 per jendela 10 menit, sisanya diringkas jadi satu pesan "Ringkasan laporan" pada akhir jendela. Laporan duplikat dari pelapor yang sama tidak memicu notifikasi.
- **Kegagalan tidak memengaruhi laporan**: pembuatan laporan selalu 201; gagal kirim hanya dicatat. **Token bot tidak pernah masuk log/UI** (galat jaringan Go memuat URL penuh yang berisi token; disamarkan dan diuji).
- `POST /api/admin/notify/test` (staf, maks 5 per jam) dan tombol **"Tes notifikasi"** di `/admin/reports`: mengirim pesan uji dan menampilkan hasil per saluran (mis. "ditolak (401): Unauthorized").
- Dispatcher dimulai di `Run()` dan dihentikan (menyapu sisa antrean) di `Shutdown()`.

**Cara mengaktifkan (di VPS, `~/wuzz-chat/backend/.env`):**
1. Di Telegram, chat ke **@BotFather** → `/newbot` → simpan token.
2. Kirim satu pesan ke bot Anda (atau masukkan bot ke grup moderator dan kirim satu pesan di grup).
3. Buka `https://api.telegram.org/bot<TOKEN>/getUpdates` di browser, cari `"chat":{"id":...}` (angka; grup biasanya negatif). Hapus riwayat URL browser setelahnya karena memuat token.
4. Tambahkan ke `.env` VPS: `MODERATION_NOTIFY=telegram`, `TELEGRAM_BOT_TOKEN=...`, `TELEGRAM_CHAT_ID=...`, `MODERATION_ADMIN_URL=https://chat.wuzzhub.id/admin`, lalu `docker compose up -d`.
5. Masuk di `/admin`, tekan **Tes notifikasi**; pesan tes harus muncul di Telegram.
Bila variabel kurang lengkap, saluran dilewati dengan peringatan di log (server tetap jalan). Token bocor/curiga: cabut lewat @BotFather (`/revoke`) dan ganti.

**Batasan:** laporan di instans lain tidak berbagi kuota "5 per 10 menit" (hanya satu VPS sekarang). Tautan di pesan menuju `/admin` yang butuh login moderator (akun berpassword). Saluran email belum ada (butuh penyedia SMTP). Pembaruan `/privacy` (Telegram sebagai pemroses metadata laporan) dan retensi `evidence` 90 hari masih terbuka (P3).

## 12. Peran staf diverifikasi ke database (2026-10-06)

**Masalah yang diperbaiki:** peran (`system_role`) hanya dibaca dari klaim JWT, sehingga moderator yang perannya dicabut di database masih punya akses sampai tokennya habis (maks 30 hari).

**Perbaikan (`auth/role_resolver.go`, `authz/role_policy.go`, hook di `auth.RequireJWT`):**
- Token berperan `user`/kosong: dipakai apa adanya, **tanpa query** (tidak ada beban untuk pengguna biasa; peran juga tidak bisa naik tanpa login ulang).
- Token yang mengklaim peran istimewa (`wuzz_admin`, `wuzz_moderator`, atau klaim asing): **nilai database yang berlaku**, di-cache 15 detik per akun. Pencabutan/penurunan peran berlaku dalam sekitar 15 detik tanpa mencabut token. Akun yang tidak ada (terhapus) menjadi `user`.
- Galat database: peran diturunkan ke `user` (gagal tertutup untuk hak istimewa); kegagalan tidak di-cache sehingga pulih otomatis.
- Karena hook ada di `RequireJWT`, semua pembaca peran ikut terlindungi: alat moderasi, `/api/reports`, dan hak staf/admin di Linimasa (hapus postingan orang lain, fitur admin saat membuat postingan). Refresh token juga membawa peran efektif.
- Resolver dipasang di `app.New` (dan di-reset ke nil bila alat moderasi tidak aktif, agar tidak ada sisa antar-instans/tes).

**Dites** (SQLite dan PostgreSQL 16, seluruh suite lulus, 4 mutasi tertangkap): kebijakan peran (tanpa query untuk user, DB menang, TTL/Invalidate, gagal tertutup + pulih, nil aman), end-to-end lewat `RequireJWT` (token lama ditolak 403 setelah dicabut di DB, diterima lagi setelah diangkat, klaim tanpa dukungan DB ditolak, token user tidak naik sendiri), dan wiring aplikasi dengan akun sungguhan.

**Mengelola moderator (hanya SQL; UI "Kelola moderator" belum ada):**
- Tambah: orang itu daftar akun biasa (berpassword; setelah 30 Okt 2026 juga sudah menautkan Google), lalu `UPDATE users SET system_role='wuzz_moderator' WHERE username='...';`. Peran di token terbit saat login, jadi mereka **harus login ulang** di `/admin` setelah diangkat (token lama berperan `user` tidak naik sendiri).
- Cabut: `UPDATE users SET system_role='user' WHERE username='...';` Berlaku dalam sekitar 15 detik (maks 30 detik pada multi-instans), tanpa mencabut token.
- Cek: `SELECT username, system_role FROM users WHERE system_role <> 'user';`
- `wuzz_admin` dan `wuzz_moderator` setara di alat moderasi; `wuzz_admin` tambahan punya fitur admin di Linimasa.

**Belum:** halaman "Kelola moderator" di `/admin` (khusus `wuzz_admin`, angkat/cabut lewat username dengan audit dan `Invalidate`). Layak dikerjakan sebelum moderator bertambah banyak.

## 13. Halaman Kelola Moderator (2026-10-06)

**Selesai di `dev` (belum di-commit/dideploy).** `/admin/staff` (menu "Moderator" hanya tampil untuk admin): daftar admin dan moderator, cari akun lewat username (tak peka huruf besar/kecil) dengan kartu konfirmasi, angkat jadi moderator, cabut moderator, catatan opsional yang masuk audit, peringatan bila akun hanya punya login Google (belum bisa masuk ke `/admin` web).

**Aturan keamanan (diuji):**
- Hanya **`wuzz_admin`** (peran efektif, diverifikasi ke database) yang boleh; moderator biasa 403.
- UI hanya **mengangkat `wuzz_moderator`** dan **mencabut `wuzz_moderator`**. Peran `wuzz_admin` tidak bisa diberikan/dicabut lewat alat ini (hanya SQL): tidak ada eskalasi hak lewat antarmuka dan admin tidak bisa saling mencabut.
- Tidak boleh mengubah peran akun sendiri; akun yang sudah staf tidak diangkat ulang (409); akun yang ditangguhkan tidak bisa diangkat (409); akun tenant lain 404.
- Perubahan dan audit (`grant_moderator` / `revoke_moderator`, memuat siapa, siapa target, catatan, waktu) dalam satu transaksi; UPDATE bersyarat peran saat ini melindungi dari perubahan bersamaan.
- Cache peran dibuang saat peran diubah, sehingga **pencabutan berlaku seketika** pada token yang sama (terbukti di browser: sesi moderator lama langsung ditolak). Yang baru diangkat **harus login ulang** di `/admin` (token lama berperan `user` tidak naik sendiri).

**Endpoint:** `GET /api/admin/staff`, `GET /api/admin/staff/lookup?username=`, `POST /api/admin/staff/{id}/grant`, `POST /api/admin/staff/{id}/revoke`. Kode: `store/moderation_staff_store.go`, `api/moderation_staff_handler.go`, `frontend/app/admin/staff/page.tsx`.

**Dites:** SQLite dan PostgreSQL 16, seluruh suite; 6 mutasi keamanan tertangkap (termasuk pengaman ganda pada pencabutan admin, yang sengaja berlapis); browser nyata dua sesi (admin mengangkat, moderator baru login, admin mencabut, akses lama hilang), tata letak 390px. Satu cacat tampilan ditemukan dan diperbaiki saat uji (`.btn-primary` berlebar 100% menghimpit nama di baris flex) dan dijaga tes.

**Belum:** mengangkat `wuzz_admin` lewat UI (sengaja), riwayat staf di halaman (audit ada di tabel `moderation_actions`).

## 14. Status P3 (2026-10-06): retensi bukti, privasi, siaran realtime

**Selesai di `dev` (belum di-commit/dideploy):**
- **Retensi bukti**: `REPORT_EVIDENCE_RETENTION_DAYS` (bawaan 90; 0 = mati). Teks `evidence` dan `details` laporan dihapus otomatis N hari setelah laporan **ditutup**; metadata laporan (jenis, alasan, status, waktu) dan jejak audit tetap. Kolom baru di `content_reports` (migrasi otomatis, idempoten): `closed_at` (terisi saat ditutup, kosong saat dibuka kembali; laporan lama tanpa `closed_at` memakai `created_at`), `evidence_hold`, `evidence_purged_at`. Worker `worker.EvidenceRetentionWorker` berjalan saat start lalu tiap 6 jam.
- **Tahan bukti**: aksi `hold_evidence` / `release_evidence` (catatan wajib, tercatat audit, tidak mengubah status) untuk bukti yang mungkin diteruskan ke pihak berwenang; bukti yang ditahan tidak pernah dihapus otomatis. Menahan bukti yang sudah dihapus dijawab 409.
- **Halaman detail** menampilkan jadwal hapus otomatis, lencana "Bukti ditahan", banner "dihapus otomatis pada ...", dan tombol Tahan/Lepas.
- **Pesan grup yang dihapus moderator** kini dikosongkan seperti penarikan oleh pengirim (isi diganti "🚫 Pesan ini telah dihapus", media dan reaksi dibuang, pin dilepas) dan **disiarkan realtime** (`message_deleted`) ke anggota ruang yang sedang terbuka. Sebelumnya hanya ditandai terhapus tanpa siaran.
- **`/privacy` diperbarui** (tanggal berlaku 6 Oktober 2026 untuk semua halaman legal, karena memakai satu konstanta): Masuk dengan Google (ID akun dan email Google disimpan sebagai label, tanpa nama/foto), catatan moderasi dan penangguhan, retensi bukti 90 hari, Google sebagai pihak yang memverifikasi login, Telegram (hanya metadata laporan).
- **Koreksi Data Safety** (`docs/PLAY_STORE_LISTING.md`): tertulis "email tidak dikumpulkan", padahal login Google menyimpan email Google (`user_credentials.label`). Ditambahkan baris **Alamat email** dan catatan retensi/Telegram. **Wajib sesuai di Play Console sebelum rilis.**

**Dites** (SQLite dan PostgreSQL 16, seluruh suite lulus, 5 mutasi tertangkap): matriks pembersihan (terbuka, baru ditutup, ditahan, lama, legacy tanpa `closed_at`, tanpa teks, idempoten), `closed_at` mengikuti status (termasuk PATCH lama), tahan/lepas, jadwal di detail, tombol hapus pesan (isi kosong, media, pin, siaran sekali, tanpa siaran bila tak ada yang dihapus), worker (cutoff, mati, berulang, berhenti, galat tidak menghentikan), konfigurasi, wiring app, browser nyata (jadwal, tahan, lepas, pembersihan oleh worker saat start, banner).

**Belum:** layar akun ditangguhkan di aplikasi mobile (butuh build APK baru), pencarian laporan per pengguna, UI banding, saluran email. Catatan: `moderation_actions.note` (tulisan moderator) tidak dihapus otomatis; jangan menulis data pribadi di catatan.

**Uji siaran realtime dengan klien WebSocket sungguhan (6 Okt 2026):** backend asli (SQLite terisolasi), tiga klien WS nyata (penulis, anggota lain, moderator yang bukan anggota ruang). Moderator menghapus pesan grup lewat `POST /api/admin/reports/{id}/action`: penulis dan anggota menerima frame `message_deleted` (`id`, `room`, `is_deleted:true`, isi "🚫 Pesan ini telah dihapus") dalam 8 ms; non-anggota tidak menerima apa pun; frame tidak memuat isi asli; klien yang masuk belakangan melihat riwayat dengan tombstone dan pesan lain utuh. Dengan siaran dimatikan di wiring, tes yang sama gagal (frame tidak pernah tiba). Format frame sudah cocok dengan pembaca di mobile (`MessageContext.handleWsMessageDeleted`: `room`, `id`, `content`, `is_deleted`); belum diuji pada aplikasi di HP.
