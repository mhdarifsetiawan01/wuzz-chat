# Implementation Plan — Milestone 8.3: Message Management Suite (Mobile)

## 🎯 Objectives
Mengimplementasikan rangkaian lengkap fitur Message Management Suite pada aplikasi mobile WuzzChat (`mobile/`) sesuai spesifikasi standar WhatsApp/Telegram dan dokumen `MOBILE_INTEGRATION_GUIDE.md`:
1. **Sub-8.3.A**: ✏️ Edit Pesan (Edit Message)
2. **Sub-8.3.B**: ↪ Teruskan Pesan (Forward Message)
3. **Sub-8.3.C**: 📌 Pin Chat (Daftar Obrolan)
4. **Sub-8.3.D**: 📌 Pin Message (Linimasa Chat)
5. **Sub-8.3.E**: 🔍 In-Chat Text Search (Pencarian Teks Dalam Obrolan)

---

## 📁 Target Files & Architecture

### 1. API & Types Layer
- `mobile/src/api/types.ts`:
  - Perluas interface `Message` dengan `is_edited?: boolean`, `edited_at?: string`, `is_forwarded?: boolean`, `is_pinned?: boolean`, `pinned_at?: string`.
  - Tambah interface: `EditMessageRequest`, `ForwardMessageRequest`, `ForwardMessageResponse`, `PinMessageRequest`, `PinMessageResponse`, `PinConversationRequest`, `PinConversationResponse`.
- `mobile/src/api/messages.ts`:
  - Perbaiki endpoint `editMessage` menjadi `PUT /api/messages/edit` (body: `{ message_id, content }`).
  - Tambah fungsi `forwardMessage(messageId: string, targetRoomIds: string[], plaintextContent?: string)`.
  - Tambah fungsi `pinMessage(messageId: string, roomId: string)`.
  - Tambah fungsi `unpinMessage(messageId: string, roomId: string)`.
  - Tambah fungsi `getPinnedMessages(conversationId: string)`.
  - Tambah fungsi `searchMessages(conversationId: string, query: string)`.
- `mobile/src/api/conversations.ts`:
  - Tambah fungsi `pinConversation(roomId: string)`.
  - Tambah fungsi `unpinConversation(roomId: string)`.

### 2. UI Components Layer
- `mobile/src/components/MessageActionSheet.tsx`:
  - Tambah opsi "✏️ Edit Pesan" (hanya untuk `isSelf`, pesan belum dihapus, tipe teks/bukan file audio, dan dalam batas 15 menit).
  - Tambah opsi "↪️ Teruskan Pesan" (untuk semua pesan yang belum dihapus).
  - Tambah opsi "📌 Sematkan Pesan" / "📍 Lepas Sematan" (berdasarkan status pin pesan).
- `mobile/src/components/MessageBubble.tsx`:
  - Tampilkan lencana `↪ Diteruskan` di bagian paling atas bubble jika `message.is_forwarded === true`.
  - Tampilkan label `(diedit)` di area footer bubble jika `message.is_edited === true`.
  - Tampilkan ikon pin kecil jika `message.is_pinned === true`.
  - Pastikan style `highlightedBubble` aktif dengan border aksen saat `isHighlighted === true`.
- `mobile/src/components/ChatInputBar.tsx`:
  - Tambah props `editingMessage`, `onSaveEdit`, `onCancelEdit`.
  - Tampilkan banner mode edit di atas input bar ("✏️ Edit Pesan" + teks cuplikan + tombol batal `✕`).
  - Set input field dengan konten pesan yang diedit dan auto-fokus.
  - Ubah tombol kirim menjadi tombol simpan/centang `✓`.
- `mobile/src/components/ForwardMessageModal.tsx` *(Komponen Baru)*:
  - Bottom sheet modal untuk memilih 1 hingga 5 kontak/grup penerima.
  - Fitur pencarian kontak/grup secara lokal.
  - Multiselect counter `(X/5)`.
  - Tombol aksi "Teruskan".
- `mobile/src/components/PinnedMessagesBanner.tsx` *(Komponen Baru)*:
  - Banner Aurora Glassmorphism di bawah header `ChatScreen`.
  - Mendukung hingga 3 pesan tersemat dengan navigasi carousel (slide atau tombol navigasi `‹` `›`).
  - Tombol `✕` untuk melepas sematan.
  - Tap banner memicu aksi *Jump-to-Message* pada linimasa chat.
- `mobile/src/components/ChatListItem.tsx`:
  - Tampilkan ikon pin `📌` di baris atas jika `conversation.is_pinned === true` atau `conversation.pinned === true`.
  - Tambah prop `onLongPress` untuk memicu dialog aksi Pin/Unpin obrolan.
- `mobile/src/components/index.ts`:
  - Ekspor komponen baru `ForwardMessageModal` dan `PinnedMessagesBanner`.

### 3. Screen & State Integration Layer
- `mobile/src/screens/RecentChatsScreen.tsx`:
  - Urutkan percakapan dengan prioritas chat yang disematkan (`is_pinned === true`) di bagian paling atas.
  - Tangani `onLongPress` pada `ChatListItem` untuk toggle Pin / Unpin percakapan via API dengan update optimistik.
- `mobile/src/screens/ChatScreen.tsx`:
  - **Edit Message Flow**:
    - State `editingMessage: Message | null`.
    - Handle aksi `onEdit` dari `MessageActionSheet`.
    - Panggil `messagesApi.editMessage` saat disimpan, perbarui pesan lokal secara optimistik.
    - Tangani event WebSocket `message_edited`: perbarui linimasa secara reaktif (`is_edited: true`, `content`, `edited_at`).
  - **Forward Message Flow**:
    - State `forwardingMessage: Message | null` dan `isForwardModalVisible: boolean`.
    - Cross-room E2EE handling: ambil teks terdekripsi dari pesan aktif untuk dikirim via `plaintext_content`.
    - Panggil `messagesApi.forwardMessage`.
  - **Pin Message Flow**:
    - State `pinnedMessages: Message[]`.
    - Fetch initial pinned messages saat masuk room via `messagesApi.getPinnedMessages`.
    - Tangani event WebSocket `message_pinned` dan `message_unpinned`.
    - Integrasikan `PinnedMessagesBanner`.
    - Fitur *Jump-to-Message*: `flatListRef.current?.scrollToIndex` / `scrollToItem` dengan highlight animasi visual selama 2 detik (`highlightedMessageId`).
  - **In-Chat Search Flow**:
    - Tombol pencarian `🔍` di header kanan.
    - State `isSearching: boolean`, `searchQuery: string`, `searchResults: Message[]`, `currentSearchIndex: number`.
    - Search input bar debounced (300ms) memanggil `messagesApi.searchMessages`.
    - Counter `(X dari Y)` dan tombol panah `▲` dan `▼`.
    - Auto-scroll ke pesan hasil pencarian dan highlight pesan aktif.

---

## 🧪 Verification Strategy
1. **TypeScript Typecheck Gate**: `npx tsc --noEmit` di `mobile/` wajib exit 0 tanpa error tipe.
2. **Resilience & Timeout Check**: Pastikan semua pemanggilan API menggunakan `apiClient` dengan timeout 15 detik.
3. **Cross-Room E2EE Plaintext Verification**: Pastikan `plaintext_content` selalu diisi dengan teks terdekripsi agar room target dapat membaca pesan.
4. **No Git Commit Gate**: Stop dan tunggu konfirmasi kata "selesai" dari user sebelum melakukan git commit atau sinkronisasi dokumentasi akhir.
