# Context Boundaries & System Constraints: Mobile Conversation Global Context & SWR Layer

## 🎯 Scope of Work
- **Target Subsystem**: Mobile React Native Expo client (`mobile/`).
- **Domain Focus**: Conversation list global caching & SWR (Stale-While-Revalidate) layer to eliminate UX blocking spinner ("Memuat obrolan...") when opening the app and switching back from `ChatScreen`.
- **Primary References**: `PROMPT.md`, `docs/context/MOBILE.md` (Section 2.E), `mobile/DESIGN.md`.

## 🛡️ Constraints & Anti-Patterns
1. **Branch Protection**: Strict dev-only work. Active branch is verified as `dev`. Never touch `main`.
2. **Zero Live Browser Testing**: Verification via `cd mobile && npx tsc --noEmit` (0 TypeScript errors) and code auditing.
3. **No Unapproved Git Commit**: Never run `git commit` until user explicitly states "selesai".
4. **Token Optimization**: Use line-range inspection and chunk editing. Avoid full-file overwrites for existing large files.
5. **Clean Unmount & Memory Leak Prevention**: Clear WebSocket listeners and timeout handlers on unmount.
