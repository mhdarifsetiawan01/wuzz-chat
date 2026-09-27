# IMPLEMENTATION_PLAN.md — Milestone M-Mobile-8.17

## 1. Objectives & Requirements
- **Goal**: Implement in-memory timeline state management with SWR caching for chat messages on mobile.
- **Problem Solved**: Eliminate blank/loading screens and blocking spinners when opening a chat room, while keeping all room timelines synchronized in real-time.
- **Key Specifications**:
  1. `MessageContext`: Provides `messagesByRoom`, `getRoomMessages(roomId)`, `isRoomLoading(roomId)`, `isRoomRevalidating(roomId)`, `appendMessage`, `updateMessage`, `removeMessage`, `reconcileHistory`.
  2. SWR 0ms Render: Instant display of cached messages; silent background revalidation on room join.
  3. Live WebSocket Synchronization: Centralized ingestion of `message`, `history`, `ack`, `receipt`, `reaction`, `message_deleted`, `delete_message`, `message_edited`, `message_pinned`, `message_unpinned`.
  4. Decryption preservation & deduplication during delta sync.
  5. Refactor `ChatScreen.tsx` to consume `useMessages()`.

## 2. Target Modified & Created Files
- `mobile/src/context/MessageContext.tsx` (NEW)
- `mobile/src/context/index.ts` (MODIFIED: export MessageContext)
- `mobile/App.tsx` (MODIFIED: wrap MessageProvider)
- `mobile/src/screens/ChatScreen.tsx` (MODIFIED: integrate useMessages, SWR 0ms render)

## 3. Technical Architecture & Data Flow
```text
[WebSocket Event Stream]
          │
          ▼
   [MessageContext] ◄─── (Centralized Ingestion)
     ├── messagesByRoom: Record<roomId, Message[]>
     ├── roomLoading: Record<roomId, boolean>
     └── roomRevalidating: Record<roomId, boolean>
          │
          ├── (0ms Cache Hit)
          ▼
     [ChatScreen] ───► Instant Render (0ms)
          │
          └── (Silent SWR Revalidation in Background)
```

## 4. Verification Strategy
- Type Safety: Run `cd mobile && npx tsc --noEmit` (0 errors).
- Memory Cache Integrity: Verify cached messages remain intact across chat room navigation.
- SWR Behavior: Verify that room entry with existing messages renders without displaying `Memuat pesan...`.
- Live WebSocket Events: Verify message appends, acks, receipts, edits, reactions, and deletions update cache.
