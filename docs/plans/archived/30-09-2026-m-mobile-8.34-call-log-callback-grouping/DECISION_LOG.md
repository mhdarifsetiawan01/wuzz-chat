# Decision Log

### DEC-CALL-03: Peer ID & Room ID Segregation in Call Logging
- **Konteks**: Saat memulai panggilan dari `ChatScreen.tsx`, kode lama menggunakan fallback `conversation.id` (room ID) untuk `peerId`, yang menyebabkan record log panggilan menyimpan room ID di kolom `peer_id`. Akibatnya, saat callback dari log panggilan dijalankan, backend menolak karena room ID dianggap user ID yang tidak ditemukan.
- **Keputusan**: Gunakan `resolvedPeerId || conversation.peer_id` untuk identitas lawan bicara (`peer_id`), dan simpan `room_id` secara eksplisit di kolom tersendiri di SQLite (`local_call_logs.room_id`).

### DEC-CALL-04: Consecutive Call Grouping in Calls History UI
- **Konteks**: User menanyakan apakah memanggil 5 kali akan menampilkan 5 baris. Standar antarmuka chat WhatsApp mengelompokkan panggilan beruntun dengan kontak dan jenis yang sama menjadi 1 baris dengan badge counter `(x)`.
- **Keputusan**: Pertahankan penyimpanan individual per sesi di database SQLite lokal untuk integritas data historis, namun kelompokkan panggilan beruntun pada level rendering `CallsHistoryScreen` menjadi `Kontak (5)` dengan timestamp terkini.

