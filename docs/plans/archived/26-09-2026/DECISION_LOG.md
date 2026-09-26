# Decision Log — Milestone M-Mobile-8.8

## Architectural & Technical Decisions

### DEC-020: Global Root Hoisting for `SessionAlertModal`
- **Context**: Previously, `SessionAlertModal` was placed inside `RecentChatsScreen.tsx`. If a user was chatting inside `ChatScreen` or browsing `GroupInfoScreen`, or if `isAuthenticated` reverted to `false` upon credential purge, the modal would be unmounted before user interaction.
- **Decision**: Hoist `SessionAlertModal` to the root view hierarchy inside `AppNavigator` (`mobile/App.tsx`). This ensures the modal overlays any active screen and persists until the user acknowledges the notification.
- **Consequences**: Upon dismissal, all active subscreen states (`activeConversation`, `activeGroupInfo`, `isNewChatOpen`, `isNewGroupOpen`) are reset to `null` / `false`, and the user is redirected to `LoginScreen`.

### DEC-021: Dual-Trigger Session Replacement Handling (Payload + Close Frame)
- **Context**: Backend Go Hub sends both a WebSocket system message with `SESSION_REPLACED` content and subsequently closes the connection with Close Code `4001: SESSION_REPLACED` after a 500ms grace period.
- **Decision**: Handle session replacement on both triggers in `WebSocketClient`:
  1. Early trigger on incoming message (`onmessage` with `SESSION_REPLACED`).
  2. Fallback/direct trigger on socket closure (`onclose` with code 4001 or matching reason).
- **Consequences**: An idempotent guard (`if (this.isTerminated) return;`) prevents duplicate side-effects. The client terminates auto-reconnection immediately on the first event received.
