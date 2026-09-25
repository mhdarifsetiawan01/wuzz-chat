# AI Context & Active Workspace — Milestone M-Mobile-5

- **Repository**: `wuzz-chat` (Monorepo: Go Backend + Next.js Frontend + Expo React Native Mobile)
- **Direct Workspace Target**: `mobile/` (React Native Expo Mobile Client)
- **Active Branch**: `dev` (strictly enforced, no direct commits to `main`)
- **Active Milestone**: Milestone M-Mobile-5: Media Attachments & Image/File Sharing
- **Applicable Rules & Constraints**:
  - `AGENTS.md` (Global & Workspace Rules):
    - Strict Branching Strategy: Dev-only work.
    - Mandatory Slow & Flaky Server Resilience: Explicit AbortController timeout (60s for media uploads), double-action & loading state guard.
    - Design System & Token Compliance: Follow `theme/colors.ts`, `theme/spacing.ts`, and WhatsApp Aurora aesthetics.
    - No direct commits before explicit confirmation ("selesai").
  - Technical Framework: Expo SDK 57, React Native 0.86, TypeScript, `expo-image-picker`.
