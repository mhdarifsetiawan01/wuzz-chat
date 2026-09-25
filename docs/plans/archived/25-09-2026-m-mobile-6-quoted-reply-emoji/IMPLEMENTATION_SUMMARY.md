# Implementation Summary — Milestone M-Mobile-6

- **Milestone**: Milestone M-Mobile-6: Quoted Reply, Swipe-to-Reply & WhatsApp-Style Emoji Picker
- **Status**: Planning (Pending Approval)
- **Active Branch**: `dev`
- **Impacted Scope**: `mobile/` React Native Expo application
- **Deliverables**:
  1. **WhatsApp-Style Emoji Picker**: Docked tray (~280dp) replacing the soft keyboard, toggle button 😊 ⇄ ⌨️ in `ChatInputBar`, anti-jump transition, modular categories from `frontend/lib/emojis.ts`.
  2. **PanResponder Swipe-to-Reply**: Horizontal swipe to right on `MessageBubble` with spring-back animation and animated ↩️ icon; Reply Preview Banner above input; Quote box in bubble with left accent border and tap-to-scroll to original message.
  3. **Long Press Action Sheet & Quick Reactions**: WhatsApp-style modal with 6 quick reactions (👍, ❤️, 😂, 😮, 😢, 🙏), Quoted Reply action, Copy Text via `expo-clipboard`, and Delete Message with 60s "Tarik untuk Semua Orang" vs "Hapus untuk Saya".
  4. **E2EE & WebSocket Protocol Continuity**: AES-256-GCM encrypted replies for direct chat, WebSocket payload synchronization for `reply_to`, `reaction`, and `message_deleted`.
