# Implementation Plan — Fix Infinite Reconnect & Flickering Loop on Chat Open

## 🎯 1. Problem Statement & Root Cause
Saat user (`mhdarifsetiawan`) membuka ruang obrolan (misal dengan `Semantic`), tampilan chat kedip-kedip tiada henti antara "Menyinkronkan Percakapan" + "Menunggu koneksi..." dan "Koneksi Sedang Terhambat" + "Message", sehingga user tidak bisa mengetik.

### Root Cause Diagnosis:
1. **Backend Crash (Panic: send on closed channel)**:
   - Terjadi panic di `Hub.BroadcastRoomUsers` (`hub.go:540`): `send on closed channel`.
   - Penyebab: Saat client berpindah room di `client.go:186`, baris `c.RoomID = targetRoom` dieksekusi sebelum `c.hub.JoinRoom(c, targetRoom)`. Akibatnya di `JoinRoom`, pengecekan `if c.RoomID != "" && c.RoomID != roomID` selalu false, sehingga client TIDAK PERNAH dibersihkan dari room lamanya di `h.rooms`.
   - Saat client disconnect, `Unregister` hanya membersihkan room terakhir dan menutup channel `close(c.send)`. Client tersebut tertinggal sebagai *zombie pointer* di room-room lain dengan channel `send` yang sudah ditutup.
   - Saat user lain (`mhdarifsetiawan`) membuka room obrolan tersebut, `JoinRoom` memanggil `BroadcastRoomUsers`, yang mencoba mengirim pesan `TypeRoomUsers` ke channel tertutup tersebut (`target.send <- msg`), memicu `panic: send on closed channel`.
   - Goroutine WebSocket HTTP handler langsung crash, memutus soket secara abnormal (Code 1005).
   - Klien browser mendeteksi putus koneksi, beralih ke state "Menunggu koneksi...", mencoba reconnect, terhubung kembali ("Message"), mengirim `join`, backend panic lagi, putus lagi -> looping tanpa henti.
2. **Channel Send Thread-Safety**:
   - `Client.send` belum memiliki proteksi mutex / SafeSend terpadu untuk mencegah pengiriman pesan jika channel sudah di-close saat unregister/eviction.
3. **Frontend WebSocket Lifecycle Reconnection Bug**:
   - Di `frontend/app/chat/page.tsx`, `useEffect` inisialisasi WebSocket memasukkan `resolvePeerKeyAndDecrypt` ke dalam array dependensi, sedangkan `resolvePeerKeyAndDecrypt` bergantung pada `roomId`.
   - Hal ini menyebabkan koneksi WebSocket dihancurkan dan dibuat ulang setiap kali user memilih room, bertentangan dengan arsitektur Single Connection Lifecycle (0ms reconnect).
   - Format DM multi-tenant `dm_<tenant>_<userA>_<userB>` belum didukung pada resolusi instan `dm_` di `page.tsx`.

---

## 🛠️ 2. Action Plan

### Task 1: Backend Channel Protection & Room Cleanup Hardening (`backend/internal/ws/`)
- Tambahkan `sendMu sync.Mutex` dan `closed bool` pada `Client struct`.
- Buat method `c.SafeSend(msg Message) bool`, `c.CloseSend()`, dan `c.IsClosed() bool`.
- Ganti semua pengiriman raw `c.send <- msg` dan `target.send <- msg` di `hub.go` dan `client.go` menggunakan `SafeSend`.
- Perbaiki `Hub.Unregister`: iterasi dan bersihkan client dari seluruh room di `h.rooms` saat disconnect.
- Perbaiki `Hub.JoinRoom`: hapus client dari room-room lama sebelum menambahkan ke room baru. Hapus penugasan prematur `c.RoomID = targetRoom` di `client.go:186`.
- Bersihkan juga room membership saat `kickClient` di `Hub.Register`.

### Task 2: Frontend Single Connection Lifecycle & DM Tenant Support (`frontend/app/chat/page.tsx`)
- Gunakan `useRef` untuk `resolvePeerKeyAndDecryptRef` di dalam WebSocket `useEffect` agar tidak memicu re-connect saat berpindah room.
- Dukung parsing multi-tenant DM ID (`dm_<tenant>_<userA>_<userB>`) di `page.tsx`.

### Task 3: Verification & Automated Tests
- Jalankan `go test -v ./...` di backend (termasuk unit & integration tests `internal/ws`).
- Jalankan `npm run build` di frontend (verifikasi 0 lint & 0 TypeScript errors).
- Uji koneksi WebSocket lokal / simulated join ke room DM untuk memastikan 0 panic dan pesan history diterima mulus.
