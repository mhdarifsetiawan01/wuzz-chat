# Implementation Progress — Fix Call Log Callback & Consecutive Grouping

- [x] Step 1: Fix Peer ID & Nickname resolution in `ChatScreen.tsx`
- [x] Step 2: Add `room_id` column to SQLite & `LocalCallRecord` in `sqliteStorage.ts`
- [x] Step 3: Update `CallContext.tsx` with `room_id` logging, `ensureConnected`, and `joinRoom` before call signaling
- [x] Step 4: Fix callback dialer in `CallsHistoryScreen.tsx` with conversation lookup
- [x] Step 5: Implement consecutive call grouping in `CallsHistoryScreen.tsx`
- [x] Step 6: Verify automated tests (`npx tsc --noEmit`, `npm run build`, `go test ./...`)


