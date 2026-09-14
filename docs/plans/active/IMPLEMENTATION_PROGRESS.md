# IMPLEMENTATION_PROGRESS.md — Atomic Task Progress

## Milestone 1: WebSocket Event Authorization Hardening (BOLA / IDOR) [SELESAI ✅]
- [x] Buat helper `isAuthorizedForRoom(roomID string) bool` pada struct `*Client` di `backend/internal/ws/client.go`
- [x] Terapkan validasi `isAuthorizedForRoom` pada `onTyping`, `onReceipt`, `onReaction`, dan `onCallSignaling`
- [x] Tambahkan unit test untuk memverifikasi penolakan event dari non-member room di `backend/internal/ws/handler_test.go`
- [x] Verifikasi seluruh test suite backend (`go test -v ./...`) dan build frontend (`npm run build`)
