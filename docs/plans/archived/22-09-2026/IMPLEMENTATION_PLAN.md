# Implementation Plan — Otomatisasi Pencabutan Sesi (Transfer, Reset, Keluar)

- **Tujuan**: Memastikan pencabutan sesi (session revocation), penendangan WebSocket, dan auto-redirect 401 bekerja secara komprehensif di seluruh skenario:
  1. Transfer Kunci E2EE via QR / Kode.
  2. Reset Kunci E2EE dengan Verifikasi Password.
  3. Keluar (Logout) Akun & Penanganan Konflik Perangkat.
- **Komponen Terdampak**:
  - `backend/internal/api/transfer_handler.go`: Injeksi `sessionStore` & revoke sesi perangkat lain saat `ConsumeSession`.
  - `backend/internal/api/auth_handler.go`: Injeksi `hub WebSocketHub`, revoke sesi lain & kick client saat `ResetPublicKey`, serta pastikan WebSocket ditutup saat `Logout`.
  - `backend/main.go`: Sambungkan dependensi `sessionStore` dan `hub`.
  - `frontend/app/chat/DeviceTransferModal.tsx`: Panggil `logout()` otomatis setelah pesan transfer berhasil.
  - `frontend/app/chat/page.tsx`: Panggil `logout()` pada `handleDeviceConflictLogout`.
