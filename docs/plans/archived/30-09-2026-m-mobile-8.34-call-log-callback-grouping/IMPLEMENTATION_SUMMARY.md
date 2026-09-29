# Implementation Summary — Fix Call Log Callback & Consecutive Grouping

## 🎯 Executive Snapshot
- **Permasalahan 1**: Apakah jika user A memanggil user B sebanyak 5 kali akan tercatat 5 baris log?
  - **Penjelasan**: Ya, saat ini di SQLite lokal setiap sesi panggilan disimpan sebagai satu baris terpisah (`INSERT INTO local_call_logs`). Namun, pada tampilan antarmuka (UI) standar chat modern (WhatsApp), panggilan berturut-turut ke/dari kontak yang sama seharusnya dikelompokkan (*grouped*) menjadi satu entri dengan badge jumlah panggilannya, misal `Kontak (5)`.
- **Permasalahan 2**: Jika salah satu log panggilan di klik tombol panggil (callback), panggilan tidak terhubung ke tujuan ("tidak masuk"). Panggilan hanya bisa terhubung jika ditelepon dari dalam chat room.
  - **Root Cause Utama**:
    1. Di `ChatScreen.tsx`, `handleVoiceCall` menggunakan `peerId = (conversation as any).peer_user_id || (conversation as any).user_id || conversation.id`. Karena `peer_user_id` tidak ada, maka `peerId` jatuh ke `conversation.id` (yaitu Room ID, misal `conv_01J...`, bukan User ID!).
    2. Saat panggilan selesai, `session.peerId` yang disimpan ke SQLite adalah Room ID.
    3. Ketika dipanggil dari `CallsHistoryScreen.tsx`, sistem mencoba memanggil `startCall('', item.peer_id, displayName)`. Backend mencoba `startDirectChat` dengan `target_user_id = conv_01J...`, yang gagal karena itu bukan ID user!
    4. `LocalCallRecord` di SQLite tidak menyimpan kolom `room_id`, sehingga roomId selalu kosong saat callback dari history.
    5. Di `CallContext.tsx`, `startCall` tidak menjalankan `websocketClient.joinRoom(targetRoomId)` sebelum mengirim offer, dan tidak memastikan koneksi WebSocket aktif (`ensureConnected`), sehingga signaling WebRTC dari luar chat room tidak ter-routing di Hub.

