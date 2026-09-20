# AI Context

- **Repository**: wuzz-chat
- **Branch**: feature/group-memory-ai
- **Feature**: Group Memory AI — Milestone 1 (Foundation & Data Model)
- **Active Task**: M1 Database Schema & Store Models
- **Constraints**:
  - Strict Dev-Only work (No work on `main`).
  - Strict Group-Scoped data isolation (all queries bounded by `group_id`).
  - No breaking changes to existing `conversations`, `messages`, `users` tables.
  - Snapshot evidence model to withstand deletion of original messages.
  - PostgreSQL `FOR UPDATE SKIP LOCKED` compatibility.
  - Zero raw SQL drops/truncates.
