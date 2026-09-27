# AI_CONTEXT.md — Active Implementation Context

- **Milestone**: M-Mobile-8.18: Offline-First Persistent Storage (SQLite / Local Cache)
- **Target Repository/Dir**: `mobile/`
- **Tech Stack**:
  - React Native 0.86.3 / React 19 / Expo SDK 57
  - Local Database: `expo-sqlite` ~57.0.3 (Modern Async API: `openDatabaseAsync`, WAL mode)
  - State Management: `ConversationContext.tsx`, `ChatScreen.tsx`
  - Backend Synchronization: Go WebSocket Hub (`join` with `since` parameter delta sync)
- **Active Constraints**:
  - Dilarang bekerja di branch `main` (tetap di `dev`).
  - No commit sebelum user menyatakan "selesai".
  - Verifikasi typecheck `npx tsc --noEmit` wajib 0 error.
  - Kompatibel dengan skema E2EE dan Zero-Knowledge push decryption yang sudah ada.
