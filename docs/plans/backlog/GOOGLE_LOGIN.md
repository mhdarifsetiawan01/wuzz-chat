# Backlog: Login dengan Google (wajib untuk akun baru, migrasi akun lama)

> Dibuat 2026-10-06. **Status: FASE 1 (BACKEND) SELESAI di branch `dev`, belum di-commit/deploy; fase 2 sampai 5 belum dikerjakan.** Lihat bagian 8. Seluruh keputusan di bagian 2 berasal dari diskusi dengan pemilik proyek.
> Fakta bertanda **(terverifikasi)** sudah dicek di kode per tanggal di atas; bertanda **(belum diverifikasi)** harus dicek dulu.

## 1. Latar belakang dan tujuan

Saat ini hanya ada login **username + password** (`POST /api/auth/register`, `/login`). Tidak ada Google Sign-In, OAuth, OIDC, email, maupun pemulihan password (terverifikasi).
Tujuan: **semua akun akhirnya terikat ke satu akun Google**. Akun baru wajib lewat Google; akun lama diberi masa transisi untuk menautkan Google, lalu login username dihentikan.

**Bukan tujuan:** SSO korporat per tenant (SAML/OIDC, terkait rencana B2B yang dijeda), login Apple/Facebook, pemulihan password lewat email.

## 2. Keputusan (final)

1. **Akun baru:** wajib Google. Data wajib: username + display name. **Tanpa password** (tidak ada flow lupa password).
2. **Satu tombol "Lanjutkan dengan Google"** (bukan "Daftar" dan "Masuk" terpisah). Server memutuskan berdasar `sub` Google:
   - `sub` sudah tertaut → login ke akun itu.
   - `sub` belum tertaut → status `GOOGLE_NOT_LINKED`, lalu layar pilihan: **"Saya sudah punya akun Wuzz"** (username + password, lalu `sub` ditautkan) atau **"Saya pengguna baru"** (username + display name).
3. **Login username tetap ada** sebagai opsi sekunder untuk akun lama selama masa transisi. Register username + password ditutup untuk akun baru.
4. **Akun lama:** pengumuman di aplikasi (banner/dialog dengan hitung mundur) agar menautkan Google sebelum `google_link_deadline`. Penautan dari Pengaturan butuh **sesi aktif + login Google baru** (tanpa password).
5. **Setelah batas waktu: akun DIBEKUKAN, bukan langsung dihapus.** Login username hanya membuka layar "Tautkan Google untuk melanjutkan"; selama belum tertaut tidak bisa mengirim pesan atau membaca data. Setelah menautkan, normal kembali.
6. **Hapus otomatis hanya untuk akun tidak aktif sangat lama** (usulan 6 sampai 12 bulan setelah batas waktu, tanpa login), lewat worker terjadwal memakai `EraseUser`. Aturan harus dicantumkan di `/privacy` dan `/terms`.
7. **Lupa password (akun lama, sudah logout):** tidak ada fitur pemulihan. Pilihannya: daftar akun baru dengan Google (username berbeda), atau hubungi support untuk meminta penghapusan akun lama lalu mendaftar ulang dengan username yang sama. **Admin tidak boleh menautkan Google ke akun yang sudah ada** (tidak ada cara memverifikasi pemilik; risiko pengambilalihan identitas).
8. **Aturan penghapusan manual oleh admin menyusul** (ambang tidak aktif, masa tunggu). Sementara itu: periksa `last_active_at` sebelum menghapus, tolak bila akun masih aktif, catat tiap penghapusan (siapa, kapan, alasan), dan selalu panggil `EraseUser` (jangan hapus baris `users` manual).
9. **Ganti akun Google:** re-auth Google lama, lalu tautkan yang baru. Masuk dari awal agar akun tidak terkunci bila Google lama hilang.

## 3. Kondisi saat ini (terverifikasi)

| Komponen | Lokasi | Keterangan |
|---|---|---|
| Layanan auth | `backend/internal/authz/service.go` | `Register` (`:77`), `Login` (`:170`), `ChangePassword`, `RefreshToken`; penerbitan JWT lewat `auth.GenerateTokenDetailedWithTenantAndRole` |
| Rute | `backend/internal/app/router.go` (`:106` dst.) | `/api/auth/register`, `login`, `me`, `refresh`, `verify-password`, `change-password`, `credentials` (daftar kredensial) |
| Tabel kredensial | `backend/internal/store/sql.go` (`:375`) | `user_credentials(id PK, user_id, type, identifier, secret_data NOT NULL, name, created_at, updated_at)`. **PK adalah `id`, bukan `user_id`** (dokumen `AUTH_SESSION.md` bagian 3 keliru, perlu dikoreksi). Banyak baris per user sudah boleh |
| Indeks | `idx_credentials_user(user_id, type)`, `idx_credentials_ident(identifier)` | **Tidak ada UNIQUE** pada `(type, identifier)` |
| Model | `store/credential_store.go` | `UserCredential.Type`: `"password" \| "passkey" \| "oauth"`, `Identifier` sudah dirancang untuk email/credential_id. Tersedia `CreateCredential`, `GetPasswordCredential`, `UpdatePasswordCredential`, `ListCredentials`. **Belum ada** pencarian kredensial berdasar `(type, identifier)` |
| Repo authz | `authz/repository.go:58` | `CreateCredential(userID, passwordHash)` khusus password |
| E2EE | `mobile/src/services/crypto.ts`, `frontend/lib/crypto/` | Keypair acak di perangkat, public key di-upload; **tidak diturunkan dari password**. Login Google tidak mengubah E2EE. Perangkat baru tetap lewat konflik kunci (QR atau reset) |
| Aksi berbasis password | `DELETE /api/auth/me`, `verify-password`, `change-password`, reset kunci E2EE (`AuthContext.resetE2EEKeys`) | Perlu diganti/ditambah re-auth Google untuk akun tanpa password |
| Rate limit password | auth handler | 10 per 15 menit per pengguna (HTTP 429) |
| Batas perangkat & JWT | `authz`, `auth/jwt.go` | maks 2 perangkat (409 `DEVICE_LIMIT_REACHED`); JWT 30 hari, sliding refresh, batas absolut 365 hari |
| Hapus akun | `store.SQLAccountEraser.EraseUser` | satu transaksi, tombstone `deleted_<id>`, username dibebaskan, JWT dicabut, WS ditendang |
| Tenant | `docs/domains/MULTI_TENANT.md` | register pada tenant non-default ditolak 403; login Google harus ikut aturan ini |
| Mobile | `mobile/package.json` | hanya `@react-native-firebase/app` dan `crashlytics`; **belum ada** paket Google Sign-In |
| Web | `frontend/` | belum ada |
| Gatekeeper versi | `docs/plans/archived/01-10-2026-m-mobile-11-client-version-gatekeeper/` | dapat memaksa klien lama update |
| Kolom aktivitas | `store/session_store.go:19` | `sessions.last_active_at` tersedia untuk menilai akun tidak aktif |

**Belum ada (terverifikasi):** kolom email di `users`, status akun beku/`suspended`, verifikasi `id_token`, konfigurasi OAuth client ID.

**Temuan tambahan (terverifikasi 2026-10-06):**
- `sharedvalidator.ValidateRegistration(username, displayName, password)` **memaksa password** (`ValidatePassword`, minimal 6 karakter). Akun Google tidak boleh memakainya: pecah menjadi `ValidateUsername` dan `ValidateDisplayName` (dipakai juga oleh `ValidateRegistration`), jangan memanggil dengan password palsu.
- Password disimpan **dua tempat** (dual-write): `users.password_hash` dan `user_credentials`. `SQLUserStore.ChangePassword` menulis keduanya (sinkronisasi kredensial best-effort, error diabaikan); `Authenticate` membaca `user_credentials` dulu lalu fallback ke `users.password_hash`; `VerifyPassword` hanya membaca `users.password_hash`.
- Akun Google-only memakai `users.password_hash = ''` dan tanpa baris `password`. Perilaku aman: bcrypt terhadap hash kosong selalu gagal, jadi login username dan `verify-password` selalu ditolak (tidak ada celah). **Jangan** menulis hash acak sebagai pengganti. Tambahkan tes yang menegaskan hal ini.
- `SQLAuthRepository.CreateUserWithContext` membuat user dengan password kosong; baris password dibuat terpisah di `service.go:108`. Jalur Google cukup melewati langkah itu dan menulis baris `oauth`.
- Pembuatan user dan penulisan kredensial `oauth` harus **dalam satu transaksi** (hindari user tanpa kredensial bila langkah kedua gagal). Jalur `Register` saat ini tidak transaksional, jangan ditiru.

## 4. Rancangan

### 4.1 Backend (Go)

**Verifikasi `id_token`** (paket baru, mis. `backend/internal/authz/google/`): verifikasi tanda tangan memakai JWKS Google (cache), cek `iss` (`accounts.google.com`), `aud` (client ID Android, iOS, dan Web milik kita), `exp`, `email_verified`, dan `nonce` bila dipakai. Pakai `sub` sebagai identifier, **bukan email**. Pertimbangkan library resmi `google.golang.org/api/idtoken`.

**Skema:**
- Indeks unik parsial `UNIQUE(type, identifier)` untuk `type='oauth'`, supaya satu `sub` hanya ke satu akun. Tambahkan juga batas satu kredensial `oauth` per `user_id`.
- Untuk `oauth`, `secret_data` diisi string kosong (kolom `NOT NULL`). `name` memuat label (mis. email Google, hanya untuk tampilan).
- Kolom/penanda akun beku dan `google_link_deadline` (konfigurasi server, bukan per akun).
- Cek perilaku SQLite dan PostgreSQL (kedua mesin dipakai, lihat `isPostgres()`).

**Endpoint baru:**

| Method | Endpoint | Akses | Fungsi |
|---|---|---|---|
| `POST` | `/api/auth/google` | Publik | Terima `id_token`, `device_id`, `platform`. `sub` tertaut: terbitkan JWT (jalur perangkat dan batas 2 perangkat sama dengan `Login`). Belum tertaut: `GOOGLE_NOT_LINKED` + `link_token` |
| `POST` | `/api/auth/google/register` | Publik + `link_token` | Buat akun baru (username, display name). Tanpa password |
| `POST` | `/api/auth/google/link` | Publik + `link_token` | Akun lama: username + password, lalu tautkan `sub` dan terbitkan JWT (aturan login biasa berlaku) |
| `POST` | `/api/auth/me/google` | JWT | Tautkan Google ke akun yang sedang login, dengan `id_token` baru. Tanpa password |
| `PUT` | `/api/auth/me/google` | JWT + re-auth Google lama | Ganti akun Google |

**`link_token`:** JWT pendek (TTL 5 menit), sekali pakai, mengikat `sub` (dan email untuk tampilan). Jangan pernah mengirim `id_token` Google mentah bolak-balik. Sekali pakai dicatat agar tidak bisa dipakai ulang.

**Re-auth Google untuk aksi sensitif** (hapus akun, reset kunci E2EE, ganti Google): terima `id_token` baru, cek `sub` sama dengan kredensial `oauth` akun, `nonce` cocok, dan `auth_time` atau `iat` kurang dari 5 menit. `DELETE /api/auth/me` dan jalur reset kunci menerima `password` **atau** `google_id_token`. Rate limit 10 per 15 menit tetap berlaku.

**Penutupan register lama:** `POST /api/auth/register` ditolak (HTTP 410/403 dengan kode jelas) untuk akun baru. Versi klien lama diarahkan update lewat gatekeeper.

**Pembekuan setelah batas waktu:** middleware atau pemeriksaan di `ValidateToken` menolak akses data (selain endpoint penautan) untuk akun tanpa kredensial `oauth` setelah `google_link_deadline`. Respons memakai kode khusus (mis. `GOOGLE_LINK_REQUIRED`) supaya klien membuka layar penautan.

**Status di respons:** `/api/auth/me` dan respons login menyertakan `google_linked` dan `google_link_deadline`.

**Pesan error:** langkah penautan memakai pesan umum "username atau password salah" (tidak membocorkan keberadaan username).

### 4.2 Mobile (React Native Expo)

- Paket Google Sign-In (Credential Manager / `@react-native-google-signin/google-signin` atau setara; **(belum diverifikasi)** kompatibel dengan Expo 57). Butuh **rebuild native** (bukan OTA) dan **SHA-1 keystore release** terdaftar di Google Cloud Console (OAuth client Android).
- `LoginScreen`: tombol utama "Lanjutkan dengan Google", opsi sekunder "Masuk dengan username".
- Layar baru: pilihan `GOOGLE_NOT_LINKED` ("sudah punya akun" / "pengguna baru"), form username dan display name, layar `GOOGLE_LINK_REQUIRED`.
- Pengaturan: "Hubungkan Google", "Ganti akun Google"; sembunyikan "Ganti password" untuk akun tanpa password.
- `DeleteAccountModal`, `KeyConflictModal`: dukung re-auth Google.
- Banner pengumuman dengan hitung mundur, makin mendesak mendekati batas waktu.
- Ikuti alur build di memori `mobile-release-build-workflow` dan aturan `mobile/` (`npx tsc --noEmit`).

### 4.3 Web (Next.js)

- Google Identity Services (tombol resmi), alur sama dengan mobile. Patuhi `frontend/DESIGN.md` dan token CSS.
- Web sedang dijeda (`frontend/lib/app-download.ts`); rute login Google harus dikecualikan dari gate bila web dibuka kembali.
- Halaman publik (`/privacy`, `/terms`, `/delete-account`) diperbarui: data dari Google (hanya `sub`, email untuk tampilan), aturan pembekuan dan penghapusan akun tidak aktif, dan cara meminta penghapusan akun lama.

### 4.4 Operasional dan kepatuhan

- **Google Cloud Console:** OAuth consent screen, client ID Android, iOS (bila ada), dan Web; SHA-1 debug dan release.
- **Play Console:** Data safety form (Google account ID), akun uji untuk reviewer (**wajib**: siapkan akun Google khusus reviewer, karena login password tidak ada lagi untuk akun baru; lihat `docs/PLAY_STORE_MIGRATION.md`).
- **Hapus akun tetap bisa untuk akun Google-only** (syarat Play) lewat re-auth Google.
- **Penghapusan manual oleh admin (sementara):** skrip yang memanggil `EraseUser`, memeriksa `last_active_at`, dan mencatat jejak. Alat resminya masuk ke `docs/plans/backlog/MODERATION_TOOL.md`.

## 5. Fase pengerjaan

1. **Fondasi backend:** verifikasi `id_token`, indeks unik, `POST /api/auth/google`, `link_token`, `google/register`, `google/link`, `me/google`, re-auth Google di `DELETE /api/auth/me` dan reset kunci. Uji unit. Cek skema pada SQLite dan PostgreSQL.
2. **Klien mobile dan web:** tombol Google, layar pilihan, form akun baru, pengaturan tautkan dan ganti Google. Tutup `register` lama (bersama gatekeeper versi).
3. **Pengumuman dan batas waktu:** `google_link_deadline`, banner hitung mundur, pembaruan `/privacy` dan `/terms`, pengumuman di luar aplikasi (listing Play Store, halaman web).
4. **Pembekuan:** aktifkan pemeriksaan `GOOGLE_LINK_REQUIRED` setelah batas waktu; layar penautan paksa.
5. **Penghapusan akun tidak aktif:** worker terjadwal (`EraseUser`), setelah ambang 6 sampai 12 bulan.

Fase 1 sampai 2 dapat dirilis tanpa menyalakan batas waktu (fase 3 sampai 4). Backend wajib dideploy dulu sebelum klien yang memakainya.

## 6. Risiko dan pertanyaan terbuka

- **Akun Google hilang atau diblokir:** akun Wuzz tidak bisa dibuka. Mitigasi: fitur ganti Google (keputusan 9). Pengguna yang tidak punya akun Google tidak bisa mendaftar (konsekuensi keputusan "wajib").
- **Pengguna lama yang lupa password dan sudah logout** tidak bisa menautkan Google. Pengumuman harus menyebut jalur daftar baru dan permintaan hapus akun lama (keputusan 7).
- **Permintaan hapus palsu oleh orang iseng.** Mitigasi sementara: periksa `last_active_at`; aturan resmi (masa tunggu 7 hari, batal otomatis bila pemilik login) menyusul.
- **Ketergantungan pada Google** di semua platform, termasuk kebijakan dan kuota OAuth.
- **Tenant non-default:** perlu ditentukan apakah login Google berlaku untuk tenant B2B (default: tidak, ikuti aturan provisioning).
- **Akun uji dan load test:** `load-test/` dan skrip uji yang memakai register/login password perlu jalur khusus (akun password lama atau token uji).
- **Belum diverifikasi:** kompatibilitas library Google Sign-In dengan Expo 57 dan arsitektur baru; perilaku `UNIQUE` parsial di SQLite versi yang dipakai.

## 7. Definisi selesai

- Akun baru hanya bisa dibuat lewat Google; register username lama ditolak.
- Pengguna lama dapat menautkan Google (dari Pengaturan atau lewat login username), dan dua jalur login berfungsi selama masa transisi.
- Hapus akun, reset kunci E2EE, dan ganti Google berfungsi untuk akun Google-only.
- `go test -v ./...` di `backend/` lulus 100%, `npm run build` di `frontend/` bersih, `npx tsc --noEmit` di `mobile/` bersih.
- `docs/domains/AUTH_SESSION.md` diperbarui (invarian, endpoint, skema, koreksi PK `user_credentials`).
- Akun uji reviewer Play Store tersedia.

## 8. Status fase 1 (backend), 2026-10-06

**Selesai dan teruji** (`go test ./...` seluruh modul lulus, `go vet ./...` bersih):
- `internal/authz/google/` verifier ID token (JWKS + cache + batas refetch; tes: aud/iss/exp/iat/email_verified, HS256 confusion, kid tak dikenal, tanda tangan kunci lain, rotasi kunci, JWKS mati = gagal tertutup).
- Migrasi: indeks unik parsial `idx_credentials_oauth_subject` dan `idx_credentials_oauth_user`.
- `store.SQLOAuthStore`: `CreateUserWithOAuth` (transaksi atomik, terbukti tanpa user/kredensial yatim saat bentrok), `LinkOAuth`, `UnlinkOAuth`, `ReplaceOAuth` (atomik), `FindUserIDBySubject`, `GetLinkedSubject`. Hapus akun membebaskan `sub`.
- `auth.GenerateLinkToken/ParseLinkToken` (kunci turunan; tes dua arah: tidak valid sebagai token sesi dan sebaliknya).
- `AuthService`: `finishLogin` diekstrak dari `Login` (perilaku login password tidak berubah, tes lama lulus); metode Google sesuai bagian 2.
- HTTP: `/api/auth/google`, `/google/register`, `/google/link`, `/me/google`; `/api/auth/me` + `google_linked`/`has_password`; `DELETE /api/auth/me` dan reset kunci menerima `google_id_token`.
- Konfigurasi `GOOGLE_OAUTH_CLIENT_IDS` (kosong = endpoint membalas 503; **produksi tidak berubah sampai diisi**).

**Penyimpangan dari rencana awal:**
- Ditambah `UnlinkGoogle` (`DELETE /api/auth/me/google` + password). Alasan: penyerang yang tahu password korban bisa menautkan Google miliknya dan tautan itu bertahan setelah korban mengganti password.
- `/api/user/public-key/reset` kini dibatasi `passwordAttemptLimit` (10/15 menit per pengguna) seperti verify-password dan change-password; sebelumnya tidak ada pembatas padahal memverifikasi password.
- Sentinel error OAuth ada di `shared/errors` (dipakai bersama `store` dan `authz`).
- Konfigurasi Google sengaja berada di `AuthService`, bukan di `AuthRepository`, karena `AuthHandler.syncAuthRepo` mengganti repository setiap kali ada `Set*Store` (ada tes yang menjaga ini).

**Belum dilakukan di fase 1 (sengaja):**
- `POST /api/auth/register` **belum ditutup**: menutupnya sekarang akan merusak aplikasi mobile yang beredar. Tutup bersama fase 2 dengan version gatekeeper.
- Belum ada alat admin untuk menghapus akun atas permintaan (lihat keputusan 8) dan belum ada `google_link_deadline`/pembekuan (fase 3 sampai 4).
- Re-auth `VerifyPassword`/`change-password` untuk akun Google-only belum ada di klien (fase 2). Endpoint `verify-password` tetap menolak akun tanpa password.
- **PostgreSQL: sudah dites** (PG 16 lokal, 6 Okt 2026) untuk store OAuth, `AuthService` (login password + Google), handler, dan router, lewat `PG_TEST_ADMIN_DSN` (helper `internal/testutil/pgtest`; tanpa variabel itu tes memakai SQLite). Termasuk skenario deploy: database berisi akun password lama dibuka ulang dua kali oleh versi baru (migrasi indeks idempoten, login password tetap sah). Cara menjalankan: `PG_TEST_ADMIN_DSN="postgres://postgres@127.0.0.1:<port>/postgres?sslmode=disable" go test ./internal/store ./internal/authz ./internal/api ./internal/app`. **Belum dites terhadap Supabase/pooler sungguhan.**
- **Bug laten (lama, bukan dari fase 1):** pada database Postgres yang dibuat dari nol, `CREATE TABLE users` membuat `metadata` bertipe `TEXT`, sedangkan query `GetUserByID` memakai `COALESCE(metadata, '{}'::jsonb)` sehingga gagal. Produksi aman karena kolomnya `JSONB` (ditambahkan lewat ALTER pada tabel lama). Hanya berdampak bila suatu hari membuat instalasi Postgres baru; tes memakai `pgtest.ProductionShape` untuk menyamakan skema. Perlu diperbaiki terpisah.
- **Belum dites dengan ID token Google sungguhan** (butuh client ID dan perangkat). Perlu diperiksa di fase 2: apakah library mobile mengembalikan token baru (`iat` ≤ 5 menit) atau token cache; bila cache, batas kesegaran 5 menit untuk re-auth akan menolak pengguna yang sah.

**Langkah deploy fase 1** (hanya setelah disetujui): `ssh deploy@<VPS_IP> ./deploy-chat.sh`. Migrasi indeks berjalan otomatis saat start. Aman dideploy dengan `GOOGLE_OAUTH_CLIENT_IDS` kosong (fitur mati); isi setelah OAuth client dibuat di Google Cloud Console.
