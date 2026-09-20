# AI Context — Milestone 4: Review Backend API & Knowledge Endpoints

## Active Focus
- **Fitur**: Group Memory AI
- **Milestone**: M4 — Review Backend API & Knowledge Endpoints
- **Branch**: `feature/group-memory-ai`
- **Head Commit**: `89a2b6c`
- **Database Status**: 7 tabel auto-migrated di SQLite & PostgreSQL.
- **Worker Status**: Background job worker `MemoryJobWorker` sudah aktif dengan injeksi `MemoryProcessor`.

## Target Endpoints
1. `GET /api/memory/drafts?group_id={id}` (Admin only)
2. `GET /api/memory/drafts/{draft_id}` (Admin only)
3. `POST /api/memory/drafts/{draft_id}/approve` (Admin only)
4. `POST /api/memory/drafts/{draft_id}/reject` (Admin only)
5. `PATCH /api/memory/drafts/{draft_id}/artifacts/{artifact_id}` (Admin only)
6. `DELETE /api/memory/drafts/{draft_id}/journey` (Admin only)
7. `POST /api/memory/drafts/{draft_id}/approve-with-changes` (Admin only)
8. `GET /api/groups/{id}/memories` (All members)
9. `GET /api/memories/{memory_id}` (All members + view event tracking)
