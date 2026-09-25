# AI Context: Mobile Persistent Local Media Cache (DEC-034)

- **Target Workspace**: `mobile/` (React Native Expo Managed Workflow)
- **Active Branch**: `dev`
- **Objective**: Implement local filesystem persistence for media (images & voice notes) so files remain viewable and playable after server Store-and-Forward deletion (`media_status === 'expired'`).
- **Architectural Constraints**:
  - Dual-Platform Frontend Architecture (Mobile single-screen WhatsApp flow)
  - Token-first Design System (`mobile/src/theme/`)
  - Mandatory Slow & Flaky Server Resilience (15s AbortController timeout, offline fallback)
  - Immutable UUID checking (DEC-008 / DEC-031)
  - Strict Dev-Only work (No commits directly on `main`)
  - No commits prior to explicit user approval ("selesai")
