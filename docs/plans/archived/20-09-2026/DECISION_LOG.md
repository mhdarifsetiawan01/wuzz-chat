# Decision Log — Milestone 8.13

## DEC-014: Direct WebSocket Kick on E2EE Key Transfer Consume
- **Context**: Saat perangkat baru memanggil `POST /api/users/transfer/consume`, basis data diperbarui tetapi perangkat lama di WebSocket Hub tidak segera ditendang sampai perangkat baru melakukan handshake upgrade WebSocket.
- **Decision**: `TransferHandler` disuntikkan dependensi `*ws.Hub` sehingga pemanggilan `ConsumeTransferSession` yang berhasil akan langsung memanggil `h.hub.KickClientByUserID` seketika.
- **Consequences**: Mengeliminasi window race condition di mana perangkat lama masih merasa aktif saat transfer telah selesai dikonsumsi.

## DEC-015: Unified Z-Index Modal Hierarchy & Event-Driven Auto-Dismiss
- **Context**: `DeviceTransferModal` (z-index 160) menutupi `DeviceConflictModal` (z-index 150) di layar laptop, dan modal generator QR tidak mendengarkan event pergantian sesi.
- **Decision**: 
  1. `DeviceConflictModal` dinaikkan ke `var(--z-modal-top)` (1100).
  2. `DeviceTransferModal` dan `ProfileModal` diset ke `var(--z-modal)` (1000).
  3. `WsClient` memancarkan custom event `wuzz:session_replaced` agar modal yang terbuka dapat menampilkan pesan sukses pengalihan dan menutup dirinya sendiri secara mulus.
