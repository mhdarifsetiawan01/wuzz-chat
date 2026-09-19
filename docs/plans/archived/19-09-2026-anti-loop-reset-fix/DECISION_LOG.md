# Decision Log

- **DEC-015**: Synchronous Local-First Purge & Server-Timeout Immunity pada Alur Logout.
  - **Konteks**: Saat logout, request jaringan ke backend bisa lambat atau timeout (terutama di jaringan seluler). Menaruh pembersihan `localStorage` setelah request jaringan menyebabkan kegagalan pembersihan dan memicu infinite reset loop antara dua perangkat.
  - **Keputusan**:
    1. Kredensial lokal (`localStorage`, state) wajib dihapus secara sinkron 0ms di awal proses logout.
    2. Notifikasi ke server dibatasi timeout 30 detik (`AbortController`), jika server lambat/timeout pengguna tetap keluar secara bersih tanpa membekukan antarmuka.
    3. State loading (`isLoggingOut`) dan tombol disabled aktif saat proses logout berlangsung untuk mencegah double-click race condition.
    4. Halaman login dilengkapi parameter `?logout=1` untuk memblokir auto-redirect ke linimasa obrolan dan memaksa input kredensial ulang.
