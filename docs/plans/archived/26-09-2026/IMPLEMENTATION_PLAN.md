# Implementation Plan — Milestone M-Mobile-8.8: Single Active Device Guard & Terminal Reconnect Protection

## 1. Problem Statement & Motivation
Under the `Slow & Flaky Server Resilience Rule` and `docs/MOBILE_INTEGRATION_GUIDE.md` Section 7, the mobile client must respect backend single active device policies. If a user logs in from another browser/phone, the Go Hub terminates the old connection by either sending a system `SESSION_REPLACED` message or closing the socket with Close Code `4001: SESSION_REPLACED`.
Without proper terminal guard:
- The mobile WebSocket client could mistakenly attempt exponential backoff reconnection, generating repeated 403 Forbidden handshakes.
- Modals embedded only inside `RecentChatsScreen` will fail to render if the user is currently inside `ChatScreen` or `GroupInfoScreen`, or when session state switches `isAuthenticated` to false before the modal is seen.

## 2. Technical Architecture & Modifications

### A. WebSocket Client (`mobile/src/services/websocket.ts`)
1. **Terminal Flag**:
   - Add/synchronize `public destroyed = false;` alongside `this.isTerminated = true;`.
   - Prevent any reconnection attempts in `scheduleReconnect()` and `initSocket()` if `this.destroyed || this.isTerminated`.
2. **Close Code 4001 / Terminal Close Handler**:
   - In `ws.onclose`, detect `event.code === 4001` or reason matching `SESSION_REPLACED` / `DEVICE_KICKED`.
   - Call centralized `this.handleSessionReplaced(reason)`.
3. **Incoming Payload Handler**:
   - In `dispatchMessage()`, check if `type === 'SESSION_REPLACED'` or `type === 'session_replaced'` or `(type === 'system' && message.content?.includes('SESSION_REPLACED'))`.
   - Call `this.handleSessionReplaced(reason)` and dispatch event to `session_replaced` listeners.
4. **Centralized `handleSessionReplaced(reason: string)` Method**:
   - Guard against duplicate calls if already terminated.
   - Set `this.isTerminated = true`, `this.destroyed = true`, `this.setState('terminated')`.
   - Clear any pending reconnect timers.
   - Close WebSocket instance safely if still open.
   - Notify `this.sessionReplacedHandler(reason)`.
   - Dispatch to `this.listeners.get('session_replaced')`.
5. **Reset Method**:
   - `reset()` method clears `isTerminated = false`, `destroyed = false`, `isExplicitlyClosed = false`, and resets `reconnectAttempt = 0`.

### B. Auth Context (`mobile/src/context/AuthContext.tsx`)
1. **Session Replacement Listener**:
   - When `onSessionReplaced` is called, unsubscribe notifications, purge local session from `secureStorage`, reset `user`, `token`, `e2eeKeyPair`, and set `sessionReplacedMessage`.
2. **`dismissSessionAlert` Action**:
   - Clear `sessionReplacedMessage`, call `secureStorage.clearSession()`, and invoke `websocketClient.reset()`.

### C. Root Navigation & UI (`mobile/App.tsx` & `mobile/src/screens/RecentChatsScreen.tsx`)
1. **Global `SessionAlertModal` Placement in `App.tsx`**:
   - Move `SessionAlertModal` to the root `AppNavigator` container wrapping screen content.
   - When dismissed:
     - Clear `sessionReplacedMessage`.
     - Reset screen navigation state: `setActiveConversation(null)`, `setActiveGroupInfo(null)`, `setIsNewGroupOpen(false)`, `setIsNewChatOpen(false)`, `setForumParentConversation(null)`.
     - Direct route to `login` (`setAuthRoute('login')`).
2. **Clean up duplicate modal**:
   - Remove duplicate `<SessionAlertModal>` from `RecentChatsScreen.tsx`.

## 3. Impacted Files
- `mobile/src/services/websocket.ts`
- `mobile/src/context/AuthContext.tsx`
- `mobile/App.tsx`
- `mobile/src/screens/RecentChatsScreen.tsx`
- `docs/MOBILE_INTEGRATION_GUIDE.md`

## 4. Verification & Testing Strategy
- Automated Typecheck: `npx tsc --noEmit` in `mobile/`
- Backend Verification: `go test -v ./...` in `backend/`
- Frontend Build: `npm run build` in `frontend/`
- SOP Verification: Review docs checklist synchronization.
