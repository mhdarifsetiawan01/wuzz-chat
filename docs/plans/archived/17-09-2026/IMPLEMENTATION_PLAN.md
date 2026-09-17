# Implementation Plan: Bugfix Kontrak Payload Delete for Everyone

- **Objective**: Menyelaraskan kontrak komunikasi REST API penghapusan pesan (`/api/messages/delete`) antara Frontend dan Backend Go agar aksi "Hapus untuk Semua Orang" (*Delete for Everyone*) tereksekusi dengan benar di database, menghapus konten, menandai `is_deleted = true`, dan memancarkan event WebSocket `message_deleted` secara real-time ke semua klien di room.
- **Target Files**:
  - `backend/internal/api/chat_handler.go` (Menerima field `type`, `delete_type`, `delete_for_everyone`, query parameters).
  - `frontend/lib/api.ts` (Kirim payload eksplisit `delete_for_everyone: boolean` dan `type: string`).
  - `backend/internal/api/chat_and_media_e2e_test.go` atau `chat_handler_test.go` (Menambahkan unit & integration test untuk Delete for Me dan Delete for Everyone dengan variasi payload).
- **Architecture**:
  - REST API & WebSocket sync
  - Zero regression
  - Backward compatibility: mendukung klien lama maupun baru
- **Verification Strategy**:
  - `go test -v ./...` pada backend
  - `npm run build` pada frontend
