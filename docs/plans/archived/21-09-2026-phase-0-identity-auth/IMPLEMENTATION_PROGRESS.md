# Implementation Progress — Identity & Auth Phase 0 (Quick Wins)

## Checklist Atomic Tasks

- [x] Task 1: Auto-migration tabel `revoked_tokens` dan `user_token_revocations` di `backend/internal/store/sql.go`
- [x] Task 2: Implementasi `TokenStore` & integrasi `UserStore.ChangePassword` & `VerifyPassword` di `backend/internal/store/`
- [x] Task 3: JTI generation di `backend/internal/auth/jwt.go` & `ValidatePassword` di `validator.go`
- [x] Task 4: Revocation checking di middleware `backend/internal/auth/middleware.go`
- [x] Task 5: Pembaruan `Logout` (revoke JTI) dan `ResetPublicKey` (wajib verifikasi password) di `backend/internal/api/auth_handler.go`
- [x] Task 6: Endpoint baru `POST /api/auth/verify-password` dan `POST /api/auth/change-password` di `backend/internal/api/auth_handler.go`
- [x] Task 7: Wiring `TokenStore`, background cleanup worker, dan rute baru di `backend/main.go`
- [x] Task 8: Unit test komprehensif di `backend/internal/api/auth_phase0_test.go` & update `auth_e2ee_test.go`
- [x] Task 9: Verifikasi otomatis (`go test -v ./...` dan `npm run build`) 100% lulus
