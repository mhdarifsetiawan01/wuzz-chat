# Implementation Plan: Fase 4 — Modern Chat UX & Interactive Dynamics

## 1. Objectives
Membangun pengalaman chatting yang hidup dan kaya umpan balik visual layaknya WhatsApp/Telegram:
1. **Unread Badge & Real-Time Sidebar Update**: Jumlah pesan belum dibaca di sidebar dan cuplikan pesan terakhir terupdate live.
2. **Sound FX & Notifikasi**: Audio saat kirim (`pop`) dan terima pesan (`ding`).
3. **Status Pesan (Message Receipts)**: `🕒 Pending` ➔ `✓ Sent` ➔ `✓✓ Delivered` ➔ `✓✓ Read Biru`.
4. **Live Typing Indicator**: Indikator lawan bicara sedang mengetik.
5. **Emoji Reactions & Reply Quote**: Balas pesan tertentu dan reaksi emoji.

## 2. Target Files
- **Backend:**
  - `backend/internal/ws/message.go` (Tambah field receipts, unread, quote)
  - `backend/internal/ws/hub.go` (Routing receipt status event & typing broadcast)
- **Frontend:**
  - `frontend/app/chat/Sidebar.tsx` (Unread badge & live snippet listener)
  - `frontend/app/chat/MessageBubble.tsx` (Tick icon `✓`/`✓✓`, reaction badge)
  - `frontend/app/chat/ChatWindow.tsx` (Live typing & sound trigger)
  - `frontend/lib/sound.ts` (Audio synthesizer Web Audio API / sound fx)

## 3. Verification Strategy
- Multi-tab simulation (Alice kirim pesan saat tab Bob sedang standby / di room lain ➔ cek unread badge bertambah & bunyi audio).
- Backend unit tests (`go test -v ./...`).
- Frontend build check (`npm run build`).
