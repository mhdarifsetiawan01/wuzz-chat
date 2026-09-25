# Decision Log — Milestone M-Mobile-1: Mobile App Initiation & Auth Layer

### `DEC-M01`: Choice of Framework & Structure
- **Decision**: Use Expo Managed Workflow + TypeScript template for `mobile/`.
- **Rationale**: Provides cross-platform native compilation for Android and iOS, fast iteration with Expo development client, and native modules for secure storage and cryptography without bare native maintenance overhead.

### `DEC-M02`: Device ID & Persistent Identity
- **Decision**: Generate a UUIDv4 on first app launch using `expo-crypto` and persist in `expo-secure-store`.
- **Rationale**: Satisfies the multi-device session requirement in `docs/MOBILE_INTEGRATION_GUIDE.md` where each physical mobile installation possesses an immutable `device_id` paired with `X-Device-Platform`.

### `DEC-M03`: Network Layer & Abort Timeout
- **Decision**: Wrap Native `fetch` with standard headers and `AbortController` (15s timeout limit).
- **Rationale**: Complies with the Mandatory Slow & Flaky Server Resilience Rule. Prevents mobile UI freezes when running on cellular networks with packet loss or latency.

### `DEC-M04`: WebSocket Session Replacement Guard (Close Code 4001)
- **Decision**: Singleton WebSocket client halts reconnection loop immediately on receiving Close Code 4001, purges local session, and renders a blocking alert.
- **Rationale**: Aligns with backend multi-device enforcement where logging in on a new primary device replaces existing sessions. Reconnecting automatically would cause a reconnection storm or 403 errors.

### `DEC-M05`: Canonical Conversation Schema & Avatar Resiliency
- **Decision**: Align `mobile/src/api/types.ts` and `ChatListItem.tsx` with Go backend's `ConversationItem` (`title`, `peer_nickname`, string `last_message`). Make `Avatar.tsx` fall back to initials on empty or invalid URLs.
- **Rationale**: The Go backend sends `title` and string `last_message`. Without this mapping, avatars displayed `?` and conversation titles appeared blank.

### `DEC-M06`: WebSocket Custom Origin Header for Mobile Platforms
- **Decision**: Explicitly pass `{ headers: { Origin: originHeader } }` in React Native's `WebSocket` constructor (`https://chat.wuzzhub.id` on production, `http://localhost:3000` on local).
- **Rationale**: React Native's OkHttp client on Android defaults the `Origin` header to the target host (`https://wuzz-chat-backend.fly.dev`). Because the Go backend's `Upgrader.CheckOrigin` strictly matches against `CORS_ALLOWED_ORIGINS` (which contains authorized frontend web domains), the default Origin caused `403 Forbidden` handshake failures and persistent reconnecting states. Explicitly setting an authorized Origin satisfies CORS validation and establishes seamless real-time connectivity.

### `DEC-M07`: Realtime History Loading via WebSocket (`TypeHistory`)
- **Decision**: Subscribe to WebSocket `history` events and dispatch `join` upon opening a chat room, instead of querying REST `GET /api/messages`.
- **Rationale**: The Go backend architecture streams conversation message history over WebSocket during the `join` lifecycle (`hub.sendRoomHistory`). This avoids `405 Method Not Allowed` on REST endpoints and immediately activates presence and unread/delivered receipt updates in a single round-trip.

### `DEC-M08`: Hardware Back Button & Dual-Screen WhatsApp Flow
- **Decision**: Implement Android `BackHandler` and sticky WhatsApp-style header with `hitSlop` in `ChatScreen`.
- **Rationale**: Strictly complies with the Mandatory Dual-Platform Frontend Architecture Rule (Mobile WhatsApp Single-Screen Flow: `Home ⇄ Chat Room`), preventing double-navigation loops and accidental app exits on Android back gesture.

### `DEC-M09`: Debounced User Search with Abort Timeout
- **Decision**: Implement a 300ms debounce timer for user search queries and enforce standard 15s `AbortController` timeout on `GET /api/users/search?q=...`.
- **Rationale**: Prevents network congestion, server overload, and race conditions from fast typing on mobile touch keyboards, while adhering to the Mandatory Slow & Flaky Server Resilience Rule.

### `DEC-M10`: Anti-Double-Click Guard on Direct Conversation Creation
- **Decision**: Disable user item selection and show an inline spinner immediately upon tapping a search result while `POST /api/conversations` is pending.
- **Rationale**: Prevents accidental duplicate requests and race conditions over mobile networks when creating direct chat rooms.
