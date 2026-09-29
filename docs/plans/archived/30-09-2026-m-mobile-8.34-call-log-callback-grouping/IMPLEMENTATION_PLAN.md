# Implementation Plan — Fix Call Log Callback & Consecutive Grouping

## 🏗️ Technical Architecture & Steps

1. **Step 1: Fix Peer ID & Nickname Resolution in `ChatScreen.tsx`**:
   - Gunakan `resolvedPeerId || conversation.peer_id || ''` dan `conversation.title || conversation.name || conversation.peer_nickname || 'Pengguna'` agar `startCall` menerima ID user kontak riil dan nama yang akurat, bukan room ID.

2. **Step 2: Tambahkan Kolom `room_id` pada SQLite & `LocalCallRecord` di `sqliteStorage.ts`**:
   - Perbarui interface `LocalCallRecord` untuk menyertakan `room_id?: string`.
   - Tambahkan migrasi otomatis (`ALTER TABLE local_call_logs ADD COLUMN room_id TEXT`).
   - Simpan `record.room_id` pada `saveCallRecord`.

3. **Step 3: Perbaiki `CallContext.tsx` (`recordCallLog` & `startCall`)**:
   - Sertakan `room_id: session.room` pada saat menyimpan record panggilan.
   - Pada `startCall`:
     - Panggil `await websocketClient.ensureConnected(4000)`.
     - Validasi `peerId`: jika `peerId` berupa room ID (`conv_...` atau `dm_...`), pulihkan target room dan ambil `peerId` yang sebenarnya.
     - Panggil `websocketClient.joinRoom(targetRoomId)` sebelum mengirim offer SDP agar hub WebSocket mendaftarkan perangkat caller pada channel room tersebut.

4. **Step 4: Perbaiki Callback Dialer di `CallsHistoryScreen.tsx`**:
   - Hubungkan ke `conversations` dari context untuk memetakan `item.room_id || conv.id` dan `peer_id` kontak yang valid.
   - Panggil `startCall` dengan `roomId` dan `peerId` yang presisi.

5. **Step 5: Implementasi Grouping Panggilan Beruntun (Consecutive Call Grouping)**:
   - Di `CallsHistoryScreen.tsx`, agregasikan entri panggilan beruntun dengan peer yang sama (`peer_id`) dan jenis panggilan yang sama menjadi 1 baris dengan badge counter `(x)` (misal: `Budi Santoso (5)`).
   - Tampilkan timestamp panggilan terakhir dan durasi total/terakhir.

6. **Step 6: Verifikasi & Audit**:
   - Verifikasi typecheck mobile via `npx tsc --noEmit`.
   - Pastikan backend `go test -v ./...` dan frontend web `npm run build` tetap 100% lulus.

