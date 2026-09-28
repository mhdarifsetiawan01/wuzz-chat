# AI Context & Boundaries

- Target Platform: React Native Expo Mobile (`mobile/`)
- Domain: Messaging & Read Receipts Synchronization / Realtime Navigation Lifecycle
- Target Files:
  - `mobile/src/services/sqliteStorage.ts`
  - `mobile/src/api/messages.ts`
  - `mobile/src/context/ConversationContext.tsx`
  - `mobile/src/screens/ChatScreen.tsx`
  - `mobile/src/screens/RecentChatsScreen.tsx`
- Constraints:
  - Strict Dev-Only Branch (`dev`)
  - No live browser required
  - Typecheck gate: `npx tsc --noEmit` in `mobile/`
  - 0ms Optimistic unread reset & receipt sync across mobile navigation transitions
