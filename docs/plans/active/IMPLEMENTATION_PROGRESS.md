# Implementation Progress: Fase 4

## 📌 Status Sub-Milestone

- [x] **Milestone 4.1: Sound FX Synthesizer (Web Audio API)** ✅
  - [x] Buat procedural sound generator di `frontend/lib/sound.ts`
  - [x] Tambahkan toggle mute di StatusBar / Header
  - [x] Integrasikan audio trigger pada pengiriman & penerimaan pesan
- [x] **Milestone 4.2: Live Typing Indicator** ✅
  - [x] Set `msg.Nickname` pada server WebSocket `onTyping` dan unit test `TestHubTypingBroadcast`
  - [x] Tambahkan handler debounce typing pada input box
  - [x] Tampilkan animated typing label di `StatusBar.tsx` dan author bubble di `ChatWindow.tsx`
- [ ] **Milestone 4.3: Real-Time Sidebar Snippet & Unread Badge Counter** 🚀 (Next)
- [ ] **Milestone 4.4: Message Receipts Status Transitions**
- [ ] **Milestone 4.5: Emoji Reactions & Reply/Quote Message**

## 📝 Catatan Milestone 4.1
- Menggunakan Web Audio API oscillator murni (bebas dependensi aset audio eksternal dan bebas lag loading).
