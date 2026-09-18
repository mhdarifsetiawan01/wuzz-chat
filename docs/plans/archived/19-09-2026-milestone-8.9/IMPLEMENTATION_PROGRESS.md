# Active Implementation Progress — Milestone 8.9: Mobile-Ready Reliability (Request ID + ACK Protocol & Server-Side In-Memory Idempotency)

## Tasks Checklist
- [x] **Task 1: Protocol Struct & Constants (`backend/internal/ws/message.go`)**
  - [x] Tambahkan konstanta `TypeAck = "ack"`
  - [x] Tambahkan field `RequestID string` (`json:"request_id,omitempty"`) pada struct `Message`
- [x] **Task 2: Server-Side In-Memory Deduplication Cache (`backend/internal/ws/hub.go`)**
  - [x] Tambahkan `dedupMu sync.RWMutex` dan `dedupHistory map[string]int64` di `Hub`
  - [x] Implementasikan `IsDuplicateAndRecord(msgID string, ttl time.Duration) bool` dengan presisi `UnixNano()`
  - [x] Tambahkan periodic cleanup untuk entri yang expired saat map melebihi 2000 entri
- [x] **Task 3: Dispatcher ACK & Idempotency Guard (`backend/internal/ws/client.go`)**
  - [x] Tambahkan helper `sendAck(requestID string, status string, errMsg string)`
  - [x] Di `onMessage(msg)`: Cek `IsDuplicateAndRecord`. Jika duplicate, kirim ACK dan batalkan broadcast/save
  - [x] Di `onMessage(msg)`: Setelah broadcast sukses, kirim ACK jika `msg.RequestID != ""`
- [x] **Task 4: Client Outbound Queue & Deterministic Retransmit (`frontend/lib/`)**
  - [x] Tambahkan `'ack'` pada union `MessageType` dan `request_id?: string` di `frontend/lib/types.ts`
  - [x] Perbarui `outboundQueue` di `frontend/lib/ws-client.ts` untuk melacak `request_id`
  - [x] Pop item dari `outboundQueue` hanya ketika paket `ack` yang cocok diterima (anti-blind pop)
- [x] **Task 5: Automated Testing Suite (`backend/internal/ws/ack_idempotency_test.go`)**
  - [x] Test pengiriman pesan dengan `request_id` mengembalikan event `type: "ack"` (`TestClient_MessageAckDispatch`) — PASS
  - [x] Test pengiriman pesan duplikat dicegah dari broadcast dan hanya mengembalikan ACK (`TestHub_ServerSideIdempotency`) — PASS
  - [x] Test pembersihan TTL cache idempotency (`TestHub_IdempotencyTTL`) — PASS
- [x] **Task 6: Verification & Quality Gate**
  - [x] Jalankan `go test -v ./...` di `backend/` (100% PASS)
  - [x] Jalankan `npm run build` di `frontend/` (100% PASS)
