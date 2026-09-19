# Decision Log

## 🎯 DEC-014: Scoped Notification Recipient Model for Sub-Group Join Requests
- **Date**: 2026-09-20
- **Status**: Accepted
- **Context**: 
  Subgrup privat mewajibkan permohonan izin gabung (`POST /api/groups/{id}/join-request`). Sebelumnya data hanya tersimpan secara pasif di database `conversation_join_requests`. Admin/creator tidak menerima alert real-time atau push notification.
- **Decision**:
  1. **Strict Target Notification**: Notifikasi hanya dikirimkan ke:
     - Creator dari subgrup tersebut (`conversations.created_by`)
     - Anggota subgrup yang memiliki role `admin` atau `creator` di tabel `conversation_members` subgrup.
     - Admin/creator grup induk yang belum/tidak bergabung ke subgrup privat TIDAK menerima notifikasi untuk menghindari spam dan menjaga privasi ruang diskusi subgrup.
  2. **Multi-Channel Dispatch**:
     - WebSocket: Pengiriman event instan ke koneksi admin/creator yang sedang online.
     - Web Push Notification: Pengiriman notifikasi latar belakang ke admin/creator yang sedang offline/background.
  3. **Badge Counter**: Menambahkan kolom `pending_requests_count` pada respons `GET /api/groups/{parent_id}/subgroups` untuk menampilkan badge jumlah permohonan tertunda pada tombol `📋 Kelola Izin`.
  4. **Feedback Loop ke Pemohon**: Saat admin menyetujui (`approved`) atau menolak (`rejected`), pemohon (`targetUserID`) menerima WebSocket event & Push Notification secara real-time.
