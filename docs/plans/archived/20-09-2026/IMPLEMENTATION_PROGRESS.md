# Implementation Progress

## Checklist
- [x] Task 1: Backend Store — Implementasi `GetSubGroupAdmins` & `pending_requests_count` di `group_store.go`
- [x] Task 2: Backend Push & Hub — Implementasi `NotifyUsers` di `push.go` dan `hub.go`
- [x] Task 3: Backend API Handler — Integrasi notifikasi di `handleRequestToJoinSubGroup` dan `handleRespondJoinRequest` di `group_handler.go`
- [x] Task 4: Backend Unit Tests — Uji verifikasi logic notifikasi dan resolusi admin subgrup
- [x] Task 5: Frontend Types & SubGroupListDrawer — Tampilkan badge counter pending requests & toast notifikasi
- [x] Task 6: Frontend WebSocket Listener — Tangani event `join_request` di `page.tsx`
- [x] Task 7: Automated Verification — Eksekusi `go test -v ./...` dan `npm run build`
