# IMPLEMENTATION PLAN — M-Mobile-8.20

## 1. Target Files
- `mobile/src/services/sqliteStorage.ts`: Tambah skema tabel `local_call_logs`, index, interface `LocalCallRecord`, dan fungsi CRUD.
- `mobile/src/context/CallContext.tsx`: Hubungkan lifecycle panggilan ke SQLite logging, auto-resolve room pada `startCall`, serta sediakan state `callHistory`.
- `mobile/src/screens/CallsHistoryScreen.tsx`: Ganti mock data dengan live SQLite data, pull-to-refresh, empty state, action hapus item, dan modal contact picker / dialer baru.

## 2. Technical Decisions
- **DEC-M32 (Local Call Logs Table)**: Tabel `local_call_logs` disimpan di database SQLite lokal yang sama dengan WAL mode, multi-tenant isolation via `user_id`, index pada `(user_id, created_at DESC)`.
- **DEC-M33 (Single-Invocation Call Log Guard)**: Lifecycle logging menggunakan ref string identifier (`${room}_${startTime}`) untuk mencegah penulisan berulang saat event teardown (misal `endCall` lokal + `call_end` ws).
- **DEC-M34 (Room Auto-Resolution)**: `startCall` mendukung inisiasi panggilan hanya bermodalkan `peerId` dengan otomatis memanggil `startDirectChat(peerId)` untuk mendapatkan `roomId` yang sah di sisi server.
- **DEC-M35 (Dialer / Contact Picker UX)**: Menggunakan modal/bottom-sheet Aurora Dark Mode terpadu dengan input pencarian instan dan daftar kontak percakapan yang sudah ada.

## 3. Verification Strategy
1. `cd mobile && npx tsc --noEmit` (0 error).
2. `./gradlew assembleRelease` di `mobile/android` (sukses).
3. Verifikasi ketersediaan dan ketepatan tipe data di seluruh komponen terkait.
