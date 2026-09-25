# AI Context: Mobile Public Group Discovery & Private Group Shield (DEC-012 & DEC-013)

- **Target Workspace**: `mobile/` (React Native Expo Managed Workflow)
- **Active Branch**: `dev`
- **Architectural Constraints**:
  - Dual-Platform Frontend Architecture (Mobile single-screen WhatsApp flow)
  - Token-first Design System (`mobile/src/theme/`)
  - Mandatory Slow & Flaky Server Resilience (15s AbortController timeout, anti-double-action guards)
  - Immutable UUID checking for all identities and access controls (DEC-008 / DEC-031)
  - Strict Dev-Only work (No commits directly on `main`)
  - No commits prior to explicit user approval ("selesai")
