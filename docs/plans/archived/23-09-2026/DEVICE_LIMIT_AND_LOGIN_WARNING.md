# Archived Implementation Plan — Login Device Limit Guard & Interactive Eviction Modal

**Tanggal:** 23 September 2026  
**Status:** SELESAI & TERVERIFIKASI ✅

---

## 1. Overview
Mengatasi celah ketiadaan peringatan dini di halaman login ketika pengguna mencoba masuk dari perangkat ke-3 padahal kuota 2 perangkat bersamaan telah terpenuhi. Mencegah kebingungan saat perangkat ke-3 masuk ke ruang chat dan terhalang konflik enkripsi E2EE / WebSocket Hub eviction.

## 2. Arsitektur Solusi
1. **Backend Auth Gate (`backend/internal/api/auth_handler.go`)**:
   - Menambahkan field `confirm_override` dan `kick_device_id` pada `LoginRequest`.
   - Menghitung jumlah perangkat aktif via `GetUserDevices`.
   - Mengembalikan HTTP 409 Conflict (`DEVICE_LIMIT_REACHED`) jika kuota $\ge 2$ dan `confirm_override == false`.
   - Saat `confirm_override == true`: deaktifkan perangkat lama (`DeactivateDevice`), cabut sesi di database (`RevokeDeviceSessions`), dan kick koneksi WebSocket secara real-time (`KickClientByDeviceID`).
2. **Session Store Device Revocation (`backend/internal/store/session_store.go`)**:
   - Method `RevokeDeviceSessions(deviceID, userID string) error` untuk mencabut seluruh JWT aktif yang terikat pada perangkat tersebut.
3. **Frontend Interaktif (`frontend/app/login/DeviceLimitModal.tsx` & `page.tsx`)**:
   - `DeviceLimitModal` dengan desain token `DESIGN.md`.
   - Menampilkan daftar perangkat aktif, ikon platform, waktu aktivitas terakhir, dan penanda "Paling Lama".
   - Mengintegrasikan `useModalBackHandler` untuk penanganan tombol Back di browser mobile.
   - Pilihan radio button untuk menentukan perangkat mana yang dikeluarkan.
4. **API Helper (`frontend/lib/api.ts`)**:
   - Memastikan `apiRequest` menyertakan `data: result` saat terjadi status error non-OK (409).

## 3. Hasil Pengujian & Verifikasi
- Backend Test Suite: `go test -v ./internal/api/ -run TestAuthHandler_DeviceLimitFlow` -> PASS.
- Backend Full Suite: `go test -v ./...` -> PASS 100%.
- Frontend Build: `npm run build` -> PASS 100% (Next.js 16 Turbopack, 0 error).
- Frontend Simulation: `npm run test:device-limit` -> PASS 100% (3/3 skenario).
- Frontend Regressions: `npm run test:cache`, `npm run test:multi-device`, `npm run test:phase5` -> PASS 100%.
