# Implementation Plan: Mobile Conversation Global Context & SWR Layer

## 🎯 Objectives
Provide a robust global state management and Stale-While-Revalidate (SWR) caching layer for conversations in the mobile app, resolving UX lag and repetitive loading spinners when navigating between `ChatScreen` and `RecentChatsScreen`.

## 📁 Impacted Files
- `mobile/src/context/ConversationContext.tsx` (NEW)
- `mobile/src/context/index.ts` (MODIFIED)
- `mobile/App.tsx` (MODIFIED)
- `mobile/src/screens/RecentChatsScreen.tsx` (MODIFIED)

## 🏗️ Technical Architecture & Workflow
1. **`ConversationContext` Architecture**:
   - Manages `conversations: Conversation[]`, `isLoading: boolean`, `isRefreshing: boolean`, and `error: string | null`.
   - `isLoading` is set to `true` strictly on first boot / initial fetch when `conversations` is empty. Subsequent revalidations use `isSilent = true` (or `isRefreshing = true` if user pulls down).
   - Encapsulates `decryptSnippet` logic with cached peer public keys to keep the snippet decryption decoupled from individual screen lifecycles.
   - Subscribes to `websocketClient.on('message')` to invoke `refreshConversations(true)` centrally.
   - Provides optimistic `updateConversationPin(roomId, isPinned)` with rollback on API failure.
2. **Provider Hierarchy (`mobile/App.tsx`)**:
   - `DeviceProvider` -> `AuthProvider` -> `ConversationProvider` -> `CallProvider` -> `AppNavigator`.
   - Ensures `ConversationProvider` has access to authenticated user credentials and E2EE keypairs.
3. **Screen Refactoring (`RecentChatsScreen.tsx`)**:
   - Replaces local `conversations`, `isLoading`, `isRefreshing`, and `fetchConversations` with hook `useConversations()`.
   - Uses `refreshConversations(true)` on screen mount when cached data already exists, guaranteeing immediate 0ms render.
   - Cleans up duplicate socket listeners and cryptographic imports.

## 🧪 Verification Strategy
- Run `cd mobile && npx tsc --noEmit` to verify type safety and interface adherence.
- Code review to ensure no memory leaks, unclosed listeners, or unexpected state resets.
