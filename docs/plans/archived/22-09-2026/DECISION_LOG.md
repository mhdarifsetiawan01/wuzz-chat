# Decision Log — Phase 1: Session Foundation

### DEC-014: Stateful Session Tracking dengan JTI Binding
- **Konteks**: Token JWT bersifat *stateless*. Tanpa tabel sesi, pengguna tidak dapat menginspeksi di perangkat/peramban mana saja akun mereka sedang terhubung atau mencabut akses satu sesi tanpa mengganti seluruh kredensial password.
- **Keputusan**: Mengikat JTI (UUID unik dari klaim JWT) sebagai `PRIMARY KEY` pada tabel `sessions`. Menyimpan metadata `device_id`, `user_agent`, `ip_address`, `expires_at`, dan status `is_revoked`.
- **Rasional**:
  1. Kompatibilitas 100% tanpa mengubah format token atau merusak klien yang ada.
  2. Memungkinkan pencabutan sesi secara presisi per-perangkat tanpa memaksa semua perangkat logout.
  3. Membuka jalan mulus menuju *Phase 2 (Device Registry)* dan *Phase 4 (Passkey)*.
