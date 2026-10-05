# 🔐 Domain: Authentication & Session (`AUTH_SESSION`)

Dokumen ini adalah spesifikasi definitif untuk domain **Autentikasi, Manajemen Sesi, Kredensial, dan Batas Perangkat** pada Wuzz Chat.

---

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **Pemisahan Kredensial**:
   - Kata sandi disimpan terpisah di tabel `user_credentials` dalam bentuk hash `bcrypt` (cost 10). Tabel `users` bersih dari data kata sandi.
2. **Siklus Hidup JWT & Token Revocation**:
   - Akses token JWT memiliki masa aktif 30 hari sejak diterbitkan (login maupun refresh).
   - **Sliding renewal**: `POST /api/auth/refresh` menerbitkan token baru (jti baru) bila sisa masa berlaku < 50% (15 hari); selain itu `refreshed:false`. Batas absolut sesi 365 hari sejak login awal (klaim `auth_time`, fallback `iat` untuk token lama); lewat itu 401 dan wajib login ulang. Token lama dibiarkan habis alami, record sesinya dicabut. Refresh tidak menambah perangkat dan ditolak bila sesi/perangkat sudah dicabut. Kegagalan refresh di klien **tidak boleh** memicu logout.
   - Setiap token memuat klaim unik `jti` (UUID). Saat pengguna melakukan logout atau mengganti kata sandi, `jti` dicatat di tabel `revoked_tokens` (*blacklist*).
   - Middleware memvalidasi bahwa `jti` belum kedaluwarsa dan tidak ada di daftar blacklist.
3. **Batas Kuota Perangkat (Maksimal 2 Perangkat Aktif)**:
   - Satu akun pengguna dibatasi maksimal **2 perangkat fisik aktif** secara bersamaan.
   - Jika perangkat ke-3 mencoba login:
     - Server menolak dengan status HTTP 409 Conflict (`code: "DEVICE_LIMIT_REACHED"`).
     - Payload response mengembalikan daftar perangkat aktif saat ini.
     - Pengguna dapat mengirim parameter konfirmasi `{ confirm_override: true }` untuk menimpa sesi perangkat terlama.
4. **Pola Trusted Device pada Normal Logout**:
   - Logout sukarela (`POST /api/auth/logout`) **TIDAK MENGHAPUS** kunci E2EE lokal di Keystore/IndexedDB.
   - Saat login ulang di perangkat yang sama, aplikasi memverifikasi kunci ke server via `PUT /api/users/public-key`, menerima status 200 OK, dan langsung masuk tanpa modal scan QR atau reset kunci berulang kali.
5. **Session Replacement & Eviction**:
   - Jika akun dibuka di perangkat baru yang menendang perangkat lama, server mengirimkan frame penutupan WebSocket Close Code `4001: SESSION_REPLACED`. Klien lama wajib memutus koneksi permanen (`destroyed = true`) dan menghapus sesi lokal.
6. **Hapus Akun (syarat Google Play)**:
   - `DELETE /api/auth/me` wajib re-auth password. Seluruh penghapusan berjalan dalam **satu transaksi** (`store.SQLAccountEraser.EraseUser`), gagal = tidak ada yang berubah.
   - Dihapus: pesan yang ditulis user (DM & grup) beserta pin, keanggotaan & permintaan gabung, relasi pertemanan, postingan/komentar/suka feed (counter post orang lain disinkronkan ulang), kredensial, sesi, perangkat, push token, token transfer/pertukaran.
   - Grup yang dibuat user: peran `creator` diwariskan ke admin/anggota tertua; jika tidak ada anggota lain, grup beserta pesannya dihapus.
   - Baris `users` dipertahankan sebagai **tombstone** (`username=deleted_<id>`, `display_name='Akun Terhapus'`, password/kunci/profil dikosongkan) agar referensi data milik orang lain tidak rusak; username asli dibebaskan. Seluruh JWT lama dicabut (`user_token_revocations`) dan koneksi WebSocket ditendang (`ACCOUNT_DELETED`).
   - Berkas media fisik tidak dihapus langsung; mengikuti `PurgeWorker` (24 jam DM / 7 hari grup). Percobaan password (hapus akun, `verify-password`, `change-password`) dibatasi 10 per 15 menit per pengguna (HTTP 429, `Retry-After: 900`), sebab token curian tidak boleh dipakai menebak password. Halaman publik: `/privacy`, `/terms`, `/delete-account` (frontend, dikecualikan dari gate web dijeda).

7. **Login dengan Google (fase 1 backend, nonaktif sampai `GOOGLE_OAUTH_CLIENT_IDS` diisi)**:
   - Identitas Google = klaim `sub` dari ID token yang diverifikasi server (tanda tangan RS256 vs JWKS Google, `iss`, `aud` = client ID kita, `exp`, `email_verified`). Email hanya label tampilan, **bukan** kunci. Disimpan sebagai `user_credentials(type='oauth', identifier='google:<sub>', secret_data='')`.
   - Database menjamin (indeks unik parsial): satu `sub` hanya ke satu akun, satu akun hanya satu Google. Pembuatan user + kredensial `oauth` berlangsung **dalam satu transaksi** (`store.SQLOAuthStore.CreateUserWithOAuth`).
   - Satu tombol "Lanjutkan dengan Google": `sub` tertaut → login (kuota 2 perangkat sama seperti login password); belum tertaut → `200 {code:"GOOGLE_NOT_LINKED", link_token}`. `link_token` (5 menit, kunci turunan terpisah dari JWT sesi, tidak pernah valid sebagai token sesi) dipakai untuk **daftar baru** (username + display name, tanpa password; `password_hash=''` sehingga login password mustahil) atau **menautkan akun lama** (username + password benar).
   - Hanya tenant default. Tidak ada auto-link berdasar email.
   - Re-auth Google (ID token usia ≤ 5 menit, `sub` = yang tertaut) diterima sebagai pengganti password pada `DELETE /api/auth/me` (`google_id_token`) dan reset kunci E2EE (`google_id_token`).
   - Akun yang masih punya password dapat memutus Google (`DELETE /api/auth/me/google` + password), supaya pemilik asli bisa melepas tautan Google yang dipasang pihak lain setelah mengganti password. Akun tanpa password tidak boleh memutus (satu-satunya cara login).

---

## 🏛️ 2. Model Backend DDD (`backend/internal/authz/`)

```text
backend/internal/authz/
├── entity.go         # Entitas: User, UserCredential, Session, Device, RevokedToken
├── repository.go     # Interface AuthRepository & DeviceRepository
├── service.go        # AuthService (Login, Register, ChangePassword, RevokeSession); finishLogin dipakai bersama semua metode login
├── google_auth.go    # Login Google: GoogleSignIn, GoogleRegister, GoogleLinkExisting, LinkGoogleToAccount, ReplaceGoogle, UnlinkGoogle, VerifyGoogleReauth
├── google/           # Verifier ID token Google (JWKS, cache, tanpa dependensi baru)
└── worker/           # CleanerWorker (Pembersihan token kedaluwarsa)
```

- **Use Cases di `AuthService`**:
  - `Register(ctx, username, displayName, password) (*User, error)`
  - `Login(ctx, username, password, deviceID, platform, confirmOverride) (*AuthResult, error)`
  - `Logout(ctx, userID, deviceID, tokenJTI) error`
  - `ChangePassword(ctx, userID, oldPass, newPass) error`
  - `ValidateToken(ctx, tokenString) (*JWTClaims, error)`
  - `GetActiveSessions(ctx, userID) ([]Session, error)`

---

## 🗄️ 3. Skema Basis Data

- `user_credentials`: `id` (PK), `user_id` (indeks, boleh banyak baris per user), `type` (`password`/`passkey`/`oauth`), `identifier`, `secret_data` (NOT NULL; hash bcrypt untuk `password`), `name`, `created_at`, `updated_at`. Tidak ada kolom `key_salt`. Hash password juga disalin ke `users.password_hash` (dual-write jalur lama; `Authenticate` membaca `user_credentials` dulu, fallback ke `users.password_hash`).
- `sessions`: `id` (PK, UUID), `user_id` (FK), `token_hash`, `device_id`, `created_at`, `expires_at`, `revoked_at`.
- `devices`: `id` (PK, UUID), `user_id` (FK), `device_id`, `device_name`, `platform` (`web`/`android`/`ios`), `push_token`, `last_active_at`.
- `revoked_tokens`: `jti` (PK, VARCHAR), `user_id`, `revoked_at`, `expires_at`.
- Indeks unik parsial `idx_credentials_oauth_subject` (`identifier` WHERE `type='oauth'`) dan `idx_credentials_oauth_user` (`user_id` WHERE `type='oauth'`).

---

## 🔌 4. Kontrak REST API

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `POST` | `/api/auth/register` | Publik | Registrasi akun baru |
| `POST` | `/api/auth/login` | Publik | Login & terbitkan JWT token |
| `POST` | `/api/auth/refresh` | Terproteksi | Perpanjang token (sliding renewal, lihat invarian 2) |
| `POST` | `/api/auth/logout` | Terproteksi | Logout & cabut sesi perangkat |
| `POST` | `/api/auth/change-password` | Terproteksi | Ganti password & revoke seluruh sesi lain |
| `GET` | `/api/auth/sessions` | Terproteksi | Daftar sesi aktif |
| `DELETE` | `/api/auth/sessions/{id}` | Terproteksi | Remote logout sesi tertentu |
| `DELETE` | `/api/auth/me` | Terproteksi | Hapus akun permanen. Body `{password}` atau `{google_id_token}` (401 = bukti salah). Lihat invarian 6 dan 7 |
| `POST` | `/api/auth/google` | Publik | `{id_token, device_id, platform, confirm_override?, kick_device_id?}`. 200 sesi, 200 `GOOGLE_NOT_LINKED` + `link_token`, atau 409 `DEVICE_LIMIT_REACHED` |
| `POST` | `/api/auth/google/register` | Publik + `link_token` | `{link_token, username, display_name?, device_id}` → 201 sesi (akun tanpa password) |
| `POST` | `/api/auth/google/link` | Publik + `link_token` | `{link_token, username, password, device_id}` → tautkan ke akun lama + login |
| `POST` / `PUT` / `DELETE` | `/api/auth/me/google` | Terproteksi | Tautkan (`{id_token}`) / ganti (`{old_id_token, id_token}`) / putuskan (`{password}`) |
| `GET` | `/api/auth/me` | Terproteksi | Kini menyertakan `google_linked` dan `has_password` |

Respons `login`, `register`, dan semua endpoint Google memuat `has_password` dan `google_linked` (di samping `token` dan `user`) supaya klien tahu metode login akun tanpa panggilan tambahan (akun Google-only wajib re-auth Google untuk hapus akun dan reset kunci).

Kode error `code` (selain pesan `error`): `GOOGLE_NOT_CONFIGURED` (503), `GOOGLE_TOKEN_INVALID`, `GOOGLE_REAUTH_STALE`, `GOOGLE_MISMATCH`, `LINK_TOKEN_INVALID`, `INVALID_CREDENTIALS` (401), `GOOGLE_LINKED_TO_OTHER_ACCOUNT`, `ACCOUNT_ALREADY_HAS_GOOGLE`, `USERNAME_TAKEN`, `PASSWORD_LOGIN_UNAVAILABLE` (409), `VALIDATION_ERROR` (400), `GOOGLE_TENANT_NOT_ALLOWED` (403).

---

## 💻📱 5. Perilaku Antarmuka (Web & Mobile)
1. **Layar Login**: Menangani respons error 409 `DEVICE_LIMIT_REACHED` dengan memunculkan modal/dialog konfirmasi override perangkat yang menampilkan nama-nama perangkat aktif.
2. **Anti-Stale Navigation Guard**: Menggunakan `window.history.replaceState` untuk membersihkan parameter `?logout=1` agar menekan tombol Back tidak memicu auto-logout.
