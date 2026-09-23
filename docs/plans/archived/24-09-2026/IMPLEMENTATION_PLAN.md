# Implementation Plan — Track B: Modular Monolith Fase 3

## 1. Objectives & Architectural Principles
1. Mentransformasi domain Messaging backend Go menjadi 3-Tier DDD (Transport → Application Service → Domain → Infrastructure).
2. Memisahkan logika bisnis dari `ChatHandler` ke `MessageService` yang mudah diuji secara independen.
3. Mendecouple WebSocket Hub dari database langsung dengan interface `RoomAuthorizationChecker`.
4. Menerapkan Strangler Fig Pattern dengan jaminan Zero Behavior Change (kontrak API dan skema DB 100% utuh).

## 2. Layering & Responsibility Guide (Mental Model)
- **Transport Layer (`api/chat_handler.go`, `ws/hub.go`)**: Hanya menangani HTTP/WS payload parsing, auth header, delegasi ke Service, dan serialisasi response.
- **Application Service Layer (`messaging/service.go`)**: Orkestrasi aturan bisnis (validasi 15 menit edit, max 3 pin, max 5 forward, koordinasi broadcast event).
- **Domain Layer (`messaging/entity.go`, `messaging/repository.go`)**: Entitas murni Go dan kontrak interface abstraksi penyimpanan.
- **Infrastructure Layer (`messaging/infra/sql_repository.go`)**: Adapter Strangler Fig yang membungkus `store.MessageStore` & `store.UserStore`.

## 3. Target Files & Contracts
- `backend/internal/messaging/entity.go`: Structs Message, Conversation, PinnedMessage, DTOs.
- `backend/internal/messaging/repository.go`: Interfaces MessageRepository & ConversationRepository.
- `backend/internal/messaging/infra/sql_repository.go`: SQLMessagingRepository adapter.
- `backend/internal/messaging/service.go`: MessageService dengan MessageBroadcaster interface.
- `backend/internal/messaging/service_test.go`: Comprehensive unit tests.
- `backend/internal/ws/hub.go`: RoomAuthorizationChecker interface & decoupling.
- `backend/internal/api/chat_handler.go`: Thin transport layer dengan service injection & fallback.
- `backend/main.go`: Wire dependencies.
- `PROMPT.md`: Sinkronisasi status Track B.

## 4. Safety & Verification Gate
- Unit tests: `go test -v ./internal/messaging/...`
- Realtime tests: `go test -v ./internal/ws/...`
- Full backend suite: `go test -v ./...` (100% PASS)
- Frontend build: `npm run build` (0 error)
