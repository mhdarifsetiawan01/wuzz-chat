# AI Context — Milestone 8.3: Message Management Suite (Mobile)

## 📌 Context Snapshot
- **Platform**: React Native / Expo (`mobile/`)
- **Active Branch**: `dev`
- **Milestone**: 8.3 — Message Management Suite & Chat Optimization (Mobile Client)
- **Primary References**:
  - `docs/MOBILE_INTEGRATION_GUIDE.md` (Section 7: Message Management Suite)
  - `docs/ROADMAP.md` (Fase 8 Milestone 8.3)
  - `docs/BACKEND_API.md` (Endpoints: 13, 14, 16, 17, 18, 19, 20, 21; WS Events: 10, 11, 12)
  - `mobile/src/theme/` (Design tokens: colors, spacing, radius, typography)

## 🛡️ Critical Constraints & Safety Rules
1. **Protected Branch Guard**: Work strictly on `dev`. Never commit or touch `main`.
2. **Commit Gate**: Do NOT run `git commit` until the user explicitly responds with "selesai".
3. **Flaky & Slow Server Resilience**: All REST API calls must use `apiClient` with `AbortController` (15s timeout).
4. **TypeScript Quality Gate**: `npx tsc --noEmit` must pass with 0 errors.
5. **E2EE Cross-Room Plaintext Override**: Forwarded messages must decrypt ciphertext locally before sending `plaintext_content` to avoid cross-room decryption key errors.
6. **No Live Browser Required**: Automated typecheck and verification only.
