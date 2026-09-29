# AI Context — Multi-Device Call Reject Teardown Bug

## 1. Domain & Boundaries
- **Project**: Wuzz Chat
- **Subsystem**: WebRTC 1-on-1 Audio Calling & WebSocket Signaling Hub
- **Components Impacted**:
  - `backend/internal/ws/hub.go` (Signaling broadcast & call state tracking)
  - `mobile/src/context/CallContext.tsx` (Signaling event listener & state guards)
  - `frontend/app/chat/page.tsx` (Signaling parity & multi-device answer handling)

## 2. Issue Description
- User A calls User B (who is logged in on 2 devices: Device 1 & Device 2).
- User B answers the call using Device 1.
- When Device 2 rejects the call (or late reject arrives), Device 1 (which was already in an active connected call) unexpectedly gets disconnected/torn down.

## 3. Root Cause Analysis
1. **Signaling Filter Mismatch (`backend/internal/ws/hub.go`)**:
   `TypeCallAnswer` was included in the exclusion filter that skips forwarding signaling messages to clients belonging to the sender (`client.ID == msg.From`). Because Device 2 belongs to the same user (`User B`), Device 2 was blocked from receiving `call_answer`. As a result, Device 2 never knew the call was answered elsewhere and kept ringing.
2. **Missing Active Call State Guard on Reject (`backend/internal/ws/hub.go`)**:
   When `call_reject` was received, the Hub blindly deleted the call state (`delete(h.activeCalls, roomID)`) and broadcast `call_reject` to the room without checking if the call was already in `answered` status.
3. **Missing Connected State Guard on Client (`mobile/src/context/CallContext.tsx` & `frontend/app/chat/page.tsx`)**:
   When `unsubReject` received `call_reject`, neither mobile nor web verified whether `current.status === 'connected'`. Consequently, any late or secondary device reject terminated the active call on both Device 1 and User A.
