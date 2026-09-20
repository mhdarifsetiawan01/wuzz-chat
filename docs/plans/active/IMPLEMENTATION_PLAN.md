# Implementation Plan: Milestone 4 — Review Backend API & Knowledge Endpoints

## 🎯 Objective
Membangun REST API backend terproteksi untuk alur review admin (persetujuan, penyuntingan, dan penolakan draft memori grup) serta endpoint konsumsi pengetahuan permanen bagi seluruh anggota grup sesuai `docs/GROUP_MEMORY_AI_SPEC.md` Bagian 9 & 11.

## 📦 Scope of Work

### 1. Handler & Controller (`backend/internal/api/memory_handler.go`)
- **Admin Review Endpoints**:
  - `GET /api/memory/drafts?group_id={id}`: Mengambil daftar draft berstatus `pending_review` untuk grup tertentu.
  - `GET /api/memory/drafts/{draft_id}`: Mengambil detail lengkap draft memori beserta artefak dan snapshot bukti pendukung (`artifact_evidences`).
  - `POST /api/memory/drafts/{draft_id}/approve`: Menyetujui draft memori as-is secara transaksional, menghasilkan `approved_memories`, dan mencatat `MemoryReviewAction`.
  - `POST /api/memory/drafts/{draft_id}/reject`: Menolak draft memori dengan alasan opsional (`rejection_reason`) dan mencatat `MemoryReviewAction`.
  - `PATCH /api/memory/drafts/{draft_id}/artifacts/{artifact_id}`: Mengedit konten teks artefak (`content`), menandai `is_human_edited = true`, dan mencatat audit review action `EDITED_*`.
  - `DELETE /api/memory/drafts/{draft_id}/journey`: Menandai artefak `JOURNEY_LITE` sebagai `is_removed = true` dan mencatat review action `REMOVED_JOURNEY`.
  - `POST /api/memory/drafts/{draft_id}/approve-with-changes`: Menyetujui draft setelah dilakukan pengeditan/penghapusan, membuat `approved_memories` dengan flag `has_human_edits = true`.

- **Member Knowledge Endpoints**:
  - `GET /api/groups/{id}/memories`: Mengambil daftar memori terkurasi yang disetujui (`approved_memories`) untuk semua anggota grup.
  - `GET /api/memories/{memory_id}`: Mengambil detail memori terkurasi lengkap beserta snapshot keputusan dan perjalanan diskusi, sekaligus mencatat `memory_view_events` untuk analitik keterbacaan.

### 2. Otorisasi Berlapis (Multi-Tier RBAC)
- **Layer 1**: Autentikasi JWT (Token wajib valid).
- **Layer 2**: Keanggotaan Grup (User harus merupakan anggota percakapan grup induk).
- **Layer 3**: Peran Administratif (Untuk endpoint review draft, user wajib memiliki peran `admin` atau `creator`).
- **Layer 4**: Scope Isolation (Memastikan `draft_id` benar-benar berada di dalam `group_id` yang divalidasi).

### 3. Ekstensi Store / Repository (`backend/internal/store/memory_store.go`)
- Menambahkan kueri pendukung jika belum tersedia:
  - `GetDraftWithDetails(ctx, draftID string) (*MemoryDraftDetail, error)`
  - `UpdateArtifactContent(ctx, artifactID, content string) error`
  - `RemoveArtifact(ctx, artifactID string) error`
  - `GetApprovedMemoriesByGroupID(ctx, groupID string, limit, offset int) ([]ApprovedMemory, error)`
  - `GetApprovedMemoryByID(ctx, memoryID string) (*ApprovedMemory, error)`

### 4. Router Wiring (`backend/main.go`)
- Menghubungkan seluruh rute `/api/memory/...` dan `/api/groups/{id}/memories` ke router Chi dengan middleware otentikasi.

### 5. Automated Test Suite (`backend/internal/api/memory_handler_test.go`)
- Test kasus otorisasi (401 Unauthorized, 403 Forbidden untuk non-admin, 200 OK untuk admin).
- Test lifecycle review: Get Drafts -> Get Detail -> Edit Artifact -> Approve With Changes.
- Test rejection flow: Reject with reason -> Validasi status REJECTED di DB.
- Test member viewer: Anggota reguler dapat membaca approved memories tetapi tidak dapat mengakses review drafts.
- Full verification: `go test ./...` dan `npm run build` (100% PASS).
