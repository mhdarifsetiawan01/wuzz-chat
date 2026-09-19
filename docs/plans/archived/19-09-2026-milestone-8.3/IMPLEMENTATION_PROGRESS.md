# Implementation Progress — Milestone 8.3: Message Management Suite

## Sub-Milestone 8.3.A: Edit Pesan (Window 15 Menit)
- [x] **TASK A-1**: Tambah kolom `is_edited` & `edited_at` ke migration database (`backend/internal/store/sql.go`)
- [x] **TASK A-2**: Tambah method `EditMessage` ke interface `MessageStore` & field ke `StoredMessage` (`backend/internal/store/store.go`)
- [x] **TASK A-3**: Implementasi `EditMessage` di SQL store (`backend/internal/store/sql.go`)
- [x] **TASK A-4**: Implementasi `EditMessage` di memory store (`backend/internal/store/memory.go`)
- [x] **TASK A-5**: Tambah WebSocket event type `message_edited` & fields ke struct `Message` (`backend/internal/ws/message.go`)
- [x] **TASK A-6**: Buat REST endpoint `PUT /api/messages/edit` di `chat_handler.go` (`backend/internal/api/chat_handler.go`)
- [x] **TASK A-7**: Daftarkan route di router (`backend/main.go`)
- [x] **TASK A-8**: Tulis unit test `EditMessage` 4 skenario (`backend/internal/api/chat_handler_edit_test.go`)
- [x] **TASK A-9**: Update types frontend (`frontend/lib/types.ts`)
- [x] **TASK A-10**: Handle event `message_edited` & reducer action di `page.tsx` (`frontend/app/chat/page.tsx`)
- [x] **TASK A-11**: Context menu "Edit" & label `(edited)` di `MessageBubble.tsx` (`frontend/app/chat/MessageBubble.tsx`)
- [x] **TASK A-12**: UI inline input edit di `MessageInput.tsx` (`frontend/app/chat/MessageInput.tsx`)

## Sub-Milestone 8.3.B: Forward Pesan (Multi-Kontak Max 5)
- [x] **TASK B-1**: Tambah kolom `is_forwarded` ke database (`backend/internal/store/sql.go`)
- [x] **TASK B-2**: Tambah method `ForwardMessage` di store interface (`backend/internal/store/store.go`)
- [x] **TASK B-3**: Implementasi `ForwardMessage` di SQL store (`backend/internal/store/sql.go`)
- [x] **TASK B-4**: Tambah endpoint `POST /api/messages/forward` (`backend/internal/api/chat_handler.go`)
- [x] **TASK B-5**: Komponen UI `ForwardMessageModal.tsx` (`frontend/app/chat/ForwardMessageModal.tsx`)
- [x] **TASK B-6**: Context menu "Teruskan" & label "Diteruskan" di `MessageBubble.tsx`
- [x] **TASK B-7**: Unit test backend untuk forward pesan

## Sub-Milestone 8.3.C: Pin Chat (Sidebar)
- [x] **TASK C-1**: Migration `is_pinned` & `pinned_at` di `conversation_members`
- [x] **TASK C-2**: Method `PinConversation` & `UnpinConversation` di `UserStore`
- [x] **TASK C-3**: Implementasi SQL & Memory store serta sorting conversations
- [x] **TASK C-4**: Endpoint `POST /api/conversations/pin` & `/unpin`
- [x] **TASK C-5**: Pendaftaran route di `main.go`
- [x] **TASK C-6**: UI Sidebar pin indicator & context action

## Sub-Milestone 8.3.D: Pin Message (Dalam Chat)
- [x] **TASK D-1**: Tabel `pinned_messages` migration
- [x] **TASK D-2**: Method store `PinMessage`, `UnpinMessage`, `GetPinnedMessages`
- [x] **TASK D-3**: Implementasi SQL & Memory store
- [x] **TASK D-4**: WebSocket event `message_pinned` & `message_unpinned`
- [x] **TASK D-5**: Endpoints REST pin message
- [x] **TASK D-6**: Banner Pinned Message di `ChatWindow.tsx`
- [x] **TASK D-7**: Context menu "Pin Pesan" di `MessageBubble.tsx`

## Sub-Milestone 8.3.E: In-Chat Search
- [x] **TASK E-1**: Method `SearchMessages` di store interface
- [x] **TASK E-2**: Implementasi SQL store `SearchMessages`
- [x] **TASK E-3**: Endpoint `GET /api/messages/search`
- [x] **TASK E-4**: In-Chat Search UI di `StatusBar.tsx`
- [x] **TASK E-5**: Scroll-to-message & highlight glow effect di `page.tsx`
