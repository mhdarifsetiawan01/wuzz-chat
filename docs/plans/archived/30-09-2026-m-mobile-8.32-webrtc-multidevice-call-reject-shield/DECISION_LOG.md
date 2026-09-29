# Decision Log — Multi-Device Call Reject Teardown Bug

- **DEC-CALL-01 (Multi-Device Answer Delivery)**:
  `TypeCallAnswer` must be delivered to secondary devices of the callee (matching `client.ID == msg.From`) so that secondary devices can recognize that the call has been answered elsewhere and immediately silence their ringtone and dismiss `IncomingCallModal`.
- **DEC-CALL-02 (Answered State Shield Against Reject)**:
  Once a call enters the `"answered"` state, it represents an active peer-to-peer conversation. A `call_reject` event sent by a secondary device (or received out-of-order due to network latency) is invalid and must not destroy the active session. The hub will drop the late reject, and clients will ignore `call_reject` while in the `connected` state.
