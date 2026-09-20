# Rencana Implementasi Perbaikan Real-Time Read Receipt (Centang Biru)

## Tujuan Utama
Memperbaiki mekanisme penerimaan event `receipt` (tanda terima pesan dibaca/centang 2 biru) di frontend agar langsung memperbarui status pesan dan sidebar secara instan (real-time) saat lawan bicara membuka percakapan, tanpa harus menunggu lawan bicara membalas pesan.

## User Review Required
> [!NOTE]
> Perbaikan ini mencakup:
> 1. Penanganan event `receipt` di `page.tsx` agar tidak ter-drop ketika user sedang di luar room (misal di Home/Sidebar).
> 2. Penambahan fungsi batch update `updateRoomCachedMessagesStatus` di `lib/messageCache.ts` agar status bulk read tersimpan permanen di IndexedDB lokal.
> 3. Audit performa (non-blocking async IndexedDB) & security (fail-safe status weight monotonic progression).

## Scope File yang Dimodifikasi
1. `frontend/lib/messageCache.ts`: Menambahkan fungsi `updateRoomCachedMessagesStatus(roomId, status)` dengan index `by_room` dan proteksi anti-regression weight.
2. `frontend/app/chat/page.tsx`:
   - Melepas guard `currentRoom` yang memblokir `setLastIncomingMessage` agar sidebar selalu tersinkronisasi.
   - Mengintegrasikan pembaruan IndexedDB untuk bulk read receipt (`!msg.id`).
3. `frontend/test-message-cache.mjs`: Menambahkan automated unit test untuk `updateRoomCachedMessagesStatus`.

## Rencana Verifikasi
- **Automated Tests**:
  - `npm test` / eksekusi `node test-message-cache.mjs` di direktori `frontend/`.
  - `npm run build` di direktori `frontend/` (Next.js / TypeScript check).
  - `go test -v ./...` di direktori `backend/`.
