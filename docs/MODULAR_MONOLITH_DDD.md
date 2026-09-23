# WuzzChat Architecture Audit & DDD Redesign Proposal

> **Status**: **Fase 1 SELESAI & DEPLOYED ✅** | Menuju Fase 2 (Auth/Identity Application Service) 🎯
> **Audit & Kickoff Date**: 2026-09-23
> **Scope**: Backend Golang (semua package di `backend/internal/`)

---

## 1. Executive Summary

WuzzChat saat ini memiliki arsitektur **1-layer flat** yang pragmatis: HTTP/WebSocket handler langsung memanggil Store (repository layer) yang mengandung implementasi SQL. Tidak ada Application Service atau Domain layer di antaranya.

Ini **bukan masalah besar saat ini**, karena kode sudah cukup bersih dan ada interface/abstraksi di level store. Namun untuk tujuan jangka panjang (WuzzChat Engine, multi-context Memory, future mobile), beberapa coupling perlu diperbaiki.

**Rekomendasi utama**: Adopsi **Modular Monolith** dengan **lightweight layered architecture** per domain — bukan DDD klasik yang berat. Cukup 3 lapis:

```
Transport (REST / WebSocket handler)
     ↓
Application Service (use case / orchestration)
     ↓
Repository Interface + Domain Entity
     ↓
Infrastructure (SQL Implementation)
```

---

## 2. Current Architecture

### 2.1 Package Map Aktual

```
backend/
├── main.go                    ← God entrypoint: wiring, routing, goroutine, config
└── internal/
    ├── api/                   ← HTTP handlers (auth, chat, group, memory, media, device, notification)
    ├── auth/                  ← JWT generation, middleware, CORS, rate limiter, validator
    ├── store/                 ← Repository interface + SQL implementation (SEMUA domain)
    ├── ws/                    ← WebSocket hub, client, handler, message types
    ├── ai/                    ← AI service interface, provider, processor (business logic AI)
    ├── broker/                ← Pub/Sub interface + Redis/In-Memory impl
    ├── push/                  ← Web Push / FCM notification service
    ├── storage/               ← Media storage (local, supabase) + purge worker
    └── worker/                ← Background jobs (memory AI worker, subgroup TTL worker)
```

### 2.2 Dependency Flow Aktual

**REST Request:**
```
HTTP Request
  → main.go (routing + middleware wiring)
    → auth.RequireJWT() middleware
      → api.AuthHandler / ChatHandler / GroupHandler / MemoryHandler
        → store.UserStore / MessageStore / GroupStore / MemoryStore (interface)
          → store.SQLUserStore / SQLMessageStore / SQLGroupStore (implementation, SAME package)
            → database/sql (PostgreSQL / SQLite)
```

**WebSocket:**
```
WebSocket Upgrade
  → ws.Handler (auth + device validation)
    → ws.Hub.Register(client)
      → ws.Client.ReadPump()
        → client.handleMessage() [switch: join, message, receipt, reaction, call]
          → hub.BroadcastRoom() → store.MessageStore.Save()
          → hub.messageStore.MarkRoomMessagesAsRead()
          → hub.userStore.IsConversationExpired()
          → hub.userStore.GetConversationMemberUsernames()
```

**Memory AI Pipeline:**
```
worker.SubGroupTTLWorker → store.GroupStore.ExpireSubGroupsBatchDetailed()
  → worker.MemoryJobWorker → store.MemoryStore.GetPendingJobs() → ClaimJob()
    → ai.MemoryProcessor.ProcessMemoryJob()
      → store.MessageStore.GetRoomHistory()  (ambil pesan forum)
      → store.GroupStore.GetGroupDetails()   (ambil nama forum/group)
      → ai.AIService.GenerateMemory()        (panggil LLM)
      → store.MemoryStore.CreateDraftWithArtifacts()
      → push.Service.NotifyMemoryEvent()
```

---

## 3. Current Problems

### 🔴 CRITICAL — Coupling Kuat

| Problem | Lokasi | Dampak |
|---|---|---|
| **God Store** | `store/user_store.go` mengimplementasikan `UserStore` DAN `GroupStore` dalam satu struct `SQLUserStore` | GroupStore dan UserStore coupling, sulit dipisahkan |
| **Handler → Store direct** | Semua handler (`api/auth_handler.go`, dll) langsung panggil store interface | Tidak ada application layer — business logic tersebar di handler |
| **Business logic di Handler** | `auth_handler.go:Login()` berisi device limit check, kick logic, session creation, dan JWT generation (250+ baris) | Susah di-unit-test tanpa HTTP layer |
| **Business logic di Hub** | `ws/hub.go` menyimpan `userStore` dan langsung query DB saat broadcast (`getRoomMembers`, `IsConversationExpired`) | WebSocket layer tahu terlalu banyak tentang domain |
| **Business logic di Client** | `ws/client.go:onMessage()` berisi rate limiting, idempotency check, peer online detection, dan message save | Mix antara transport protocol dan business logic |

### 🟡 MEDIUM — Coupling yang Perlu Diperhatikan

| Problem | Lokasi | Dampak |
|---|---|---|
| **Memory tightly coupled ke Forum** | `store/memory_store.go` — semua entity punya `forum_id` + `group_id` hardcoded | Sulit extend ke Personal Chat memory tanpa refactor besar |
| **MemoryProcessor → push.Service concrete type** | `ai/processor.go:25` — `pushService *push.Service` (concrete, bukan interface) | Sulit diganti / di-mock saat testing |
| **main.go God Object** | `main.go` (559 baris) berisi: wiring, routing, background goroutine, config parsing | Terlalu besar, sulit dibaca |
| **GroupHandler reference MemoryHandler** | `api/group_handler.go:27` — `memoryHandler *MemoryHandler` | Cross-handler dependency (coupling horizontal) |
| **Auth middleware: SetTokenChecker global** | `auth/middleware.go` — global mutable var `tokenChecker` | Implicit dependency, sulit di-test paralel |
| **SQLUserStore implements GroupStore** | `store/user_store.go:62` di main.go: `groupStore = sqlUserStore` | Satu struct merangkap dua domain |
| **ws.Hub depends on store directly** | `ws/hub.go` imports `store`, `push`, `broker` | WebSocket layer tidak clean dari infrastructure |

### 🟢 BAGIAN YANG SUDAH BAIK

- Interface-based store design (UserStore, GroupStore, MemoryStore, dll)
- AIService adalah interface (`ai/service.go:81`) — bagus
- MemoryJobProcessor adalah interface (`worker/memory_worker.go:17`) — bagus
- Broker adalah interface (`broker/broker.go`) — bagus
- MessageBroker, Storage abstraction sudah baik
- Test coverage cukup baik di `api/` dan `store/`

---

## 4. Domain / Bounded Context Analysis

Berdasarkan audit kode aktual dan business requirement, berikut domain yang tepat:

### 4.1 Domain yang Benar-Benar Ada di Kode

```
DOMAIN 1: Identity (User profile, search, E2EE key)
DOMAIN 2: Auth (JWT, credential, session, device, transfer)
DOMAIN 3: Messaging (message CRUD, conversation, pin, receipt, forward, reaction)
DOMAIN 4: Group (group lifecycle, member management, subgroup/forum TTL)
DOMAIN 5: Memory (job queue, draft, artifact, approval, view — AI Memory Engine)
DOMAIN 6: AI (LLM provider, prompt building, memory generation)
DOMAIN 7: Media (upload, storage, purge, acknowledge)
DOMAIN 8: Notification (push subscription, VAPID, WebSocket delivery)
DOMAIN 9: Realtime (WebSocket hub, broker, clustering)
```

### 4.2 Analisis Pemisahan vs Penggabungan

**Identity + Auth: PISAHKAN**
- `Identity` = siapa user itu (User entity, profile, public key, E2EE)
- `Auth` = bagaimana user membuktikan identitasnya (Credential, Session, Device, JWT, Transfer)
- Keduanya ada di kode sekarang tetapi tercampur dalam `UserStore` + handler `auth`

**Group + Forum: PISAHKAN sebagian**
- `Group` = entitas persisten (group lifecycle, keanggotaan, roles)
- `Forum` (saat ini disebut SubGroup) = ephemeral discussion space di bawah Group (TTL-based)
- Saat ini keduanya di `GroupStore` — **masuk akal untuk tetap di satu domain Group** karena Forum adalah child entity dari Group
- Yang perlu dipisahkan adalah **Memory Engine** yang saat ini hardcoded `forum_id`

**Memory: SATU ENGINE, BUKAN TIGA**
- Jangan membuat `ForumMemoryService`, `GroupMemoryService`, `PersonalMemoryService`
- Memory Engine harus menerima `ContextSource` (abstraksi sumber konten) yang bisa berasal dari Forum, Group, atau Direct Chat
- Access control tetap di masing-masing domain asal

**Messaging: GABUNGKAN Direct + Group Message**
- Saat ini pesan di direct chat dan group chat keduanya menggunakan tabel `messages` yang sama (room_id based)
- Ini adalah desain yang tepat — jangan pisahkan
- `ChatHandler` adalah handler messaging yang sudah benar

**Notification: GABUNG ke shared package**
- `push.Service` bersifat infrastruktur dan cross-cutting concern
- Lebih tepat sebagai shared infrastructure, bukan domain terpisah
- Tetap di `internal/push/` atau dipindah ke `internal/infra/push/`

---

## 5. Recommended Architecture

### Prinsip

```
Transport Layer (REST + WebSocket)
      ↓
Application Layer (Use Cases / Orchestration)
      ↓
Domain Layer (Entity + Repository Interface)
      ↓
Infrastructure Layer (SQL, Redis, AI Provider, Storage, Push)
```

**Dependency Rule:**
- Transport → Application → Domain ← Infrastructure
- Infrastructure MENGIMPLEMENTASIKAN interface yang didefinisikan di Domain
- Domain TIDAK boleh import Infrastructure
- Application BOLEH import Domain, TIDAK BOLEH import Transport
- Transport TIDAK BOLEH mengandung business logic

---

## 6. Recommended Folder Structure

```
backend/
├── main.go                        ← Entry point (tipis, hanya wiring + server start)
├── cmd/
│   └── server/
│       └── wire.go                ← Dependency injection / wiring (pindah dari main.go)
└── internal/
    │
    ├── identity/                  ── DOMAIN: User Identity
    │   ├── entity.go              ← User, PushSubscription (value objects)
    │   ├── repository.go          ← IdentityRepository interface
    │   ├── service.go             ← Application: ProfileService, SearchService
    │   └── infra/
    │       └── sql_repository.go  ← SQL implementation
    │
    ├── authz/                     ── DOMAIN: Authentication & Authorization
    │   ├── entity.go              ← Session, Device, Credential, Transfer entities
    │   ├── repository.go          ← AuthRepository interfaces (Session, Device, Credential, Token, Transfer)
    │   ├── service.go             ← Application: LoginUseCase, RegisterUseCase, DeviceUseCase
    │   ├── jwt/
    │   │   ├── token.go           ← JWT generation/validation (dari auth/jwt.go)
    │   │   └── middleware.go      ← RequireJWT middleware
    │   └── infra/
    │       └── sql_repository.go  ← SQL implementation
    │
    ├── messaging/                 ── DOMAIN: Messaging (Direct + Group Messages)
    │   ├── entity.go              ← Message, PinnedMessage, Conversation entities
    │   ├── repository.go          ← MessageRepository, ConversationRepository interfaces
    │   ├── service.go             ← Application: MessageService (send, edit, delete, forward, pin, receipt)
    │   └── infra/
    │       └── sql_repository.go  ← SQL implementation
    │
    ├── group/                     ── DOMAIN: Group & Forum
    │   ├── entity.go              ← Group, GroupMember, Forum (SubGroup) entities
    │   ├── repository.go          ← GroupRepository interface
    │   ├── service.go             ← Application: GroupService, ForumService
    │   └── infra/
    │       └── sql_repository.go  ← SQL implementation (pisah dari user_store)
    │
    ├── memory/                    ── DOMAIN: Memory Engine (AI Memory — bukan terikat ke Forum saja)
    │   ├── entity.go              ← MemoryJob, MemoryDraft, MemoryArtifact, ApprovedMemory
    │   ├── repository.go          ← MemoryRepository interface
    │   ├── context_source.go      ← ContextSource interface (abstraksi sumber konten)
    │   ├── service.go             ← Application: MemoryApplicationService
    │   ├── processor.go           ← MemoryProcessor (pipeline AI, dari ai/processor.go)
    │   └── infra/
    │       └── sql_repository.go  ← SQL implementation
    │
    ├── ai/                        ── DOMAIN: AI Provider (infrastruktur LLM)
    │   ├── service.go             ← AIService interface + types (TIDAK BERUBAH)
    │   └── infra/
    │       └── provider.go        ← Gemini / OpenAI provider implementation
    │
    ├── media/                     ── DOMAIN: Media & File Storage
    │   ├── entity.go              ← MediaMeta (embedded di StoredMessage saat ini)
    │   ├── repository.go          ← MediaRepository interface
    │   ├── service.go             ← Application: MediaService (upload, ack, purge)
    │   └── infra/
    │       ├── local_storage.go
    │       └── supabase_storage.go
    │
    ├── realtime/                  ── INFRASTRUCTURE: WebSocket & Realtime
    │   ├── hub.go                 ← Hub (lebih kurus — tidak langsung query domain)
    │   ├── client.go              ← Client (transport only)
    │   ├── handler.go             ← HTTP upgrade handler
    │   ├── message.go             ← Message types (protocol definition)
    │   └── broker/
    │       ├── broker.go          ← MessageBroker interface (dari broker/)
    │       ├── memory.go          ← In-memory impl
    │       └── redis.go           ← Redis impl
    │
    ├── notification/              ── INFRASTRUCTURE: Push Notification
    │   ├── push_service.go        ← push.Service (dari push/push.go)
    │   └── ...
    │
    ├── worker/                    ── INFRASTRUCTURE: Background Workers
    │   ├── memory_worker.go       ← MemoryJobWorker (tidak berubah banyak)
    │   ├── subgroup_ttl_worker.go ← SubGroupTTLWorker
    │   └── purge_worker.go        ← MediaPurgeWorker (dari storage/)
    │
    └── shared/                    ── SHARED KERNEL (cross-cutting concerns)
        ├── pagination.go
        ├── errors.go              ← Shared error types
        └── config/
            └── config.go          ← Config struct (dari env parsing yang tersebar di main.go)
```

---

## 7. Dependency Rules

### Aturan Import yang Diizinkan

```
✅ DIIZINKAN:
  identity/service.go → identity/repository.go (interface)
  identity/service.go → identity/entity.go
  identity/infra/ → identity/repository.go (implements)
  
  authz/service.go → authz/entity.go
  authz/service.go → authz/repository.go
  authz/service.go → identity/repository.go (query user)
  authz/jwt/ → shared/
  
  messaging/service.go → messaging/entity.go
  messaging/service.go → messaging/repository.go
  messaging/service.go → identity/repository.go (verify membership)
  
  memory/service.go → memory/entity.go
  memory/service.go → memory/repository.go
  memory/service.go → memory/context_source.go
  memory/service.go → ai/service.go (interface only)
  
  realtime/hub.go → messaging/service.go (interface)
  realtime/hub.go → notification/ (interface)
  
  api handlers → application services (dari masing-masing domain)
```

```
❌ DILARANG:
  domain/ → infra/ (domain tidak import implementasi)
  domain/ → api/ (domain tidak tahu transport)
  realtime/hub.go → store.UserStore (langsung query user)
  api handler → store.SQLUserStore (langsung ke impl)
  memory/ → group/ (Memory Engine tidak bergantung pada Group internals)
```

### Ringkasan Aturan

```
Lapisan          | Boleh Import
-----------------|-----------------------------------------------------------
Transport        | Application Services
Application      | Domain Entities, Repository Interfaces, Shared
Domain           | Shared, Entity internal, Repository interface sendiri
Infrastructure   | Domain Repository Interface (untuk implementasi)
```

---

## 8. Identity vs Authentication Design

### Pemisahan yang Diusulkan

```
IDENTITY Domain
└── Entity: User {ID, Username, DisplayName, AvatarURL, StatusMessage, PublicKey, KeyVersion, ActiveDeviceID}
└── Repository: IdentityRepository
    ├── GetByID(userID) → User
    ├── GetByUsername(username) → User
    ├── Search(query, excludeID) → []User
    ├── UpdateProfile(...)
    ├── UpdatePublicKey(userID, pubKey, deviceID) → (keyVersion, error)
    └── GetE2EEInfo(userID) → (pubKey, keyVersion, activeDeviceID)

AUTHZ Domain
└── Entity: Session {ID (JTI), UserID, DeviceID, UserAgent, IP, IsRevoked, ExpiresAt}
└── Entity: Device {ID, UserID, Name, Platform, IsActive, LastSeenAt}
└── Entity: Credential {ID, UserID, Type, Identifier, SecretData, Name}
└── Entity: DeviceTransfer {Token, UserID, EncryptedBundle, ExpiresAt}
└── Repository: AuthRepository
    ├── SessionRepo: CreateSession, GetActiveSessions, RevokeSession, ...
    ├── DeviceRepo: Register, GetUserDevices, Deactivate, TouchDevice
    ├── CredentialRepo: CreateCredential, GetPassword, UpdatePassword, List
    └── TokenRepo: Revoke, IsRevoked, IsUserRevokedBefore
└── Application Service: AuthService
    ├── Register(username, displayName, password, deviceID) → (token, session, error)
    ├── Login(username, password, deviceID, confirmOverride, kickDeviceID) → (token, session, error)
    ├── Logout(jti, userID, deviceID)
    ├── GetActiveSessions(userID, currentJTI) → []Session
    ├── RevokeSession(sessionID, userID)
    ├── RevokeAllOtherSessions(userID, exceptJTI)
    └── ManageDevice(userID, action DeviceAction, targetDeviceID)
```

**Kenapa terpisah?**
- Identity bisa diquery oleh domain lain (messaging cek membership, group cek user exists)
- Auth adalah concern yang berbeda — tentang *bukti* identitas, bukan *profil* identitas
- Mendukung multiple credential types di masa depan (OAuth, Passkey, etc.)
- Mobile app dan web app bisa punya device management yang berbeda

### JWT Design

```go
// authz/jwt/token.go (tidak berubah banyak)
type UserClaims struct {
    UserID      string
    Username    string
    DisplayName string
    jwt.RegisteredClaims  // ID = JTI untuk revocation
}
```

JWT tetap stateless. Revocation check tetap via `TokenStore.IsTokenRevoked(jti)`.

---

## 9. Messaging / Group / Forum Boundary

### Model Saat Ini (Sudah Tepat)

Tabel `conversations` adalah unified conversation entity:
- `type = "direct"` → direct chat
- `type = "group"` → group chat
- `type = "subgroup"` → forum (ephemeral)
- `parent_id` → null untuk group, ada untuk subgroup/forum

Tabel `messages` menggunakan `room_id = conversation_id` — **ini desain yang TEPAT dan tidak perlu diubah**.

### Boundary yang Diusulkan

```
MESSAGING Domain
└── Conversation (abstraksi umum: direct / group / forum)
└── Message (terikat ke conversation via RoomID)
└── Service: MessageService
    ├── Send(senderID, roomID, content, media, replyTo) → Message
    ├── Edit(msgID, userID, newContent) → Message
    ├── Delete(msgID, userID, forEveryone) → Message
    ├── Forward(srcMsgID, senderID, targetRoomIDs, plaintextContent) → []Message
    ├── Pin/Unpin(convID, msgID, userID) → PinnedMessage
    ├── MarkRead(roomID, excludeUserID)
    └── GetHistory(roomID, userID, limit, since) → []Message

GROUP Domain
└── Group (entity persisten)
└── Forum (entity ephemeral, child of Group via parentID)
└── GroupMember
└── Service: GroupService
    ├── CreateGroup(title, description, ...) → Group
    ├── JoinGroup(conversationID, userID) → error
    ├── UpdateInfo(conversationID, actorID, ...) → Group
    ├── ManageMember(conversationID, actorID, targetID, action) → error
    └── GetDetails(conversationID, currentUserID) → GroupDetails
└── Service: ForumService
    ├── CreateForum(parentID, title, duration, ...) → Forum
    ├── JoinForum(forumID, userID) → error
    ├── ExpireForums() → []ExpiredForum
    └── GetActiveForums(parentID, userID) → []Forum
```

**Hubungan Forum dan Memory:**
- Forum memberi tahu Memory Engine ketika expire (via event / callback)
- Memory Engine tidak tahu internals Group/Forum — hanya menerima `ContextSource`

---

## 10. Memory Engine Boundary

### Masalah Saat Ini

Semua entity Memory (`ForumMemoryJob`, `MemoryDraft`, `MemoryArtifact`, `ApprovedMemory`) memiliki field:
- `forum_id` — hardcoded ke Forum
- `group_id` — hardcoded ke Group

Ini membuat Memory Engine tidak bisa digunakan untuk Personal Chat Memory.

### Solusi: ContextSource Abstraction

```go
// memory/context_source.go

// ContextType mendefinisikan jenis sumber konteks memori
type ContextType string
const (
    ContextTypeForum      ContextType = "forum"
    ContextTypeGroup      ContextType = "group"
    ContextTypeDirectChat ContextType = "direct"
)

// MemoryContext adalah abstraksi sumber konten untuk Memory Engine
type MemoryContext struct {
    ContextID   string      // ID percakapan (forum_id, group_id, atau room_id)
    ContextType ContextType // Tipe sumber
    ParentID    string      // Parent context (group_id untuk forum, kosong untuk group/direct)
    OwnerIDs    []string    // User yang punya akses (untuk access control)
    Title       string      // Nama percakapan/forum/group
}

// ContextSource adalah interface untuk domain lain menyediakan konten ke Memory Engine
type ContextSource interface {
    GetMessages(ctx context.Context, contextID string, limit int) ([]Message, error)
    GetContextMeta(ctx context.Context, contextID string) (*MemoryContext, error)
    GetAuthorizedViewers(ctx context.Context, contextID, viewerID string) (bool, error)
}
```

```go
// memory/entity.go — Schema yang lebih generik

type MemoryJob struct {
    ID          string
    ContextID   string      // Ganti forum_id → context_id
    ContextType ContextType // Tipe sumber (forum / group / direct)
    ParentID    string      // Ganti group_id → parent_id (nullable)
    Status      string
    // ...
}

type ApprovedMemory struct {
    ID          string
    ContextID   string
    ContextType ContextType
    // ...
}
```

### Memory Pipeline dengan ContextSource

```
Memory Engine
  ├── Menerima: MemoryJob {ContextID, ContextType}
  ├── Memanggil: ContextSource.GetMessages(ContextID)  ← dapat dari Forum/Group/Direct
  ├── Memanggil: ContextSource.GetContextMeta(ContextID)
  ├── Memanggil: AIService.GenerateMemory(input)
  ├── Menyimpan: MemoryDraft + Artifacts
  └── Access Control: ContextSource.GetAuthorizedViewers(contextID, viewerID)
```

**Siapa yang mengimplementasikan `ContextSource`?**
- Forum: `group/infra.ForumContextSource` — query messages dari forum
- Group: `group/infra.GroupContextSource` — query messages dari group conversation
- Direct: `messaging/infra.DirectContextSource` — query messages dari direct chat

Memory Engine tidak perlu tahu mana yang sedang diproses — cukup memanggil interface.

### Access Control

```
Saat user request GET /memories/{memoryID}:
  1. Ambil ApprovedMemory dari memory.Repository
  2. Resolve ContextType dari memory
  3. Panggil ContextSource.GetAuthorizedViewers(contextID, viewerID)
     ← Implementasi: group/ForumContextSource.GetAuthorizedViewers()
  4. Return 403 jika tidak authorized
  5. Return memory jika authorized
```

---

## 11. REST & WebSocket Boundary

### REST Handler Responsibilities (HANYA ini)

```
✅ Boleh:
  - Parse HTTP request (body, query params, headers)
  - Extract JWT claims dari context
  - Call Application Service (use case)
  - Transform hasil ke HTTP response
  - Handle HTTP error codes

❌ Dilarang:
  - Business logic (device limit check, dll)
  - Direct database query
  - Session creation
  - Token generation
```

### WebSocket Hub Responsibilities (HANYA ini)

```
✅ Boleh:
  - Manage client connections (Register, Unregister)
  - Route messages ke client yang tepat
  - Handle cluster pub/sub (Redis)
  - Basic rate limiting (per connection)
  - ACK management

❌ Dilarang:
  - Direct database query (hub.userStore.query...)
  - Business logic (conversation authorization, expired check)
  - Domain entity manipulation
```

### WebSocket ↔ Application Service Communication

Saat ini Hub langsung query `store.UserStore`. Seharusnya:

```go
// Buat interface minimal untuk WebSocket layer
type RoomAuthorizationChecker interface {
    IsUserInRoom(userID, roomID string) (bool, error)
    IsRoomExpired(roomID string) bool
    GetRoomMembers(roomID string) ([]string, error)
}

// Hub hanya menyimpan interface ini, bukan UserStore langsung
type Hub struct {
    roomAuth RoomAuthorizationChecker  // ganti dari userStore
    // ...
}
```

Implementasi `RoomAuthorizationChecker` ada di `messaging/service.go` atau `group/service.go`.

---

## 12. Future WuzzChat Engine Readiness

### Evaluasi Architecture yang Diusulkan

Dengan struktur Modular Monolith + Application Service layer, future API productization **tidak perlu rewrite**:

```
WuzzChat App (saat ini)         InstaQRIS (masa depan)
       ↓                                 ↓
  REST / WebSocket                REST / WebSocket
       ↓                                 ↓
  Application Services  ←────────────────┘
  (messaging, group, memory, authz, identity)
       ↓
  Domain Repository Interfaces
       ↓
  Infrastructure (SQL, Redis, AI, Storage)
```

InstaQRIS tidak perlu tahu tentang SQL atau Go internals. Ia cukup:
1. Autentikasi via `/api/auth` (jika multi-tenant) atau API key
2. Memanggil `/api/conversations` untuk membuat chat room
3. Memanggil `/api/messages` untuk kirim pesan
4. Subscribe ke WebSocket untuk realtime

**Yang BELUM perlu dilakukan sekarang:**
- Multi-tenant architecture (tenant isolation)
- API key / OAuth2 untuk third-party
- Rate limiting per tenant
- Billing / quota system
- Public API documentation / SDK

**Yang SUDAH siap dengan redesign ini:**
- Clean application service layer (dapat dipanggil dari REST, WebSocket, atau gRPC)
- Repository interface (dapat diimplementasikan untuk multi-DB)
- Domain isolation (messaging tidak bergantung pada group internals)

---

## 13. Migration Plan

> **Prinsip**: Strangler Fig Pattern — ganti bagian per bagian tanpa big-bang rewrite

### Fase 0: Persiapan (1-2 hari)
- [ ] Buat folder structure baru (`identity/`, `authz/`, `messaging/`, dll) — EMPTY dulu
- [ ] Tidak memindahkan kode apapun di fase ini
- [ ] Setup test harness untuk verifikasi behaviour tidak berubah

### Fase 1: Pisahkan GroupStore dari SQLUserStore (SELESAI & DEPLOYED ✅)
- [x] Buat `store.SQLGroupStore` (`backend/internal/store/sql_group_store.go`) — ekstrak implementasi method GroupStore dari `store/user_store.go` ke struct mandiri
- [x] Perbarui `main.go` agar inisialisasi `groupStore = store.NewSQLGroupStore(...)` independen tanpa bergantung ke `SQLUserStore`
- [x] Bersihkan `SQLUserStore` agar tidak lagi merangkap domain grup/forum
- [x] Verifikasi semua test group pass 100% dan deploy ke Fly.io (`672eca6`)

### Fase 2: Extract Application Services untuk Auth (3-5 hari)
- [ ] Buat `authz/service.go` dengan `AuthService`
- [ ] Pindahkan business logic dari `api/auth_handler.go` (device limit, session creation, kick logic) ke `AuthService`
- [ ] Handler menjadi tipis: parse request → call service → return response
- [ ] Verifikasi test `api/auth_*_test.go` masih pass

### Fase 3: Extract Application Services untuk Messaging (3-4 hari)
- [ ] Buat `messaging/service.go` dengan `MessageService`
- [ ] Pindahkan logic dari `api/chat_handler.go` ke service
- [ ] Buat `RoomAuthorizationChecker` interface
- [ ] Update `ws/hub.go` untuk tidak lagi inject `userStore` langsung

### Fase 4: Extract Group + Forum Service (2-3 hari)
- [ ] Buat `group/service.go`
- [ ] Pindahkan logic dari `api/group_handler.go` ke service
- [ ] Pindahkan `SubGroupTTLWorker` ke `group/worker/`

### Fase 5: Memory Engine Generalization (3-5 hari) ← KERJAKAN SETELAH FASE 1-4 STABIL
- [ ] Buat `memory/context_source.go` — interface
- [ ] Buat implementasi `ForumContextSource` di `group/infra/`
- [ ] Migrate schema: `forum_id` + `group_id` → `context_id` + `context_type` + `parent_id`
- [ ] Update `MemoryProcessor` untuk menggunakan `ContextSource`
- [ ] Verifikasi existing Memory AI tests masih pass

### Fase 6: Cleanup (1-2 hari)
- [ ] Hapus file yang sudah dipindahkan
- [ ] Update package imports
- [ ] Run full test suite

---

## 14. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| SQLUserStore implements GroupStore — refactor bisa break test | 🟡 Medium | Jalankan test suite setelah setiap step, gunakan Fase 1 sebagai isolated change |
| Memory schema migration (`forum_id` → `context_id`) | 🟡 Medium | Gunakan SQL migration bertahap, backward-compatible schema dulu (tambah kolom baru, jangan hapus lama) |
| ws/Hub menjadi tergantung Application Service yang belum ada | 🟡 Medium | Buat interface dulu (`RoomAuthorizationChecker`), implementasinya nanti |
| main.go wiring kompleks saat dipindah ke `cmd/server/wire.go` | 🟢 Low | Pindah bertahap, test manual setiap pindah seksi |
| Background goroutine di main.go (cleanup token, session, transfer) | 🟢 Low | Pindahkan ke masing-masing domain worker atau ke `worker/` terpusat |

---

## 15. Files/Packages yang Perlu Dipindahkan

| File Saat Ini | Dipindah Ke | Keterangan |
|---|---|---|
| `store/user_store.go` (User entity + ops) | `identity/entity.go` + `identity/repository.go` | User profile, search, public key ops |
| `store/user_store.go` (GroupStore impl) | `group/infra/sql_group_repository.go` | Group CRUD, member ops |
| `store/group_store.go` (interface) | `group/repository.go` | Interface definition |
| `store/memory_store.go` (interface) | `memory/repository.go` | Generalized |
| `store/session_store.go` | `authz/repository.go` + `authz/infra/` | Session ops |
| `store/device_store.go` | `authz/repository.go` + `authz/infra/` | Device ops |
| `store/credential_store.go` | `authz/repository.go` + `authz/infra/` | Credential ops |
| `store/token_store.go` | `authz/repository.go` + `authz/infra/` | Token revocation |
| `store/transfer_store.go` | `authz/repository.go` + `authz/infra/` | Device transfer |
| `auth/jwt.go` | `authz/jwt/token.go` | JWT generation/validation |
| `auth/middleware.go` | `authz/jwt/middleware.go` | JWT middleware |
| `auth/cors.go` | `shared/cors/` atau `realtime/cors.go` | CORS validator |
| `auth/ratelimit.go` | `shared/ratelimit/` | Rate limiter |
| `auth/validator.go` | `shared/validator/` | Input validation |
| `api/auth_handler.go` (business logic) | `authz/service.go` | Login, register, device limit logic |
| `api/group_handler.go` (business logic) | `group/service.go` | Group use cases |
| `api/chat_handler.go` (business logic) | `messaging/service.go` | Message use cases |
| `ai/processor.go` | `memory/processor.go` | Memory generation pipeline |
| `worker/subgroup_ttl_worker.go` | `group/worker/ttl_worker.go` | TTL lifecycle |
| `storage/purge_worker.go` | `media/worker/purge_worker.go` | Media purge |

---

## 16. Files/Packages yang Sebaiknya Tetap

| File | Keterangan |
|---|---|
| `ws/hub.go` | Tetap, tapi kurangi dependencies (ganti userStore → interface minimal) |
| `ws/client.go` | Tetap, pindahkan business logic ke service (onMessage()) |
| `ws/handler.go` | Tetap, cukup tipis sudah |
| `ws/message.go` | Tetap, ini adalah protocol definition |
| `broker/broker.go` | Tetap, interface sudah bagus |
| `broker/redis_broker.go` | Tetap, di `realtime/broker/` |
| `ai/service.go` | Tetap, interface AIService sudah clean |
| `ai/provider.go` | Tetap, pindah ke `ai/infra/` |
| `push/push.go` | Tetap, pindah ke `notification/push_service.go` |
| `storage/storage.go` | Tetap, pindah ke `media/infra/storage.go` |
| `store/sql.go` | Tetap sebagai schema migration handler, tapi eventually dipindah per domain |

---

## 17. Files/Packages yang Sebaiknya Dipecah

| File | Dipecah Menjadi | Alasan |
|---|---|---|
| `store/user_store.go` (1265 baris) | `identity/`, `authz/`, terpisah | Terlalu besar, mix domain |
| `store/sql.go` (1831 baris) | Migrasi per domain | Too large, all tables in one file |
| `api/auth_handler.go` (862 baris) | Handler + AuthService | Business logic harus ke service |
| `api/group_handler.go` (948 baris) | Handler + GroupService | Business logic harus ke service |
| `api/memory_handler.go` (801 baris) | Handler + MemoryService | Business logic harus ke service |
| `main.go` (559 baris) | `main.go` (tipis) + `cmd/server/wire.go` | God object |
| `ws/hub.go` (1039 baris) | Hub + domain interfaces | Hub terlalu banyak tahu |
| `ws/client.go` (566 baris) | Client (transport) + MessageService calls | Mix transport + logic |

---

## 18. Files/Packages yang Sebaiknya Dihapus Setelah Migration

| File | Kapan Dihapus |
|---|---|
| `store/store.go` | Setelah semua interface dipindah ke domain masing-masing |
| `store/factory.go` | Setelah diganti oleh per-domain infra init |
| `store/user_store.go` | Setelah identity/ dan authz/ selesai dan teruji |
| `store/group_store.go` | Setelah group/repository.go selesai |
| `store/memory_store.go` | Setelah memory/repository.go selesai |
| `store/session_store.go` | Setelah authz/infra/ selesai |
| `store/device_store.go` | Setelah authz/infra/ selesai |
| `store/credential_store.go` | Setelah authz/infra/ selesai |
| `store/token_store.go` | Setelah authz/infra/ selesai |
| `store/transfer_store.go` | Setelah authz/infra/ selesai |

---

## 19. Recommended Implementation Order

```
PRIORITAS 1 (Foundation — Lakukan Dulu, Low Risk):
  ① Pisahkan GroupStore dari SQLUserStore (Fase 1)
     → Buat group/infra/sql_group_repository.go
     → SQLUserStore tidak lagi implements GroupStore
  
  ② Buat shared/ package untuk CORS, RateLimit, Validator
     → Pindahkan dari auth/ ke shared/
     → Tidak ada logic change

PRIORITAS 2 (Business Logic Extraction — Medium Risk):
  ③ Buat authz/service.go (AuthService)
     → Ekstrak Login/Register business logic dari handler
  
  ④ Buat messaging/service.go (MessageService)
     → Ekstrak message operations dari handler
  
  ⑤ Kurangi Hub dependencies
     → Buat RoomAuthorizationChecker interface
     → Hub tidak lagi import store.UserStore

PRIORITAS 3 (Memory Engine Generalization — Do Last):
  ⑥ Buat memory/context_source.go (ContextSource interface)
  ⑦ Migrate memory schema (forum_id → context_id + context_type)
  ⑧ Update MemoryProcessor untuk ContextSource
  ⑨ Implement ForumContextSource, GroupContextSource

PRIORITAS 4 (Cleanup):
  ⑩ Hapus store/* files yang sudah dipindah
  ⑪ Update main.go → slim wiring
```

---

## Appendix: Pertanyaan untuk Diklarifikasi

Sebelum implementasi Fase 5 (Memory Generalization):

1. **Memory untuk Direct Chat** — apakah rencana ini akan dimulai dalam 3 bulan ke depan? Jika belum, schema migration bisa ditunda.

2. **Multi-tenant / WuzzChat Engine** — apakah InstaQRIS akan menggunakan backend yang sama, atau akan ada deployment terpisah? Ini mempengaruhi apakah perlu tenant isolation di level database.

3. **Memory access control** — untuk Group Memory, siapa saja yang bisa melihat ApprovedMemory? Apakah semua member group, atau hanya admin, atau hanya member forum tersebut?

4. **Forum vs SubGroup naming** — di kode saat ini dipakai "SubGroup" tapi dalam requirement dipakai "Forum". Apakah penamaan ini sudah final?
