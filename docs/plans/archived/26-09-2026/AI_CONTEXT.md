# AI Context — Milestone M-Mobile-8.8: Single Active Device Guard & Terminal Reconnect Protection

## 🎯 Target Milestone & Objective
- **Milestone**: M-Mobile-8.8
- **Goal**: Implement single active device guard & terminal reconnect protection for WuzzChat Mobile client when account is accessed from another device (WebSocket Close Code `4001: SESSION_REPLACED` & event payload `type: "SESSION_REPLACED"` / `session_replaced`).
- **Target Repository/Path**: `mobile/` (`mobile/src/services/websocket.ts`, `mobile/src/context/AuthContext.tsx`, `mobile/App.tsx`, `mobile/src/screens/RecentChatsScreen.tsx`).
- **Relevant Docs**: `docs/MOBILE_INTEGRATION_GUIDE.md` (Section 2B, 2C, 7).

## 🛡️ Active Constraints & Safety Directives
- **Branch**: `dev` (Strict Dev-Only Work, prohibited from working on `main`).
- **Protocols**:
  - `implementation-protocol`: Stage plan, present to user, wait for approval before code modification.
  - `Slow & Flaky Server Resilience Rule`: Halt auto-reconnect permanently on terminal code 4001 (`destroyed = true`), clean local storage, inform user via modal.
  - `Token Efficiency Guard`: Range reading, grep search, diff-chunk edits.
  - `Server Lifecycle Rule`: Do not leave servers running; kill test ports after verification.
  - `No Commit Before Approval`: Do not commit until explicit user approval ("selesai").
