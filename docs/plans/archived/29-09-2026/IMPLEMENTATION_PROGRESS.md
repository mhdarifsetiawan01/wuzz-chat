# Implementation Progress — WebRTC Call Background Push Notification

## 📋 Task Checklist

### Milestone 1: Backend Call Push Notification Dispatch
- [x] 1.1 Implementasi `NotifyIncomingCall` di `backend/internal/push/push.go`
- [x] 1.2 Implementasi `NotifyCallCancelled` di `backend/internal/push/push.go`
- [x] 1.3 Integrasikan pengecekan offline peer dan trigger push pada `TypeCallOffer` & `TypeCallEnd` di `backend/internal/ws/client.go` / `hub.go`
- [x] 1.4 Tambahkan unit test di `backend/internal/push/push_test.go` dan verifikasi seluruh test Go lulus (`go test ./...`)

### Milestone 2: Mobile Call Notification Channel & Background Task
- [x] 2.1 Tambahkan notification channel `wuzz_chat_calls` dengan `importance: MAX` di `mobile/src/services/notificationService.ts`
- [x] 2.2 Implementasi helper pembatalan / dismiss notifikasi panggilan masuk di `notificationService.ts`
- [x] 2.3 Tambahkan penanganan `call_incoming` dan `call_cancelled` di `mobile/src/services/notificationBackgroundTask.ts`

### Milestone 3: Mobile UI & Cold Start Call Context Integration
- [x] 3.1 Integrasikan penanganan payload `call_incoming` pada tap notifikasi di `mobile/App.tsx`
- [x] 3.2 Dukung peluncuran sesi panggilan masuk dari data push di `mobile/src/context/CallContext.tsx`
- [x] 3.3 Tambahkan helper `ensureConnected` di `mobile/src/services/websocket.ts` untuk cold-start reliability
- [x] 3.4 Verifikasi typecheck mobile dengan `npx tsc --noEmit`

### Milestone 4: Final Quality Audit & Handover
- [x] 4.1 Eksekusi automated test penuh: `backend/` (`go test ./...` 100% PASS) dan `mobile/` (`npx tsc --noEmit` 0 error)
- [x] 4.2 Siapkan ringkasan handover dan konfirmasi penyelesaian ke pengguna
