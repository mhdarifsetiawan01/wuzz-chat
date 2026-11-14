# ⚙️ Backend Progress Log — Wuzz Chat

### Pembelian Star lewat Google Play, Wuzz Chat V2 Tahap 2b (14 Nov 2026, di `dev`, belum dideploy, sakelar mati)

- **Tujuan:** menjual Star lewat Play Billing (desain disetujui pengguna 14 Nov 2026: `docs/plans/backlog/STARS_PLAY_BILLING.md`; aturan: `docs/domains/STARS_WALLET.md` aturan 14-15). Dikerjakan paralel dengan Tahap 0; rilis menunggu gerbang `STARS_STAGE0.md`.
- **Perubahan:** paket baru `internal/playbilling` (token service account jwt-bearer dengan cache; klien Play Developer API: `productsv2` get, `products.consume`, `voidedpurchases.list`; layanan verifikasi + kredit + sapuan); tabel `play_purchases` (PK hash token) dan `star_debts`; `store/stars_play.go` (kredit idempoten per token, tolak token akun lain, pelunasan utang `debt_repay`, pembalikan `reversal` sampai saldo 0 + utang, cursor voided di `star_settings`); `PurchaseAccess` menolak 402 `stars_debt` saat berutang; dompet memuat `debt`; endpoint `GET /api/me/stars/packages`, `POST /api/me/stars/purchases` (30/jam per pengguna), admin `play_purchases` dan `/debtors`; `worker/play_billing_worker.go` (per jam); sakelar `STARS_PLAY_BILLING`, `PLAY_PACKAGE_NAME`, `PLAY_SERVICE_ACCOUNT_FILE`.
- **Celah yang ditemukan tes dan ditutup:** token yang sudah dikreditkan bila dikirim ulang dengan `product_id` lain dijawab "credited" (tanpa Star tambahan); kini 400 `product_mismatch`.
- **Tes:** `store/stars_play_test.go` (pemetaan produk; kredit idempoten dan kepemilikan; void dengan saldo cukup, dengan utang, blokir belanja, pelunasan penuh dan sebagian; cursor; 8 kredit bersamaan token sama = tepat 1), `playbilling/client_test.go` (pertukaran dan cache token, parsing `productsv2`, 404/500, consume, voided + halaman), `playbilling/service_test.go` (alur kredit, pending lalu purchased, akun/produk tidak cocok, dibatalkan, konsumsi gagal lalu disapu, voided sekali, cursor), `api/stars_play_handler_test.go` (404 saat mati, kode status, token tidak bocor ke admin).
- **Bukti:** *tes saja*. `go test ./...` lolos (SQLite); `./internal/store ./internal/api ./internal/playbilling` lolos di Postgres 16 sementara.
- **Belum:** deploy (aman: sakelar mati, migrasi hanya menambah tabel), web admin, mobile, persiapan Play Console/Google Cloud, uji nyata dengan penguji lisensi (termasuk nama parameter halaman voided).

### Star & grup privat berbayar, Wuzz Chat V2 Tahap 2a (14 Nov 2026, di `dev`, belum dideploy, sakelar mati)

- **Tujuan:** pondasi Star tanpa Play Billing (keputusan pengguna 14 Nov 2026; Tahap 0 belum, angka sementara). Desain: `docs/plans/backlog/STARS_PAID_GROUPS.md`; aturan: `docs/domains/STARS_WALLET.md`.
- **Perubahan:** tabel `star_settings`, `star_wallets` (`CHECK balance >= 0`), `star_ledger` (append-only, `idempotency_key` unik), `creator_earnings` (uang + snapshot tarif), `paid_group_creators`, `paid_groups`, `paid_group_access` (`store/sql.go`); `store.StarStore` (`store/stars.go`): pengaturan, dompet, kredit uji, refund, mitra kreator, grup berbayar, bayar akses; integrasi tautan undangan mode `paid` (`InviteLinkStore.SetStarStore`; pratinjau harga + saldo; `join` approval 402); `GroupService.SetPaidGroupChecker` (grup berbayar tidak bisa publik); `api/stars_handler.go` + rute di `group_handler.go`, `group_invite_handler.go`, `app/router.go`; sakelar `STARS_ENABLED`, `PAID_GROUPS_ENABLED`, `STARS_TEST_GRANTS` (`config.go`, `.env.example`); penghapus akun menghapus `paid_groups` grup yang dihapus dan **mempertahankan** catatan keuangan (K1).
- **Celah yang ditemukan dan ditutup sebelum commit:** dua pembayaran bersamaan ke grup yang sama dengan kunci idempoten berbeda bisa memotong saldo dua kali. Kini keanggotaan disisipkan lebih dulu sebagai kunci; terbukti di Postgres (8 permintaan bersamaan = sekali potong, diulang 10x).
- **Tes:** `store/stars_test.go` (pengaturan + rumus bagian kreator 100 Star = Rp6.800 dari Rp10.000; kredit uji idempoten; aturan K2/K3, mitra dicabut, reset tautan; bayar: saldo kurang, harga berubah, tanpa kunci, idempoten, sudah anggota, masa tahan pending → tersedia, refund sekali, keanggotaan tetap, dikeluarkan = bayar lagi; pembayaran bersamaan + invarian `balance = SUM(ledger)`), `api/stars_handler_test.go` (sakelar mati = 404, admin saja, alur HTTP lengkap, kredit uji ikut sakelar, PATCH publik 409).
- **Bukti:** *tes saja*. `go vet ./...` dan `go test ./...` lolos di SQLite dan Postgres 16 sementara. Di SQLite sebagian transaksi bersamaan ditolak `SQLITE_BUSY` (keterbatasan lama: `busy_timeout` hanya terpasang di satu koneksi pool); tes menerima itu di SQLite dan menuntut hasil tepat di Postgres.
- **Belum:** deploy (aman: semua sakelar mati, migrasi hanya menambah tabel), `/admin` web, mobile, Play Billing (2b), uji di produksi. **Jangan menyalakan sakelar untuk pengguna** sebelum Tahap 0 dan deklarasi Play.

### Teks notifikasi push sistem lewat FCM (14 Nov 2026, di `dev`, belum dideploy)

- **Masalah (terbukti di HP saat uji undangan):** notifikasi permohonan bergabung (grup dan forum) dan status permohonan tampil "Pesan baru diterima", karena FCM data-only tidak membawa teks.
- **Perubahan:** `push.buildFCMData` (dipisah dari `FCMv1PushProvider.Send`) menambah `notif_text` = Body hanya untuk push tanpa kunci `encrypted_content`; push pesan chat tidak terpengaruh. Pasangan mobile: `notificationBackgroundTask.ts` membaca `notif_text`.
- **Tes:** `push/fcm_test.go` `TestBuildFCMData_NotifTextOnlyForSystemPush` (sistem dapat teks; chat, juga media dengan `encrypted_content` kosong, tidak; tidak ada kunci `title`/`body`). *tes saja*.
- **Perlu deploy backend** (tugas pengguna) dan build APK. Aman untuk APK lama (kunci baru diabaikan; tetap "Pesan baru diterima").

### Tautan undangan grup privat, Wuzz Chat V2 Tahap 1 (14 Nov 2026, di `main`, DIDEPLOY 14 Nov 2026)

- **Tujuan:** non-anggota bisa masuk grup utama privat lewat tautan undangan yang bisa dicabut, dengan persetujuan admin. Desain dan keputusan D1-D5 (disetujui pengguna 14 Nov 2026): `docs/plans/backlog/PRIVATE_GROUP_INVITES.md`. Aturan: `docs/domains/GROUP_FORUM.md` aturan 9. Tanpa uang (Star/Play Billing = Tahap 2, belum).
- **Perubahan:** tabel `group_invite_links` (indeks unik token dan satu-aktif-per-grup parsial) dan kolom `conversation_join_requests.invite_link_id` (auto-migrasi Postgres dan SQLite, `store/sql.go`); `store.InviteLinkStore`; `group.InviteService` (notifikasi WS/push ke admin dan pemohon); `GroupService.SetInviteRevoker` (grup dijadikan publik mencabut tautan); `api/group_invite_handler.go` (`/api/groups/{grp_id}/invite-link`, `/api/invites/{token}[/join|/request]`, `join-requests` dan `action` untuk `grp_`); laju per pengguna di `app/router.go` (ajukan 10/jam, baca 60/jam); perakitan di `app/wire.go`. Penghapus akun ikut menghapus tautan grup yang dihapus (`account_eraser.go`).
- **Perbaikan K3:** `POST /api/links` untuk grup utama privat kini hanya creator/admin (403 `admin_only`); sebelumnya aturan ini hanya di UI.
- **Bug lama ditemukan dan diperbaiki:** pola validasi kode pendek (`IsShortCode`, juga `mobile/src/api/links.ts` dan `frontend/app/OpenInAppLanding.tsx`) menolak huruf `i` padahal alfabet pembuat kode memuatnya, jadi ±13% kode pendek tidak pernah bisa dibuka (backend 404). Ini akar `TestShortLinkHandler_CreateAndResolve` yang flaky (kini lolos 40/40). Tes regresi: `store/short_code_alphabet_test.go`.
- **Tes lama diperbaiki:** `store/forum_extend_test.go` memakai placeholder `?` mentah sehingga 4 tes gagal di Postgres (bukan bug produksi); kini lewat `rebindPG`.
- **Berkas tes:** `store/invite_links_test.go` (admin saja, satu aktif + konkurensi, reset, grup publik, alur ajukan/setujui/tolak, jeda 24 jam, batal, batas 500, beda tenant, dikeluarkan lalu mengajukan lagi), `api/group_invite_handler_test.go` (HTTP end-to-end + notifikasi + K3), `store/short_code_alphabet_test.go`.
- **Bukti:** *tes saja*. `go vet ./...` dan `go test ./...` lolos penuh di SQLite dan di Postgres 16 sementara (`PG_TEST_ADMIN_DSN`). `npx tsc --noEmit` (mobile) dan `npm run build` (frontend) lolos untuk perubahan regex. **Dideploy** pengguna 14 Nov 2026; terlihat dari luar: `GET /api/invites/{token}` dan `/api/groups/{id}/invite-link` tanpa token menjawab 401 (rute terpasang). **Belum:** alur nyata di produksi (buat tautan, ajukan, setujui), log startup migrasi belum dilihat AI.
- Deploy backend (dilakukan pengguna 14 Nov 2026; migrasi otomatis, tanpa env baru). Aman sebelum APK baru: endpoint baru tidak dipakai APK lama; satu-satunya perubahan perilaku untuk APK lama adalah anggota biasa grup privat tidak lagi mendapat kode pendek (APK jatuh ke tautan panjang, yang memang tidak membuka akses). Deploy frontend menghidupkan kode pendek ber-`i` di landing web.

### Pelepasan media pesan dihapus & avatar grup diganti; hasil laporan bucket (5 Nov 2026)

- **Hasil `cmd/orphanreport` di produksi (dijalankan pengguna, *terbukti*):** 20 objek di bucket, 13 dipakai (1,5 MiB), 1 diantre hapus, 1 terlalu baru, 5 kandidat yatim (2,3 MiB; 16-25 Okt 2026, semua sebelum langkah 1-2). Tanda tangan `ListObjectsV2` diterima R2 asli dan kredensial server punya izin list. Keputusan: sapu bucket otomatis tidak dibangun.
- **Temuan dari kode:** `DeleteMessage(deleteForEveryone)` (`store/sql.go`) dan jalur moderasi mengosongkan `media_url` tanpa menghapus berkas, sehingga berkasnya yatim (dugaan sumber sebagian dari 5 kandidat, belum dibuktikan).
- **Perubahan:** `messaging.MessageService.SetMediaReleaser` (melepas URL lama pada hapus-untuk-semua-orang; hapus-untuk-saya tidak), `group.GroupService.SetMediaReleaser` (melepas avatar lama pada `UpdateGroupInfo`), dirakit di `app/wire.go`. Memakai `store.MediaReleaser` yang sama (hanya URL milik R2 dan tidak dirujuk tempat lain).
- **Berkas tes:** `messaging/service_test.go` (`..._ReleasesMedia`), `group/service_test.go` (`..._ReleasesReplacedAvatar`).
- **Bukti:** *tes saja*. `go test ./...` lolos kecuali `TestShortLinkHandler_CreateAndResolve` yang flaky sejak sebelumnya. **Dideploy** (dikonfirmasi pengguna 14 Nov 2026). **Belum:** dicoba di produksi (hapus pesan untuk semua orang, ganti avatar grup; lihat `docs/plans/backlog/README.md` bagian 2b).
- **Belum dicakup:** pesan dan postingan yang dihapus moderator (bukti laporan).
- Sudah dideploy pengguna. Tanpa env baru.


### Alat laporan berkas yatim bucket R2 (5 Nov 2026, A3 langkah 3 tahap laporan)

- **Tujuan:** mengukur apakah sapu bucket layak dan apakah pemeriksaan rujukan lengkap, tanpa menghapus apa pun.
- **Perubahan:** `storage.R2Storage.ListObjects` + `KeyFromURL` (`storage/r2_list.go`), `presignParams.Query` (`storage/sigv4.go`), paket `internal/orphanreport` (`LoadReferences`, `Analyze`, `Report.Write`), perintah `cmd/orphanreport` (flag `-csv`, `-min-age-hours`, `-prefix`, `-max-objects`, `-sample`, `-db-driver`, `-db`). Tidak membaca `.env`, tidak ada kode hapus, DB dibuka READ ONLY (Postgres), CSV berizin 0600.
- **Berkas tes:** `storage/r2_list_test.go`, `orphanreport/report_test.go`.
- **Bukti:** *tes saja* + uji ujung-ke-ujung binari dengan server R2 palsu lokal dan SQLite sementara (kategori, CSV, izin berkas). **Terbukti kemudian (5 Nov 2026):** dijalankan pengguna terhadap bucket dan DB produksi, tanda tangan `ListObjectsV2` diterima R2 asli (hasil di entri berikutnya di atas).
- **Tanpa deploy:** alat dijalankan manual, tidak mengubah server.


### Penyapu unggahan yatim lewat tiket (5 Nov 2026, A3 langkah 2)

- **Masalah:** unggahan langsung ke R2 yang tak pernah dipakai (post dibatalkan, aplikasi ditutup) tidak terlihat server, jadi tidak ada yang membersihkannya.
- **Perubahan:** tabel `upload_tickets` (`store/sql.go`); `store.UploadTicketStore.Record` dipanggil `MediaHandler.CreateSignedUploadURL` (`SetUploadTicketRecorder`); `store.UploadOrphanSweeper` (mode `off|dry|true`, umur minimum ≥ 24 jam) dipasang ke `PurgeWorker.SetSweeper` dan dijalankan di `runCycle`; env `UPLOAD_ORPHAN_SWEEP`, `UPLOAD_ORPHAN_MIN_AGE_HOURS` (`config.go`, `.env.example`). Perakitan di `app/wire.go` hanya bila storage punya `OwnsURL` (R2).
- **Berkas:** `store/upload_tickets.go`, `store/sql.go`, `api/media_handler.go`, `storage/purge_worker.go`, `shared/config/config.go`, `app/wire.go`; tes: `store/upload_tickets_test.go`, `api/media_ticket_record_test.go`.
- **Bukti:** *tes saja*. Tes penyapu (true/dry/off/nilai tak dikenal, umur minimum, tiket terpakai/asing/baru) dan pencatatan tiket lolos di SQLite dan Postgres 16 sementara; `go test ./...` lolos. **Dideploy** (5 Nov 2026). **Belum:** penyapuan nyata di bucket produksi, log `[UploadSweep]`.
- **Temuan terpisah (akar ditemukan 14 Nov 2026: pola kode menolak huruf `i`; lihat entri 14 Nov):** `TestShortLinkHandler_CreateAndResolve` (`api/short_link_handler_test.go`) flaky sejak sebelum perubahan ini (gagal 5 dari 20 kali pada kode asli: pratinjau grup publik `nil`); lolos pada suite penuh. Belum diselidiki.
- Sudah dideploy pengguna. Sakelar baru mati secara bawaan; urutan pengaktifan di `docs/OPERATIONS.md`.


### Pelepasan media saat hapus postingan Feed / ganti foto profil (5 Nov 2026, A3 sebagian)

- **Masalah:** `FeedService.DeletePost` hanya menghapus baris DB; berkas lampiran tetap di R2 selamanya. Mengganti `avatar_url` juga membiarkan berkas lama. Hanya hapus akun yang membersihkan (lewat `media_purge_queue`).
- **Perubahan:** `store.MediaReleaser` (`store/media_release.go`) mengantrekan URL ke `media_purge_queue` bila (a) dimiliki storage (`R2Storage.OwnsURL`) dan (b) tidak dirujuk `messages.media_url`/`users.avatar_url`/`conversations.avatar_url`/`feed_posts.media_urls`. Dipasang di `FeedService.DeletePost` (`SetMediaReleaser`) dan `AuthHandler.UpdateProfile` (`SetMediaReleaser`), dirakit di `app/wire.go` hanya bila driver storage punya `OwnsURL` (R2). Best-effort, galat hanya dicatat.
- **Berkas:** `store/media_release.go`, `feed/service.go`, `api/auth_handler.go`, `storage/r2_storage.go`, `app/wire.go`; tes: `store/media_release_test.go`, `feed/service_test.go`, `api/auth_profile_avatar_release_test.go`, `storage/r2_storage_test.go`.
- **Bukti:** *tes saja*. `go test ./...` lolos; tes releaser juga lolos di Postgres 16 sementara (`PG_TEST_ADMIN_DSN`). **Dideploy** (5 Nov 2026). **Terbukti:** log `[MediaRelease] Berkas diantrekan` saat postingan Feed dihapus (5 Nov 2026). **Belum:** penghapusan nyata di bucket R2 produksi (status terbaru: `docs/plans/backlog/README.md` bagian 2b).
- **Belum dicakup:** avatar grup, postingan yang dihapus moderator, unggahan tak terpakai, yatim lama (lihat `FEED_UPLOAD_HARDENING.md` A3).
- Sudah dideploy pengguna. Tanpa env baru.


### Ringkasan 19-28 Oktober 2026 (disusun 28 Okt saat merapikan dokumen)

- **Monetisasi forum:** batas Free/Pro, kuota ringkasan AI, `/admin/plans`, grandfather Pro, Perpanjang forum (`POST /api/groups/{id}/subgroups/{subId}/extend`, kolom `conversations.extended_days`). Sakelar `FORUM_LIMITS_ENABLED` dan `MEMORY_QUOTA_ENABLED` menyala di produksi.
- **Wuzz Grid:** paket `internal/game` (solver, generator, streak), tabel `game_*`, `GAME_ENABLED`, `GAME_REMINDER_TIME`, moderasi papan publik (`/api/admin/users/{id}/game-board`), hapus akun menghapus data game. API: `docs/BACKEND_API.md` bagian 3.13.
- Semua tercantum sudah dideploy pengguna ke produksi. Sakelar dan tenggat: `docs/OPERATIONS.md`.


### Tautan pendek grup/forum (28 Oktober 2026)

- Kolom `conversations.short_code VARCHAR(16)` + indeks unik `uq_conv_short_code` (migrasi otomatis Postgres dan SQLite). Kode dibuat malas di `store.ShortLinkStore.GetOrCreate` (UPDATE bersyarat anti-balapan, ulang bila tabrakan); tidak ada backfill grup lama. Endpoint: `POST /api/links` (JWT, anggota) dan `GET /api/links/{code}` (publik, 60/menit per IP). Detail: `docs/BACKEND_API.md` #35b, `docs/domains/GROUP_FORUM.md` aturan 8, kedua `openapi.yaml`.
- Mobile: `linksApi`, Bagikan Grup memakai tautan pendek (gagal → tautan panjang), `handleDeepLink` menerjemahkan kode. Web: `OpenInAppLanding` menerjemahkan kode di server.
- Bukti: **tes saja** — `TestShortLinkHandler_CreateAndResolve` (idempoten, non-anggota 403, 404, bentuk salah), `go test ./...` lulus, `npm run build` frontend lulus, `npx tsc --noEmit` mobile bersih. **Belum teruji** di produksi/HP: Bagikan Grup → buka tautan pendek di HP lain (terpasang dan belum), landing web saat web dijeda, App Links `/g/<kode>` (intent filter sudah mencakup prefix `/g`, belum dibuktikan).
- Sakelar `SHORT_LINKS_ENABLED` (28 Okt 2026, default mati): **terbukti di HP** bahwa APK lama membuka obrolan kosong "Obrolan" untuk link pendek, sedangkan APK baru benar. `POST /api/links` kini 503 `short_links_disabled` saat sakelar mati (mobile jatuh ke tautan panjang), Resolve tetap aktif. Bukti sakelar: **tes saja** (`TestShortLinkHandler_CreateDisabledStillResolves`, `go test` lulus); belum dicoba di produksi. Perlu deploy backend; **untuk memakai tautan pendek sakelar harus dinyalakan** (`SHORT_LINKS_ENABLED=true` di env VPS + restart) setelah build mobile baru beredar.
- Pratinjau landing (28 Okt 2026): `GET /api/links/{code}` menyertakan `preview` {title, avatar_url} hanya untuk grup utama publik; landing web (`OpenInAppLanding`) menampilkan nama dan avatar grup. Bukti: **tes saja** (`TestShortLinkHandler_CreateAndResolve` memeriksa grup privat tidak bocor dan grup publik berpratinjau; `npm run build` lulus); tampilan landing **belum dilihat** di browser. Catatan privasi: nama/avatar grup publik kini dapat dilihat tanpa login oleh pemegang kode (sebelumnya butuh login lewat pencarian). Perlu deploy backend + frontend.
- Audit keamanan/performa khusus fitur ini (28 Okt 2026, tinjauan kode): ruang kode 54^8 ≈ 7×10^13 + 60 permintaan/menit per IP membuat tebakan tidak praktis; Resolve hanya mengembalikan ID dan semua endpoint grup tetap menegakkan tenant, keanggotaan, dan 403 grup privat; kode hanya bisa dibuat anggota; input divalidasi regex sebelum query dan sebelum fetch server web (tanpa SSRF/SQL injection). Performa: Resolve memakai indeks unik `uq_conv_short_code` (satu baris), pembuatan kode sekali per grup, migrasi ADD COLUMN nullable tanpa default tidak mengunci tabel. **Bug ditemukan dan diperbaiki**: fetch server Next.js ke `/api/links/{code}` tidak membawa IP pengunjung sehingga semua pengunjung landing berbagi satu jatah 60/menit; kini `X-Forwarded-For` diteruskan. Catatan: `GetClientIP` memercayai header IP (perilaku proyek yang sudah ada), jadi rate limit bisa dilewati dengan memalsukan header; tidak berdampak praktis di sini karena ruang kode sangat besar. Belum diuji di Postgres nyata (tes memakai SQLite).
- Perlu: deploy backend (`ssh deploy@<VPS_IP> ./deploy-chat.sh`, migrasi kolom otomatis), deploy frontend, dan build APK baru (tanpa itu, APK lama tidak mengenali kode pendek dan masih membagikan tautan panjang). Dikerjakan pengguna.


### Forum Completion Loop — daftar forum berakhir (18 Oktober 2026)

- Endpoint subgroups kini mengembalikan forum aktif dan berakhir; status arsip tetap dikecualikan. Nama internal `GetActiveSubGroups` dipertahankan untuk kompatibilitas. Gerbang membership induk tetap berlaku; query mencocokkan tenant forum, induk, dan viewer. Membuka riwayat tetap memerlukan otorisasi forum yang sudah ada.
- Regresi lifecycle store memastikan forum expired tetap terdaftar dengan sisa waktu 0 dan metadata membership, anggota tetap berhak membaca, outsider ditolak, dan child lintas tenant tidak bocor. Tes WS baru memastikan join/history forum berakhir berhasil untuk anggota tetapi kirim baru ditolak dan tidak tersimpan; outsider tidak menerima history. Tes forward terkunci yang sudah ada tetap dipertahankan.
- `go test -v ./...` lulus (tes live provider dengan kredensial tidak tersedia tetap SKIP sesuai suite). Tidak mengubah gate whitelist, worker, push dedup, atau aturan edit/hapus/reaksi.
- Status setelah uji APK 1.39.1 build 70: daftar dari backend yang dipakai APK sudah menampilkan forum berakhir dan Buka Riwayat berhasil. Hash deployment VPS tidak diperiksa langsung. Deploy selanjutnya sepenuhnya dilakukan pengguna; AI hanya menginformasikan bila diperlukan.


### Pencabutan perangkat untuk menu Perangkat Tertaut (18 Oktober 2026)

- `RemoveDevice` memvalidasi kepemilikan sebelum mencabut seluruh sesi perangkat target; sesi wajib berhasil dicabut sebelum perangkat dinonaktifkan. Error pencabutan kini menghasilkan HTTP 500 (503 bila session store tidak tersedia), bukan sukses palsu. Jalur kick WebSocket tetap dipakai.
- Tes integrasi memastikan dua token target tidak dapat mengakses endpoint terproteksi, token pemanggil tetap valid, dan kegagalan revoke mempertahankan target dalam daftar tanpa kick. Seluruh tes backend lulus. Operasi revoke/deactivate belum atomik; penonaktifan gagal setelah revoke dapat diulang.
- Belum deploy. Perlu `ssh deploy@<VPS_IP> ./deploy-chat.sh` setelah izin pengguna; uji dua perangkat nyata masih terbuka.
- `go test -race ./...` lulus pada pengulangan; percobaan pertama mengalami timeout konteks 5 detik di `TestTenantServiceFlow` saat paket berjalan bersamaan, tanpa laporan data race. Tidak ada perubahan kode tenant.

Dokumen ini mencatat seluruh riwayat pengerjaan, status kapabilitas, dan rencana pengembangan pada layer **Backend (Golang)**.

---

## 📊 Status Ringkasan
- **Arsitektur**: Modular Monolith Domain-Driven Design (Fase 1 s/d 6 SELESAI ✅)
- **Post-Audit Hardening**: Milestones 1–3 SELESAI ✅
- **Real-Time Engine**: WebSocket Hub $O(M)$ membership cache + Redis Pub/Sub multi-node sync SELESAI ✅
- **Push Notification Engine**: Pluggable Provider (FCM v1 Silent Data-Only + VAPID Web Push) SELESAI ✅
- **Multi-Device Routing**: Targeted room history socket delivery & trusted device public key protection SELESAI ✅
- **Status Deployment**: Live di VPS (`https://chat-api.wuzzhub.id`, nginx + `deploy-chat.sh`)

---

## 🏆 Riwayat Fitur & Milestone yang Telah Selesai

### 1. Transformasi Modular Monolith DDD (Track B Fase 1–6)
- [x] **Fase 1: Pemisahan GroupStore**: Mengekstrak `SQLGroupStore` mandiri dari `SQLUserStore` dan memutus ketergantungan domain group.
- [x] **Fase 2: Application Service Auth & Identitas**: Mengekstrak `AuthService` (`internal/authz/service.go`) untuk use case login, register, password change, dan batas kuota 2 perangkat.
- [x] **Fase 3: Application Service Messaging & Hub Decoupling**: Domain `internal/messaging/` dengan `MessageService` untuk operasi pesan dan decoupling WebSocket via interface otorisasi room.
- [x] **Fase 4: Group & Forum Service**: Domain `internal/group/` dengan `GroupService` & `ForumService`, migrasi `SubGroupTTLWorker` (auto-purge batch).
- [x] **Fase 5: Memory Engine Generalization**: Abstraksi `ContextSource` di domain `internal/memory/` dan decoupling dari skema obrolan konkret.
- [x] **Fase 6: Slim Main & Centralized Config**: Sentralisasi konfigurasi di `internal/shared/config/`, container orkestrasi `internal/app/wire.go`, modular router `internal/app/router.go`, dan perampingan `main.go` (55 baris).

### 2. Post-Audit Hardening (Milestones 1–3)
- [x] **Milestone 1: Zero-Risk Handler Cleanup**: Menghapus sisa fallback store lama di seluruh controller API (-599 baris), menjadikan handler 100% tipis (*thin transport*).
- [x] **Milestone 2: Realtime Ingestion Decoupling**: Memutus akses langsung WebSocket Hub ke SQL via interface `RealtimeMessageManager`.
- [x] **Milestone 3: Mobile Gateway Readiness**: Menangani header `X-Device-Platform` (`web`, `android`, `ios`), integrasi `PushProvider` dengan perutean otomatis token FCM v1 dan URL VAPID Web Push.

### 3. Skalabilitas & Stabilitas Multi-Device (Terbaru)
- [x] **Targeted WebSocket Room History Routing (`internal/ws/hub.go`, `client.go`)**:
  - Mengalirkan paket riwayat obrolan (`sendRoomHistory`) langsung ke soket perangkat yang meminta (`c.send`), bukan disebar acak ke seluruh soket user.
  - Memastikan skenario multi-device (Laptop Web & HP React Native aktif bersamaan) menerima riwayat lengkap di HP tanpa paket tersasar ke laptop.
- [x] **Proteksi Penimpaan Kunci Publik E2EE (`internal/store/user_store.go`)**:
  - Validasi kunci identik diperbolehkan (reconnect/trusted device).
  - Jika kunci berbeda dan ada perangkat aktif, server menolak dengan HTTP 409 (`ErrKeyConflict`) untuk melindungi dari pembajakan kunci sepihak.
- [x] **Multi-Node Cluster Session Kick via Redis**:
  - Event `session_kick` dan `device_kick` disinkronkan lintas node backend dengan perlindungan Anti-Echo loop node UUID.
- [x] **In-Memory Message Idempotency**:
  - Deduplikasi pesan (TTL 2 menit) berpresisi nanodetik (`UnixNano()`) untuk menangkal duplicate resend dari perangkat seluler.

### 4. Login dengan Google, fase 1 backend (6 Okt 2026, belum dideploy)
- [x] Verifier ID token Google, `SQLOAuthStore` atomik, link token, `AuthService` Google, endpoint `/api/auth/google*`, re-auth Google untuk hapus akun dan reset kunci. Nonaktif sampai `GOOGLE_OAUTH_CLIENT_IDS` diisi. Rencana dan sisa pekerjaan: `docs/plans/backlog/GOOGLE_LOGIN.md`.

### 5. Monetisasi forum, Fase 2: entitlement & batas forum aktif (20 Okt 2026, lokal, belum dideploy)
- [x] Paket `internal/entitlement` (Free: 1 forum aktif, 7 hari; Pro: 5 forum aktif, 7/30 hari), tabel `user_entitlements` + `entitlement_events` (DDL inline `store/sql.go`), `SQLEntitlementStore`.
- [x] Batas ditegakkan di dalam transaksi `SQLGroupStore.CreateSubGroupWithContext` (advisory lock per user di Postgres, mutex di SQLite). Forum aktif = `status active` dan belum lewat `expires_at`. Hanya tenant `default`; tenant B2B tidak dibatasi.
- [x] **Mati secara default**: aktif hanya dengan env `FORUM_LIMITS_ENABLED=true`. Tanpa env ini perilaku pembuatan forum tidak berubah.
- [x] `GET /api/me/entitlement`; admin `GET/POST /api/admin/entitlements` (khusus `wuzz_admin`, ada riwayat). Penolakan: HTTP 403 dengan `code` `forum_limit_reached` / `duration_not_in_plan`.
- [x] **Fase 3 kuota AI (20 Okt 2026, lokal)**: Free 2 / Pro 20 ringkasan per bulan kalender (UTC), dimiliki pembuat forum, dihitung dari `forum_memory_jobs` (job gagal permanen tidak dihitung). Dicek di `GatedMemoryStore.CreateJob` (satu titik untuk TTL worker dan akhiri manual) lewat `SQLEntitlementStore.CheckMemoryJobQuota`; whitelist `MEMORY_ENABLED_GROUPS` tetap lebih dulu. Mati secara default: `MEMORY_QUOTA_ENABLED=true`. Galat database pada cek kuota = job tetap dibuat (fail-open). Respons `.../expire` kini membawa `memory` (`queued`/`quota_exceeded`/`not_queued`) dan pesan jujur; `/api/me/entitlement` memuat blok `ai`.
- [x] **Aksi grandfather (20 Okt 2026, lokal)**: `POST /api/admin/entitlements/grandfather` (khusus `wuzz_admin`, tenant `default`). Memberi Pro sementara (default 60 hari, `source=grandfather`) kepada admin/pembuat grup induk dan pembuat forum yang belum punya baris entitlement apa pun (akun yang diberi manual atau sengaja dicabut dilewati). Aman: tanpa `confirm` hanya pratinjau; penerapan wajib `confirm:true` + `expected_eligible` = jumlah pratinjau (selain itu 409, tidak menulis). Idempotent; ada riwayat di `entitlement_events`. Tidak dijalankan otomatis oleh migrasi.
- [x] **Forum berakhir tanpa ringkasan karena kuota habis kini dijelaskan (21 Okt 2026, lokal)**: saat `GatedMemoryStore.CreateJob` menolak karena kuota, dicatat satu baris `forum_memory_jobs` berstatus `SKIPPED` (`last_error=quota_exceeded`, `is_terminal_fail=true` agar tidak dihitung sebagai pemakaian dan tidak pernah diantre). `GET /api/forums/mine` memberi `memory_state: "quota_exceeded"` hanya bila AI Memory aktif untuk grup (tanpa detail paket); klien lama mengabaikan nilai ini. Percobaan ulang tetap dilaporkan sebagai kuota, bukan galat UNIQUE.
- [x] **Perbaikan wiring jalur "akhiri forum manual" (21 Okt 2026, lokal; ditemukan saat uji lokal terhadap server sungguhan)**: `NewMemoryHandler` menerima `memoryStore` mentah dan `GroupHandler.SetMemoryHandler` menimpa store job milik `ForumService` dengan store mentah itu, sehingga `POST .../subgroups/{id}/expire` melewati gerbang `MEMORY_ENABLED_GROUPS`, sakelar `MEMORY_WORKER_ENABLED=false`, **dan** kuota AI (jalur TTL worker tidak terdampak). Akibat lama: job QUEUED yang tidak pernah diproses (worker menyaring grup non-whitelist, jadi tidak ada teks yang dikirim ke LLM) dan pesan "antrean memori dibuat" yang keliru. `app/wire.go` kini memberi MemoryHandler store ber-gerbang (`jobStore`, atau gerbang tertutup bila AI dimatikan). Tes regresi dengan wiring utuh: `internal/app/memory_quota_wiring_test.go`. Tes tingkat paket tidak menangkap ini karena merakit objeknya sendiri.
- [x] **Durasi forum disatukan (21 Okt 2026, lokal)**: `ForumService.validDurations` menerima `1h`…`3d` padahal `SQLGroupStore` hanya menerima 7 atau 30 hari (durasi pendek selalu 400, teks galat menjanjikan pilihan yang tidak ada). Kini satu fungsi `store.SubGroupDurationDays` dipakai service dan store; teks galat menyebut `7_days`/`30_days` saja. OpenAPI `CreateSubgroupRequest` (sebelumnya `name` + `ttl_minutes`, salah total) diganti sesuai handler (`title`, `description`, `duration`, `is_public`). Dokumen domain dan `.env.example` disinkronkan (dua sakelar paket).
- [x] **Suite backend kini lulus penuh di PostgreSQL (21 Okt 2026, lokal)**: tes lama `TestForumLifecycleJoinsIsolationAndReviewUpdates` gagal di Postgres sejak sebelum monetisasi karena helper `exec` memakai placeholder `?` mentah (Postgres butuh `$n`); kini lewat `rebindPG`. Dua helper kembar di paket tes (`rebindPG` dan `rebindForTest`) disatukan menjadi `rebindPG`. Hasil: `PG_TEST_ADMIN_DSN=... go test ./...` lulus di seluruh paket.
- [x] **Perpanjang masa aktif forum (24 Okt 2026, di `main`, backend dideploy user)**: `POST /api/groups/{id}/subgroups/{subId}/extend` body `{"days":1..3}`. Hanya pembuat forum (`conversations.created_by`) berpaket Pro; maksimal 30 hari total per forum (kolom baru `conversations.extended_days`, auto-migrasi Postgres dan SQLite); forum `expired` atau lewat `expires_at` ditolak dan tidak ada jalur aktifkan ulang (sengaja). Gerbang Pro mengikuti `FORUM_LIMITS_ENABLED` dan hanya tenant `default`. Satu transaksi (`SELECT ... FOR UPDATE` di Postgres) plus UPDATE bersyarat. Kode: `store.ExtendSubGroup` (`sql_group_store_extend.go`), `ForumService.ExtendSubGroup`, `entitlement.ForumExtend*` dan `Limits.CanExtendForum`. `extended_days` ikut di daftar topik. Pesan sistem `subgroup_extended`. Tes: `internal/store/forum_extend_test.go` (10 tes, termasuk konkurensi). **Terbukti di produksi lewat HP (24 Okt)**: Pro diterima (+3 hari, sisa 27), Free ditolak `extend_pro_required`, pesan sistem muncul di chat grup. Batas 30 hari dan penolakan bukan-pembuat hanya terbukti lewat tes otomatis. Rincian: `docs/domains/GROUP_FORUM.md`.
- [x] **Dokumen kontrak REST AI Memory dikoreksi (21 Okt 2026)**: tabel di `docs/domains/AI_MEMORY.md` bagian 4 ditulis ulang dari `api/memory_handler.go`, `api/group_handler.go`, dan `app/router.go`. Rute yang tidak pernah ada dihapus (`POST /api/memory/jobs`, `.../drafts/{id}/action`, `GET /api/memory/approved`); rute nyata ditambahkan (`approve`, `approve-with-changes`, `reject`, `PATCH .../artifacts/{id}`, `DELETE .../journey`, `GET /api/groups/{id}/memories`, `GET /api/memories/{id}`). Dicatat juga bahwa job dibuat otomatis (bukan lewat REST) dan bahwa pemeriksaan whitelist berlaku per metode HTTP.
- [x] **Gerbang whitelist kini mencakup `DELETE .../drafts/{id}/journey` (21 Okt 2026, lokal)**: pengecualian gerbang di `RouteMemoryRequest` dikunci pada metode `DELETE`, sehingga membuang Journey Lite (penyuntingan draf) lolos walau grup di luar whitelist. Kini pengecualian hanya untuk penghapusan draf utuh (`DELETE` + rute dua segmen). Terbukti dengan tes yang gagal pada kondisi lama ("expected 403, got 200"); layar tinjau klien hanya muncul untuk grup yang diizinkan, jadi alur sah tidak terdampak. Dampak sebelum perbaikan rendah (butuh admin grup, draf `DRAFT`, tanpa panggilan AI). Perlu deploy backend untuk berlaku.
- UI admin web untuk memberi paket: `/admin/plans` (lihat docs/progress/FRONTEND.md). Rencana dan keputusan: `docs/plans/backlog/FORUM_MONETIZATION_PLAN.md`.

---

## 🎯 Fokus Berikutnya (What's Next)
- [ ] **Tenant Engine Milestone 1**: Migrasi skema aditif kolom `tenant_id` pada seluruh tabel dan implementasi middleware `X-Tenant-ID`.
