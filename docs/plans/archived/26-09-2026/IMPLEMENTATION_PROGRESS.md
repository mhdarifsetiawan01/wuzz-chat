# Implementation Progress — Milestone M-Mobile-8.11

## 📋 Task Checklist

- [x] **Task 1: WebSocket Signaling Methods (`mobile/src/services/websocket.ts`)**
  - [x] Implementasi method `sendCallOffer(room, sdp, targetUserId)`
  - [x] Implementasi method `sendCallAnswer(room, sdp)`
  - [x] Implementasi method `sendIceCandidate(room, candidate)`
  - [x] Implementasi method `sendCallReject(room)`
  - [x] Implementasi method `sendCallEnd(room)`
  - [x] Implementasi method `sendCallBusy(room)`

- [x] **Task 2: Call Audio Manager & Device Permissions (`mobile/src/services/callAudioManager.ts` & `app.json`)**
  - [x] Deklarasi permissions Android (`RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `INTERNET`) dan iOS `NSMicrophoneUsageDescription` di `mobile/app.json`
  - [x] Implementasi runtime permission guard (`requestRecordingPermissionsAsync`) sebelum memulai / menerima panggilan
  - [x] Inisialisasi audio mode untuk calling (`expo-audio`)
  - [x] Route toggling: Speakerphone (`shouldRouteThroughEarpiece: false`) vs Earpiece (`shouldRouteThroughEarpiece: true`)
  - [x] Generator nada sambung (ringback) & nada dering masuk (ringtone)
  - [x] Lifecycle cleanup resource audio saat panggilan berakhir

- [x] **Task 3: WebRTC Calling Service & State Machine (`mobile/src/services/webrtcService.ts`)**
  - [x] Definisi tipe state panggilan (`CallState`, `CallSession`)
  - [x] Setup STUN/TURN server configuration matching Web frontend
  - [x] Manajemen antrian ICE candidates & SDP negotiation flow
  - [x] State transition handling (`idle` ➔ `outgoing_calling` ➔ `incoming_ringing` ➔ `connecting` ➔ `connected` ➔ `ended`)

- [x] **Task 4: React Call Context & Global Hook (`mobile/src/context/CallContext.tsx`)**
  - [x] Hubungkan event WebSocket signaling ke state panggilan global
  - [x] Timer durasi panggilan aktif real-time
  - [x] Expose aksi: `startCall`, `acceptCall`, `rejectCall`, `endCall`, `toggleMute`, `toggleSpeaker`

- [x] **Task 5: Mobile Call UI Components & Header Integration**
  - [x] Tombol `📞` panggil suara di `mobile/src/screens/ChatScreen.tsx` (1-on-1 chat)
  - [x] `IncomingCallModal.tsx`: Modal panggilan masuk bertema Aurora Dark Mode
  - [x] `ActiveCallOverlay.tsx`: Overlay panggilan aktif dengan tombol aksi terpadu
  - [x] Pasang `CallProvider` & modal/overlay di root `mobile/App.tsx`

- [x] **Task 6: Verification, Automated Testing & Documentation**
  - [x] Automated typecheck `npx tsc --noEmit` di `mobile/` (0 error)
  - [x] Backend test `go test -v ./...` di `backend/` (100% lulus)
  - [x] Frontend build `npm run build` di `frontend/` (0 error)
  - [x] Skrip simulasi signaling `mobile/test-webrtc-signaling.mjs` (8/8 tests pass)
  - [x] Update `docs/MOBILE_INTEGRATION_GUIDE.md` Section 7
