# AI Context — Milestone 2: Tenant Context Propagation in Services & Repositories

- **Target Workspace**: `/home/bms-del112/BMS/personal-project/wuzz-chat`
- **Active Git Branch**: `dev` (STRICT: main branch is protected)
- **Active Scope**: Backend Go Services, Repositories, HTTP Middlewares & Storage Layers
- **Core Dependencies**:
  - `internal/shared/tenant`: TenantContext extraction, injection, default fallback
  - `internal/tenant`: Tenant entity, repository, validation service (`ValidateTenantActive`)
  - `internal/auth`: UserClaims JWT payload with `tenant_id`
  - `internal/store`: `SQLUserStore`, `SQLGroupStore`, `SQLMemoryStore`, `SQLMessageStore`
  - `internal/authz`: `AuthService`, `AuthRepository`, `SQLAuthRepository`
  - `internal/group`: `GroupService`, `ForumService`, `GroupRepository`, `SQLGroupRepository`
  - `internal/messaging`: `MessageService`, `ConversationRepository`, `SQLMessagingRepository`
- **Active Constraints**:
  - Zero-breaking changes for single-tenant / legacy tests (fallback to `default`).
  - No destructive database migrations (`DROP TABLE`, `DROP COLUMN` strictly forbidden).
  - Kill testing server ports immediately upon verification completion (`fuser -k <port>/tcp`).
  - No `git commit` or `git push` without explicit user confirmation ("selesai").
