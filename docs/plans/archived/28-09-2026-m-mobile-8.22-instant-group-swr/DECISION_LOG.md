# DECISION LOG — Mobile Group Chat SWR & Instant Local Hydration

## DEC-020: Optimistic Non-Blocking SWR for Group Chat Navigation
- **Konteks**: Pengguna merasa membuka grup selalu mengalami delay dan loading spinner seperti mengambil pesan dari awal, padahal local storage (SQLite) sudah menyimpan riwayat pesan grup. Hal ini diakibatkan oleh pre-flight check blocking `isVerifyingGroup` yang menunggu response `groupsApi.getGroupDetails` sebelum merender linimasa dan sebelum memicu hidrasi pesan dari SQLite/WebSocket.
- **Keputusan**:
  1. Klasifikasikan ruang obrolan: Jika grup dibuka dari daftar obrolan lokal atau memiliki metadata keanggotaan aktif (`isKnownGroupMember`), set `isVerifyingGroup = false` sejak awal mount.
  2. Linimasa pesan langsung dirender secara instan (0ms) memanfaatkan SWR memory cache dan SQLite local storage.
  3. Pengecekan detail grup via HTTP berjalan di latar belakang untuk sinkronisasi judul, avatar, dan role.
  4. Proteksi DEC-012 dan DEC-013 tetap dipertahankan penuh untuk skenario tautan langsung (direct link / deep link) grup baru yang belum terverifikasi keanggotaannya.
- **Konsekuensi Positif**: Navigasi ke ruang obrolan grup menjadi instan (< 50ms) dan sepenuhnya mendukung offline reading.
