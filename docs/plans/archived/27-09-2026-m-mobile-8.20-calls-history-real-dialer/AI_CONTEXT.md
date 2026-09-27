# AI_CONTEXT.md — Active Implementation Context

- **Milestone**: M-Mobile-8.20: CallsHistoryScreen — Integrasi Riwayat Panggilan Real & Dialer
- **Target Repository/Dir**: `mobile/`
- **Tech Stack**:
  - React Native 0.86.3 / React 19 / Expo SDK 57
  - Local Database: `expo-sqlite` ~57.0.3 (Table: `local_call_logs`, WAL mode)
  - WebRTC & Audio: `react-native-webrtc`, `callAudioManager`, `webrtcService`
  - Context & State: `CallContext.tsx`, `AuthContext.tsx`, `CallsHistoryScreen.tsx`
  - Design System: Aurora Dark Glassmorphic (`mobile/DESIGN.md`, `mobile/src/theme/`)
- **Active Constraints**:
  - Dilarang bekerja di branch `main` (wajib di `dev`).
  - No commit sebelum user menyatakan "selesai".
  - Verifikasi typecheck `npx tsc --noEmit` wajib 0 error.
  - Verifikasi Android native build `./gradlew assembleRelease` sukses.
  - Kompatibel dengan arsitektur Dual-Platform dan server lifecycle rules.
