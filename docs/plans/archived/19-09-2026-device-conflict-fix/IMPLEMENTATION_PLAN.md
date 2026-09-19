# Active Implementation Plan

## Tujuan
Memperbaiki alur pembatalan konflik perangkat agar ketika perangkat penantang (Device 2) memilih *"Batalkan & Keluar"*, sesi perangkat aktif utama (Device 1) tetap terlindungi 100% dan `active_device_id` tidak terhapus dari database.

## Rencana Perubahan
1. **Backend**:
   - `backend/internal/store/user_store.go`: `ClearActiveDevice` mengecek kesesuaian `deviceID`.
   - `backend/internal/api/auth_handler.go`: `Logout` mengekstrak `device_id` dari request.
   - `backend/internal/api/auth_logout_test.go`: Test skenario isolasi device logout.
2. **Frontend**:
   - `frontend/lib/auth-context.tsx`: Tambah `localLogout` & kirim `device_id` pada normal `logout`.
   - `frontend/app/chat/page.tsx`: Pakai `localLogout` di `handleDeviceConflictLogout` saat `!isRotated`.
   - `frontend/app/chat/DeviceConflictModal.tsx`: Verifikasi tombol pembatalan.

## Verifikasi
- `go test -v ./...`
- `npm run build`
