# AI Context — Milestone 0: Codebase & Hub Prerequisite Stabilization

- **Workspace**: WuzzChat Monorepo (`/home/bms-del112/BMS/personal-project/wuzz-chat`)
- **Active Branch**: `dev`
- **Master Architecture Blueprint**: [`docs/TENANT_ENGINE_MASTER_PLAN.md`](../../TENANT_ENGINE_MASTER_PLAN.md)
- **Target Subsystem**: Backend Go (`backend/internal/ws`, `backend/internal/authz`, `backend/internal/api`, `backend/internal/shared/tenant`)
- **Core Mission**: Menuntaskan seluruh prasyarat teknis (Milestone 0) sebelum fondasi Multi-Tenancy (Milestone 1–3) dibangun, demi mencegah username collision dan kebocoran data kontak.
- **Constraints & Rules**:
  1. DILARANG memodifikasi skema basis data pada milestone ini (0 migration).
  2. Pertahankan backward compatibility 100% untuk client Web Next.js dan PWA live.
  3. Seluruh perutean WebSocket Hub WAJIB berbasis UUID murni (`userID`), bukan raw string `username`/`nickname`.
  4. Seluruh pencarian dan pengambilan profil pengguna WAJIB melalui Application Service layer (`AuthService`), tidak boleh lagi memotong langsung ke `userStore` SQL.
  5. Seluruh test Go (`go test ./...`) dan build Next.js (`npm run build`) wajib lulus 100%.
  6. Server lifecycle rule: port testing wajib dimatikan sebelum respon berakhir.
