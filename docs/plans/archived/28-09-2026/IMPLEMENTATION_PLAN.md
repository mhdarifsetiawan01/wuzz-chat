# Implementation Plan — M-Mobile-8.29 SQLite Storage Retention Cap, Cache Pruning & Auto-Vacuum

## Objectives
Implement persistent SQLite storage capping, background cache pruning, and auto-vacuum reclamation in WuzzChat Mobile (`mobile/`).

## Target Files
1. `mobile/src/services/sqliteStorage.ts`
   - Add `PRAGMA auto_vacuum = INCREMENTAL;` to `getDatabase()`.
   - Export constant `MAX_LOCAL_MESSAGES_PER_ROOM = 500`.
   - Implement `pruneRoomMessages(userId: string, roomId: string, keepLimit?: number): Promise<number>`.
   - Run `PRAGMA incremental_vacuum;` in pruning and `clearMessageCacheOnly`.
   - Auto-prune within `saveStoredMessages`.
2. `mobile/src/context/MessageContext.tsx`
   - Trigger silent background pruning when hydrating room (`hydrateRoomFromLocalDB`) and after reconciling history messages.
   - Guard memory integrity and ensure reverse infinite scroll pagination is not disrupted.
3. `mobile/src/components/StorageSettingsModal.tsx`
   - Show retention cap informational note (500 messages per room).
   - Ensure "Bersihkan Cache Pesan" runs vacuum and updates storage stats cleanly.

## Verification Strategy
- `npx tsc --noEmit` in `mobile/`
- `npm run build` in `frontend/`
- `go test -v ./...` in `backend/`
