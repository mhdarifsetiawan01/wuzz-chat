# Implementation Progress — Post-Audit Hardening

## Milestone 1: Zero-Risk Handler Cleanup (Eliminasi Dual-Path Debt)
- [x] Task 1.1: Pembersihan `internal/api/auth_handler.go` (hapus fallback store di Login/Register/Sessions/Password).
- [x] Task 1.2: Pembersihan `internal/api/chat_handler.go` (hapus fallback store di DirectChat/Clear/Edit/Delete/Pin/Forward).
- [x] Task 1.3: Pembersihan `internal/api/group_handler.go` (hapus fallback store & dead fields di Group CRUD/Subgroup/Members).
- [x] Task 1.4: Pembersihan `internal/api/memory_handler.go` (hapus dead struct fields di MemoryHandler).
- [x] Task 1.5: Simplifikasi constructor di `internal/app/wire.go` & sinkronisasi dependensi handler.
- [x] Task 1.6: Verifikasi full Go test suite & frontend compilation (100% PASS).

## Milestone 2: Realtime Message Ingestion Decoupling (Route WS via MessageService)
- [x] Task 2.1: Definisikan use cases `SaveIncomingMessage`, `HandleReceiptUpdate`, `HandleReactionToggle` di `messaging.MessageService`.
- [x] Task 2.2: Suntikkan domain message manager (`messagingRepo`) ke dalam `ws.Hub` di `internal/app/wire.go`.
- [x] Task 2.3: Refactor `internal/ws/client.go` untuk mendelegasikan persistensi & receipts ke `Hub` message manager.
- [x] Task 2.4: Refactor `internal/ws/hub.go` untuk mengekapsulasi kueri pesan ke thread-safe message manager.
- [x] Task 2.5: Verifikasi full suite test WebSocket, backend unit/integration, dan real frontend proxy (100% PASS).

## Milestone 3: Mobile Gateway Readiness (Device Platform & Multi-Push Architecture)
- [x] Task 3.1: Tambahkan field `Platform` (`web`, `android`, `ios`) pada `authz.RegisterInput`, `authz.LoginInput`, dan HTTP parsing.
- [x] Task 3.2: Perbarui pencatatan device di `device_store.go` & `user_store.go` agar menyimpan platform aktual.
- [x] Task 3.3: Abstraksi `PushProvider` interface di `internal/push/push.go` (VAPID + FCM v1 scaffolding).
- [x] Task 3.4: Verifikasi penuh flow multi-platform dan push notification tests (100% PASS).
