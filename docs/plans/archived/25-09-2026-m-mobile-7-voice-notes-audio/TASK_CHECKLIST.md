# Task Checklist — Milestone M-Mobile-7: Voice Notes & Audio Messaging

- **Branch**: `dev`
- **Status**: Implementasi & Verifikasi Otomatis Selesai (Menunggu Konfirmasi Pengguna)

---

### Daftar Tugas Atomic:

1. [x] **Task 1**: Pemasangan dependencies `expo-av` dan inisialisasi `audioManager.ts` (manajemen single playback).
2. [x] **Task 2**: Implementasi tombol mikrofon 🎙️ dan mode rekam WhatsApp-style di [ChatInputBar.tsx](file:///home/bms-del112/BMS/personal-project/wuzz-chat/mobile/src/components/ChatInputBar.tsx).
3. [x] **Task 3**: Pembuatan komponen [AudioPlayerBubble.tsx](file:///home/bms-del112/BMS/personal-project/wuzz-chat/mobile/src/components/AudioPlayerBubble.tsx) dengan tombol Play/Pause, scrubber waveform, durasi realtime, dan kecepatan 1x/1.5x/2x.
4. [x] **Task 4**: Integrasi [MessageBubble.tsx](file:///home/bms-del112/BMS/personal-project/wuzz-chat/mobile/src/components/MessageBubble.tsx) (dukungan `media_type: 'audio'`) dan [ChatListItem.tsx](file:///home/bms-del112/BMS/personal-project/wuzz-chat/mobile/src/components/ChatListItem.tsx) (snippet "🎙️ Pesan Suara").
5. [x] **Task 5**: Integrasi alur pengiriman di [ChatScreen.tsx](file:///home/bms-del112/BMS/personal-project/wuzz-chat/mobile/src/screens/ChatScreen.tsx) (optimistic UI 0ms, upload `/api/media/upload`, WebSocket payload `audio`).
6. [x] **Task 6**: Verifikasi kualitas otomatis (`npx tsc --noEmit`, `npm run build`, `go test ./...`) dan pelaporan bukti uji.
