# Implementation Plan — Milestone M-Mobile-8.7

## Objective
Mengimplementasikan penghapusan pesan real-time (*Delete for Everyone* dan *Delete for Me*) pada WuzzChat Mobile (`mobile/`), lengkap dengan dialog konfirmasi WhatsApp-Style, optimistic UI, penanganan event WebSocket server-to-client, dan styling placeholder pesan terhapus.

## Proposed Architecture & File Changes

### 1. `mobile/src/api/messages.ts`
- Tambahkan / ekspor fungsi helper:
  ```ts
  export async function deleteMessage(
    messageId: string,
    forEveryone: boolean,
    roomId?: string
  ): Promise<void>
  ```
  serta perbarui metode di `messagesApi.deleteMessage`:
  - Kirim HTTP DELETE `/api/messages` dengan payload:
    ```json
    {
      "message_id": messageId,
      "id": messageId,
      "room_id": roomId,
      "delete_for_everyone": forEveryone,
      "type": forEveryone ? "for_everyone" : "for_me"
    }
    ```
  - Tetap gunakan `apiClient` dengan AbortController timeout 15s.

### 2. `mobile/src/components/MessageActionSheet.tsx`
- Sempurnakan dialog konfirmasi WhatsApp-Style di sub-view penghapusan:
  - Cek `isSelf` via UUID perbandingan `message.from === currentUserId || isSelf`.
  - Hitung countdown sisa waktu `remainingSeconds` untuk 60 detik (1 menit) sejak `message.timestamp || message.created_at`.
  - Jika `isSelf`:
    - Tampilkan kartu tombol "Hapus untuk Semua Orang" (dengan countdown badge atau disabled jika > 60 detik).
    - Tampilkan kartu tombol "Hapus untuk Saya".
    - Tampilkan tombol "Batal".
  - Jika BUKAN `isSelf`:
    - Hanya tampilkan kartu tombol "Hapus untuk Saya".
    - Tampilkan tombol "Batal".
  - Styling rapi sesuai Aurora theme tokens.

### 3. `mobile/src/components/MessageBubble.tsx`
- Deteksi status deleted:
  `const isDeleted = Boolean(message.is_deleted || message.content?.startsWith('🚫 Pesan ini telah dihapus'));`
- Disable interactions:
  - `PanResponder`: Cegah swipe-to-reply jika `isDeleted`.
  - `onLongPress`: Abaikan long press jika `isDeleted`.
  - Sembunyikan quoted message / media preview / reactions / reply preview jika terhapus.
  - Sembunyikan checklist delivery receipt (`🕒` / `✓` / `✓✓`).
  - Render icon `🚫` dengan teks miring abu-abu (*italic*).

### 4. `mobile/src/screens/ChatScreen.tsx`
- **Optimistic UI Update** di `handleDeleteMessage`:
  - Jika `type === 'for_everyone'`: ubah pesan seketika di state lokal menjadi:
    `{ ...m, is_deleted: true, content: '🚫 Pesan ini telah dihapus' }`.
  - Jika `type === 'for_me'`: hapus pesan dari array state:
    `prev.filter(m => m.id !== messageId)`.
  - Kirim request via `messagesApi.deleteMessage` / `deleteMessage` helper. Jika error, kembalikan state sebelumnya dan munculkan alert user-friendly.
- **WebSocket Event Handling**:
  - Tangani `message_deleted` dan `delete_message`:
    - Jika `data.type === 'for_me'`, hapus dari array timeline lokal jika cocok dengan user.
    - Jika `data.is_deleted === true` atau default delete: mutasi pesan lokal menjadi `{ ...m, is_deleted: true, content: data.content || '🚫 Pesan ini telah dihapus' }`.
  - Bersihkan juga pesan dari pinned messages atau reply preview jika pesan yang sedang dihapus relevan.

## Verification & Testing Plan
1. **Typecheck & Linter**:
   - Jalankan `npx tsc --noEmit` di direktori `mobile/` memastikan 0 error.
2. **Backend Regression Test**:
   - Jalankan `go test -v ./...` di direktori `backend/` memastikan semua test endpoint delete dan chat lolos.
