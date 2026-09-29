# AI Context — Fixing WebRTC Call History & Callback Failure

- **Target Repository**: WuzzChat Mobile (`mobile/`)
- **Active Branch**: `dev`
- **Milestone / Task**: Fix WebRTC Call Log Resolution & Consecutive Call Grouping
- **Impacted Files**:
  - `mobile/src/screens/ChatScreen.tsx`
  - `mobile/src/services/sqliteStorage.ts`
  - `mobile/src/context/CallContext.tsx`
  - `mobile/src/screens/CallsHistoryScreen.tsx`
- **Core Constraints**:
  - Do not commit on `main`. Work strictly on `dev`.
  - Offline-first SQLite compatibility with migration guard.
  - Zero TypeScript errors (`npx tsc --noEmit`).

