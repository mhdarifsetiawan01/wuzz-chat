# AI Context — Track B: Modular Monolith Fase 3 (Messaging & Hub Decoupling)

## Target Scope
- **Domain**: Messaging (`backend/internal/messaging/`)
- **Transport**: REST Chat Handler (`backend/internal/api/chat_handler.go`) & WebSocket Hub (`backend/internal/ws/hub.go`)
- **Wiring**: Server Bootstrap (`backend/main.go`)

## Active Constraints & Architecture Rules
1. **Zero Behavior Change**: REST API kontrak (/api/conversations, /api/messages, /api/search/users, dll) dan WebSocket payloads tidak boleh berubah sedikit pun.
2. **Strangler Fig Pattern**: Store database lama (`internal/store/`) tetap dipertahankan dan diadaptasi melalui `messaging/infra/sql_repository.go` tanpa migrasi SQL destruktif.
3. **Decoupled Realtime Layer**: WebSocket Hub (`ws/hub.go`) tidak boleh mengimpor langsung `store.UserStore`. Gunakan interface minimal `RoomAuthorizationChecker`.
4. **Thin Transport**: `ChatHandler` hanya menangani serialisasi/deserialisasi HTTP dan memanggil `MessageService`.
5. **Quality & Testing Gate**: 100% test passing pada `go test -v ./...` dan frontend `npm run build`.
