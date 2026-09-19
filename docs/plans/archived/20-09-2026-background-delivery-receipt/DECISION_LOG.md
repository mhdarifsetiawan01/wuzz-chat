# Decision Log

## DEC-016: Dual-Tier Background Delivery Receipt Architecture
- **Konteks**: Saat pengirim mengirim pesan ke penerima yang menutup PWA, pesan tertahan di centang 1 (✓ `sent`) meskipun notifikasi Web Push sudah masuk ke HP penerima. Centang 2 abu baru muncul saat PWA dibuka karena event `delivered` sebelumnya hanya dipicu pada WebSocket `onJoin`.
- **Keputusan**:
  1. Menambahkan ID pesan (`message_id`) ke payload push notification.
  2. Mengimplementasikan konfirmasi ganda (*Dual-Tier*):
     - **Tier 1 (Gateway Level)**: Ketika server Go menerima status HTTP 201/200 dari FCM/Apple push endpoint, server langsung menandai pesan sebagai `delivered` dan membroadcast `TypeReceipt` ke room pengirim.
     - **Tier 2 (Service Worker Level)**: Saat event `push` aktif di Service Worker (`sw.js`), SW melakukan background request ke `POST /api/messages/receipt` menggunakan token JWT yang disimpan di CacheStorage.
- **Konsekuensi**: Pengirim langsung melihat centang 2 abu-abu seketika notifikasi push terkirim/diterima di HP tanpa menunggu penerima membuka aplikasi PWA.
