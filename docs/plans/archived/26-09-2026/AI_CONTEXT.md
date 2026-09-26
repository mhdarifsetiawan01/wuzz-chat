# AI Context — Milestone M-Mobile-8.9: E2EE Key Conflict Handling & Reset Dialog (HTTP 409)

## 🎯 Target Milestone & Objective
- **Milestone**: M-Mobile-8.9
- **Goal**: Implement E2EE key conflict detection (`HTTP 409: KEY_ALREADY_REGISTERED`) and user-facing resolution modal (`KeyConflictModal.tsx`) on WuzzChat Mobile.
- **Target Repository/Path**: `mobile/` (`mobile/src/components/KeyConflictModal.tsx`, `mobile/src/components/index.ts`, `mobile/src/context/AuthContext.tsx`, `mobile/App.tsx`).
- **Relevant Docs**: `docs/MOBILE_INTEGRATION_GUIDE.md` (Section 2B, 3A, 7), `docs/BACKEND_API.md`.

## 🛡️ Active Constraints & Safety Directives
- **Branch**: `dev` (Strict Dev-Only Work, prohibited from modifying `main`).
- **Protocols**:
  - `implementation-protocol`: Initialize active plan in `docs/plans/active/`, present plan to user, wait for approval before writing feature code.
  - `Token Efficiency Guard`: Range reading, grep search, diff-chunk edits.
  - `Clean Architecture & Token Design`: Comply with `mobile/src/theme` tokens, safe-area insets, and proper keyboard handling for password input.
  - `Local-Only Session Abort Rule`: If the user cancels the key conflict dialog, purge local credentials without invoking `POST /api/auth/logout` to the backend server so the primary device's active session is not disturbed.
  - `No Commit Before Approval`: Do not commit until explicit user approval ("selesai").
