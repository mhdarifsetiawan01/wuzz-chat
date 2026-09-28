# Decision Log — M-Mobile-8.29

## DEC-001: Incremental Auto-Vacuum with Vacuum Fallback
- **Context**: SQLite in mobile OS holds deleted page allocations in freelists unless vacuumed. Full `VACUUM` can be slow and lock the DB, whereas `PRAGMA incremental_vacuum;` reclaims freelist pages gradually.
- **Decision**: Configure `PRAGMA auto_vacuum = INCREMENTAL;` at initialization, and run `PRAGMA incremental_vacuum;` with fallback to non-blocking catch.

## DEC-002: Subquery Ordering for SQLite Retention Pruning
- **Context**: Pruning older messages while keeping the latest 500 per room requires atomic SQL deletion.
- **Decision**: Use `DELETE FROM local_messages WHERE user_id = ? AND room_id = ? AND id NOT IN (SELECT id FROM local_messages WHERE user_id = ? AND room_id = ? ORDER BY created_at DESC LIMIT ?)` with indexed lookup on `(user_id, room_id, created_at DESC)`.

## DEC-003: Silent Background Pruning Execution
- **Context**: Pruning must not block UI frames or freeze gesture animations.
- **Decision**: Run pruning asynchronously via `.catch(() => {})` fire-and-forget, without awaiting in the main UI render loop.
