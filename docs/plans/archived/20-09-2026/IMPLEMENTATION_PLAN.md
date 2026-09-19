# Implementation Plan — Milestone 8.13

## 🎯 Problem Statement
Ketika pengguna melakukan transfer kunci E2EE dari Laptop ke HP via scan QR:
1. HP memindai QR, mengunduh bundle kunci, dan mengaktifkan sesi.
2. Laptop tidak otomatis ter-logout atau memberikan respon, melainkan tetap menampilkan modal QR generator.
3. Hal ini disebabkan karena:
   - `TransferHandler.ConsumeSession` di backend belum memanggil `Hub` untuk menendang perangkat lama seketika.
   - `DeviceConflictModal` di laptop tertutup oleh `DeviceTransferModal` karena isu z-index stacking (`150` vs `160`).
   - `DeviceTransferModal` tidak mendengarkan event pergantian sesi (`wuzz:session_replaced`).

## 🛠️ Architecture & Changes
### 1. Backend (`backend/internal/...` & `backend/main.go`)
- `ws/hub.go`: Tambahkan method `KickClientByUserID(userID, exceptDeviceID, reason string)` untuk mengirim pesan kick `SESSION_REPLACED` dan menutup WebSocket secara tertib dengan Close Code 4001.
- `api/transfer_handler.go`: Suntikkan `*ws.Hub` ke `TransferHandler`. Begitu `ConsumeTransferSession` berhasil dalam transaksi DB, panggil `h.hub.KickClientByUserID(claims.UserID, req.DeviceID, ...)` secara langsung.
- `main.go`: Berikan instance `hub` ke `api.NewTransferHandler(transferStore, hub)`.

### 2. Frontend (`frontend/...`)
- `lib/ws-client.ts`: Dispatch event browser `window.dispatchEvent(new CustomEvent('wuzz:session_replaced'))` saat menerima Code 4001 atau payload `SESSION_REPLACED`.
- `app/chat/DeviceTransferModal.tsx`:
  - Tambahkan listener `wuzz:session_replaced`.
  - Jika modal sedang dalam mode `generate`, saat event pergantian sesi diterima, ubah state ke tampilan sukses transisi *"✅ Kunci Keamanan Berhasil Dipindahkan ke Perangkat Baru!"*, lalu tutup modal dalam 1.2 detik.
  - Standarisasi `z-index` backdrop ke `var(--z-modal)` (1000).
- `app/chat/DeviceConflictModal.tsx`:
  - Naikkan backdrop ke `var(--z-modal-top)` (1100) dan `zIndex: 1100` agar selalu di puncak hierarki modal.
- `app/chat/ProfileModal.tsx`:
  - Dengarkan event `wuzz:session_replaced` untuk menutup modal profil otomatis ketika perangkat telah ditendang.

## 🧪 Verification Strategy
- `go test -v ./...` di backend (memastikan seluruh suite test lolos 100%).
- `npm run build` di frontend (memastikan 0 TypeScript & lint error).
- Simulasi otomatis `transfer_handler_test.go` & integrasi WebSocket kick.
