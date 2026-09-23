# Implementation Plan — Track B: Modular Monolith Fase 4 (Group & Forum Service)

## 📌 Ringkasan Masalah & Tujuan
Saat ini, file `backend/internal/api/group_handler.go` (948 baris) masih menjalankan peran ganda (*God Handler*):
1. Mengurai request HTTP (JSON decoding/query params).
2. Mengeksekusi business logic dan validasi hak akses role (`creator`, `admin`, `member`).
3. Mengakses database langsung melalui interface `store.GroupStore` dan `store.UserStore`.
4. Mengatur pemicu event real-time WebSocket (`*ws.Hub`) dan push notification (`*push.Service`).
5. Mengelola integrasi pembuatan background memory job untuk AI.

Selain itu, `SubGroupTTLWorker` masih berada di package generik `internal/worker/`.

**Tujuan Fase 4**:
Mengekstrak seluruh logika bisnis grup dan forum ke dalam domain terisolasi `backend/internal/group/` yang mematuhi arsitektur 3-tier (Transport → Application Service → Domain → Infrastructure).

---

## 🏗️ Desain Arsitektur Domain `internal/group`

```text
HTTP Request (REST API)
       │
       ▼
Transport Layer: internal/api/group_handler.go (Thin Handler)
       │
       ▼
Application Layer: internal/group/service.go
 ├── GroupService (Create, Join, Manage Members, Update Role, Search)
 └── ForumService (Create Subgroup, Active Forums, Join Request, Expire)
       │
       ├─────────────────────────────────┬─────────────────────────────────┐
       ▼                                 ▼                                 ▼
Domain Interfaces:               Real-Time Events:               Push Notifications:
GroupRepository,                 GroupBroadcaster                GroupNotifier
UserLookupRepository             (diimplementasi ws.Hub)         (diimplementasi push.Service)
       │
       ▼
Infrastructure Adapter:
internal/group/infra/sql_repository.go
       │
       ▼
Existing Database Stores:
store.GroupStore & store.UserStore (Zero Schema Changes)
```

---

## 📁 Rincian File yang Dibuat & Dimodifikasi

### 1. `backend/internal/group/entity.go` [BARU]
- Menyediakan domain model dan DTO:
  - `GroupRole`: konstanta `RoleCreator = "creator"`, `RoleAdmin = "admin"`, `RoleMember = "member"`
  - `Group`, `GroupMember`, `Forum` / `SubGroup`, `JoinRequest`, `ExpiredForum`
  - Domain error sentinels: `ErrUnauthorized`, `ErrForbidden`, `ErrNotFound`, `ErrConflict`, `ErrBadRequest`, dll.

### 2. `backend/internal/group/repository.go` [BARU]
- Mendefinisikan interface repository murni:
  - `GroupRepository`: Menyimpan dan mengambil data grup, anggota, forum, dan request join.
  - `UserLookupRepository`: Mencari profil user untuk resolusi display name & validasi keberadaan user.

### 3. `backend/internal/group/infra/sql_repository.go` [BARU]
- Adapter Strangler Fig:
  - Struct `SQLGroupRepository` yang mengimplementasikan `GroupRepository` dan `UserLookupRepository` dengan mendelegasikan pemanggilan ke `store.GroupStore` dan `store.UserStore`.
  - Zero breaking changes ke schema database SQL.

### 4. `backend/internal/group/service.go` [BARU]
- Mendefinisikan interfaces:
  - `GroupBroadcaster`: `BroadcastRoomUsers`, `BroadcastGroupSystemEvent`, `InvalidateRoomMembersCache`, `NotifyUsers`
  - `GroupNotifier`: `NotifyUsers`
- Mengimplementasikan:
  - `GroupService`:
    - `CreateGroup(...) (*GroupDetails, error)`
    - `GetGroupDetails(...) (*GroupDetails, error)`
    - `GetGroupMembers(...) ([]GroupMemberItem, error)`
    - `JoinPublicGroup(...) error`
    - `AddGroupMembers(...) error`
    - `RemoveGroupMember(...) error`
    - `UpdateMemberRole(...) error`
    - `UpdateGroupInfo(...) error`
    - `SearchPublicGroups(...) ([]GroupDetails, error)`
  - `ForumService`:
    - `CreateSubGroup(...) (*GroupDetails, error)`
    - `GetActiveSubGroups(...) ([]SubGroupItem, error)`
    - `JoinSubGroup(...) error`
    - `RequestToJoinSubGroup(...) error`
    - `GetPendingJoinRequests(...) ([]JoinRequestItem, error)`
    - `RespondJoinRequest(...) (targetUserID string, approved bool, err error)`
    - `InstantExpireSubGroup(...) error`
    - `ExpireSubGroupsBatchDetailed(...) ([]ExpiredSubGroupItem, error)`

### 5. `backend/internal/group/worker/ttl_worker.go` [BARU / MIGRASI]
- Migrasi `SubGroupTTLWorker` dari `internal/worker/subgroup_ttl_worker.go` ke dalam package domain `internal/group/worker/`.
- Memanfaatkan `ForumService` / `GroupRepository` untuk memeriksa dan mengunci subgrup expired secara periodik.

### 6. `backend/internal/group/service_test.go` [BARU]
- Unit tests komprehensif menggunakan Mock Repository / Mock Broadcaster:
  - Validasi CreateGroup (nama kosong, batas 128 karakter, username unik).
  - Validasi AddMembers & RemoveMember (hak akses creator/admin, larangan kick creator).
  - Validasi UpdateMemberRole (larangan demote creator, promosi valid).
  - Validasi SubGroup creation (hanya anggota parent group).
  - Validasi JoinRequest approval & broadcast event.

### 7. `backend/internal/api/group_handler.go` [MODIFIKASI / REFACTOR]
- Menjadi *thin transport handler*:
  - Mengambil claims user dari context HTTP.
  - Membaca dan memvalidasi JSON payload dasar.
  - Memanggil `GroupService` atau `ForumService`.
  - Mengembalikan JSON response dan status HTTP yang sesuai.
  - Tetap menyediakan constructor `NewGroupHandler(gs, us)` (backward-compatible) dan `NewGroupHandlerWithServices(groupSvc, forumSvc)`.

### 8. `backend/main.go` [MODIFIKASI]
- Inisialisasi:
  ```go
  groupRepo := groupinfra.NewSQLGroupRepository(groupStore, userStore)
  groupSvc := group.NewGroupService(groupRepo, groupRepo, hub, pushService)
  forumSvc := group.NewForumService(groupRepo, groupRepo, memoryStore, hub, pushService)
  groupHandler := api.NewGroupHandlerWithServices(groupSvc, forumSvc, groupStore, userStore)
  // TTL Worker
  subGroupWorker := groupworker.NewSubGroupTTLWorker(groupStore, 15*time.Minute)
  ```

---

## 🧪 Strategi Pengujian (Verification Strategy)

1. **Automated Unit Tests (`backend/internal/group/...`)**:
   - `go test -v ./internal/group/...` lulus 100%.
2. **API Handler Integration Tests (`backend/internal/api/...`)**:
   - `go test -v ./internal/api -run TestGroupHandler` lulus 100%.
   - `go test -v ./internal/api -run TestMemoryHandler` lulus 100%.
3. **Backend Full Suite**:
   - `go test -v ./...` lulus 100% tanpa regresi.
4. **Frontend Turbopack Compilation**:
   - `npm run build` di direktori `frontend/` (0 TypeScript / lint errors, 8/8 routes prerendered).
