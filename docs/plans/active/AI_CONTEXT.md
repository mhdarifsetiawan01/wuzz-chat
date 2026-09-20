# AI Context

- **Repository**: wuzz-chat
- **Branch**: feature/group-memory-ai
- **Feature**: Group Memory AI — Milestone 3 (AI Service Integration & Structured Output)
- **Active Task**: M3 AI Engine, Prompt Builder, JSON Contract, Evidence Resolver & Draft Pipeline
- **Constraints**:
  - Work strictly on branch `feature/group-memory-ai`.
  - Strict Group-Scoped data isolation.
  - Limit 1.000 messages with `was_truncated` flag if exceeded.
  - Strict Boundary `[DATA DISKUSI]` to prevent prompt injection.
  - Evidence snapshot isolation (withstand message deletion).
  - Pluggable AI provider interface with Mock provider for offline testing and real provider support.
