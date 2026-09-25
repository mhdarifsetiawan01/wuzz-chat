# Implementation Plan — Milestone M-Mobile-6: Quoted Reply, Swipe-to-Reply & WhatsApp-Style Emoji Picker

## 1. Objectives & Overview
Implement WhatsApp-grade interactive chat features in the mobile application (`mobile/`):
- Keyboard-docked emoji picker tray with smooth anti-jump keyboard transitions.
- Native `PanResponder` Swipe-to-Reply gesture with spring-back animation and visual reply indicator.
- In-bubble quoted message card with tap-to-scroll navigation to original messages.
- Staged reply preview banner docked directly above the chat input bar.
- Long-press contextual Action Sheet featuring 6 quick emoji reactions, reply trigger, clipboard copy, and dual-mode message deletion.
- Full E2EE and WebSocket parity with existing Go backend and Next.js web application.

---

## 2. Technical Architecture & Component Design

### Module A: Types & WebSocket Service Extensions
- **File**: `mobile/src/api/types.ts`
  - Extend `Message`:
    ```typescript
    reactions?: { emoji: string; users: string[]; count: number }[];
    is_deleted?: boolean;
    ```
- **File**: `mobile/src/api/messages.ts`
  - Update `deleteMessage(messageId: string, roomId: string, type: 'for_me' | 'for_everyone')`.
- **File**: `mobile/src/services/websocket.ts`
  - Update `sendMessage(roomId, content, requestId, media, replyTo)` with `replyTo?: { id: string; nickname?: string; content?: string }`.
  - Add `sendReaction(roomId: string, messageId: string, emoji: string): boolean`.

### Module B: Emoji Catalog & WhatsApp-Style Docked Emoji Tray
- **File**: `mobile/src/constants/emojis.ts`
  - Standardized Unicode emoji catalog ported from `frontend/lib/emojis.ts` (Faces 😀, Gestures 👍, Hearts ❤️, Objects ☕).
- **File**: `mobile/src/components/EmojiPicker.tsx`
  - Docked tray (`height: 280dp`, background: `colors.bgCardSolid` / `#161c28`, borderTop: `colors.borderSubtle`).
  - Top category selector bar with active indicator + Backspace action button (`⌫`).
  - Scrollable grid (7 columns) with smooth scrolling and instant touch response.
- **File**: `mobile/src/components/ChatInputBar.tsx`
  - Dynamic toggle button: switches between 😊 (open emoji tray) and ⌨️ (open text keyboard).
  - Anti-jump transition:
    - Tap 😊: dismiss keyboard via `Keyboard.dismiss()`, display docked emoji tray at bottom.
    - Tap ⌨️: hide emoji tray, focus text input (`inputRef.current?.focus()`).
    - Tap input directly: dismiss emoji tray, soft keyboard takes over smoothly.

### Module C: PanResponder Swipe-to-Reply & Bubble Quotes
- **File**: `mobile/src/components/MessageBubble.tsx`
  - Native `PanResponder` attached to message bubble container:
    - Restrict horizontal movement to right only (`dx > 0`), clamped between 0 and 70dp.
    - Horizontal gesture filter: `dx > 15 && dx > 1.5 * dy` to preserve vertical FlatList scrolling.
    - Left reply icon (`↩️`) with animated fade-in and scale.
    - On release past threshold (`dx >= 50`): trigger `onReply(message)` and animate back with `Animated.spring`.
  - Quoted message card inside bubble:
    - Rendered above message content if `message.reply_to` is present.
    - 3px solid accent border on left, dark tinted card background (`rgba(0,0,0,0.2)`), bold sender name, and truncated preview snippet.
    - Tap gesture: invokes `onPressQuote(message.reply_to.id)`.
  - Deleted message state:
    - If `message.is_deleted`: render muted italic text `🚫 Pesan ini telah dihapus`, suppressing media and captions.
  - Reaction pills:
    - Render reaction chips below the bubble showing emoji and counter. Tapping a pill toggles the reaction.

### Module D: Reply Preview Banner & Scroll-to-Message
- **File**: `mobile/src/components/ChatInputBar.tsx`
  - Staged reply banner above input bar:
    - Left accent border (WhatsApp green / Aurora blue).
    - Header: "Membalas ke <SenderName>".
    - Snippet: message text or "📷 Foto".
    - Cancel button (✕).
- **File**: `mobile/src/screens/ChatScreen.tsx`
  - State: `replyingTo: Message | null`.
  - When `onPressQuote(replyId)` is invoked:
    - Locate index of `replyId` in `messages`.
    - If found: `flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 })`.
    - Set `highlightedMessageId = replyId` for 1.5s to flash bubble border/background.

### Module E: Contextual Action Sheet & Quick Reactions
- **File**: `mobile/src/components/MessageActionSheet.tsx`
  - Triggered by `onLongPress` on `MessageBubble`.
  - Quick Reactions Bar at top:
    - Horizontal pill with 6 emojis: 👍, ❤️, 😂, 😮, 😢, 🙏.
    - Tapping emoji calls `onReact(message.id, emoji)` and closes sheet.
  - Action menu items:
    - ↩️ Balas Pesan: sets `replyingTo = message`, focuses input.
    - 📋 Salin Teks: copies content via `expo-clipboard` with feedback toast/alert.
    - 🗑️ Hapus Pesan:
      - If own message and sent ≤ 60 seconds: offers "Tarik untuk Semua Orang" (`for_everyone`) and "Hapus untuk Saya" (`for_me`).
      - Otherwise: offers "Hapus untuk Saya" (`for_me`).
      - Dispatches `messagesApi.deleteMessage()`.

### Module F: Realtime Synchronization & E2EE Continuity
- **File**: `mobile/src/screens/ChatScreen.tsx`
  - Listen for WebSocket `reaction` event: dynamically update target message reactions in local state.
  - Listen for WebSocket `message_deleted` event: mark target message as `is_deleted: true`.
  - In `handleSendMessage`:
    - If `replyingTo` is set, attach `reply_to: { id, nickname, content }` to WebSocket payload and optimistic message.
    - For direct chat, encrypt message body with `roomAESKey` via AES-256-GCM.

---

## 3. Verification Strategy
1. **TypeScript Typecheck**: Run `npx tsc --noEmit` in `mobile/` (0 errors).
2. **Frontend Build**: Run `npm run build` in `frontend/` (0 errors).
3. **Backend Tests**: Run `go test -v ./...` in `backend/` (100% pass).
