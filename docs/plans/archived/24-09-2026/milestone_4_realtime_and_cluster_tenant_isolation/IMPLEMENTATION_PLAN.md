# IMPLEMENTATION_PLAN.md — Milestone 4: Realtime & Cluster Envelope Tenant Isolation

## 1. Executive Overview
Mengacu pada blueprint kanonikal `docs/TENANT_ENGINE_MASTER_PLAN.md` Bagian 6, Milestone 4 bertugas membangun isolasi tenant mutlak pada layer realtime in-memory (Gorilla WebSocket Hub) dan multi-instance cluster bus (Redis Pub/Sub). Sistem harus menjamin bahwa dua client dari tenant yang berbeda tidak akan pernah saling menerima pesan chat, room presence, direct message, WebRTC signaling, maupun session kick, meskipun memiliki ID room atau ID user yang identik.

---

## 2. Technical Architecture & Data Flow

```text
[Client A (tenant_id: alpha)]             [Client B (tenant_id: beta)]
       │                                              │
       │ (WS Handshake + JWT Claims)                  │ (WS Handshake + JWT Claims)
       ▼                                              ▼
[ws.Handler] ──> Set client.TenantID = "alpha"   [ws.Handler] ──> Set client.TenantID = "beta"
       │                                              │
       ▼                                              ▼
[ws.Hub In-Memory]                            [ws.Hub In-Memory]
       │                                              │
       ├─ Both joined "room-lobby"                    ├─ Both joined "room-lobby"
       │                                              │
       ▼ (Client A sends msg to "room-lobby")         │
[broadcastLocal("room-lobby", msg, ...)]              │
       │                                              │
       ├─ Target: Client A (Tenant: alpha) ──> OK ✅  │
       └─ Target: Client B (Tenant: beta)  ──> REJECTED! (alpha != beta) 🛡️
       │
       ▼ (Publish to Redis Pub/Sub Cluster)
[ClusterEvent Envelope]
  NodeID: node-1
  TenantID: "alpha"
  RoomID: "room-lobby"
  Message: { ... TenantID: "alpha" }
       │
       ▼ (Redis Channel: "wuzz:cluster:events")
[Remote Node 2 Hub Subscriber]
  Event received: TenantID = "alpha"
  Target Local Clients:
    - Client C (Tenant: alpha) ──> DELIVERED ✅
    - Client D (Tenant: beta)  ──> DROPPED! (alpha != beta) 🛡️
```

---

## 3. Detailed Component Plan

### A. In-Memory Client Scoping (`client.go` & `handler.go`)
1. Struct `Client`:
   - Tambahkan field `TenantID string` di `backend/internal/ws/client.go`.
   - Di constructor `NewClient`, set fallback default `TenantID: "default"`.
   - Di `ReadPump`, paksa override `msg.TenantID = c.TenantID` dan `msg.From = c.ID` untuk mencegah spoofing JSON.
   - Di seluruh event handler (`onMessage`, `onReceipt`, `onTyping`, `onReaction`, `onCallSignaling`), pastikan `msg.TenantID = c.TenantID`.
2. Handshake HTTP Upgrade (`handler.go`):
   - Di `Handler.ServeHTTP`, ekstrak `claims.TenantID`. Jika kosong, fallback ke `"default"`.
   - Set ke `client.TenantID`.

### B. Message Struct Update (`message.go`)
- Tambahkan field `TenantID string json:"tenant_id,omitempty"` pada struct `Message` di `backend/internal/ws/message.go`.

### C. Multicast Room & Direct Message Tenant Isolation (`hub.go`)
1. `broadcastLocal(roomID string, msg Message, senderKey string)`:
   - Evaluasi `msgTenant := msg.TenantID` (fallback `"default"`).
   - Saat memfilter `h.rooms[roomID]` dan `memberIDs`:
     Pastikan `client.TenantID` (fallback `"default"`) sama persis dengan `msgTenant`. Jika berbeda, abaikan (`continue`).
2. `BroadcastRoomUsers(roomID string)`:
   - Kelompokkan client yang aktif di room berdasarkan `TenantID`.
   - Bentuk list user per tenant (`users`), dan kirimkan `TypeRoomUsers` hanya ke client milik tenant tersebut.
3. `NotifyUser(userID string, msg Message)`:
   - Validasi bahwa `target.TenantID == msgTenant` sebelum mengirimkan pesan ke channel client.
4. `NotifyUsers(userIDs []string, msg Message)`:
   - Hanya masukkan target client yang memiliki `c.TenantID == msgTenant`.
   - Publish ke Redis cluster dengan `ClusterEvent.TenantID = msgTenant`.
5. `KickClientByUserID` & `KickClientByDeviceID`:
   - Tambahkan parameter opsional `tenantID ...string`.
   - Saat kick lokal dan publish cluster event, sertakan `TenantID`.
   - Pada subscriber cluster kick, hanya tendang koneksi yang memiliki `client.TenantID == event.TenantID`.

### D. Cluster Event Envelope (`hub.go`)
1. Struct `ClusterEvent`:
   - Tambahkan field `TenantID string json:"tenant_id"` di `backend/internal/ws/hub.go`.
2. Publishing ke Redis Pub/Sub:
   - Pada `BroadcastRoom`, `BroadcastGroupSystemEvent`, `NotifyUsers`, `KickClientByUserID`, dan `KickClientByDeviceID`:
     Isi field `TenantID` dengan `msg.TenantID` / tenant pengirim (fallback `"default"`).
3. Subscriber Redis Pub/Sub:
   - Ekstrak `event.TenantID` (fallback `"default"` jika kosong).
   - Pastikan `event.Message.TenantID = event.TenantID`.
   - Distribusi lokal (`NotifyUser`, `broadcastLocal`, `kickClientByUserIDLocal`, `kickClientByDeviceIDLocal`) otomatis terfilter oleh `TenantID`.

---

## 4. Verification & Testing Strategy
1. **Unit Test Suite Dedicated**: `backend/internal/ws/hub_tenant_isolation_test.go`:
   - **Test 1 (`TestHub_LocalRoom_TenantIsolation`)**: Dua client (`client-alpha` di `tenant-a` dan `client-beta` di `tenant-b`) bergabung ke room `"shared-lobby"`. Client alpha kirim pesan. Verifikasi: Client alpha menerima ACK/receipt, Client beta TIDAK menerima pesan sama sekali.
   - **Test 2 (`TestHub_BroadcastRoomUsers_TenantIsolation`)**: Dua client dari tenant berbeda di room yang sama menerima `room_users` yang hanya berisi member dari tenant masing-masing.
   - **Test 3 (`TestHub_ClusterSync_TenantIsolation`)**: Node A (Client di `tenant-a`) dan Node B (Client di `tenant-b`) terhubung via InMemoryBroker di room yang sama. Node A broadcast pesan room. Verifikasi: Client di Node B tidak menerima pesan karena beda tenant.
   - **Test 4 (`TestHub_ClusterSync_SameTenant_Success`)**: Node A dan Node B dengan client di `tenant-a` yang sama. Verifikasi: Pesan sukses tersinkronisasi antar node cluster.
   - **Test 5 (`TestHub_DirectMessage_TenantIsolation`)**: `NotifyUser` dan signaling WebRTC tidak bocor ke user ber-ID sama di tenant lain.
   - **Test 6 (`TestHub_ClusterKick_TenantIsolation`)**: Session kick dari satu tenant tidak menendang user dari tenant lain.
2. **Regression Testing**:
   - Jalankan seluruh test suite backend: `go test -v ./...`.
   - Jalankan frontend build: `npm run build` di `frontend/`.
