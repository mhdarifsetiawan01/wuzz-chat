# Implementation Progress — Milestone M-Mobile-8.7

- [x] Task 1: API Client Helper (`mobile/src/api/messages.ts`)
  - [x] Implementasikan `deleteMessage(messageId: string, forEveryone: boolean, roomId?: string): Promise<void>`
  - [x] Pastikan payload memuat `message_id`, `id`, `delete_for_everyone`, `type: "for_everyone" | "for_me"`
- [x] Task 2: Confirmation Dialog WhatsApp-Style (`mobile/src/components/MessageActionSheet.tsx`)
  - [x] Cek `isSelf` berdasarkan `message.from === currentUserId || isSelf` (UUID-First Identity)
  - [x] Tambahkan countdown timer 60s untuk "Hapus untuk Semua Orang" dengan badge dinamis
  - [x] Tampilkan opsi kondisional (hanya "Hapus untuk Saya" jika pesan orang lain)
- [x] Task 3: MessageBubble Placeholder & Interaction Guard (`mobile/src/components/MessageBubble.tsx`)
  - [x] Deteksi `isDeleted` dari flag `is_deleted` dan placeholder `🚫 Pesan ini telah dihapus`
  - [x] Nonaktifkan swipe-to-reply dan onLongPress jika `isDeleted`
  - [x] Sembunyikan checklist delivery receipt dan tampilkan teks miring abu-abu dengan icon `🚫`
- [x] Task 4: WebSocket Handling & Optimistic State (`mobile/src/screens/ChatScreen.tsx`)
  - [x] Optimistic update seketika di `handleDeleteMessage` dengan rollback jika terjadi kegagalan jaringan
  - [x] Sinkronisasi event WebSocket `message_deleted` & `delete_message`
- [x] Task 5: Automated Verification & Quality Gate
  - [x] Jalankan `npx tsc --noEmit` di `mobile/` (Lolos 0 error)
  - [x] Jalankan `go test ./...` di `backend/` (Lolos 100%)
