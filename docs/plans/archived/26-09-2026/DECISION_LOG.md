# Decision Log: DEC-012 & DEC-013 Mobile

## DEC-033: Pre-Flight Group Verification & WebSocket Gating in Mobile ChatScreen
- **Context**: When a user navigates to a group (via search, direct link, or deep link), `ChatScreen` historically joined the WebSocket room immediately. For unauthorized private groups, this resulted in an empty room, rejected events, and false connection timeout errors.
- **Decision**: Introduce a pre-flight group verification step for group rooms (`grp_...`) before dispatching `{ type: "join" }`. If `GET /api/groups/{id}` returns HTTP 403 Forbidden, immediately render `AuthorizationShield`, suppress WebSocket join, and cancel loading timeouts. If public and user is not a member, prompt with `GroupPreviewModal` before joining.
- **Impact**: Full compliance with DEC-012 & DEC-013, zero wasted socket traffic, and clear user authorization feedback.
