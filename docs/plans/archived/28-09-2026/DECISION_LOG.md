# Decision Log

### DEC-001: Thread-Safe SafeSend & Comprehensive Room Cleanup on Client Disconnect
- **Context**: Terjadi runtime panic `send on closed channel` di `Hub.BroadcastRoomUsers` ketika seorang client yang telah terputus masih tertinggal pointer-nya di dalam `h.rooms`.
- **Decision**:
  1. Tambahkan `sendMu sync.Mutex` dan method `SafeSend(msg)` serta `CloseSend()` pada `Client struct`. Pengiriman pesan ke `client.send` kini 100% terlindungi dari pengiriman ke closed channel.
  2. Saat `Unregister` dan `JoinRoom`, lakukan pembersihan menyeluruh ke semua entri `h.rooms` yang merujuk ke instance client tersebut. Hapus penugasan `c.RoomID = targetRoom` prematur di `client.go` sebelum `JoinRoom`.
  3. Di frontend `chat/page.tsx`, stabilkan dependency WebSocket initialization effect menggunakan ref agar perpindahan room tidak memutus koneksi WebSocket (0ms room switch).
