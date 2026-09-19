# Implementation Plan — Background Delivery Receipt (Centang 2 Abu-abu Otomatis)

## 🎯 Objective
Mengatasi masalah pesan tertahan di status Centang 1 (✓ `sent`) saat aplikasi tujuan tertutup. Mengimplementasikan **Background Delivery Receipt Dual-Tier**:
1. **Gateway Delivery ACK**: Backend memperbarui status pesan menjadi `delivered` dan membroadcast `TypeReceipt` saat Web Push berhasil dikirim ke gateway FCM/APNs.
2. **Service Worker Background ACK**: Service Worker (`sw.js`) mengirim `POST /api/messages/receipt` seketika payload push mendarat di HP penerima.

## 📁 Target Modified/Created Files
- `backend/internal/push/push.go`: Menambahkan `msgID` ke payload push dan callback delivery ACK.
- `backend/internal/ws/hub.go`: Integrasi `msg.ID` dan siaran `TypeReceipt (status: delivered)`.
- `backend/internal/api/receipt_handler.go`: Endpoint HTTP `POST /api/messages/receipt`.
- `backend/cmd/server/main.go`: Registrasi route `/api/messages/receipt`.
- `frontend/lib/pushNotification.ts`: Penyimpanan token JWT ke CacheStorage (`wuzz-auth-cache`).
- `frontend/lib/auth-context.tsx`: Sinkronisasi & pembersihan token di CacheStorage saat login/logout.
- `frontend/public/sw.js`: Background delivery receipt report via `fetch()`.

## 🧪 Verification Strategy
- Backend: `go test -v ./...`
- Frontend: `npm run build`
