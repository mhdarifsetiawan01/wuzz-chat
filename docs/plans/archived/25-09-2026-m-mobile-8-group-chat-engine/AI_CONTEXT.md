# AI Context — Milestone M-Mobile-8: Core Group Chat Engine & Member Management

- **Corpus / Workspace**: `wuzz-chat`
- **Target Subsystem**: `mobile/` (React Native Expo Managed Workflow + TypeScript)
- **Active Git Branch**: `dev`
- **Milestone Reference**: Milestone M-Mobile-8 (Core Group Chat Engine & Member Management, docs/ROADMAP.md & docs/MOBILE_INTEGRATION_GUIDE.md Section 7)
- **Architecture Constraints**:
  - Dual-Platform Frontend Architecture (Mobile single-screen WhatsApp flow, 100dvh safe-area-insets, clean state transitions).
  - Design System Compliance: Adhere strictly to `colors`, `spacing`, `typography`, and `radius` tokens in `mobile/src/theme/`.
  - Anti-Double-Action Guards: All critical buttons (Create Group, Add Member, Kick, Leave, Change Role) must have instant disabled states and loading indicators.
  - Bypass E2EE Fail-Closed for Group Rooms (`grp_...`): TLS in-transit server-relayed transport; do not invoke pairwise ECDH key derivation or throw encryption errors.
  - Deterministic Sender Nickname Color: `getAvatarColor` or dedicated palette mapped to sender display name/UUID for group incoming bubbles.
  - No Direct Git Commit until user explicitly states "selesai".
