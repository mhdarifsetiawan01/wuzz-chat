# Implementation Summary — Identity & Auth Phase 0 (Quick Wins)

- **Status**: Planning / Ready for Approval
- **Goal**: Mengimplementasikan 3 perbaikan keamanan kritis tanpa breaking change skema atau API publik:
  1. **JWT Revocation (R1)**: Tabel `revoked_tokens`, penyertaan JTI (`uuid.New()`), revocation saat logout, pemeriksaan revocation di middleware `RequireJWT`, dan periodic TTL cleanup worker.
  2. **ForceResetPublicKey Re-auth (R2)**: Validasi password wajib saat melakukan force-reset public key perangkat E2EE (`POST /api/users/public-key/reset`) dan penambahan endpoint pre-check `POST /api/auth/verify-password`.
  3. **Change Password & Global Token Invalidation (R3)**: Endpoint `POST /api/auth/change-password` (verifikasi password lama, validasi kekuatan password baru, hashing bcrypt, pembaruan DB, dan invalidasi semua token JWT aktif milik user).
- **Active Branch**: `dev`
- **Impact Area**:
  - `backend/internal/auth/jwt.go` (JTI generation di RegisteredClaims)
  - `backend/internal/auth/validator.go` (Password validator reusable)
  - `backend/internal/auth/middleware.go` (Pemeriksaan token revocation di `RequireJWT`)
  - `backend/internal/store/sql.go` (Auto-migration tabel `revoked_tokens`)
  - `backend/internal/store/token_store.go` (Interface & SQL implementation TokenStore)
  - `backend/internal/store/user_store.go` (ChangePassword & VerifyPassword method)
  - `backend/internal/api/auth_handler.go` (Handler Logout, ResetPublicKey, VerifyPassword, ChangePassword)
  - `backend/main.go` (Wiring TokenStore & routes)
  - `backend/internal/api/auth_phase0_test.go` & `auth_e2ee_test.go` (Automated tests)
