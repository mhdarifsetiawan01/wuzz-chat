# AI Context — Milestone 6: Member Knowledge Viewer (Frontend Next.js)

## Active Focus
- **Fitur**: Group Memory AI
- **Milestone**: M6 — Member Knowledge Viewer (Frontend Next.js)
- **Branch**: `feature/group-memory-ai`
- **Head Commit**: `327e4a3`
- **Backend Endpoints**:
  - `GET /api/groups/{id}/memories` (List memori grup untuk seluruh anggota)
  - `GET /api/memories/{memory_id}` (Detail memori grup + tracking `memory_view_events`)

## Target Components
1. `frontend/app/chat/memory/GroupMemoryDetailModal.tsx`: Tampilan detail memori permanen grup.
2. `frontend/app/chat/memory/GroupMemoryListModal.tsx`: Daftar linimasa arsip memori grup.
3. `frontend/app/chat/ChatArea.tsx`: Banner penampil memori di forum expired.
4. `frontend/app/chat/SubGroupListDrawer.tsx`: Tombol navigasi "Arsip Memori Grup".
5. `frontend/app/chat/page.tsx`: Wiring handlers dan modal state.
