# Backlog Wuzz Chat — Indeks dan Sisa Pekerjaan

> Diperbarui 14 Nov 2026 sore (serah terima sesi: bagian 0). Sumber kebenaran sisa pekerjaan untuk sesi AI mana pun. Berkas selesai ada di `../archived/28-10-2026-backlog-selesai/`. Aturan kerja ada di `PROMPT.md`; runbook operasional di `docs/OPERATIONS.md`.
> **Kerjakan hanya yang diminta pengguna.** Memiliki item di sini bukan izin implementasi.

## 0. Serah terima sesi 14 Nov 2026 sore (BACA DULU)

**Fokus terakhir: Wuzz Chat V2** (Fase 15 `docs/ROADMAP.md`). Semua kode di bawah sudah di `main` dan di-push; isi `dev` sama dengan `main`. Untuk keadaan terkini pakai `git log origin/main`, bukan hash di catatan ini.

**Tahap 1, tautan undangan grup privat: LIVE.** Backend dan landing web `/join` sudah dideploy; mobile teruji di HP (dua profil Android). Rincian: `PRIVATE_GROUP_INVITES.md`, `docs/domains/GROUP_FORUM.md` aturan 9, `docs/progress/MOBILE.md`.
- Belum: **rilis APK lewat Play** (memuat undangan, teks notifikasi `notif_text`, perbaikan kode pendek huruf `i`, dan kode Star yang tersembunyi selama sakelar mati); cek gerbang Data Safety di `OPERATIONS.md` sebelum promosi build.
- Belum dilihat di HP: **teks notifikasi baru** (`notif_text`). Ma Stw bisa mengajukan lagi ke "Grup Tes Privat" setelah ±02:30 15 Nov 2026 (jeda penolakan). Tautan aktif grup itu sekarang mode persetujuan (lihat Info Grup). Catat hasilnya di `docs/progress/MOBILE.md`.

**Tahap 2a, Star & grup privat berbayar (tanpa Play Billing): SELESAI dan *terbukti* di HP 14 Nov 2026; semua sakelar MATI di produksi.** Desain `STARS_PAID_GROUPS.md`, aturan `docs/domains/STARS_WALLET.md`.
- Backend + `/admin/stars` (web) + mobile sudah di `main`; backend dan frontend 2a **sudah dideploy**. Uji HP 16.07-16.38 dengan `STARS_ENABLED`, `PAID_GROUPS_ENABLED`, `STARS_TEST_GRANTS` dinyalakan sementara lalu dikosongkan lagi oleh pengguna (dicek: baris Saldo Star hilang). Rincian per langkah, temuan, dan yang belum teruji: `docs/progress/MOBILE.md`.
- **Sudah di APK lokal terpasang (build 14 Nov 17.07), belum dilihat di HP:** dua perbaikan `InviteScreen` (jumlah anggota dimuat ulang setelah bayar; tombol tidak lagi terkunci setelah galat 402/409/404). Lihat sekilas saat uji Star berikutnya.
- **Perbaikan lain sesi ini, *terbukti* di HP:** garis gestur Android tidak lagi menimpa tab bar dan kolom ketik (jarak bawah minimum 16 dp; HP Realme melaporkan inset bawah ±1 dp). Rincian `docs/progress/MOBILE.md`.
- **Data uji yang tertinggal di produksi (sengaja, tidak dihapus):** @semantic berstatus mitra kreator aktif; "Grup Tes Privat" punya baris `paid_groups` nonaktif (harga 95); @mastwofficial bersaldo **100 Star dari `test_grant`** (riwayat: kredit uji +100, akses −10, refund +10). Buku besar append-only: bila perlu dinolkan, pakai entri koreksi admin, jangan hapus baris.
- **Tahap 0 DIMULAI 14 Nov 2026** (sisi pengguna): daftar kerja dan gerbang di `STARS_STAGE0.md`. Keputusan: jual atas nama pribadi dulu (akun developer personal; jenis profil pembayaran tidak bisa diubah setelah dibuat). Tahap 2b (Play Billing) baru setelah gerbang bagian 4 dokumen itu lengkap. Angka masih sementara (Rp100/Star, platform 20%, potongan toko 15%, masa tahan 14 hari).
- **Jangan menyalakan sakelar Star untuk pengguna** sebelum Tahap 0 dan deklarasi Play selesai. Sakelar berlaku global (bukan per akun); selama menyala, hanya APK baru dan `/admin/stars` yang melihat fitur.

**Pelajaran sesi ini (jebakan):**
- Periksa `git branch --show-current` tepat sebelum commit; branch sempat berpindah ke `main` di tengah sesi.
- Ubah env backend VPS di `~/wuzz-chat/backend/.env` lalu `docker compose up -d` (bukan `restart`). Endpoint Star tanpa token menjawab 401 baik sakelar nyala maupun mati; cek lewat aplikasi atau `docker compose exec ... env`.
- Uji HP lewat adb dengan dua profil Android (user 0 = @semantic, user 10 = @mastwofficial): **kedua profil terkunci** setiap kali dipindah (`am switch-user`); pengguna harus membuka, dan tangkapan layar layar kunci kosong. Kelompokkan langkah per profil agar perpindahan sedikit. FCM ke profil di latar belakang tertunda sampai profil aktif.
- Memicu penyegaran AppState: `input keyevent HOME` lalu `am start --user <n> -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n com.wuzzchat.mobile/.MainActivity` (`monkey --user` tidak membuka aplikasi). Deep link: `am start --user <n> -a android.intent.action.VIEW -d https://chat.wuzzhub.id/join/<token> com.wuzzchat.mobile`.
- Sebelum `adb install -r` APK lokal, bandingkan sidik SHA-256 penanda tangan (`apksigner verify --print-certs`) dengan APK terpasang (`adb pull` dari `pm path`); beda tanda tangan berarti jangan uninstall (kunci E2EE hilang). Satu install memperbarui semua profil.
- Hindari mengendalikan Chrome di HP pengguna untuk uji web (tab pribadi dan lembar kata sandi tersimpan muncul); pakai Chrome headless di laptop dengan profil sementara.
- Uji backend lokal tanpa menyentuh produksi: jalankan binari dari folder yang tidak berisi `.env` (`.env` lokal = produksi), `DATABASE_URL=sqlite://...`; rewrite `/api` frontend terkunci ke `localhost:8080` saat build.
- SQLite: `busy_timeout` hanya terpasang di satu koneksi pool, jadi tulis bersamaan bisa `SQLITE_BUSY`; uji konkurensi di Postgres (`PG_TEST_ADMIN_DSN`, kontainer `postgres:16-alpine` port 54329).
- Teramati, belum diselidiki: setelah mengeluarkan anggota lalu berpindah profil Android, dialog "Sukses" tampil di atas daftar obrolan, bukan di Info Grup.

## 1. Berkas aktif

| Berkas | Status | Catatan |
|---|---|---|
| [`ADS_AND_REWARDS_PLAN.md`](ADS_AND_REWARDS_PLAN.md) | Draf. **Belum boleh dieksekusi** | Akun AdMob sudah dibuat dan `app-ads.txt` tayang (28 Okt); SDK iklan baru setelah perintah eksplisit. Setiap fitur baru wajib dicek terhadap rencana ini. |
| [`FORUM_MONETIZATION_PLAN.md`](FORUM_MONETIZATION_PLAN.md) + [`_BACKLOG.md`](FORUM_MONETIZATION_BACKLOG.md) | Live (Free/Pro, Perpanjang forum) | Tenggat 1 Nov dan ±20 Des 2026; bug B1-B10, fitur F1-F8, keputusan produk di berkas backlog. |
| [`GOOGLE_LOGIN.md`](GOOGLE_LOGIN.md) | Fase 1-4 live, fase 5 ditunda | Pembekuan otomatis 30 Okt 2026 23:59:59 WIB. |
| [`VIDEO_MESSAGE_R2.md`](VIDEO_MESSAGE_R2.md) | Tahap 1-4 selesai, web ditunda | Cek bagian 6 (thumbnail lokal dan ACK sekali) sebelum menganggapnya terbuka. |
| [`FORUM_BUBBLE.md`](FORUM_BUBBLE.md) | Tahap 1-2 selesai, tahap 3 ditunda | Tahap 3 butuh desain per-tenant untuk AI Memory. |
| [`MOBILE_LINKED_DEVICES.md`](MOBILE_LINKED_DEVICES.md) | Selesai kecuali audit | Audit akar penyebab inventaris lama/kuota dan target yang sepenuhnya offline masih terbuka. |
| [`FEED_UPLOAD_HARDENING.md`](FEED_UPLOAD_HARDENING.md) | Belum dikerjakan | A1 (kompresi gambar) butuh dependency native, jadi build baru. |
| [`PRIVATE_GROUP_INVITES.md`](PRIVATE_GROUP_INVITES.md) | Disetujui 14 Nov 2026. Backend di `main`, **dideploy 14 Nov 2026** (alur nyata belum dicoba). **Mobile selesai di `dev`** (tes saja; butuh build APK dan uji dua HP). Landing web `/join` dideploy 14 Nov 2026 | Wuzz Chat V2 Tahap 1: tautan undangan grup privat yang bisa dicabut + persetujuan admin. Tanpa uang; Star/grup berbayar menyusul (Fase 15). |
| [`STARS_PAID_GROUPS.md`](STARS_PAID_GROUPS.md) | Disetujui 14 Nov 2026. **Tahap 2a selesai, dideploy, *terbukti* di HP 14 Nov 2026** (sakelar mati); Play Billing (2b) belum | Wuzz Chat V2 Tahap 2: Star (hanya dibelanjakan) dan grup privat berbayar. 2a tanpa Play dulu; 2b Play Billing setelah merchant aktif. Tahap 0 belum; semua sakelar mati. |
| [`STARS_STAGE0.md`](STARS_STAGE0.md) | Dimulai 14 Nov 2026 (tanpa kode) | Tahap 0 Star: profil pembayaran Play (individu), pertanyaan ke dukungan Play, konsultasi hukum/pajak, keputusan harga, dokumen pengguna, deklarasi Play; gerbang sebelum Tahap 2b. |
| [`b2b-widget/README.md`](b2b-widget/README.md) | Diskusi, ditunda | Prasyarat audit tenant T1-T6 sudah selesai. |

## 2. Sisa dari rencana yang sudah diarsipkan

**Wuzz Grid (ditutup pengguna 28 Okt 2026; tidak dikejar kecuali dibuka lagi):**
- Belum teruji di HP: notifikasi pengingat benar-benar muncul dan ketukannya membuka game; opsi "sembunyikan dari teman dan grup" dilihat dari akun lain; lencana pembeku saat streak 0; tema gelap kartu pengingat dan papan skor.
- Akun uji sengaja dibiarkan: `@mhdarifsetiawan` (`hide_from_social` ON, pengingat ON, papan publik OFF) dan `@vanyzter` (papan publik ON). Laporan uji "LAPORAN UJI ... abaikan" di `/admin/reports` perlu ditutup pengguna.
- Cara uji pengingat: setelah tengah malam, ubah `GAME_REMINDER_TIME` di env VPS ke sekitar 5 menit ke depan, restart backend, buka aplikasi sekali, tunggu, lalu kembalikan ke `19:00`.

**Moderasi (live):** pencarian laporan per pengguna, UI banding, saluran email, "Tangguhkan lewat username" di Kelola Moderator, notifikasi Telegram dipindah ke grup. Catatan moderator tidak dihapus otomatis (jangan isi data pribadi).

**Token/sesi (live):** konfirmasi log produksi `POST /api/auth/refresh 200` dari aplikasi (UA `WuzzChat-Mobile/<versi>`); cara cek di `docs/OPERATIONS.md`.

**Performa mobile (tuntas):** B3 (opsional, butuh keputusan keamanan) dan D6 (ukur hanya bila riwayat panjang terasa lambat).

**Forum Completion Loop (selesai):** uji notifikasi `memory_draft_ready` nyata (warm/background/cold start) dan dedup ketukan; kasus akses dicabut atau draf dihapus/ditinjau admin lain; pencarian arsip; "Lihat Pesan Asli"; membuka whitelist AI Memory.

## 2b. Belum teruji: pelepasan media & penyapu unggahan yatim (5 Nov 2026)

Kode ada di `main` (`78cfd04`, `bf913a0`, `770f38a`). Deploy backend oleh pengguna: `78cfd04` dan `bf913a0` **sudah** (5 Nov 2026); `770f38a` **sudah** (dikonfirmasi pengguna 14 Nov 2026). Rincian teknis: `docs/domains/MEDIA_LIFECYCLE.md`, `docs/progress/BACKEND.md`, `FEED_UPLOAD_HARDENING.md` (A3). Legenda: **terbukti** = dilihat di produksi; **tes saja** = hanya tes otomatis; **belum** = belum dicoba.

| # | Hal | Status | Cara memverifikasi |
|---|---|---|---|
| 1 | Hapus postingan Feed mengantrekan lampiran | **terbukti** (log `[MediaRelease] Berkas diantrekan`, 5 Nov 2026 19:05 waktu server) | - |
| 2 | Berkas dari #1 benar-benar hilang dari R2 | **belum** (menunggu pengguna) | Buka `https://media.wuzzhub.id/902d11b9-59c9-4593-adfc-f0dd0369d6fb.jpg` (jendela penyamaran / Ctrl+Shift+R); harus 404. Log: `[PurgeWorker] Antrean berkas yatim: 1 terhapus`. Siklus `PurgeWorker` jatuh di menit :52 waktu server, jatuh tempo 1 jam setelah diantrekan |
| 3 | Ganti foto profil melepas foto lama | tes saja | Ganti avatar akun uji, cari `[MediaRelease]` di log, cek link foto lama setelah ±2 jam. Catatan: foto dari login Google bukan milik R2 dan sengaja diabaikan (belum dicoba) |
| 4 | Tiket unggah tercatat di `upload_tickets` | **belum** (sudah dideploy, belum dilihat; saat dicek tepat setelah deploy belum ada tiket) | Unggah media dari HP, lalu di DB: `SELECT COUNT(*), MIN(created_at) FROM upload_tickets;` (akses DB oleh pengguna). Tidak ada baris log sukses; hanya `[UploadTicket] Gagal` bila galat |
| 5 | Penyapu unggahan yatim, mode `dry` | **belum** (`UPLOAD_ORPHAN_SWEEP` kosong = mati) | Tunggu ≥ 4 hari sejak deploy `bf913a0` agar ada tiket matang, set `dry`, `docker compose up -d`, baca log `[UploadSweep]`, cocokkan contoh yatim dengan bucket |
| 6 | Penyapu mode `true` (penghapusan nyata) | **belum**, jangan sebelum #5 bersih | Hanya setelah `dry` tidak menandai berkas yang masih dipakai |
| 7 | Hapus pesan untuk semua orang melepas lampiran | tes saja (sudah dideploy, belum dicoba di produksi) | Kirim gambar ke grup uji, hapus untuk semua orang dalam 60 detik, cari `[MediaRelease]`, cek link ±2 jam kemudian (404) |
| 8 | Kasus tepi #7 | **belum** | (a) pesan yang sudah diteruskan: berkas harus tetap ada; (b) "hapus untuk saya": berkas harus tetap ada; (c) media DM E2EE; (d) video: thumbnail ikut hilang |
| 9 | Ganti avatar grup melepas avatar lama | tes saja (sudah dideploy, belum dicoba di produksi) | Ganti avatar grup uji (foto, bukan emoji), cari `[MediaRelease]`, cek link lama |
| 10 | `cmd/orphanreport` | **terbukti** (dijalankan pengguna di produksi 5 Nov 2026: 20 objek, 5 kandidat yatim 2,3 MiB) | - |
| 11 | Kelima kandidat yatim dicek manual | **belum** | Buka link tiap kunci; bila ada yang ternyata masih tampil di aplikasi, pemeriksaan rujukan tidak lengkap (kabari AI), lalu boleh dihapus dari dashboard R2 bila memang yatim |
| 12 | Ukur ulang bucket | **belum** (jadwal: antara 19 Nov dan 3 Des 2026) | `cd backend && ( set -a; source .env; set +a; go run ./cmd/orphanreport -csv ~/kandidat.csv )`; bila kandidat tidak bertambah dari 5, A3 dianggap selesai (lalu `rm ~/kandidat.csv`) |

**Sengaja tidak dicakup:** pesan dan postingan yang dihapus moderator (bukti laporan ditahan 90 hari; keputusan terpisah), media lama Supabase (bukan milik R2, tidak disentuh), dan sapu bucket otomatis (diputuskan tidak dibangun karena nilainya kecil). **Batas yang diketahui:** pemeriksaan rujukan dilakukan saat berkas dilepas, bukan saat dihapus fisik, jadi rujukan baru dalam jeda 1 jam tidak terdeteksi.

**Temuan terpisah, SELESAI 14 Nov 2026:** `TestShortLinkHandler_CreateAndResolve` flaky karena pola validasi kode pendek menolak huruf `i` (±13% kode pendek produksi tidak bisa dibuka). Diperbaiki di backend, web, dan mobile (`docs/progress/BACKEND.md`, entri 14 Nov). Berlaku setelah deploy backend/frontend dan build APK baru.

## 3. Backlog lain yang belum dimulai (dari serah terima 7 Okt 2026)

- Hardening unggahan Feed (lihat berkas di atas).
- Login Google di web (moderator Google-only belum bisa masuk `/admin`).
- Fase 5 Google: hapus akun tidak aktif (ditunda sengaja; tinjau paling lambat kuartal 2 2027).
- Tutup `POST /api/auth/register` lama setelah klien baru tersebar; hapus kartu "Saya sudah punya akun" setelah masa transisi (`GOOGLE_LOGIN.md` bagian 14.1).
- Latensi kecil opsional: `POST /api/messages/receipt` (3 putaran DB), `POST /api/media/ack` (4 putaran), pemanasan cache tenant/peran/penangguhan saat startup. Konteks: `docs/SECURITY_AND_PERFORMANCE.md`, bagian "Putaran kedua".
- Ide baru (5 Nov 2026), belum diputuskan: Star dan grup privat berbayar dengan pencairan ke kreator; benturan dengan Poin dicatat di `ADS_AND_REWARDS_PLAN.md` bagian 14. Tahap 1 (tautan undangan, tanpa uang) dikerjakan sejak 14 Nov 2026: `PRIVATE_GROUP_INVITES.md`. Tahap 0 (hukum, merchant, harga) di sisi pengguna.
- Ide ditunda: bubble chat AI atas memori (RAG), sinkron kontak (biaya OTP, izin `READ_CONTACTS`), multi-tenant B2B/widget, SVG ikon final (ikon mobile masih placeholder; pengguna menggambar sendiri).
- Dokumentasi: audit `docs/openapi.yaml` terhadap handler (satu skema pernah salah total) dan verifikasi ulang dokumen domain terhadap kode (`FORUM_MONETIZATION_BACKLOG.md` B8, B9). Dua salinan OpenAPI sudah berbeda ±136 baris sejak sebelum game.
- Utang tautan dokumen (sudah ada sebelum 28 Okt): `PROGRESS.md`, `SECURITY_AND_PERFORMANCE.md`, `PROJECT_STATE.md`, dan `MOBILE_INTEGRATION_GUIDE.md` memuat tautan `file:///home/...` absolut (hanya jalan di satu mesin); `ARCHITECTURE_AUDIT.md`, `GROUP_MEMORY_AI_SPEC.md`, `HEADLESS_INTEGRATION_GUIDE.md`, `MODULAR_MONOLITH_DDD.md`, dan `mobile/DESIGN.md` dirujuk dari `docs/` dengan jalur relatif yang salah atau berkasnya tidak ada atau bukan di `docs/`. Perbaiki bertahap (ganti ke tautan relatif atau hapus rujukan).
