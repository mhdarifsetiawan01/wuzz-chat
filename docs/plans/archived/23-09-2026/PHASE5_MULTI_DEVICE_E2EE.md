# Phase 5 — Multi-Device E2EE Continuity (Shared Master Key Pattern) [APPROVED - Opsi A]

## Status: IN PROGRESS
- **Pilihan User**: Q1 Opsi A (Reload otomatis tanpa logout). Batas perangkat: 2 (default).
- **Target**: Memungkinkan 2 perangkat aktif bersamaan dengan kunci E2EE yang sama via QR Transfer tanpa konflik atau auto-kick.

## Latar Belakang & Masalah yang Diselesaikan
1. `UpdatePublicKeyWithDevice()` di `user_store.go` mengembalikan `ErrKeyConflict` (HTTP 409) ketika perangkat ke-2 mencoba mendaftarkan E2EE key-nya ke server — karena server tidak membedakan apakah key yang dikirim identik atau berbeda dengan yang sudah tersimpan.
2. `ConsumeSession()` di `transfer_handler.go` memanggil `KickClientByUserID()` dan `RevokeAllOtherSessions()` setelah QR Transfer sukses — yang menendang perangkat pertama.
3. `DeviceTransferModal.tsx` memanggil `logout()` dan redirect ke `/login` setelah QR Transfer sukses.

## Rencana Perubahan
1. `backend/internal/store/user_store.go`:
   - Izinkan update/pendaftaran public key jika `strings.TrimSpace(pubKey) == trimmedKey` (key-matching) meskipun `active_device_id != trimmedDev`.
2. `backend/internal/api/transfer_handler.go`:
   - Hapus pemanggilan `KickClientByUserID` dan `RevokeAllOtherSessions` di `ConsumeSession`. Keduanya tetap aktif.
3. `frontend/app/chat/DeviceTransferModal.tsx`:
   - Setelah QR Transfer sukses, jangan panggil `logout()`. Tampilkan notifikasi sukses dan reload halaman otomatis (`window.location.reload()`).
4. Unit & Integration Testing:
   - `backend/internal/store/user_store_multidevice_test.go`
   - `backend/internal/api/multidevice_e2ee_test.go`
   - Automated testing: `go test -v ./...` dan `npm run build`.

