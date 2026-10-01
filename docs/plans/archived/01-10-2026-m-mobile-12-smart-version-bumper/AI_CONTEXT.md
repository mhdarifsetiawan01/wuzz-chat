# AI Context — Smart Version Bumper & Conventional Commits SOP

- **Target Workspace**: `wuzz-chat` (Monorepo Go + Next.js + React Native Expo)
- **Active Branch**: `dev` (STRICT: Do NOT touch `main`)
- **Active Task**: Smart Version Bumper via Conventional Commits & Android Gradle Release Hook
- **Active Constraints**:
  1. Conventional Commits Standard: AI commit messages MUST strictly follow `feat:`, `fix:`, `refactor:`, `perf:`, `BREAKING CHANGE:`.
  2. Single Source of Truth: `app.json` is the single source of truth; Android `build.gradle` reads directly from `app.json`.
  3. Release-Only Automation: Smart bump runs automatically during release tasks (`assembleRelease` / `bundleRelease`), keeping debug builds fast.
  4. Server Lifecycle & Commit Approval: Obey server port cleanup and mandatory user approval before commit.
