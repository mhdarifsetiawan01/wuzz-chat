# AI Context — Milestone M-Mobile-8.11: WebRTC 1-on-1 Voice Calling & Audio Session Management (Mobile)

## 📌 Scope & Target Workspace
- **Target Repository**: `mobile/` (React Native / Expo SDK 57), `docs/`
- **Active Branch**: `dev` (Strict Dev-Only Work)
- **Primary Goals**:
  1. Integrasi WebRTC Signaling Layer di Mobile WebSocket (`call_offer`, `call_answer`, `ice_candidate`, `call_reject`, `call_end`, `call_busy`).
  2. Implementasi `webrtcService.ts` & Call State Machine (`idle` ➔ `outgoing_calling` ➔ `incoming_ringing` ➔ `connecting` ➔ `connected` ➔ `ended`).
  3. Audio Session & Ringtone Manager (`callAudioManager.ts`) memanfaatkan `expo-audio` (`setAudioModeAsync` untuk earpiece vs speakerphone, mic capture, nada sambung, nada dering).
  4. Komponen UI Panggilan Aurora Dark Mode (`IncomingCallModal.tsx`, `ActiveCallOverlay.tsx`) & tombol panggil `📞` di `ChatScreen.tsx`.
  5. Penyediaan `CallProvider` / Root mounting di `mobile/App.tsx` agar panggilan masuk dapat direspon dari layar manapun.
  6. Automated quality gate & automated signaling simulation test script.

## ⚠️ Constraints & Protocol
- Strict Dev-Only: Dilarang menyentuh branch `main`.
- Token Efficiency: Diff-chunk edits & line-range reading.
- No Commit without explicit "selesai" confirmation.
