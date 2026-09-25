# Decision Log — Milestone 8.3: Message Management Suite (Mobile)

## DEC-037: Client-Side Architecture for Message Management Suite in React Native Mobile
- **Date**: 2026-09-26
- **Status**: Proposed / Pending Approval
- **Context**:
  Milestone 8.3 requires mobile implementation of 5 core message management features: Edit Message (15 min window), Forward Message (1-5 rooms with cross-room E2EE plaintext override), Pin Chat (sidebar/recent chats priority), Pin Message (banner max 3 with jump-to-message), and In-Chat Text Search (debounced search with navigation).
- **Decisions**:
  1. **Edit Message Window**: Only enable "Edit Pesan" in `MessageActionSheet` if `isSelf === true`, `is_deleted !== true`, message has content, and time difference is <= 15 minutes (`900_000 ms`).
  2. **Cross-Room E2EE Forwarding**: Direct messages in WuzzChat are encrypted per room key. Forwarding an encrypted ciphertext to other rooms will make it unreadable to recipients. Therefore, the mobile client retrieves the locally decrypted message text and passes it as `plaintext_content` to `POST /api/messages/forward`, which the backend uses to populate the target messages.
  3. **Pinned Messages Banner & Jump-to-Message**: Pinned banner will support up to 3 pins with a carousel index. Tapping the banner finds the index of the message in the active `messages` array and calls `flatListRef.current?.scrollToIndex({ index, animated: true })`, setting `highlightedMessageId` for 2 seconds.
  4. **In-Chat Search Debounce & Navigation**: Query input debounced by 300ms using a timer ref. Results array indexes mapped to timeline positions, with `▲` and `▼` navigating matches chronologically.
  5. **Pin Chat Ordering**: Sorted client-side in `RecentChatsScreen` with boolean check `(is_pinned || pinned)` as primary sort key, followed by descending timestamp.
