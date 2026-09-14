# IMPLEMENTATION_PROGRESS.md — Atomic Task Progress

## Milestone 1: WebSocket Event Authorization Hardening (BOLA / IDOR) [SELESAI ✅]
- [x] Buat helper `isAuthorizedForRoom(roomID string) bool` pada struct `*Client` di `backend/internal/ws/client.go`
- [x] Terapkan validasi `isAuthorizedForRoom` pada `onTyping`, `onReceipt`, `onReaction`, `onMessage`, dan `onCallSignaling`
- [x] Tambahkan unit test untuk memverifikasi penolakan event dari non-member room di `backend/internal/ws/handler_test.go`
- [x] Buat E2E test suite multi-user & attacker isolation di `backend/internal/ws/e2e_full_flow_test.go`

## Milestone 2: Media ACK File Deletion IDOR Protection [SELESAI ✅]
- [x] Validasi keanggotaan room pada `POST /api/media/ack` di `backend/internal/api/media_handler.go`
- [x] Buat unit test `TestMediaHandler_AcknowledgeDownload_IDORProtection`

## Milestone 3: N+1 SQL Query Elimination in GetUserConversations & Database Indexing [SELESAI ✅]
- [x] Refactor `GetUserConversations` dari $1+3N$ queries menjadi $O(1)$ batched queries dengan CTE & Window Function
- [x] Tambahkan indeks performa pada `conversation_members` dan `messages` di auto-migration
- [x] Buat E2E integration test di `backend/internal/api/chat_and_media_e2e_test.go`

## Milestone 4: TOCTOU SSRF & DNS Rebinding Mitigation in Link Preview [SELESAI ✅]
- [x] Implementasikan `safeDialContext` dengan validasi IP saat soket TCP dibuka
- [x] Terapkan blacklist subnet privat, link-local, cloud metadata (`169.254.169.254`), CGNAT, dan IPv4-mapped IPv6
- [x] Buat E2E test suite di `backend/internal/api/link_preview_e2e_test.go`

## Milestone 5: Direct Conversation Collision Prevention & Deterministic Room IDs [SELESAI ✅]
- [x] Implementasikan relational membership lookup untuk reuse room lama
- [x] Buat deterministic room ID berbasis full UUID / SHA-256 fallback bebas tabrakan data
- [x] Buat collision stress-test & legacy compatibility test di `backend/internal/store/sql_test.go`
