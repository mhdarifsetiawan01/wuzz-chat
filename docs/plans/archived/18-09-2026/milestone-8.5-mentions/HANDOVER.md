# Handover & Verification Report — Milestone 8.5: Group & Subgroup Multi-User Mention Engine (@username)

## 1. Executive Summary
- **Fitur Baru:** Fitur mention multi-user (`@username`) untuk obrolan grup dan forum/subgrup.
- **Prinsip Arsitektur Kekal (Immutable):** Seluruh logika bisnis, otorisasi keanggotaan, broadcast WebSocket, penyimpanan database, dan pengiriman notifikasi Web Push 100% menggunakan `user.id` (UUIDv4) dan `conversation.id` (UUIDv4), bukan username atau display_name (DEC-013).
- **Hasil Verifikasi:**
  - `go test -count=1 ./...` : 100% PASS across all backend packages.
  - `npm run build` : 100% SUCCESS, zero TypeScript/lint errors.

## 2. Key Changes & Artifacts
1. **Database Schema (`backend/internal/store/sql.go`)**:
   - Kolom `mentions TEXT DEFAULT '[]'` ditambahkan via non-destructive migration pada tabel `messages` (PostgreSQL & SQLite).
   - Menyimpan JSON string array berisi UUID pengguna yang di-mention, misal: `["uuid-1", "uuid-2"]`.
2. **Backend Domain & Store (`store.go`, `memory.go`, `sql.go`, `message.go`)**:
   - `StoredMessage.Mentions` dan `ws.Message.Mentions` (`[]string`).
   - Query `INSERT INTO messages`, `GetRoomHistoryForUser`, dan `GetMessageByID` diperbarui.
3. **Fail-Closed WebSocket Membership Verification (`backend/internal/ws/hub.go`)**:
   - Sebelum broadcast & penyimpanan, seluruh User ID dalam `msg.Mentions` diverifikasi keanggotaannya via `h.userStore.IsUserInConversation(roomID, mUID)`.
4. **Prioritized Web Push Notification (`backend/internal/push/push.go`)**:
   - Pengguna yang UUID-nya terdaftar di `msg.Mentions` menerima notifikasi berlabel khusus `🔔 [Sender] menyebut Anda` dengan data flag `is_mention: true` dan tag `chat-mention-[roomID]`.
5. **Frontend Autocomplete Mention Engine (`frontend/app/chat/MessageInput.tsx`)**:
   - Deteksi `@` real-time dengan filter anggota grup/subgrup aktif (hanya anggota room yang bersangkutan, exclude diri sendiri).
   - Navigasi keyboard penuh (Arrow Up, Arrow Down, Enter, Tab, Escape) dan tap mobile.
   - Akumulasi multi-mention: mengonversi seluruh `@username` yang ada di teks menjadi daftar UUID pengguna yang valid.
6. **Chat Timeline Rendering (`frontend/app/chat/MessageBubble.tsx`)**:
   - Parser mention otomatis merender tag `@username` berbalut `.mention-tag`.
   - Highlight ekstra pendaran Cyan (`.mention-tag-self` dan `.message-bubble-mentioned`) ketika UUID pengguna saat ini cocok dengan `message.mentions`.
7. **Design System & Styling (`frontend/app/globals.css`)**:
   - Aurora Glassmorphism popover dengan backdrop blur 20px, responsive safe-area di mobile virtual keyboard, dan tap target min 44px.
