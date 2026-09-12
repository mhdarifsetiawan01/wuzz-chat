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
- [x] **Milestone 4.3: Real-Time Sidebar Snippet & Unread Badge Counter** ✅
  - [x] Reactive state `unreadCounts` di `Sidebar.tsx` (+1 saat pesan masuk ke room non-aktif)
  - [x] Auto-reset unread counter saat user membuka/mengklik room tersebut
  - [x] Live reordering conversation list (room terupdate otomatis naik ke paling atas)
  - [x] Tampilan timestamp `HH:mm` dan badge hijau `conv-unread-badge`
- [x] **Milestone 4.4: Message Receipts Status Transitions** ✅
  - [x] Skema basis data kolom `status VARCHAR(32) DEFAULT 'sent'` pada tabel `messages` dengan auto-migration & method `UpdateMessageStatus`
  - [x] Backend WebSocket handler `TypeReceipt` & ACK sender `status: sent` di `client.go` & `hub.go`
  - [x] Unit test `TestHubReceiptsFlow` lulus 100%
  - [x] Reducer `UPDATE_MESSAGE_STATUS` di `frontend/app/chat/page.tsx` dengan transisi non-downgrading (`pending` ➔ `sent` ➔ `delivered` ➔ `read`)
  - [x] Rendering WhatsApp/Telegram-style receipt icons di `MessageBubble.tsx` (`🕒`, `✓`, `✓✓`, `✓✓` blue `#53bdeb`)
  - [x] Pengiriman otomatis `delivered` & `read` receipts saat pesan lawan bicara diterima/dibuka
- [ ] **Milestone 4.5: Emoji Reactions & Reply/Quote Message**

## 📝 Catatan Milestone 4.4
- Status transisi receipt menggunakan bobot prioritas (`pending`: 0, `sent`: 1, `delivered`: 2, `read`: 3) sehingga status tidak akan pernah ter-downgrade secara tidak sengaja oleh race condition WebSocket.

