# AI Context & Active Workspace — Milestone M-Mobile-7

- **Repository**: `wuzz-chat` (Monorepo: Go Backend + Next.js Frontend + Expo React Native Mobile)
- **Active Branch**: `dev` (strictly enforced, no direct commits to `main`)
- **Active Milestone**: Milestone M-Mobile-7: Voice Notes & Audio Messaging
- **Platform Scope**: React Native Mobile Client (`mobile/`) with Next.js Web Frontend (`frontend/`) and Go Backend (`backend/`) cross-platform interop.
- **Core Technology**:
  - Audio Engine: `expo-av` (v16.0.8, Expo SDK 57 compatible) for recording (.m4a/AAC) and playback.
  - UI Design System: Dark Mode WhatsApp Aurora (`frontend/DESIGN.md`, `mobile/src/theme/`).
  - Network & Upload: `mediaApi` multipart upload (`/api/media/upload`) with 60s timeout AbortController guard.
  - Realtime & E2EE: RFC 6455 WebSocket Hub (`mobile/src/services/websocket.ts`) + NIST P-256 / AES-256-GCM.
- **Current Lifecycle State**: Plan Formulated — Pending User Approval before code execution.
