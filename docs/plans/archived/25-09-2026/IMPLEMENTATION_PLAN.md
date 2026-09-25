# Implementation Plan — Milestone M-Mobile-3: Contact Search & Start New Conversation

## 1. Overview & Objectives
Build the Contact Search and Start New Conversation feature (`NewChatScreen.tsx`) for WuzzChat Mobile (`mobile/`). This allows users on mobile to discover registered users, initiate direct encrypted/unencrypted conversations via the Go backend's `/api/conversations` endpoint, and immediately transition into the active `ChatScreen`.

Strictly adheres to:
- **Mandatory Dual-Platform Frontend Architecture Rule** (WhatsApp Single-Screen Flow: `Home ⇄ New Chat ⇄ Chat Room`, Android BackHandler).
- **Mandatory Slow & Flaky Server Resilience Rule** (15s `AbortController` timeout, debounced query, loading spinners, anti-double-action guard).
- **Token Efficiency & Clean Code Rules**.

---

## 2. Key Architecture & Endpoints
1. **REST Endpoints**:
   - `GET /api/users/search?q={query}`: returns `UserSummary[]` (`id`, `username`, `display_name`, `avatar_url`, `status_message`, `is_verified`).
   - `POST /api/conversations`: body `{"target_user_id": string}`, returns `{"room_id": string}`.
2. **API Layer (`mobile/src/api/users.ts`)**:
   - `searchUsers(query: string)`: Debounced search with `AbortController`.
   - `startDirectChat(targetUserId: string)`: Initiates room and returns `{ room_id: string }`.
3. **Components & Screens**:
   - `NewChatScreen.tsx`: WhatsApp-style header with back button, sticky search bar, real-time search results list, loading skeleton/indicator, empty state.
   - `RecentChatsScreen.tsx`: WhatsApp-style Floating Action Button (FAB) at bottom-right (`+` / Chat icon) with safe-area offset.
   - `App.tsx`: Seamless multi-view navigation (`RecentChats` ⇄ `NewChat` ⇄ `ChatRoom`) with Android hardware `BackHandler`.

---

## 3. Tasks Breakdown
- [ ] Task 1: Add user search & conversation creation API functions in `mobile/src/api/users.ts` and update `mobile/src/api/types.ts`.
- [ ] Task 2: Build `mobile/src/screens/NewChatScreen.tsx` with search input, debounce (300ms), user list, and anti-double-click guard.
- [ ] Task 3: Add Floating Action Button (FAB) in `mobile/src/screens/RecentChatsScreen.tsx` to launch `NewChatScreen`.
- [ ] Task 4: Wire `NewChatScreen` navigation in `mobile/App.tsx` and integrate Android hardware `BackHandler`.
- [ ] Task 5: Verify TypeScript compliance (`npx tsc --noEmit`) and conduct live smoke test on connected Android device via ADB.

