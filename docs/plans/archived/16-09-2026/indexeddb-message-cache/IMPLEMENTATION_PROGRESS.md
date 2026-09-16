# IMPLEMENTATION_PROGRESS.md — Milestone 8.4: IndexedDB Message Cache

## Milestone 1: Buat `messageCache.ts` — IndexedDB Adapter ✅

- [x] Buat file `frontend/lib/messageCache.ts`
  - [x] Definisi interface `CachedMessageRecord`
  - [x] Fungsi `openMsgDB()` — buka/inisialisasi IndexedDB `wuzzchat_msg_db`
  - [x] Index `by_room` pada field `room_id`
  - [x] `getCachedMessages(roomId, limit?)` — baca pesan per room
  - [x] `cacheMessage(msg)` — simpan/update satu record
  - [x] `cacheMessages(msgs[])` — batch upsert
  - [x] `updateCachedMessageStatus(id, status)` — update status tanda terima
  - [x] `deleteCachedMessage(id)` — hapus satu pesan dari cache
  - [x] `clearRoomCache(roomId)` — hapus semua cache satu room
  - [x] `toCachedRecord(msg)` — helper konversi Message → CachedMessageRecord
- [x] Verifikasi: `npm run build` lulus 0 error TypeScript ✅

## Milestone 2: Cache-First Load di `page.tsx` ✅

- [x] Import `getCachedMessages`, `cacheMessages`, `toCachedRecord` di `page.tsx`
- [x] Baca IndexedDB saat room dibuka → render cachedMsgs instan ke UI sebelum server merespons
- [x] Fetch server via WebSocket (`case 'history'`) → dekripsi → upsert pesan baru ke IndexedDB cache
- [x] Mapping field `Message` → `CachedMessageRecord` yang benar (`m.from`, `m.timestamp`, `m.nickname`)
- [x] Verifikasi: `npm run build` lulus 0 error ✅

## Milestone 3: Write-Through Cache ✅

- [x] Import `cacheMessage`, `updateCachedMessageStatus`, `deleteCachedMessage` di `page.tsx`
- [x] Handler `case 'message'` (incoming): `cacheMessage()` setelah dekripsi sukses
- [x] Handler `case 'receipt'`: `updateCachedMessageStatus()` per message ID
- [x] Handler `case 'message_deleted'` (WS): `updateCachedMessageStatus('deleted')`
- [x] `handleDeleteMessage` for_me: `deleteCachedMessage()` → hapus bersih dari cache
- [x] `handleDeleteMessage` for_everyone: `updateCachedMessageStatus('deleted')`
- [x] `handleSend` optimistic: `cacheMessage()` langsung saat pesan dikirim
- [x] Import `clearRoomCache` di `Sidebar.tsx`
- [x] `handleExecuteDeleteConversation`: `clearRoomCache()` → bersihkan cache seluruh room
- [x] Verifikasi: `npm run build` lulus 0 error ✅

## Milestone 4: Notifikasi Kode Keamanan Berubah ✅

- [x] Tambah `lastKnownPeerKeyRef` (Ref) untuk track last known public key per peer
- [x] Di `resolvePeerKeyAndDecrypt`: baca stored key dari `lastKnownPeerKeyRef` + `localStorage`
- [x] Jika key berubah → inject `Message{type:'system', id:'security-notice-...'}` ke timeline
- [x] Perbarui `lastKnownPeerKeyRef` + `localStorage` setiap kali key di-resolve
- [x] Tambah `isSecurityNotice` detection di `MessageBubble.tsx` berdasarkan prefix ID
- [x] Terapkan CSS class `security-notice` dengan amber styling di `globals.css`
- [x] Verifikasi: `npm run build` lulus 0 error ✅

## Milestone 5: Update Roadmap & Dokumentasi ✅

- [x] Update `docs/ROADMAP.md` — tambah Milestone 8.4 (termasuk diagram alur ASCII Fase 8)
- [x] Update `docs/plans/active/DECISION_LOG.md` — tambah DEC-021 (IndexedDB Persistent Decrypted Message Cache)
- [x] Update `PROMPT.md` — update status fase & milestone 8.4
- [x] Sinkronisasi dokumentasi menyeluruh (360-degree audit): `README.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `SECURITY_AND_PERFORMANCE.md`, `MOBILE_INTEGRATION_GUIDE.md`, `BACKEND_API.md`
- [x] Verifikasi akhir: `npm run build` lulus 0 error ✅
