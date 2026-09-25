# Handover — Milestone M-Mobile-8.7

- **Feature**: Real-time Message Deletion ("Hapus untuk Semua Orang" & "Hapus untuk Saya") on Mobile
- **Fix Applied**: Resolusi error 404 "pesan tidak ditemukan" dengan memastikan klien mobile membuat ID berupa `Crypto.randomUUID()` resmi saat mengirim pesan dan menyinkronkan real ID pada listener `ack` & `receipt`.
- **Verification Evidence**:
  - `npx tsc --noEmit` (mobile/): 0 errors
  - `go test ./...` (backend/): 100% passed
- **Impacted Files**:
  - `mobile/src/api/messages.ts`
  - `mobile/src/components/MessageActionSheet.tsx`
  - `mobile/src/components/MessageBubble.tsx`
  - `mobile/src/screens/ChatScreen.tsx`
  - `mobile/src/services/websocket.ts`
- **Next Action**: Menunggu konfirmasi penyelesaian dari pengguna sebelum melakukan sinkronisasi dokumentasi (Tiered Sync) dan git commit.
