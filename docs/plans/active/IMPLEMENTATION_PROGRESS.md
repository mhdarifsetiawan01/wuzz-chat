# Implementation Progress: Fase 4

- [ ] **Milestone 4.1: Unread Counter & Sidebar Real-Time Sync**
  - [ ] Update WebSocket event payload untuk update percakapan aktif
  - [ ] Tambahkan badge angka unread di `Sidebar.tsx`
  - [ ] Update live `last_message` di sidebar tanpa reload
- [ ] **Milestone 4.2: Audio Sound Effects (Web Audio API)**
  - [ ] Buat utilitas sound FX ringan tanpa file eksternal (`frontend/lib/sound.ts`)
  - [ ] Trigger suara saat pesan terkirim & pesan diterima
- [ ] **Milestone 4.3: Status Pesan (Receipts Checklist)**
  - [ ] Tanda `✓ Sent` (disimpan server)
  - [ ] Tanda `✓✓ Delivered` (diterima klien penerima)
  - [ ] Tanda `✓✓ Read Biru` (dibaca oleh penerima)
- [ ] **Milestone 4.4: Live Typing Indicator**
  - [ ] Broadcast typing event antar client di room/DM yang sama
  - [ ] Animasi 3-dot typing di bubble dan status bar
- [ ] **Milestone 4.5: Emoji Reactions & Reply Quote**
  - [ ] UI picker reaksi emoji di tiap balon chat
  - [ ] Quote / Reply tampilan balasan pesan di atas input box
