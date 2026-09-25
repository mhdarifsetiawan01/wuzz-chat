# Decision Log — Milestone M-Mobile-8.7

## DEC-037: Dual-Payload Strategy for Message Deletion API
- **Context**: Backend Go menerima payload fleksibel (`delete_for_everyone: true` boolean dan `type: "for_everyone" | "for_me"` string, serta `id` / `message_id`).
- **Decision**: Mengirimkan seluruh field kunci secara lengkap dalam satu request (`message_id`, `id`, `delete_for_everyone`, `type`) untuk menjamin kompatibilitas 100% tanpa risiko mismatch versi handler backend.

## DEC-038: 60-Second Countdown & Graceful State for "Delete for Everyone"
- **Context**: Aturan backend membatasi *Delete for Everyone* dalam jangka waktu maksimal 60 detik sejak pesan terkirim.
- **Decision**: Menghitung sisa detik di sisi mobile secara dinamis. Jika pesan sudah melebihi 60 detik, tombol dinonaktifkan dengan label waktu habis, atau hanya menyisakan opsi "Hapus untuk Saya", selaras dengan perilaku di web desktop.

## DEC-039: Instant Client-Generated UUIDv4 ID Consistency (Fix 404 on Delete)
- **Context**: Sebelumnya pesan optimistik yang baru dikirim menggunakan prefix sementara `tempId = req_...`. Backend database menghasilkan UUIDv4 baru secara terpisah di DB, sehingga jika pesan langsung dihapus sebelum/tanpa ID sync, API `DELETE /api/messages` menerima string `req_...` dan mengembalikan error 404 "pesan tidak ditemukan".
- **Decision**: Menggunakan `Crypto.randomUUID()` secara deterministik sejak pesan dibuat di timeline lokal dan dikirimkan di payload WebSocket (`id: msgId`, `request_id: msgId`). Dengan demikian, ID pesan di state lokal dan di tabel SQL database identik 100% sejak milidetik ke-0. Ditambahkan pula rekonsiliasi ID pada listener event `ack` dan `receipt` untuk pesan lama/masuk.
