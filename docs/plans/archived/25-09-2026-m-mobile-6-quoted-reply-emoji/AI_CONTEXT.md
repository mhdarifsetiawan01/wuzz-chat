# AI Context & Active Workspace — Milestone M-Mobile-6

- **Repository**: `wuzz-chat` (Monorepo: Go Backend + Next.js Frontend + Expo React Native Mobile)
- **Active Branch**: `dev` (strictly enforced, no direct commits to `main`)
- **Status**: Planning (Awaiting User Approval)
- **Active Milestone**: Milestone M-Mobile-6: Quoted Reply, Swipe-to-Reply & WhatsApp-Style Emoji Picker in `mobile/`
- **Primary Target Directories**:
  - `mobile/src/components/` (EmojiPicker, ChatInputBar, MessageBubble, MessageActionSheet)
  - `mobile/src/screens/` (ChatScreen)
  - `mobile/src/services/` (websocket.ts)
  - `mobile/src/api/` (types.ts, messages.ts)
  - `mobile/src/constants/` (emojis.ts)
- **Architectural & Safety Constraints**:
  - Strict Dev-Only work (`dev` branch).
  - WhatsApp Aurora design system & colors from `mobile/src/theme/colors.ts`.
  - Dual-Platform rule: single-screen flow for mobile, preserving web interop.
  - Transparent E2EE: AES-256-GCM encryption for replies in direct chats.
  - No server modifications required (WebSocket hub and REST API already support reactions, replies, and deletion).
