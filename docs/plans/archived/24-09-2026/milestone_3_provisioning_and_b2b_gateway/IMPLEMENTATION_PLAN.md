# IMPLEMENTATION_PLAN.md — Milestone 3: External Provisioning & B2B Auth Gateway

## 1. Objectives & Scope
Membangun pintu gerbang B2B Server-to-Server dan alur Client Token Exchange untuk integrasi headless chat:
1. Validasi kredensial B2B via `X-App-ID` & `X-App-Secret`.
2. JIT User Provisioning (atomic upsert pada tenant terkait: `external_user_id` -> user uuid).
3. Penerbitan One-Time Exchange Token (TTL 60s, atomic single-use consume).
4. Penukaran Exchange Token oleh Client SDK menjadi Session JWT ber-claim lengkap (`user_id`, `tenant_id`, `device_id`, `jti`) dengan integrasi Level 2 Multi-Device registry.
5. Verifikasi konektivitas WebSocket penuh menggunakan token hasil exchange.
6. Zero regression pada alur autentikasi eksisting.

---

## 2. Technical Architecture & Component Design

### 2.1 Database Schema (Additive & Non-Destructive)
1. **Tabel `users`**:
   - Tambah kolom `external_user_id VARCHAR(128) DEFAULT ''`.
   - Tambah index: `idx_users_tenant_ext ON users(tenant_id, external_user_id)`.
2. **Tabel `exchange_tokens`**:
   - Kolom:
     - `token VARCHAR(128) PRIMARY KEY`
     - `tenant_id VARCHAR(64) NOT NULL`
     - `user_id VARCHAR(64) NOT NULL`
     - `expires_at TIMESTAMP NOT NULL`
     - `used_at TIMESTAMP DEFAULT NULL`
     - `created_at TIMESTAMP NOT NULL`
   - Index: `idx_exchange_tokens_lookup ON exchange_tokens(token, expires_at)`.

### 2.2 Domain Entities & Contracts
1. **`internal/tenant/entity.go`**:
   - Tambah struct `ExchangeToken`.
2. **`internal/auth/jwt.go`**:
   - Tambah field `DeviceID string json:"device_id,omitempty"` pada `UserClaims`.
   - Buat helper `GenerateSessionToken(userID, username, displayName, tenantID, deviceID string) (string, *UserClaims, error)`.
3. **`internal/tenant/repository.go` & `infra/sql_repository.go`**:
   - `CreateExchangeToken(ctx context.Context, token *ExchangeToken) error`
   - `ConsumeExchangeToken(ctx context.Context, tokenStr string) (*ExchangeToken, error)` (atomic UPDATE used_at)
4. **`internal/store/user_store.go`**:
   - `GetByExternalIDWithContext(ctx context.Context, externalUserID string) (*User, error)`
   - `UpsertExternalUserWithContext(ctx context.Context, externalUserID, displayName, avatarURL string) (*User, error)`
5. **`internal/tenant/service.go`**:
   - `ProvisionUserAndToken(ctx context.Context, externalUserID, displayName, avatarURL string) (token string, expiresIn int, user *store.User, err error)`
   - `ExchangeToken(ctx context.Context, exchangeToken, deviceID, platform, userAgent, ip string) (jwtToken string, user *store.User, jti string, err error)`

### 2.3 Middleware & HTTP Handlers
1. **`internal/api/b2b_middleware.go`**:
   - `B2BAuthGuard(tenantSvc tenant.TenantService) func(http.Handler) http.Handler`
   - Validasi header `X-App-ID` & `X-App-Secret`, inject `tenantshared.TenantContext` ke request context.
2. **`internal/api/provisioning_handler.go`**:
   - `ProvisionToken(w http.ResponseWriter, r *http.Request)` -> `POST /api/v1/auth/provision-token`
   - `ExchangeClientToken(w http.ResponseWriter, r *http.Request)` -> `POST /api/v1/auth/exchange`
3. **`internal/app/router.go`**:
   - Registrasi endpoint `/api/v1/auth/provision-token` dengan `B2BAuthGuard`.
   - Registrasi endpoint `/api/v1/auth/exchange` (terbuka untuk klien pihak ketiga).

---

## 3. Verification & Testing Strategy
1. **Unit & Integration Test Suite** (`backend/internal/tenant/provisioning_test.go`):
   - Test B2B API Key validation (valid vs invalid/revoked).
   - Test JIT User Provisioning: user baru (created) vs user eksisting (updated display_name/avatar).
   - Test Exchange Token: penukaran sukses, token expired (>60s), penolakan double-spend / reuse token.
   - Test Full E2E Chain: Third-Party Backend Provision ➔ Client Exchange ➔ WebSocket Handshake (`/ws?token=<JWT>&device_id=<device_id>`).
2. **Regression Testing**:
   - Seluruh backend tests: `go test -v ./...`
   - Frontend build & typecheck: `npm run build` di `frontend/`
