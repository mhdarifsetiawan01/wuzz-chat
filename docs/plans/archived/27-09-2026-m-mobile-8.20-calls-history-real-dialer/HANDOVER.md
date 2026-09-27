# HANDOVER — M-Mobile-8.20

## Ringkasan Perubahan
1. **Skema & SQLite CRUD di `mobile/src/services/sqliteStorage.ts`**:
   - Menambahkan tabel `local_call_logs` dan indeks `idx_call_user_created` `(user_id, created_at DESC)`.
   - Menambahkan interface `LocalCallRecord` serta helper methods `saveCallRecord`, `getCallHistory`, `clearCallHistory`, dan `deleteCallRecord`.
   - Mengintegrasikan pembersihan riwayat panggilan pada `clearUserCache(userId)` saat logout.
2. **Sinkronisasi Lifecycle Panggilan di `mobile/src/context/CallContext.tsx`**:
   - Menghubungkan event panggilan (`incoming`, `outgoing`, `missed`) dengan penghitungan durasi aktif saat terhubung.
   - Guard ref anti-duplicate logging (`loggedCallIdRef`) untuk mencegah duplikasi penulisan log saat event teardown lokal dan WebSocket signaling bersamaan.
   - Kemampuan auto-resolve `roomId` jika `startCall` dipanggil hanya dengan `peerId` via `startDirectChat(peerId)`.
   - Mengelola state `callHistory`, `isLoadingHistory`, `refreshCallHistory`, `deleteCallRecord`, dan `clearAllCallHistory`.
3. **Pembaruan Layar Tab Panggilan di `mobile/src/screens/CallsHistoryScreen.tsx`**:
   - Menghapus mock data statis `MOCK_CALLS`.
   - Menampilkan data riwayat panggilan riil dari SQLite lokal scoped per `user.id`.
   - Menambahkan dukungan Pull-to-Refresh (`RefreshControl`), empty state informatif, dan tombol bersihkan seluruh riwayat.
   - Interaksi tap item untuk dialog konfirmasi panggilan balik dan tombol callback cepat (📞).
   - Long-press item untuk konfirmasi penghapusan catatan panggilan individual.
   - FAB bulat membuka BottomSheetModal Contact Picker & Dialer dengan pencarian debounced `/api/users/search` dan daftar kontak percakapan direct yang sudah ada.

## Bukti Pengujian Otomatis
- `mobile`: `npx tsc --noEmit` ➔ **PASS 100% (0 errors)**
- `mobile/android`: `./gradlew assembleRelease` ➔ **BUILD SUCCESSFUL in 32s (30 executed, 374 up-to-date)**
- `frontend`: `npm run build` ➔ **Compiled successfully in 1243ms (Next.js Turbopack 0 errors)**
- `backend`: `go test ./...` ➔ **PASS 100% (all packages ok / cached)**
