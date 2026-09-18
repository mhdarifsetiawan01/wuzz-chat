# Active Handover — Milestone 8.9: Mobile-Ready Reliability (Request ID + ACK Protocol & Server-Side In-Memory Idempotency)

## Status
- **Status Milestone**: Implemented & Verified ✅
- **Branch**: `dev`
- **Quality Gate**:
  - `go test -v ./...` in `backend/` ➔ **100% PASS**
  - `npm run build` in `frontend/` ➔ **100% PASS (0 errors, 0 warnings)**

## Changes Summary
1. **`backend/internal/ws/message.go`**: Menambahkan `TypeAck` dan field `RequestID string`.
2. **`backend/internal/ws/hub.go`**: Menambahkan cache deduplikasi `dedupHistory map[string]int64` dengan RWMutex dan method `IsDuplicateAndRecord`.
3. **`backend/internal/ws/client.go`**: Menambahkan method `sendAck` dan idempotency guard di `onMessage`.
4. **`frontend/lib/types.ts`**: Menambahkan `'ack'` ke `MessageType` dan `request_id?: string` ke interface `Message`.
5. **`frontend/lib/ws-client.ts`**: Menghilangkan blind pop pada `outboundQueue`, mengimplementasikan auto-retransmit saat reconnect, dan deterministic removal saat event ACK tiba.
6. **`backend/internal/ws/ack_idempotency_test.go`**: Test suite 3 skenario (`TestClient_MessageAckDispatch`, `TestHub_ServerSideIdempotency`, `TestHub_IdempotencyTTL`) — 100% PASS.
