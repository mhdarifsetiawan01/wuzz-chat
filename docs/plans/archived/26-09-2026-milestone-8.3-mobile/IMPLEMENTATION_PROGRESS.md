# Implementation Progress — Milestone 8.3: Message Management Suite (Mobile)

## 📋 Task Checklist

### Phase 1: API & Types Layer
- [x] **Task 1.1**: Perbarui `mobile/src/api/types.ts` dengan atribut `is_edited`, `is_forwarded`, `is_pinned`, `pinned_at` serta tipe request/response terkait.
- [x] **Task 1.2**: Perbarui `mobile/src/api/messages.ts` dengan endpoint `editMessage` (`PUT /api/messages/edit`), `forwardMessage`, `pinMessage`, `unpinMessage`, `getPinnedMessages`, dan `searchMessages`.
- [x] **Task 1.3**: Perbarui `mobile/src/api/conversations.ts` dengan endpoint `pinConversation` dan `unpinConversation`.

### Phase 2: Core Components Implementation
- [x] **Task 2.1**: Perbarui `mobile/src/components/MessageActionSheet.tsx` dengan opsi Edit Pesan, Teruskan Pesan, dan Sematkan/Lepas Sematan Pesan.
- [x] **Task 2.2**: Perbarui `mobile/src/components/MessageBubble.tsx` untuk merender lencana `↪ Diteruskan`, label `(diedit)`, dan indikator pin `📌`.
- [x] **Task 2.3**: Perbarui `mobile/src/components/ChatInputBar.tsx` dengan mode edit inline (banner edit, cancel button, save button, auto-focus).
- [x] **Task 2.4**: Buat komponen `mobile/src/components/ForwardMessageModal.tsx` (multiselect 1-5 room, filter search, E2EE plaintext override).
- [x] **Task 2.5**: Buat komponen `mobile/src/components/PinnedMessagesBanner.tsx` (Aurora Glassmorphism, carousel multi-pin max 3, jump-to-message trigger, unpin action).
- [x] **Task 2.6**: Perbarui `mobile/src/components/ChatListItem.tsx` dengan indikator pin `📌` dan handler `onLongPress`.
- [x] **Task 2.7**: Ekspor komponen baru pada `mobile/src/components/index.ts`.

### Phase 3: Screen & Real-time Integration Layer
- [x] **Task 3.1**: Integrasikan Pin Chat pada `mobile/src/screens/RecentChatsScreen.tsx` (sorting prioritas pin, aksi long-press pin/unpin).
- [x] **Task 3.2**: Integrasikan Edit Pesan pada `mobile/src/screens/ChatScreen.tsx` (state editing, submit API, listener WS `message_edited`).
- [x] **Task 3.3**: Integrasikan Forward Pesan pada `mobile/src/screens/ChatScreen.tsx` (modal selection, E2EE plaintext resolution, submit API).
- [x] **Task 3.4**: Integrasikan Pin Message pada `mobile/src/screens/ChatScreen.tsx` (fetch pinned, listener WS `message_pinned` & `message_unpinned`, banner rendering, jump-to-message auto-scroll & highlight).
- [x] **Task 3.5**: Integrasikan In-Chat Text Search pada `mobile/src/screens/ChatScreen.tsx` (header bar pencarian, debounce, counter X/Y, navigasi navigasi ▲/▼, auto-scroll & highlight).

### Phase 4: Verification & Quality Gate
- [x] **Task 4.1**: Jalankan TypeScript quality gate `npx tsc --noEmit` di direktori `mobile/`.
- [x] **Task 4.2**: Verifikasi kepatuhan Design System token (`mobile/src/theme/`) dan timeout AbortController (15s).
- [x] **Task 4.3**: Laporkan hasil pengujian kepada pengguna dan tunggu kata "selesai" sebelum commit/docs sync.
