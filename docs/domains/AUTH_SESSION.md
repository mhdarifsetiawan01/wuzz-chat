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

---

## 🏛️ 2. Model Backend DDD (`backend/internal/authz/`)

```text
backend/internal/authz/
├── entity.go         # Entitas: User, UserCredential, Session, Device, RevokedToken
├── repository.go     # Interface AuthRepository & DeviceRepository
├── service.go        # AuthService (Login, Register, ChangePassword, RevokeSession)
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

- `user_credentials`: `user_id` (PK, FK `users.id`), `password_hash`, `key_salt`, `updated_at`.
- `sessions`: `id` (PK, UUID), `user_id` (FK), `token_hash`, `device_id`, `created_at`, `expires_at`, `revoked_at`.
- `devices`: `id` (PK, UUID), `user_id` (FK), `device_id`, `device_name`, `platform` (`web`/`android`/`ios`), `push_token`, `last_active_at`.
- `revoked_tokens`: `jti` (PK, VARCHAR), `user_id`, `revoked_at`, `expires_at`.

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

---

## 💻📱 5. Perilaku Antarmuka (Web & Mobile)
1. **Layar Login**: Menangani respons error 409 `DEVICE_LIMIT_REACHED` dengan memunculkan modal/dialog konfirmasi override perangkat yang menampilkan nama-nama perangkat aktif.
2. **Anti-Stale Navigation Guard**: Menggunakan `window.history.replaceState` untuk membersihkan parameter `?logout=1` agar menekan tombol Back tidak memicu auto-logout.
