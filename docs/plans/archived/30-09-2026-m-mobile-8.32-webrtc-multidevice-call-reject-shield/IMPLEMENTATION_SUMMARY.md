# Implementation Summary — Multi-Device Call Reject Teardown Bug

## Executive Summary
Fix unexpected call disconnection when User B is logged into multiple devices and answers on Device 1, while Device 2 rejects the call or sends a late reject.

## Target Changes
1. **`backend/internal/ws/hub.go`**:
   - In `broadcastLocal`: Exclude `TypeCallOffer` and `TypeIceCandidate` from self-user devices, but allow `TypeCallAnswer` so secondary devices receive notice that the call was answered.
   - In `BroadcastWithSenderKey`: If `msg.Type == TypeCallReject` and `call.Status == "answered"`, safely drop the late reject, do not delete the active call, and do not broadcast `call_reject`.
2. **`mobile/src/context/CallContext.tsx`**:
   - In `unsubReject`: Guard against `current.status === 'connected'`.
   - In `unsubAnswer`: Dismiss call push notifications on secondary device when call answered.
3. **`frontend/app/chat/page.tsx`**:
   - In `case 'call_reject'`: Guard against `activeCall?.status === 'connected'`.
   - In `case 'call_answer'`: Dismiss modal if `!activeCall.isCaller && activeCall.status === 'incoming_ringing'`.
4. **Backend Automated Tests**:
   - Add `TestHub_MultiDeviceCallRejectAfterAnswer` in `backend/internal/ws/hub_test.go`.
