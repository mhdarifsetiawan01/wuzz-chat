# AI Context — Mobile & Backend WebRTC Call Background Push Notification

## 🎯 Target Repositories & Subsystems
- **Backend (`backend/`)**:
  - `backend/internal/push/`: Tambahkan push notification khusus panggilan masuk (`NotifyIncomingCall`) dan pembatalan (`NotifyCallCancelled`) via FCM HTTP v1 ke subscriber perangkat mobile.
  - `backend/internal/ws/client.go` & `backend/internal/ws/hub.go`: Integrasikan trigger push notifikasi saat event `TypeCallOffer` dan `TypeCallEnd` diterima pada signaling WebRTC jika penerima sedang offline/tidak di room.
- **Mobile (`mobile/`)**:
  - `mobile/src/services/notificationService.ts`: Tambahkan Android Call Notification Channel (`wuzz_chat_calls`, importance MAX, vibration, category call) dan helper dismiss notifikasi call.
  - `mobile/src/services/notificationBackgroundTask.ts`: Tambahkan penanganan `data.type === 'call_incoming'` dan `data.type === 'call_cancelled'`.
  - `mobile/src/context/CallContext.tsx` & `mobile/App.tsx`: Handler tanggapan notifikasi panggilan masuk saat app di-*background* maupun saat *cold start* (aplikasi di-*kill*).

## 🛡️ Active Constraints
1. **Frontend Web (`frontend/`)**: TIDAK DISENTUH.
2. **Branch**: Bekerja hanya di branch `dev`.
3. **Automated Testing**: Wajib `go test -v ./...` di backend dan `npx tsc --noEmit` di mobile.
4. **Server Lifecycle**: Matikan server segera jika digunakan untuk pengujian.
5. **No Direct Git Commit**: Tunggu konfirmasi "selesai" dari user sebelum commit.
