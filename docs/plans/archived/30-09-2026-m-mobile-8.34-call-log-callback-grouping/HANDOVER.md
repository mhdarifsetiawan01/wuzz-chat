# Handover & Verification Plan

## 🧪 Verification Strategy
1. **Lint & Typecheck**:
   - `npx tsc --noEmit` di `mobile/` (0 errors).
   - `npm run build` di `frontend/` (0 errors).
   - `go test -v ./...` di `backend/` (100% pass).
2. **Behavior Verification**:
   - `ChatScreen.tsx`: `handleVoiceCall` menggunakan `resolvedPeerId` valid.
   - `sqliteStorage.ts`: migrasi `room_id` dan penyimpanan `room_id` berjalan mulus.
   - `CallContext.tsx`: `startCall` memanggil `ensureConnected`, mendaftarkan `joinRoom(targetRoomId)`, dan mampu menyelesaikan room jika `peerId` adalah room ID lama.
   - `CallsHistoryScreen.tsx`: tombol panggil callback berhasil menginisiasi panggilan ke target room dan target peer yang valid, serta panggilan beruntun terkelompokkan rapi dengan badge count `(x)`.

