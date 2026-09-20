# Implementation Plan: Milestone 1 — Foundation & Data Model

## 🎯 Objective
Membangun fondasi data persisten dan layer Go repository untuk mendukung lifecycle Group Memory AI sesuai spesifikasi di `docs/GROUP_MEMORY_AI_SPEC.md`.

## 📦 Scope of Work

### 1. Database Schema DDL (7 Tabel Baru)
- `forum_memory_jobs`: Job antrean AI (id, forum_id, group_id, status, attempt_count, max_attempts, next_retry_at, last_error, message_count, timestamps).
- `memory_drafts`: Kontainer draft hasil AI (id, job_id, forum_id, group_id, status, message_count_processed, was_truncated, created_at, reviewed_at, reviewed_by).
- `memory_artifacts`: Butir artefak (id, draft_id, type [SUMMARY/DECISION/JOURNEY_LITE], content, confidence [HIGH/MEDIUM/LOW], ai_original_content, is_human_edited, is_removed, position).
- `artifact_evidences`: Kutipan pesan asli (id, artifact_id, message_id, message_preview, message_sender_name, message_sent_at).
- `approved_memories`: Read-model terdenormalisasi (id, draft_id, forum_id, group_id, approved_by, approved_at, has_human_edits, snapshot_summary, snapshot_decisions JSONB, snapshot_journey_lite, is_journey_lite_removed).
- `memory_review_actions`: Audit log append-only (id, draft_id, admin_id, action, artifact_id, old_content, new_content, rejection_reason, created_at).
- `memory_view_events`: Analitik pembacaan memori (id, approved_memory_id, viewer_id, group_id, forum_id, viewer_role, created_at).

### 2. Go Domain Models & Store Interface
- Definisikan tipe konstanta enum (`JobStatus`, `DraftStatus`, `ArtifactType`, `ConfidenceLevel`, `ReviewActionType`).
- Struct domain Go lengkap dengan tag JSON dan DB mapping.
- Interface `MemoryStore` dengan operasi CRUD dan kueri transaksional.

### 3. Implementation in SQL Store
- Eksekusi auto-migration DDL di `backend/internal/store/sql.go`.
- Metode implementasi `MemoryStore` di PostgreSQL & SQLite kompatibel.

### 4. Verification Plan
- Unit tests di `backend/internal/store/memory_store_test.go`:
  - Test pembuatan job dan transisi state.
  - Test penyimpanan draft, artifacts, dan evidences.
  - Test query approved memory read-model.
  - Test append-only audit log review actions.
- Jalankan automated test suite `go test -v ./...` (wajib 100% PASS).
