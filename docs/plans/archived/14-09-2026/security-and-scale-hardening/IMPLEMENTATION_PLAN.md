# Implementation Plan: Fase 4 — Modern Chat UX & Interactive Dynamics

## 1. Sub-Milestones Breakdown
Untuk menjaga kualitas kode, stabilitas sistem, dan kemudahan verifikasi, Fase 4 dipecah menjadi 5 sub-milestone kecil:

1. **Milestone 4.1: Sound FX Synthesizer (Web Audio API)** 🚀 *(Aktif)*
   - Procedural Web Audio API sound generator (`lib/sound.ts`).
   - Suara kirim (*pop/whoosh*) & terima (*ding chord*).
   - Audio mute/unmute toggle dengan persistensi LocalStorage.
2. **Milestone 4.2: Live Typing Indicator** ⏳
   - WebSocket typing broadcast event (`typing_start` / `typing_stop`).
   - Debounce handler & indikator di header/chat window.
3. **Milestone 4.3: Real-Time Sidebar Snippet & Unread Badge Counter** ⏳
   - Counter unread badge per percakapan & update cuplikan pesan terakhir secara live.
4. **Milestone 4.4: Message Receipts Status Transitions** ⏳
   - Siklus status: `🕒 Pending` ➔ `✓ Sent` ➔ `✓✓ Delivered` ➔ `✓✓ Read Biru`.
5. **Milestone 4.5: Emoji Reactions & Reply/Quote Message** ⏳
   - Quick reaction selector & quote preview bar.

## 2. Target Files Milestone 4.1
- `frontend/lib/sound.ts` (Web Audio API sound synthesizer & mute storage)
- `frontend/app/chat/StatusBar.tsx` (Sound toggle switch)
- `frontend/app/chat/page.tsx` (Trigger `playSendSound` & `playReceiveSound`)

## 3. Verification Strategy
- Smoke test audio synthesizer via browser.
- Multi-tab testing (Alice & Bob).
- Frontend production build check (`npm run build`).
