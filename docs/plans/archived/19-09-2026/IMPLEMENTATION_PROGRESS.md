# Active Implementation Progress — Milestone 8.8: Realtime Engine Scalability & High-ROI Optimizations

## Tasks Checklist
- [x] **Task 1: Core Fanout & Direct Member Lookup in Hub (`backend/internal/ws/hub.go`)**
  - [x] Implementasikan in-memory membership cache `roomMembersCache` di Hub
  - [x] Refactor `broadcastLocal` dari loop $O(N)$ seluruh `h.clients` menjadi direct lookup $O(M)$ berdasarkan member IDs
  - [x] Eliminasi query database berulang pada setiap pesan masuk
- [x] **Task 2: Backend Typing Rate Limiter (`backend/internal/ws/client.go`)**
  - [x] Tambahkan sliding-window rate limit pada method `onTyping()`
- [x] **Task 3: Delta Offline Sync with Timestamp Checkpoint (`backend/` & `frontend/`)**
  - [x] Tambahkan field `Since` pada `ws.Message` di `backend/internal/ws/message.go` dan `frontend/lib/types.ts`
  - [x] Implementasikan query `GetRoomHistorySince` di `backend/internal/store/` (SQL & In-Memory)
  - [x] Hubungkan parameter `since` dari `onJoin` ke `sendRoomHistory` di `hub.go`
  - [x] Update frontend `frontend/app/chat/page.tsx` untuk menyertakan `since` timestamp dari IndexedDB cache saat join room
- [x] **Task 4: Client-Side Outbound Queue & Auto-Retry (`frontend/lib/ws-client.ts`)**
  - [x] Tambahkan FIFO `outboundQueue` di `WsClient`
  - [x] Tahan pesan jika socket belum `OPEN` dan flush otomatis saat `onopen`
- [x] **Task 5: Automated Testing & Verification Suite**
  - [x] Tambahkan test case unit untuk Fanout O(M), typing rate-limit, dan history since di `backend/internal/ws/scalability_optimizations_test.go`
  - [x] Jalankan `go test -v ./...` di `backend/` (100% PASS)
  - [x] Jalankan `npm run build` di `frontend/` (100% PASS)
