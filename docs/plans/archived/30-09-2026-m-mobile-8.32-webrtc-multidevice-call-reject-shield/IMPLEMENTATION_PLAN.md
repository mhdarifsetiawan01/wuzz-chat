# Implementation Plan — Multi-Device Call Reject Teardown Bug

## 1. Goal
Ensure that answering a call on Device 1 stops ringing on Device 2, and that rejecting on Device 2 does NOT disconnect or terminate the active call on Device 1.

## 2. Targeted Files
- `backend/internal/ws/hub.go`
- `backend/internal/ws/hub_test.go`
- `mobile/src/context/CallContext.tsx`
- `frontend/app/chat/page.tsx`

## 3. Detailed Architecture & Design
1. **Backend Relay Filter (`hub.go:broadcastLocal`)**:
   - Change `(msg.Type == TypeCallOffer || msg.Type == TypeCallAnswer || msg.Type == TypeIceCandidate)` to `(msg.Type == TypeCallOffer || msg.Type == TypeIceCandidate)`.
   - Result: When Callee answers on Device 1, `call_answer` is delivered to Callee's other devices (Device 2) so they can stop ringing and dismiss `IncomingCallModal`.
2. **Backend Call State Guard (`hub.go:BroadcastWithSenderKey`)**:
   - When `msg.Type == TypeCallReject`, inspect `h.activeCalls[roomID]`.
   - If `call != nil && call.Status == "answered"`, log a warning and return early (do not delete active call, do not forward reject).
3. **Mobile Client State Guard (`CallContext.tsx:unsubReject`)**:
   - If `current.status === 'connected'`, ignore `call_reject` and return early.
   - When receiving `call_answer` on secondary device, call `notificationService.dismissNotification('call_' + current.room)`.
4. **Web Frontend State Guard (`page.tsx:case 'call_reject' & 'call_answer'`)**:
   - If `activeCall?.status === 'connected'`, ignore `call_reject`.
   - If `call_answer` received while `!activeCall.isCaller && activeCall.status === 'incoming_ringing'`, stop sounds and dismiss modal.

## 4. Verification Strategy
1. Go automated test: `go test -v ./internal/ws -run TestHub_MultiDeviceCallRejectAfterAnswer`.
2. Full backend tests: `go test -v ./...`.
3. Frontend build & typecheck: `npm run build` in `frontend/`.
4. Mobile typecheck: `npx tsc --noEmit` in `mobile/`.
