# Implementation Plan — Milestone 2: Tenant Context Propagation in Services & Repositories

## 🎯 1. Overview & Architectural Goals
Milestone 2 menghubungkan fondasi tenant yang dibuat di Milestone 1 ke runtime request flow dan query database WuzzChat Engine. Tujuannya adalah memastikan setiap interaksi (HTTP REST & WebSocket handshake) memiliki identitas `TenantContext`, dan seluruh query data terisolasi secara ketat per `tenant_id` tanpa merusak kompatibilitas backward data tunggal/lama.

---

## 🏗️ 2. Architectural Blueprint & Target Modifications

### Task 1: Tenant HTTP Middleware & Context Resolver
- **File Target**: `backend/internal/api/tenant_middleware.go`
- **Tanggung Jawab**:
  1. Ekstraksi candidate `tenantID`:
     - Priority 1: Header `X-Tenant-ID`
     - Priority 2: JWT Claim `tenant_id` (dari Authorization: Bearer atau query `?token=`)
     - Priority 3: Fallback ke `tenant.DefaultTenantID` ("default")
  2. Validasi keaktifan tenant via `tenantSvc.ValidateTenantActive(ctx, candidateID)`:
     - Jika tenant tidak aktif (`ErrTenantInactive`) -> Return HTTP 403 Forbidden.
     - Jika tenant tidak ditemukan (`ErrTenantNotFound`) -> Return HTTP 403 Forbidden / 404 Not Found.
  3. Context Injection:
     - Bentuk `tc := tenant.NewTenantContext(tenantID)`
     - Pasang ke `r.WithContext(tenant.WithTenantContext(r.Context(), tc))`
     - Teruskan ke `next.ServeHTTP(w, r)`.
- **File Target**: `backend/internal/app/router.go`
  - Bungkus root HTTP handler/mux dengan `TenantMiddleware`.

### Task 2: JWT Claims Tenant Scoping
- **File Target**: `backend/internal/auth/jwt.go`
  - Perbarui struct `UserClaims` dengan field `TenantID string `json:"tenant_id,omitempty"`.
  - Sediakan helper `GenerateTokenDetailedWithTenant(userID, username, displayName, tenantID string)`.
  - Perbarui `GenerateTokenDetailed` agar tetap kompatibel dengan caller lama.

### Task 3: Database & SQL Schema Adaptation
- **File Target**: `backend/internal/store/sql.go`
  - Untuk SQLite table creation baru, pastikan tabel `users` memiliki composite constraint `UNIQUE(tenant_id, username)` agar username identik (misal `@alice`) dapat digunakan di dua tenant berbeda tanpa bentrok.
  - Untuk PostgreSQL, pastikan composite unique index `idx_users_tenant_username_unique` dibuat jika belum ada.
  - Tambahkan field `TenantID` pada struct `User` dan `ConversationItem` di `backend/internal/store/user_store.go`.

### Task 4: Repository Layer Data Isolation (`WHERE tenant_id = ?`)
- **Identity & Auth (`store.SQLUserStore` & `authz.SQLAuthRepository`)**:
  - `Register` / `RegisterWithContext`:
    - Insert menyertakan `tenant_id`.
    - Pengecekan username duplikat menyertakan `WHERE tenant_id = ? AND LOWER(username) = LOWER(?)`.
  - `GetUserByUsername` / `GetUserByUsernameWithContext`:
    - Filter `WHERE tenant_id = ? AND LOWER(username) = LOWER(?)`.
  - `GetUserByUsernameOrDisplayName`:
    - Filter `WHERE tenant_id = ? AND (LOWER(username) = LOWER(?) OR LOWER(display_name) = LOWER(?))`.
  - `SearchUsers` / `SearchUsersWithContext`:
    - Filter `WHERE tenant_id = ? AND id != ? AND (username LIKE ? OR display_name LIKE ?)`.
  - `GetOrCreateDirectConversation`:
    - Insert & lookup `conversations` menyertakan `tenant_id`.
  - `GetUserConversations`:
    - Filter `WHERE c.tenant_id = ? AND (c.parent_id IS NULL OR c.parent_id = '')`.
- **Groups & Conversations (`store.SQLGroupStore` & `group.SQLGroupRepository`)**:
  - `CreateGroup`: Insert `tenant_id` ke tabel `conversations`.
  - `CreateSubGroup`: Insert `tenant_id` ke tabel `conversations`.
  - `SearchPublicGroups`: Filter `WHERE c.tenant_id = ? AND c.type = 'group' AND c.is_public = true AND ...`.
  - `GetActiveSubGroups`: Scoped per `tenant_id`.
- **AI Memory Engine (`store.SQLMemoryStore`)**:
  - `CreateJob`, `GetJobByID`, `GetJobByForumID`, `ClaimJob`: Filter & insert `tenant_id`.
  - `CreateDraftWithArtifacts`, `GetDraftByID`, `GetDraftByForumID`, `GetDraftsByGroupID`: Filter & insert `tenant_id`.
  - `ApproveDraft`, `GetApprovedMemoryByID`, `GetApprovedMemoryByForumID`, `GetApprovedMemoriesByGroupID`: Filter & insert `tenant_id`.
- **Fallback Rule**:
  - Jika context tidak memiliki tenant, `tenant.MustFromContext(ctx).TenantID()` mengembalikan `"default"`.

### Task 5: Service Layer Context Propagation
- **`authz.AuthService`**:
  - Teruskan `ctx` dari HTTP Handler ke `s.repo.CreateUser(ctx, ...)`, `s.repo.GetUserByUsername(ctx, ...)`, dll.
  - Saat `Register` dan `Login`, populate `TenantID` ke dalam `UserClaims` pada saat token JWT di-generate.
- **`messaging.MessageService`**:
  - Teruskan `ctx` ke repository layer pada percakapan direct dan query list chat.
- **`group.GroupService` & `group.ForumService`**:
  - Teruskan `ctx` ke `GroupRepository.CreateGroup`, `SearchPublicGroups`, dll.

### Task 6: Automated Testing & Anti-Leak Isolation Verification
- **Unit & Integration Tests**:
  - `backend/internal/api/tenant_middleware_test.go`:
    - Test resolusi dari header `X-Tenant-ID`.
    - Test resolusi dari JWT token claim.
    - Test fallback ke `default`.
    - Test rejection jika tenant tidak aktif (403) atau tidak ditemukan.
  - `backend/internal/tenant/isolation_test.go` / `backend/internal/api/tenant_isolation_test.go`:
    - Registrasi `@alice` di Tenant A dan `@alice` di Tenant B tanpa collision.
    - Login di Tenant A hanya mengotentikasi user Tenant A.
    - `SearchUsers` di Tenant A tidak membocorkan user Tenant B.
    - Direct room di Tenant A tidak muncul di list room Tenant B.
    - Public group di Tenant A tidak muncul di pencarian Tenant B.
    - Memory jobs dan draf di Tenant A terisolasi dari Tenant B.
  - Automated Suite:
    - `go test -v ./...` di `backend/` 100% PASS.
    - `npm run build` di `frontend/` 100% PASS.

---

## 🔍 3. Verification Strategy & Definition of Done
1. Seluruh 6 unit & integration test anti-leak multi-tenant lulus 100%.
2. Seluruh test existing backend (`go test ./...`) tetap 100% passing tanpa regresi.
3. Build frontend Next.js lolos kompilasi Turbopack tanpa error.
4. Server port pengujian dimatikan sebelum respon final.
