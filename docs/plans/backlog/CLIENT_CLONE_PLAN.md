# Rencana kloning WuzzChat untuk aplikasi klien

> Dibuat 15 Nov 2026 (draf, belum dikerjakan). Dikerjakan **di sesi lain dan repository lain**. Repo WuzzChat ini hanya sumber salinan kode; jangan mengubah WuzzChat sebagai bagian dari pekerjaan klien.
>
> Titik dasar kode: commit `ca3506b` (`main` WuzzChat, 15 Nov 2026). Catat hash yang benar-benar disalin di README repo klien.

## 0. Ringkasan

- **Fitur aplikasi klien:** chat pribadi (E2EE), grup chat, grup privat dengan tautan undangan, dan **grup berbayar dengan Star** (termasuk pendaftaran Creator dan `/admin/stars`).
- **Cara:** repo baru dari salinan kode **tanpa riwayat git dan tanpa `docs/` WuzzChat**. Fitur yang tidak dipakai **dibuang dari kode**, bukan sekadar dimatikan lewat sakelar.
- **Lingkungan:** semuanya terpisah, tidak ada yang dipakai bersama WuzzChat. Itu berlaku untuk VPS, database, Redis, penyimpanan media, domain, Firebase, OAuth Google, akun Play Console, service account, bot Telegram, dan keystore.
- **Pembayaran saat pengembangan:** simulasi dulu (kredit uji, lalu opsional mode `mock`). Billing Play sungguhan baru diuji setelah aplikasi ada di Internal testing (bagian 6).

## 1. Masukan yang harus ada sebelum mulai (dari pengguna/klien)

| # | Butuh | Dipakai untuk |
|---|---|---|
| 1 | Nama aplikasi, nama paket Android (mis. `com.klien.chat`), skema deep link | `app.json`, Play Console, Firebase, OAuth |
| 2 | Domain web/API (mis. `chat.klien.id`) | nginx, TLS, App Links, `CORS_ALLOWED_ORIGINS`, halaman legal |
| 3 | Pemilik akun Play Console **dan** profil pembayaran (disarankan milik klien) | Uang Star masuk ke pemilik akun ini |
| 4 | Penanggung jawab hukum/pajak Star dan email dukungan | `/terms`, `/privacy`, listing Play |
| 5 | Ikon, warna, logo (SVG/PNG) | Ikon aplikasi, splash, web |
| 6 | Keputusan fitur opsional: **panggilan suara?**, **login Google?**, **web chat atau hanya halaman legal/admin?**, video/berkas di chat? | Menentukan bagian 3 |
| 7 | Kepemilikan kode/lisensi (beli putus vs lisensi) | Kontrak; memengaruhi apakah perbaikan WuzzChat boleh dibawa ke repo klien |

Tanpa butir 1, 2, dan 6, pekerjaan sampai bagian 3 tetap bisa jalan dengan nama sementara, tetapi ganti nama paket Android sesudah ada di Play **tidak mungkin**. Jadi butir 1 wajib final sebelum unggah pertama ke Play.

## 2. Membuat repo baru

1. Buat folder baru di luar repo WuzzChat dan repo kosong di remote milik pengguna/klien (privat).
2. Salin **hanya berkas yang dilacak git** dari commit dasar, misalnya `git archive ca3506b | tar -x -C <folder-baru>`. Dengan cara ini berkas yang di-*ignore* (`.env`, kunci) tidak ikut.
3. **Jangan ikut disalin, atau langsung hapus:**
   - `docs/` seluruhnya. Tulis ulang ringkas untuk klien (bagian 9).
   - `PROMPT.md`. Buat versi klien (aturan kerja sama, tanpa referensi WuzzChat).
   - `load-test/results/`, `frontend/.design-qa/`.
   - `mobile/google-services.json`. Ini **milik project Firebase WuzzChat**; ganti dengan milik klien.
   - `frontend/public/.well-known/assetlinks.json`. Isinya sidik jari kunci WuzzChat; ganti.
   - `backend/nginx-wuzz.conf`. Buat ulang untuk domain klien.
4. **Tidak boleh pernah disalin:** `JANGAN-DI-COMMIT.md`, `wuzz-chat-*.json` (service account), `.env` apa pun, keystore `~/keystore/wuzzchat-release.jks`, `~/wuzz-releases/`.
5. Ganti modul Go `github.com/bms-del112/wuzz-chat` di `backend/go.mod` dan semua import.
6. Commit pertama: "initial import from base <hash>". Setelah itu kerja di `dev` seperti aturan WuzzChat.
7. Jalankan semua tes (backend, frontend, mobile) **sebelum** membuang fitur. Itu garis dasar; kegagalan setelahnya berarti akibat pemangkasan.

## 3. Pemangkasan fitur

Prinsip: buang dari luar ke dalam (layar/rute → handler → store → tabel), jalankan tes setelah tiap modul. Bila sebuah modul ternyata dipakai oleh grup berbayar, **pertahankan** dan catat.

### 3.1 Dibuang

| Fitur | Backend | Web (`frontend/app`) | Mobile | Tabel |
|---|---|---|---|---|
| Linimasa (feed) | `internal/feed`, `api/feed_handler.go` | bagian feed (cek komponen) | `FeedScreen`, `PostReaderScreen`, tab "Feed" | `feed_posts`, `feed_likes`, `feed_comments` |
| Game Wuzz Grid | `internal/game`, `api/game_handler.go`, `api/moderation_game.go` | papan/admin game bila ada | `GameScreen` | `game_*` (6 tabel) |
| AI Memory | `internal/ai`, `internal/memory`, `api/memory_handler.go`, worker memory | UI memory | UI memory di grup | `forum_memory_jobs`, `memory_*`, `artifact_evidences`, `approved_memories` |
| Paket forum Free/Pro | `internal/entitlement`, `api/entitlement_handler.go`, `store/entitlement_*`, `forum_extend` | `admin/plans` | layar paket/perpanjang | `user_entitlements`, `entitlement_events` |
| Forum/topik & subgrup | `store/forum_lifecycle`, `sql_group_store_forums`, `subgroup*`, `user_forums`, worker SubGroupTTL | `app/sub` | UI topik di grup | **cek dulu**: grup berbayar dibangun di atas grup privat biasa; pastikan tidak bergantung pada forum sebelum dibuang |
| Tenant B2B & provisioning | `api/b2b_middleware.go`, `provisioning_handler.go`, `credential_handler.go`, `store/tenant_audit` | — | — | `tenants`, `tenant_api_keys`, `exchange_tokens` |
| Pembekuan akun tanpa Google | `api/link_freeze_middleware.go`, env `GOOGLE_LINK_*` | pengumuman penautan | `GoogleLinkRequiredScreen` | — (logika migrasi khusus WuzzChat) |
| Tautan pendek | `short_link_handler`, `short_link_store` | — | — | cek tabel |
| Jeda web | `WebPausedGate`, `NEXT_PUBLIC_WEB_PAUSED` | ya | — | — (buang bila web hanya untuk legal/admin; pertahankan bila klien juga ingin web chat) |
| Alat bantu | `cmd/orphanreport`, `internal/orphanreport`, `cmd/r2check` (pertahankan bila R2 dipakai), `load-test/` | — | — | — |

Catatan:
- **Kolom `tenant_id`** tersebar di banyak tabel dan kueri. **Jangan dicabut**: biarkan semua data di tenant `default`. Cukup buang jalur B2B. Mencabutnya berisiko besar tanpa manfaat.
- **Panggilan suara** (`ice_handler`, coturn, `CallsHistoryScreen`, tab "Calls") dibuang **hanya bila** butir 1.6 memutuskan tidak dipakai.
- **Login Google** (`auth_google_handler`, `google_auth.go`, `googleOnboarding`) dipertahankan bila butir 1.6 = ya. Bila tidak, login username/sandi saja tetap jalan.
- Bersihkan juga: entri `openapi.yaml` (kedua salinan), rute di `internal/app/router.go`, wiring di `wire.go`, rate limit, `account_eraser.go` (hapus baris tabel yang dibuang), tes yang terkait, dan teks `/privacy` serta Data Safety.

### 3.2 Dipertahankan (inti produk klien)

- Auth (username/sandi, refresh token, sesi, batas 2 perangkat), E2EE DM beserta transfer kunci QR dan Nomor Keamanan.
- Chat pribadi dan grup, pesan suara/foto/berkas (video opsional), pin, balas, hapus/ubah pesan, notifikasi push (FCM).
- Teman/akun privat dan blokir.
- Grup privat dengan tautan undangan dan persetujuan admin (`group_invite_links`).
- **Star:** `stars.go`, `stars_play.go`, `creator_applications.go`, `internal/playbilling`, `/admin/stars`, `StarsScreen`, `services/starBilling.ts`, tabel `star_*`, `creator_*`, `paid_group*`, `play_purchases`.
- Moderasi: laporan, penangguhan, staf, Telegram, retensi bukti (wajib untuk aplikasi berkonten pengguna di Play).
- Hapus akun (aplikasi + halaman web), antrean hapus media, cek versi aplikasi (`MIN_MOBILE_BUILD`).
- Halaman `/privacy`, `/terms`, `/delete-account`, `/child-safety` (isi ditulis ulang untuk klien).

## 4. Ganti merek

- Teks "Wuzz"/"WuzzChat" muncul di ±500 berkas yang dilacak (sebagian besar akan hilang bersama `docs/`). Cari ulang setelah pemangkasan dan ganti semua yang terlihat pengguna: string UI, notifikasi, email, Telegram, halaman legal, User-Agent `WuzzChat-Mobile`, judul web.
- `mobile/app.json`: `name`, `slug`, `scheme`, `android.package`, host App Links (`chat.wuzzhub.id` → domain klien), ikon, splash, warna.
- Domain `chat.wuzzhub.id` ada di ±30 berkas (config mobile, web, backend, legal). Jadikan satu konstanta/env bila belum.
- Klien OAuth Web Google di `mobile/src/api/config.ts` diganti milik klien.
- `build-release.sh`: buat salinan baru untuk klien (keystore, alias, folder arsip berbeda). Jangan pakai skrip WuzzChat.

## 5. Lingkungan baru (semuanya milik klien atau atas nama proyek klien)

| Komponen | Yang dibuat | Env/berkas |
|---|---|---|
| VPS | VPS baru (≥2 vCPU, 2 GB RAM, disk ≥40 GB), Docker, SSH dengan kunci, firewall | `backend/docker-compose.yml`, nginx + TLS |
| Database | Postgres baru (Supabase project baru atau Postgres terkelola) | `DATABASE_URL`/`DB_*`; skema dibuat otomatis dari `store/sql.go` |
| Redis | instance baru | `REDIS_URL` |
| Media | bucket R2 (atau Supabase Storage) baru | `R2_*` / `SUPABASE_*`, `STORAGE_DRIVER` |
| Web | project Vercel baru, domain klien | `NEXT_PUBLIC_*` |
| Push | project Firebase baru (FCM) | `mobile/google-services.json`, kredensial FCM di server |
| Login Google (opsional) | project Google Cloud baru, klien OAuth Web + Android (SHA-1 kunci upload dan kunci Play) | `GOOGLE_OAUTH_CLIENT_IDS` |
| Play Billing | service account baru, diundang di Play Console klien | `PLAY_PACKAGE_NAME`, `PLAY_SERVICE_ACCOUNT_JSON` |
| Moderasi | bot dan grup Telegram baru | `TELEGRAM_*`, `MODERATION_*` |
| Panggilan (opsional) | coturn di VPS klien | `TURN_*`, `STUN_URLS` |
| Rahasia | `JWT_SECRET`, `VAPID_*`, `TURN_SECRET` dibuat baru (jangan pakai ulang punya WuzzChat) | `.env` VPS |
| Keystore | keystore upload baru; Play App Signing dikelola Google | di luar repo |

Simpan semua rahasia di luar repo, sama seperti aturan WuzzChat. Buat `.env.example` baru tanpa variabel fitur yang dibuang.

## 6. Pembayaran: simulasi dulu, Play sungguhan belakangan

1. **Tahap pengembangan, tanpa Play:** `STARS_ENABLED=true`, `PAID_GROUPS_ENABLED=true`, `STARS_TEST_GRANTS=true`, `STARS_PLAY_BILLING` kosong. Admin menambah Star uji dari `/admin/stars`; seluruh alur setelah pembelian bisa diuji (bayar akses, masuk grup berbayar, Star diterima kreator, refund manual, Creator). Tombol "Tambah Star" tersembunyi (paket 404).
2. **Opsional, mode `mock`** (kode baru di repo klien) agar tombol beli bisa didemokan tanpa Play:
   - Backend: `STARS_PLAY_BILLING=mock` memakai pemeriksa palsu yang selalu menerima dan menandai pembelian sebagai **uji** (`play_purchases` + label uji di admin). Server **menolak menyala** dengan `mock` bila env produksi (mis. `APP_ENV=production`) atau bila kunci Play terpasang.
   - Mobile: bila server menandai mode mock, `starBilling.ts` memakai lembar konfirmasi tiruan, bukan `expo-iap`. Build release untuk Play tidak memuat jalur ini, atau jalur ini tidak aktif tanpa sinyal server.
   - Tes: kredit masuk sekali (idempoten), ditolak di produksi, label uji tampil.
3. **Sebelum rilis:** daftarkan aplikasi di Play Console klien, buat produk `star_*` (harga dari klien), daftar penguji lisensi khusus, unggah AAB ke **Internal testing**, lalu uji pembelian kartu uji (setuju, tolak, lambat, chargeback/voided) seperti tabel uji WuzzChat 15 Nov 2026.
4. **Produksi:** `STARS_TEST_GRANTS` kosong, `STARS_PLAY_BILLING=true`, satu pembelian nyata dari akun bukan penguji.

Aturan Play: Star adalah barang digital, jadi di aplikasi dari Play wajib lewat Google Play Billing (tidak boleh Midtrans/transfer untuk Star). Pencairan pendapatan kreator belum ada di WuzzChat; bila klien butuh, itu proyek terpisah dengan kajian hukum.

## 7. Play Console dan legal

- Halaman `/privacy`, `/terms` (termasuk ketentuan Star: tidak bisa dipindah/ditukar/diuangkan, hangus saat hapus akun), `/delete-account`, `/child-safety` atas nama klien.
- Data Safety lebih sedikit dari WuzzChat (tanpa game, feed, AI). Mulai dari tabel `PLAY_STORE_LISTING.md` 2.2 dan 2.6 WuzzChat, lalu buang kategori fitur yang dihapus.
- IARC: pembelian digital = Ya, interaksi pengguna = Ya.
- Financial features: tidak ada (Star hanya untuk konten dalam aplikasi).
- Akun peninjau khusus (sandi tidak disimpan di repo), target audiens 13+ atau sesuai klien, trader status UE bila akun developer trader.
- `assetlinks.json` di domain klien dengan sidik jari kunci Play App Signing klien.

## 8. Urutan kerja dan kriteria selesai

| Tahap | Isi | Selesai bila |
|---|---|---|
| A | Repo baru, salinan bersih, ganti modul Go, tes dasar | Semua tes lulus sama seperti di WuzzChat |
| B | Pemangkasan fitur (3.1), satu modul per commit | Tes lulus; tidak ada rute/tabel/layar fitur terbuang; `go vet`, `tsc`, lint bersih |
| C | Ganti merek (4) | Pencarian "wuzz" tidak menemukan teks yang terlihat pengguna atau domain WuzzChat |
| D | Lingkungan lokal dan staging di VPS klien (5) | Daftar, chat DM E2EE di dua HP, grup, undangan, notifikasi push jalan |
| E | Star dengan kredit uji (6.1), opsional mock (6.2) | Alur grup berbayar ujung ke ujung terbukti di dua HP |
| F | Play: Internal testing + billing uji (6.3), legal dan Data Safety (7) | Pembelian kartu uji dan voided terbukti |
| G | Produksi | Rilis disetujui; satu pembelian nyata; `MIN_MOBILE_BUILD` dinaikkan **hanya setelah** build tayang |

Batas kerja AI sama seperti di WuzzChat: AI tidak deploy, tidak build APK/AAB rilis, tidak menaikkan versi di luar perintah, tidak push tanpa izin tertulis, dan tidak menyentuh rahasia.

## 9. Dokumen minimal di repo klien

`README.md` (cara jalan lokal, commit dasar), `PROMPT.md` versi klien, `docs/OPERATIONS.md` (env, sakelar, urutan rilis), `docs/domains/STARS_WALLET.md` (salin aturan Star yang relevan), `docs/PLAY_STORE_LISTING.md` (Data Safety klien), `docs/PROGRESS.md`.

## 10. Membawa perbaikan dari WuzzChat setelah kloning

- Kedua repo tidak berbagi riwayat, jadi perbaikan dibawa **manual** (patch/cherry-pick berkas). Catat di repo klien: "disinkronkan dari WuzzChat `<hash>`".
- Prioritas yang dibawa: perbaikan keamanan, E2EE, auth, Star/billing, kepatuhan Play.
- Pastikan kontrak (butir 1.7) mengizinkan arah sebaliknya bila perbaikan dari repo klien ingin dibawa ke WuzzChat.

## 11. Jebakan yang sudah diketahui dari WuzzChat

- Nama paket Android dan keystore tidak bisa diganti setelah rilis Play; kunci E2EE lokal hilang bila pengguna uninstall.
- Jangan menaikkan `MIN_MOBILE_BUILD` sebelum build baru **tayang** di Play (bukan sekadar dikirim/review), atau pengguna terkunci HTTP 426.
- Akun Play yang ada di daftar penguji lisensi selalu mendapat kartu uji, juga di build Produksi.
- Perubahan `.env` baru berlaku setelah `docker compose up -d`.
- `STARS_PLAY_BILLING` tanpa kunci service account yang valid = fitur diam-diam mati (cek log `⚠️ Pembelian Star`).
- Pembelian yang dibayar tetapi belum dikonfirmasi di-refund otomatis Google setelah 3 hari; jangan matikan billing saat ada pembelian tertunda.
