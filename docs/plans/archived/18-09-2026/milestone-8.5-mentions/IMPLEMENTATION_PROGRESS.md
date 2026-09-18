# Granular Task Progress — Milestone 8.5: Group & Subgroup Multi-User Mention Engine (@username)

## 📋 Task Checklist

### Phase 1: Database & Backend Store
- [x] **Task 1.1**: Tambahkan migrasi non-destruktif kolom `mentions` pada tabel `messages` (PostgreSQL & SQLite) di `backend/internal/store/sql.go`.
- [x] **Task 1.2**: Perbarui model `StoredMessage` di `backend/internal/store/store.go` dan `memory.go`.
- [x] **Task 1.3**: Perbarui query `INSERT INTO messages` dan `GetRoomHistoryForUser` di `sql.go` agar membaca/menyimpan `mentions`.
- [x] **Task 1.4**: Buat unit test penyimpanan dan pembacaan `mentions` di `backend/internal/store/sql_test.go`.

### Phase 2: WebSocket Hub & Push Notification
- [x] **Task 2.1**: Tambahkan field `Mentions []string` pada struct `Message` di `backend/internal/ws/message.go`.
- [x] **Task 2.2**: Implementasikan validasi keanggotaan mention (fail-closed) di `backend/internal/ws/hub.go`.
- [x] **Task 2.3**: Integrasikan pengiriman prioritas notifikasi mention pada `backend/internal/push/push.go`.
- [x] **Task 2.4**: Tambahkan unit test notifikasi mention di `backend/internal/push/push_test.go` dan verifikasi seluruh test suite backend (`go test -v ./...`).

### Phase 3: Frontend Type & Autocomplete Engine
- [x] **Task 3.1**: Tambahkan `mentions?: string[]` pada tipe `Message` di `frontend/lib/types.ts`.
- [x] **Task 3.2**: Kembangkan komponen Autocomplete Suggestion Popover di `frontend/app/chat/MessageInput.tsx` lengkap dengan navigasi keyboard dan sentuhan mobile.
- [x] **Task 3.3**: Dukung multi-mention accumulator dan integrasikan dengan `onSend` di `MessageInput.tsx`.
- [x] **Task 3.4**: Hubungkan `groupDetails?.members` dari `frontend/app/chat/page.tsx` ke `MessageInput`.

### Phase 4: Chat Timeline Styling & Rendering
- [x] **Task 4.1**: Implementasikan parser mention di `frontend/app/chat/MessageBubble.tsx` untuk merender badge `@username`.
- [x] **Task 4.2**: Tambahkan styling CSS Aurora Glassmorphism untuk dropdown popover dan mention tags di `frontend/app/globals.css`.
- [x] **Task 4.3**: Verifikasi kompatibilitas Mobile (keyboard popover) dan Desktop.
- [x] **Task 4.4**: Jalankan `npm run build` di `frontend/` untuk memastikan 100% build lulus tanpa error.

### Phase 5: Self-Review & Documentation Sync
- [x] **Task 5.1**: Lakukan audit kepatuhan (Clean Code, Mobile Viewport, Server Lifecycle).
- [ ] **Task 5.2**: Sinkronkan 8 dokumen proyek sesuai SOP DoD Dokumentasi.
- [ ] **Task 5.3**: Siapkan ringkasan verifikasi dan ajukan pertanyaan konfirmasi penyelesaian sesi ke user.
