# DECISION_LOG.md — Technical Decisions Log

## DEC-014: In-Memory Message Cache Layer (SWR Pattern for Chat Timelines)
- **Status**: Implemented & Verified
- **Context**: Entering a chat room (`ChatScreen`) previously initialized a local empty message array (`useState<Message[]>([])`) and triggered a full-screen loading spinner (`Memuat pesan...`) while awaiting the WebSocket `history` event. This caused unnecessary UI flicker and perceived latency on mobile.
- **Decision**: Introduce `MessageContext.tsx` providing an in-memory dictionary `messagesByRoom: Record<string, Message[]>`. Rooms with existing cached messages render in 0ms without a loading spinner. The room's WebSocket `join` event operates as a background revalidation trigger (Stale-While-Revalidate).
- **Consequences**:
  - Positive: Instantaneous chat screen transitions, no loading flicker for visited rooms.
  - Positive: Incoming messages are collected centrally even if the user is on `HomeScreen` or another screen.

## DEC-015: E2EE Plaintext Preservation during Delta Reconciliation
- **Status**: Implemented & Verified
- **Context**: When WebSocket sends a `history` packet during background revalidation, E2EE messages might arrive as ciphertext. If local memory already holds decrypted plaintext, a naive overwrite could revert messages back to ciphertext or require re-decryption.
- **Decision**: The reconciliation algorithm preserves previously decrypted message content when merging incoming history, matching on `m.id`. Additionally, it deduplicates messages and sorts chronologically.
- **Consequences**:
  - Positive: Seamless continuity of decrypted message text, zero decryption overhead on cached messages.

## DEC-016: Reverse Infinite Scroll & Cursor-Based Pagination for Message History
- **Status**: Implemented & Verified
- **Context**: To handle rooms with thousands of messages without excessive memory consumption, the active timeline loads the 50 latest messages. When a user scrolls to the top of the chat, older messages must be paginated seamlessly.
- **Decision**:
  - Backend: Implement OpenAPI-compliant `GET /api/messages?room_id=...&before=<timestamp>&limit=50` via `GetRoomHistoryBefore` across SQL and Memory stores, service layer, router, and `ChatHandler`.
  - Client: When scrolling near the top (`contentOffset.y <= 40`) or clicking the header button, `ChatScreen` calls `loadOlderMessages(roomId)`. Older messages are prepended to `messagesByRoom[roomId]` while guarding against `scrollToEnd` auto-jumps using `isPrependingRef`.
- **Consequences**:
  - Positive: Low memory footprint, fast initial render, scalable to arbitrary room sizes.
  - Positive: Complete test coverage with dedicated test `TestChatHandler_GetMessages`.
  - Consideration: Backend deployment to Fly.io (`fly deploy --remote-only`) will be required for production activation.
