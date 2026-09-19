# Decision Log

- **DEC-016**: Anti-Accidental Logout on Browser Back Navigation & Immediate URL Sanitization.
  - **Konteks**: Pengguna yang berhasil login dari URL `/login?logout=1` masih memiliki entri URL tersebut di history stack browser. Jika menekan tombol *Back* dari `/chat`, halaman login terpanggil kembali dan menghapus token yang sedang aktif.
  - **Keputusan**:
    1. Cek sesi aktif (`!isAuthLoading && user`) diprioritaskan di atas pengecekan `isLogout`: jika pengguna sudah login, langsung pantulkan (*bounce*) kembali ke `/chat` via `router.replace('/chat')` tanpa menyentuh storage/logout.
    2. Begitu `?logout=1` terdeteksi di `/login` pada kondisi belum login, URL segera disanitasi menggunakan `window.history.replaceState(null, '', window.location.pathname)` agar parameter `logout=1` hilang dari riwayat peramban.
    3. Alur login sukses (`handleSubmit`) menggunakan `router.replace` alih-alih `router.push` sehingga halaman login tidak tertinggal di belakang riwayat obrolan.

