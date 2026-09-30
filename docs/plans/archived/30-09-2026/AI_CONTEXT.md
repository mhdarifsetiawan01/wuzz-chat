# AI Context — Milestone M-Mobile-9.1: Fondasi Profil & Identitas Publik Mobile Fleksibel & Multi-Tenant

## Workspace Boundaries & Target Environment
- **Active Git Branch**: `dev` (Strict Dev-Only Work, branch `main` strictly protected).
- **Backend**: Golang 1.26+ (`backend/internal/store/`, `backend/internal/handler/`, `backend/internal/service/`).
- **Mobile**: React Native Expo (`mobile/src/screens/`, `mobile/src/components/`, `mobile/src/api/`, `mobile/src/navigation/`).
- **Web Frontend**: Next.js 16 (`frontend/`) — sync types and API compatibility if applicable.
- **Database**: PostgreSQL (Production Supabase) & SQLite WAL (Local testing/dev).

## Multi-Tenancy & Privacy Invariants
1. **Multi-Tenant Scoping**: Seluruh query profil (`GET /api/users/{id}`, `PUT /api/users/profile`, `search`) wajib mengikat `tenant_id` dari context pengguna. Data antar-tenant tidak boleh bocor.
2. **Developer-Extensible Open Schema**:
   - Kolom `bio` (VARCHAR(255)), `role` (VARCHAR(64)), dan `metadata` (JSONB di Postgres / TEXT di SQLite).
   - `metadata` menampung dictionary data dinamis (`social_links`, `location`, `website`, `privacy`, dsb).
3. **Privacy & Permission Gate**:
   - `privacy` field di `metadata` menampung izin komunikasi (`allow_direct_messages`, `allow_calls`).
   - UI `UserProfileScreen` merender tombol aksi secara state-driven (Kirim Pesan / Panggilan Suara / Status Permintaan).
