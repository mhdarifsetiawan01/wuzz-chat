# Task Checklist: Shared Media Hub for Group Chats & Forum Topics

- [x] **Task 1: SQL & In-Memory Store Logic**
  - [x] Perbarui `SQLMessageStore.AcknowledgeMediaDownload` agar mendeteksi apakah pesan berada di dalam grup (`grp_`) atau forum topik (`sub_`).
  - [x] Jika pesan grup/forum: kembalikan `canDelete = false` dan jangan ubah status pesan menjadi `expired`.
  - [x] Perbarui `MemoryMessageStore` agar memiliki perilaku yang sama.

- [x] **Task 2: Media Handler & API Logic**
  - [x] Perbarui `AcknowledgeDownload` di `backend/internal/api/media_handler.go` agar memvalidasi perlindungan media grup & forum topik.
  - [x] Pastikan file Supabase Storage tidak dihapus jika percakapan adalah grup atau forum topik.

- [x] **Task 3: Unit Testing & Verification**
  - [x] Tambahkan unit test skenario ACK direct message vs ACK group message vs ACK forum topic di `media_handler_test.go`.
  - [x] Jalankan `go test ./...` di backend (100% pass).
  - [x] Jalankan `npm run build` di frontend (100% pass).

- [x] **Task 4: Dokumentasi & Handover**
  - [x] Sinkronkan `docs/BACKEND_API.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY_AND_PERFORMANCE.md`, dan `docs/PROGRESS.md`.
  - [x] Berikan panduan deployment Fly.io ke pengguna.

