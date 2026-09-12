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
- [x] **Milestone 4.5: Emoji Reactions & Reply/Quote Message** ✅
  - [x] Auto-migration skema database kolom `reply_to_id`, `reply_to_nickname`, `reply_to_content`, `reactions` di tabel `messages`
  - [x] Backend method `ToggleReaction(msgID, emoji, userNickname)` di SQL & Memory store
  - [x] Handler WebSocket `TypeReaction` dan persistence quoted `reply_to` di `client.go` & `hub.go`
  - [x] Unit test `TestHubReplyAndReactions` lulus 100%
  - [x] Quoted message preview bar pada `MessageInput.tsx` dengan tombol batal `✕`
  - [x] Floating hover reaction bar (`👍 ❤️ 😂 😮 😢 🙏`) dan tombol reply (`↩️`) pada `MessageBubble.tsx`
  - [x] Interactive reaction badges di bawah balon pesan dengan highlight active user & toggle click
  - [x] Glassmorphism & micro-animations styling di `globals.css`

## 📝 Catatan Milestone 4.5
- Format `reactions` disimpan sebagai JSON array terstruktur di basis data, dan di-broadcast secara real-time ke seluruh klien di room percakapan yang sama.
- Balasan kutipan (*quoted reply*) terintegrasi mulus dengan layout bubble self & peer.


