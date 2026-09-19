# Decision Log — Milestone 8.3: Message Management Suite

## DEC-016: Message Management Suite (Edit, Forward, Pin Chat, Pin Message, In-Chat Search)

- **Konteks**:
  Implementasi Milestone 8.3 untuk menghadirkan kesetaraan fitur pengelolaan pesan (*Message Management*) kelas dunia setara WhatsApp dan Telegram:
  1. *Edit Pesan*: Pengguna perlu memperbaiki salah ketik pada pesan terkirim tanpa merusak integritas riwayat percakapan.
  2. *Forward Pesan*: Pengguna perlu meneruskan pesan ke banyak kontak/grup sekaligus secara efisien dan aman dari kebocoran otorisasi.
  3. *Pin Chat (Sidebar)*: Pengguna perlu menyematkan percakapan penting di posisi teratas sidebar obrolan.
  4. *Pin Message (Dalam Chat)*: Pengguna perlu menyematkan hingga 3 pengumuman/pesan penting di dalam ruang obrolan.
  5. *In-Chat Search*: Pengguna perlu mencari pesan tertentu dalam linimasa chat aktif dengan navigasi cepat.

- **Keputusan Teknis**:
  1. **Edit Pesan (Window 15 Menit)**:
     - Dibatasi strictly pada 15 menit pertama sejak pesan dibuat (`CreatedAt`).
     - Otorisasi ketat UUID: hanya `from_id == user.id` yang diizinkan.
     - Penolakan pesan terhapus. Flag `is_edited: true` dan `edited_at` disimpan di database dan disiarkan via WebSocket `message_edited`.
  2. **Forward Pesan (Multi-Target 1–5 Room)**:
     - Endpoint `POST /api/messages/forward` dengan validasi BOLA per target room (harus member di setiap target).
     - Pesan hasil forward diberi flag kekal `is_forwarded: true`.
     - Siaran real-time ke masing-masing target room via WebSocket Hub.
  3. **Pin Chat Sidebar (Per-User Isolation)**:
     - Disimpan di `conversation_members.is_pinned` & `pinned_at`.
     - Tidak mempengaruhi urutan chat anggota lain di room yang sama.
     - Sorting prioritas: `ORDER BY is_pinned DESC, last_message_time DESC`.
  4. **Pin Message Room (Max 3 Pins, FIFO Auto-Unpin)**:
     - Tabel relasional `pinned_messages` dengan composite index `idx_pinned_messages_conv`.
     - Ditegakkan aturan FIFO: jika menyematkan pesan ke-4, sistem otomatis menghapus pin terlama.
     - Penolakan pin pesan terhapus (HTTP 400).
     - Otomatis unpin saat pesan ditarik for everyone.
  5. **In-Chat Search & Privasi `cleared_at`**:
     - Case-insensitive substring match yang menghormati timestamp `cleared_at` milik user pemanggil.
     - Mengecualikan pesan ditarik (`is_deleted = true`).
