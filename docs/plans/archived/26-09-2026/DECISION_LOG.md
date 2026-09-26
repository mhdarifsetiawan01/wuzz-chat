# Decision Log — Milestone M-Mobile-8.9

## Architectural & Technical Decisions

### DEC-022: Local-Only Session Abort on Key Conflict Cancellation
- **Context**: Sesuai `docs/MOBILE_INTEGRATION_GUIDE.md` Section 2B line 84: *"Jika menerima HTTP 409 Conflict (`KEY_ALREADY_REGISTERED`), tampilkan dialog konfirmasi apakah pengguna ingin mereset kunci ke perangkat ini via `POST /api/users/public-key/reset`. Jika pengguna membatalkan dialog tersebut, **hanya bersihkan sesi lokal tanpa memanggil `POST /api/auth/logout` ke server**, agar sesi aktif perangkat utama tidak terganggu."*
- **Decision**: Saat pengguna memilih opsi "Batal / Keluar" di `KeyConflictModal`:
  1. Hapus token dan user profile di `secureStorage` perangkat ini.
  2. Putus socket lokal dan kembalikan state navigasi ke `LoginScreen`.
  3. DILARANG memanggil endpoint `POST /api/auth/logout` ke server backend.
- **Consequences**: Sesi perangkat utama (HP lama atau Web) yang sedang memegang kunci aktif tidak akan terputus karena server tidak menerima perintah logout untuk user tersebut.

### DEC-023: Two-Phase Password Verification Flow in `KeyConflictModal`
- **Context**: Mereset kunci keamanan adalah operasi kritis yang akan menggantikan kunci publik akun di backend dan meng-kick sesi perangkat lama. Oleh karena itu, backend mewajibkan verifikasi kata sandi (`password`) pada `POST /api/users/public-key/reset`.
- **Decision**: Modal didesain dengan 2 tahap tampilan (*two-phase state*):
  - **Fase 1**: Edukasi konflik perangkat dengan 2 tombol aksi ("Reset Kunci ke Perangkat Ini" dan "Batal").
  - **Fase 2**: Input password dengan penyamaran teks (`secureTextEntry`), loading spinner saat request ke API, dan pesan error jika password salah.
- **Consequences**: Pengguna terlindungi dari reset kunci yang tidak disengaja dan mendapatkan feedback langsung jika password salah.
