# Implementation Summary: Bugfix Kontrak Payload Delete for Everyone

- **Status**: Selesai Diimplementasikan & Terverifikasi (100% Pass)
- **Branch**: `dev`
- **Fokus Utama**: Memperbaiki inkonsistensi payload penghapusan pesan antara Frontend (`frontend/lib/api.ts`) dan Backend (`backend/internal/api/chat_handler.go`).
- **Masalah**: Frontend mengirim `{ message_id, type: "for_everyone" }`, sedangkan backend Go mencari `{ delete_for_everyone: true }`. Akibatnya `DeleteForEveryone` selalu bernilai `false`, pesan hanya terhapus untuk diri sendiri (Delete for Me) dan teman bicara tetap melihat teks asli karena WebSocket event `message_deleted` tidak pernah dikirim.
- **Solusi**:
  1. Backend Go `chat_handler.go`: Normalisasi request parser agar mendukung `type: "for_everyone"`, `delete_type: "for_everyone"`, query string, dan boolean `delete_for_everyone`.
  2. Frontend `api.ts`: Mengirimkan kedua properti (`delete_for_everyone: boolean` dan `type: deleteType`) demi redundansi & backwards compatibility.
  3. Backend Unit Test: Menambahkan pengujian menyeluruh di test suite backend.
