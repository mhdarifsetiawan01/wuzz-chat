# OPERATIONS.md — Runbook Operasional & Serah Terima Lintas Sesi/AI

> Diperbarui 28 Okt 2026. Dokumen ini adalah sumber kebenaran untuk **cara mengoperasikan** Wuzz Chat (sakelar produksi, rilis, Play Console, tenggat, jebakan). Status produk: [`PROJECT_STATE.md`](PROJECT_STATE.md). Sisa pekerjaan: [`plans/backlog/README.md`](plans/backlog/README.md). Aturan kerja AI: [`../PROMPT.md`](../PROMPT.md).
> **Tidak ada rahasia di sini.** Kata sandi, token, kunci API, IP VPS, dan perintah SSH tidak dicatat di berkas yang masuk git. Akses SSH ada di `docs/local/SSH_VPS_ACCESS.md` (di-gitignore; hanya ada di mesin pengguna). Minta kata sandi ke pengguna bila perlu; jangan disimpan.

---

## 1. Pembagian Tugas (keputusan pengguna, berlaku tetap)

| Pekerjaan | Siapa |
|---|---|
| Menulis kode, tes lokal, dokumen, commit di `dev` (setelah pengguna bilang "selesai") | AI |
| `git push` ke remote, merge ke `main` | AI hanya atas permintaan eksplisit; pola: tawarkan A (merge+push) / B (merge lokal) / C (tetap di `dev`) |
| Deploy backend, deploy frontend, build APK/AAB, mengubah env VPS, unggah ke Play Console/Drive | **Pengguna.** AI hanya memberi tahu bila perlu |
| Menaikkan versi/build number, mengubah signing | **Pengguna** (skrip rilis melakukannya) |
| Mengakses DB produksi | Dilarang bagi AI (diblokir). SSH read-only (log, `grep` nama env tanpa nilai) diizinkan setelah izin |

Setelah deploy backend, AI boleh memeriksa: health, log, dan rute terlindungi (harus 401 tanpa token). Satu-dua respons 502 beberapa detik setelah container start itu normal; migrasi ke Supabase bisa membuat API tidak merespons ±13 detik.

## 2. Sakelar & Konfigurasi Produksi (env backend VPS)

File env ada di `~/wuzz-chat/backend/.env` di VPS (bukan di root home). Terapkan dengan `cd ~/wuzz-chat/backend && docker compose up -d` (**bukan** `restart`). Deploy = `./deploy-chat.sh` (git pull `main` + `docker compose up --build`). Daftar bernama lengkap: `backend/.env.example` (ada kekurangan: `GAME_*` dan sebagian `R2_*` belum tercantum di sana).

| Env | Nilai produksi / arti | Catatan |
|---|---|---|
| `GAME_ENABLED` | menyala | Mati → `/api/game/today` menjawab `{"enabled": false}`, endpoint lain 403 |
| `GAME_REMINDER_TIME` | bawaan `19:00` | Aplikasi memakai jam baru pada sinkron berikutnya, tanpa build baru |
| `FORUM_LIMITS_ENABLED`, `MEMORY_QUOTA_ENABLED` | keduanya `true` | Free 1 forum aktif/7 hari/2 ringkasan AI per bulan; Pro 5 forum/7 atau 30 hari/20 ringkasan. Tenant non-default tidak dibatasi |
| `MEMORY_WORKER_ENABLED`, `MEMORY_ENABLED_GROUPS` | AI Memory hanya untuk grup di whitelist | Daftar ID dipisahkan **koma** (bukan titik koma). Kosong = mati (fail-closed), `*` = semua grup. `MEMORY_ENABLED_GROUPS` dicek lebih dulu dan menjadi sakelar darurat |
| `GOOGLE_OAUTH_CLIENT_IDS` | terisi (client Web) | Server hanya butuh client Web (aud token = Web) |
| `GOOGLE_LINK_DEADLINE`, `GOOGLE_LINK_FREEZE` | `2026-10-30` (sampai 23:59:59 WIB), `true` | Pembekuan akun tanpa Google **otomatis menyala pada tenggat itu** |
| `GOOGLE_LINK_FREEZE_EXEMPT` | `peninjau_play` | Akun peninjau Play. Akun staf (`semantic`, peran `wuzz_admin`) harus sudah menautkan Google atau ikut dibekukan |
| `MIN_MOBILE_BUILD` | 74 (dinaikkan pengguna 28 Okt) | Build di bawahnya kena HTTP 426 / WS 4426 dan `ForceUpdateModal`. Build APK Drive lama (tanda tangan berbeda) harus uninstall; kunci E2EE lokal hilang; pengguna sudah memutuskan ini |
| `LATEST_MOBILE_BUILD`, `LATEST_MOBILE_VERSION`, `APK_DOWNLOAD_URL`, `PLAY_STORE_URL` | naikkan manual setelah rilis | Cek: `curl 'https://chat.wuzzhub.id/api/app/version?platform=android&channel=apk'` (channel dari **query**, bukan header). Naikkan `MIN_MOBILE_BUILD` hanya setelah build baru beredar |
| `STORAGE_DRIVER` | `r2` | Wajib unggah langsung ke R2 lewat signed URL. **Dilarang fallback unggah lewat VPS** (semua jenis media). Env R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`. Env Supabase dibiarkan agar media lama tetap bisa dihapus |
| `MEDIA_RETENTION_DAYS` | 1 | Hanya `PurgeWorker` yang menghapus berkas; ACK unduhan tidak menghapus |
| `MODERATION_NOTIFY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | bot moderasi ke chat pribadi pemilik | Pesan hanya metadata + tautan. Pindah ke grup = ganti chat id + `docker compose up -d` |
| `REPORT_EVIDENCE_RETENTION_DAYS` | 90 | Worker tiap 6 jam; bukti yang ditahan tidak dihapus |
| `DATABASE_URL`, `REDIS_URL` | Postgres Supabase (Seoul, pooler), Upstash Redis | Setiap putaran ke DB ±171 ms; lantai API = 2 putaran |

**Frontend (Vercel, build-time):** `NEXT_PUBLIC_WEB_PAUSED=true` (web dijeda, `WebPausedGate`), `NEXT_PUBLIC_APK_URL` = tautan Play Store (28 Okt 2026), `NEXT_PUBLIC_SUPPORT_EMAIL` menimpa email dukungan bawaan. Mengubahnya butuh rebuild. Pengecualian route gate (`WEB_PAUSED_EXEMPT_PREFIXES` di `frontend/lib/app-download.ts`): `/u`, `/g`, `/sub`, `/room`, `/transfer/share`, `/privacy`, `/terms`, `/delete-account`, `/child-safety`, `/admin`. `app-ads.txt` dilayani sebagai berkas statis (`frontend/public/`), tidak lewat gate.

**R2 (Cloudflare):** bucket `wuzzchat`, domain publik `media.wuzzhub.id`, CORS untuk `https://chat.wuzzhub.id`, Cache Rule **Bypass cache** untuk hostname itu, lifecycle rule hanya untuk awalan `video/` (hapus setelah 3 hari). **Jangan** pasang aturan lifecycle tanpa awalan: avatar dan media Feed ada di bucket yang sama. Batas video 25 MB / 60 dtk.

## 3. Rilis Mobile (Android)

- Skrip rilis ada **di luar repo**: `~/wuzz-releases/build-release.sh full|aab` (butuh TTY; meminta kata sandi keystore sendiri; AI tidak menjalankannya dan tidak pernah meminta kata sandi di chat).
  - `full` = APK (channel `apk`, smart-bump menaikkan versi) lalu AAB (channel `play`) di versi yang sama. `aab` memakai versionCode yang sama dan **ditolak Play**; jangan dipakai untuk build baru.
  - Skrip mensyaratkan working tree bersih, mengarsipkan ke `~/wuzz-releases/<versi>-<build>/` (APK/AAB, `mapping.txt`, source map Hermes, `SHA256SUMS`, `BUILD_INFO`), dan memverifikasi bundle serta tanda tangan.
  - **Jebakan:** skrip meninggalkan repo di branch `main` dengan bump `app.json`/`package.json` belum di-commit. Jalankan `git branch --show-current` sebelum commit; pindah ke `dev` (bila `main`=`dev`) lalu commit. Pernah beberapa commit nyasar ke `main`.
  - `mapping.txt` dan source map **rahasia** (jangan ke Drive publik, repo, atau chat); salin sebelum build berikutnya menimpanya. Pembacaan crash: [`CRASH_REPORTING.md`](CRASH_REPORTING.md).
- Build manual untuk tes di HP: `./gradlew assembleRelease -PskipSmartBump` di `mobile/android` (tanpa flag itu smart-bump mengubah versi). Butuh env `WUZZ_KEYSTORE_PATH`, `WUZZ_KEY_ALIAS`, `WUZZ_KEYSTORE_PASSWORD`, `WUZZ_KEY_PASSWORD`; pengguna menjalankannya di terminal sendiri. Hasil dipecah per ABI. `mobile/android/` di-gitignore (hasil `expo prebuild`); perubahan native lewat `app.json` atau plugin di `mobile/plugins/`.
- Pola pemeriksaan APK/AAB baru: versi dengan `aapt dump badging`, tanda tangan dengan `apksigner verify --print-certs`, cocokkan source map dengan working tree, cari string fitur baru di bundle kedua ABI, arsipkan.
- Smart-bump: commit bertipe `feat` menaikkan MINOR; versionCode harus unik dan naik. Satu nomor build pernah dipakai beberapa biner berbeda: rilis berikutnya harus nomor baru.
- Versi terakhir: **1.43.0 / versionCode 75** (Produksi Play, disetujui 28 Okt 2026).

### Dua kunci tanda tangan (penting)

| Sumber | Tanda tangan | Akibat |
|---|---|---|
| APK keystore lokal (Drive, HP uji) | SHA-1 `BE:B3:11:41:...` (release); developer verification juga mendaftarkan kunci `D7:6A` | Tidak bisa di-update dari Play; uninstall menghapus kunci E2EE |
| Build Play (Play App Signing, kunci buatan Google) | SHA-1 `0D:23:63:A1:36:DD:DA:61:A5:F3:A5:9A:7A:25:E2:AB:76:5A:86:16` | Sidik jari ini wajib ada di `assetlinks.json` (sudah memuat dua sidik jari) dan di klien Android OAuth Google Cloud proyek `wuzzchat` |

Jangan menghapus klien OAuth Android lama (keystore). Klien Web `721755234013-ciptsooit78pk1vjmrevkmdaft0malhg.apps.googleusercontent.com` dipakai di `mobile/src/api/config.ts` dan server.

## 4. Play Console

- Produksi: rilis 75 disetujui 28 Okt 2026. Closed testing (12 penguji opt-in) masih aktif. Data Safety diperbarui 28 Okt (tanpa tipe data baru, hanya konfirmasi Interaksi aplikasi/Fungsi aplikasi); IARC dicek, berlaku. Deklarasi iklan: tanpa iklan, tanpa izin `AD_ID` (**berubah bila SDK AdMob dirilis**, lihat `plans/backlog/ADS_AND_REWARDS_PLAN.md`).
- **Gerbang rilis:** sebelum mengunggah/mempromosikan build yang mengubah data yang dikumpulkan (mis. build dengan iklan atau fitur data baru), perbarui Data Safety memakai `PLAY_STORE_LISTING.md` bagian 2.5, cek ulang IARC, dan pastikan `/privacy`, `/terms`, `/delete-account` sudah tayang. Jangan ubah Data Safety atau jalur Closed saat pengajuan sedang direview atau hitungan penguji berjalan.
- Catatan rilis Play tidak boleh menyebut AI Memory dan tidak menyebut harga/cara bayar Pro. Penguji internal jangan akun yang sama dengan 12 penguji closed.
- **Jebakan Console:** track Open testing memuat rilis 75 ("Superseded"); dua perubahan menggantung (batas 10000 penguji, email umpan balik) ada di "Changes not yet submitted for review". "Managed publishing" aktif: **satu klik "Submit N changes" mengirim semua perubahan tertunda**, jadi jangan menekannya bila menyertakan Open testing. Perubahan tidak bisa dibuang per baris. Ikon perisai di menu kiri = Protected with Play. Halaman Data safety sulit ditemukan: URL `/app-content` mengalihkan ke home; coba `/app-content/data-privacy-security` atau daftar tugas di Dashboard.
- Akun peninjau `peninjau_play` (dibuat lewat API, belum pernah login di aplikasi): jangan login di perangkat sendiri; kata sandi ada pada pengguna. Instruksi App access: `PLAY_STORE_LISTING.md`. Pengguna memutuskan tidak perlu mengujinya di build Play.
- Aset toko: `mobile/assets/store/` (ikon 512, feature graphic 1024x500); screenshot 12 PNG 720x1280 ada di `~/wuzz-releases/screenshots-toko/`.
- Daftar kepatuhan: [`PLAY_STORE_MIGRATION.md`](PLAY_STORE_MIGRATION.md), [`PLAY_STORE_LISTING.md`](PLAY_STORE_LISTING.md). Play In-App Updates sengaja ditunda sampai ada alasan khusus.

## 5. AdMob (status 28 Okt 2026)

Akun AdMob dibuat; publisher `pub-2083809888162993`. `frontend/public/app-ads.txt` berisi `google.com, pub-2083809888162993, DIRECT, f08c47fec0942fa0` dan tayang di `https://chat.wuzzhub.id/app-ads.txt` (dikonfirmasi pengguna di browser). Domain situs pengembang di listing Play = `chat.wuzzhub.id`. Verifikasi AdMob menunggu crawler (24 jam sampai beberapa hari); pengguna menekan "Check for updates" sekali sehari. Bila masih gagal setelah 2-3 hari: periksa kolom **Website** di Play (Store presence → Main store listing → contact details; AdMob hanya membaca dari sana) dan `curl -I` berkas (harus 200, `text/plain`, tanpa redirect ke domain lain). Ini hanya persiapan akun: **belum ada SDK, kode iklan, atau perubahan deklarasi.** Rencana tetap draf dan tidak boleh dieksekusi tanpa perintah eksplisit.

## 6. Tenggat dan Pengingat Bertanggal

| Kapan | Apa | Tindakan |
|---|---|---|
| **30 Okt 2026 23:59:59 WIB** | Pembekuan akun tanpa Google menyala otomatis | Pastikan akun staf `semantic` sudah menautkan Google dan `peninjau_play` ada di `GOOGLE_LINK_FREEZE_EXEMPT`. Darurat: `GOOGLE_LINK_FREEZE=false` lalu `docker compose up -d`. Urutan aktivasi yang benar: deploy backend, build baru beredar, naikkan `MIN_MOBILE_BUILD`, baru freeze. Akun beku di perangkat tanpa kunci tidak boleh membuat kunci E2EE lokal |
| 1 Nov 2026 07:00 WIB | Kuota AI bulanan dihitung ulang | Akun uji Free `vanyzter` (2 dari 2) harus kembali 0 dari 2 |
| ±20 Des 2026 01:26 WIB | Pro 6 akun grandfather berakhir otomatis jadi Gratis | Putuskan: perpanjang lewat `/admin/plans` ("Ubah masa Pro") atau tunggu pembayaran (Fase 5 ditunda) |
| Kuartal 2 2027 | Tinjau Fase 5 Google (hapus akun tidak aktif) | Keputusan pengguna soal ambang, tenggang, pengecualian |

## 7. Aturan Penting Hasil Uji Nyata (jangan dilanggar)

- **Peran istimewa** (`wuzz_admin`, `wuzz_moderator`) diverifikasi ke database di `auth.RequireJWT` (cache 15 dtk, gagal tertutup). Mencabut peran berlaku ±15 dtk.
- **Penangguhan akun**: token **tidak** dicabut (hapus akun/`me`/logout akan 401); WS ditutup dengan kode **4004** (4001 membuat klien menghapus kunci E2EE dan data lokal!); `GET /api/auth/me` membawa `account_suspended`; mobile mengecek penangguhan sebelum cabang "sesi digantikan". "Buka kembali laporan" bukan "Pulihkan akun".
- **Cek pencabutan token tidak di-cache** (keputusan keamanan): pencabutan ditulis dari banyak jalur dan kegagalan invalidasi diam-diam. Layak di-cache hanya bila token akses sangat pendek atau pencabutan disiarkan lewat Redis.
- Pesan DM E2EE tidak pernah dibaca server; moderasi hanya menghapus post/komentar/pesan grup non-E2EE.
- Logout tidak melepas catatan perangkat (batas 2-3 per akun, `409 DEVICE_LIMIT_REACHED`). Jangan mengeluarkan/menimpa perangkat tanpa izin.
- **Reset kunci E2EE menghapus kunci** dan membuat pesan lama terkunci permanen bila tidak ada perangkat lain. Jangan menguji reset kunci di akun nyata dan jangan menekan "Reset Kunci Baru" tanpa persetujuan pengguna.
- Data Safety wajib mendeklarasikan **Alamat email** (login Google menyimpan email Google).
- Forum: durasi daftar kini satu sumber (`store.SubGroupDurationDays`); Perpanjang forum: `POST /api/groups/{id}/subgroups/{subId}/extend` body `{"days":1..3}`, hanya pembuat berpaket Pro, total maks 30 hari (`conversations.extended_days`); forum expired tidak bisa diaktifkan ulang (sengaja). Tombol "Perpanjang" tampil juga untuk akun Free; server yang menolak.
- Teks UI paket Pro harus netral (tanpa ajakan bayar): kebijakan Play Billing belum diverifikasi dari sumber resmi.
- Epoch nomor puzzle `gridEpoch` (2026-10-25) tidak boleh lebih lambat dari hari pertama fitur menyala.

## 8. Jebakan Lingkungan & Pengujian

- **`backend/.env` lokal = DATABASE PRODUKSI** (Postgres Supabase, Redis Upstash, storage produksi). Jangan jalankan backend dari folder `backend/`. Jalankan binari dari folder lain dengan `env -i` dan override: `DB_DRIVER=sqlite`, `DATABASE_URL=`, `REDIS_URL=`, `STORAGE_DRIVER=local`, `AI_PROVIDER=mock`.
- Menguji jalur PostgreSQL: kontainer sementara `postgres:16-alpine` di port bebas (mis. 54329) dengan `PG_TEST_ADMIN_DSN` (helper `internal/testutil/pgtest`); jangan pakai Postgres lain di mesin (`personalops_postgres`, `wuzzhub_postgres`, Postgres sistem 5432); matikan sesudahnya. Suite penuh: `./internal/store ./internal/api ./internal/messaging ./internal/ws ./internal/authz`. SQLite tidak menegakkan `VARCHAR(n)`. Postgres baru dari nol: `users.metadata` TEXT bukan JSONB (pakai `pgtest.ProductionShape`). `TestForumLifecycleJoinsIsolationAndReviewUpdates` pernah gagal di Postgres sebelum monetisasi (placeholder `?` mentah), bukan regresi baru.
- Menambah kolom pada tabel produksi: `ALTER ... ADD COLUMN IF NOT EXISTS` di `autoMigrate` (ada `migration_test.go`). Kueri dengan `?` + `rebindQuery`: hitung jumlah argumen.
- **Dua salinan OpenAPI** (`backend/internal/api/openapi.yaml` tertanam dan `docs/openapi.yaml`) sudah berbeda ±136 baris; ubah bagian yang disentuh di keduanya.
- Nama pengguna berawalan "admin" dicadangkan.
- Jangan `pkill -f`/`pgrep -f` dengan teks yang ada di perintah sendiri (exit 144); pakai `fuser -k PORT/tcp`. Matikan port uji sebelum mengakhiri respons. `npm run dev` (server.js) pernah menjawab 500; `npx next dev -p 3047` berhasil. Perintah latar belakang: gunakan `nohup bash -c` + Monitor.
- Tes: backend `go test ./...`; mobile `npx tsc --noEmit` + `npm run test:unit`; frontend `npx tsc --noEmit` + `npm run build`.
- Verifikasi refresh token produksi (bila perlu): `ssh <alias-vps> 'docker logs --since 72h wuzz-backend 2>&1 | grep "auth/refresh" | grep WuzzChat-Mobile'`, cari `POST /api/auth/refresh 200`. Jangan minta pengguna logout/login ulang (itu menunda refresh 15 hari).
- Akses SSH: alias `wuzz-vps` memakai port 2222 karena ISP rumah memblokir port 22 dan 25 (detail dan perbaikan di `docs/local/SSH_VPS_ACCESS.md`). Bila SSH gagal, cek jaringan sebelum menyentuh server; hotspot HP yang membagikan WiFi rumah bukan tes yang valid.

## 9. Menguji di HP Asli (adb)

- Tangkap layar **sebelum** mengetuk: ketukan buta pernah membuka Kamera atau pratinjau grup. Koordinat dari screenshot, jangan tetap (keyboard menggeser layout). Layar HP Realme 720x1600 butuh `wm size 720x1280` untuk screenshot toko (kembalikan `wm size reset`); koordinat Infinix x1.2. `adb shell svc power stayon true` agar layar tak redup (kembalikan `false`).
- Buka aplikasi dengan `am start -n com.wuzzchat.mobile/.MainActivity` (bukan `monkey`). Rekam layar: `adb shell screenrecord`.
- Jangan memilih akun Google milik orang lain di pemilih akun; jangan menekan "Bersihkan Cache" di Pengaturan > Penyimpanan untuk menguji jalur jarak jauh (menyentuh media chat tersimpan yang mungkin satu-satunya salinan); Photo Picker menampilkan foto pribadi: hanya buka album Videos.
- Akun uji produksi: `mhdarifsetiawan` (juga login Google lewat ADB), `vanyzter`, staf `semantic`; boleh mengukur latensi dan membuat grup uji; DM ke `semantic`/`ebbas` hanya bila perlu. Ukur `receipt` dengan `message_id` palsu. Sesi probe latensi memakai `device_id` `claude-latency-probe` (selalu logout dan hapus token sesudahnya). Kata sandi diminta ke pengguna, tidak disimpan.
- Tenant non-default: tidak ada di produksi; multi-tenant B2B/widget ditunda.

## 10. Peta Dokumen untuk AI Baru

1. [`../PROMPT.md`](../PROMPT.md): aturan kerja dan router domain.
2. Dokumen ini: operasional.
3. [`PROJECT_STATE.md`](PROJECT_STATE.md): status produk dan kapabilitas.
4. [`plans/backlog/README.md`](plans/backlog/README.md): sisa pekerjaan.
5. Domain terkait di `docs/domains/` + konteks platform di `docs/context/`.
6. Riwayat: [`PROGRESS.md`](PROGRESS.md) (terbaru di atas) dan `docs/progress/*`. Rencana lama: `plans/archived/`.
