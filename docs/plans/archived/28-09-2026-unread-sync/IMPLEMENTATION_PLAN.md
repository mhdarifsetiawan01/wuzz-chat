# Implementation Plan — Mobile Unread Status & Receipt Return-to-Home Sync

## 1. Objectives
- Memastikan badge unread pada obrolan langsung ter-reset 0ms (optimistic) saat obrolan dibuka/dibaca.
- Memastikan saat pengguna menekan tombol Back kembali ke Home (`RecentChatsScreen`), status obrolan sudah bersih terbaca tanpa harus menarik layar / refresh manual.
- Memastikan tab badge "Chats" pada bottom navigation bar langsung berkurang/hilang secara real-time.
- Memastikan status persisted di SQLite lokal `local_conversations` agar sinkron saat cold start aplikasi.
- Memastikan background revalidation otomatis berjalan saat layar Home kembali fokus (`useFocusEffect`).

## 2. Technical Architecture & File Changes
- **`mobile/src/services/sqliteStorage.ts`**:
  - Tambah fungsi `updateStoredConversationUnread(userId, roomId, unreadCount = 0)`.
- **`mobile/src/api/messages.ts`**:
  - Tambah `messagesApi.updateReceipt(roomId, status, messageId)` sebagai REST fallback yang handal.
- **`mobile/src/context/ConversationContext.tsx`**:
  - Tambah method `markConversationAsRead(roomId)` dan `setActiveRoomId(roomId)`.
  - Update `refreshConversations`: amankan room yang sedang aktif (`activeRoomId`) agar `unread_count` tidak tertimpa > 0.
- **`mobile/src/screens/ChatScreen.tsx`**:
  - Panggil `setActiveRoomId(roomId)` & `markConversationAsRead(roomId)` saat mount.
  - Reset `setActiveRoomId(null)` saat unmount.
- **`mobile/src/screens/RecentChatsScreen.tsx`**:
  - Panggil `markConversationAsRead` saat obrolan ditekan (`handleChatPress`).
  - Pasang `useFocusEffect` untuk silent revalidation (`refreshConversations(true)`).

## 3. Verification Strategy
- Typecheck mobile: `npx tsc --noEmit` di `mobile/`.
- Frontend build check: `npm run build` di `frontend/`.
- Backend tests check: `go test ./...` di `backend/`.
