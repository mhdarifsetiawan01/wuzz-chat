# Handover Notes

## Verification Results
- **Mobile (`mobile/`)**: `npx tsc --noEmit` -> PASS (0 error)
- **Frontend (`frontend/`)**: `npm run build` -> PASS (Next.js 16 Turbopack production build)
- **Backend (`backend/`)**: `go test ./...` -> PASS (100% passed)

## Summary of Changes
1. `mobile/src/components/ChatInputBar.tsx`:
   - Menambahkan prop `replySenderName?: string` ke `ChatInputBarProps`.
   - Mengganti logika baris 349 agar tidak lagi mendahulukan `replyTo.from` (UUID) dan dilengkapi regex anti-UUID fallback.
2. `mobile/src/screens/ChatScreen.tsx`:
   - Menambahkan fungsi helper `getMessageSenderName` yang mengembalikan `"Anda"` jika pesan milik sendiri, `title` jika obrolan 1-on-1 langsung, nama panggilan non-UUID jika pesan di grup, atau fallback `"Pengguna"`.
   - Mengoper `replySenderName={getMessageSenderName(replyingTo)}` ke `ChatInputBar`.
   - Memperbaiki payload quoted reply saat mengirim pesan teks dan pesan suara agar `nickname` yang tercatat tidak berupa raw UUID.
3. `mobile/src/components/MessageBubble.tsx`:
   - Memberikan filter anti-UUID pada tampilan nama pengirim pesan kutipan (`message.reply_to.nickname`).
4. `frontend/app/chat/MessageInput.tsx`:
   - Menyesuaikan banner preview reply di web agar menampilkan `"Anda"` jika membalas pesan milik sendiri (`currentUserId`).
