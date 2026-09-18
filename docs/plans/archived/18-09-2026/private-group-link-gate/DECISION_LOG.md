# Active Decision Log

### DEC-013: Private Group Link Gate & Authorization Shield
- **Konteks**: Non-member yang membuka tautan grup privat (`/chat?room=grp_xxx`) sebelumnya melihat ruang obrolan kosong dan error timeout "Koneksi Sedang Terhambat" karena penolakan otorisasi backend.
- **Keputusan**: 
  1. Hapus blocking `alert(error)` di `fetchGroupDetails`.
  2. Hadirkan status eksplisit `privateGroupDenied` saat menerima HTTP 403.
  3. Gantikan ruang obrolan dengan kartu elegan bertema Aurora Glassmorphism "Grup Ini Bersifat Privat" dengan tombol "Kembali ke Beranda".
  4. Blokir pengiriman frame WebSocket join bagi non-member grup privat.
