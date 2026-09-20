# AI Context

- **Repository**: wuzz-chat
- **Branch**: feature/group-memory-ai
- **Feature**: Group Memory AI — Milestone 2 (Job Queue & Expiry Trigger)
- **Active Task**: M2 Job Queue Worker & SubGroup TTL Trigger Integration
- **Constraints**:
  - Work strictly on branch `feature/group-memory-ai`.
  - Non-blocking asynchronous worker (goroutine daemon).
  - PostgreSQL `FOR UPDATE SKIP LOCKED` / SQLite atomic claim concurrency safety.
  - Integration with existing `SubGroupTTLWorker` without breaking current auto-purge logic.
  - Zero disruption to real-time chat throughput.
