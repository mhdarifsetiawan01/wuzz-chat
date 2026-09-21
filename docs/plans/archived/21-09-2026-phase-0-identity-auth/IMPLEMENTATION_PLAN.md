# Implementation Plan — Identity & Auth Phase 0 (Quick Wins)

## Objectives
Mengamankan siklus hidup token autentikasi, rotasi kunci perangkat E2EE, dan manajemen password pengguna tanpa mengubah skema tabel inti `users` atau memicu breaking changes pada klien yang ada.

## Target Files
- [NEW] `backend/internal/store/token_store.go`: Interface & implementasi `TokenStore` (`revoked_tokens`)
- [NEW] `backend/internal/api/auth_phase0_test.go`: Suite pengujian komprehensif untuk JWT revocation, change password, dan reset public key re-auth
- [MODIFY] `backend/internal/store/sql.go`: Migrasi tabel `revoked_tokens` dan index terkait
- [MODIFY] `backend/internal/store/user_store.go`: Kontrak dan implementasi `ChangePassword` & `VerifyPassword`
- [MODIFY] `backend/internal/auth/jwt.go`: Tambahkan JTI UUID ke `RegisteredClaims.ID` saat `GenerateToken`
- [MODIFY] `backend/internal/auth/validator.go`: Tambahkan fungsi `ValidatePassword`
- [MODIFY] `backend/internal/auth/middleware.go`: Hubungkan pengecekan revocation di `RequireJWT`
- [MODIFY] `backend/internal/api/auth_handler.go`: Modifikasi `Logout` & `ResetPublicKey`, buat handler `VerifyPassword` & `ChangePassword`
- [MODIFY] `backend/internal/api/auth_e2ee_test.go`: Perbarui pengujian `ResetPublicKey` untuk menyertakan verifikasi password
- [MODIFY] `backend/main.go`: Daftarkan `TokenStore`, background cleanup worker, dan rute baru

## Technical Architecture
```
                                 Client Request
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │  auth.RequireJWT Middleware   │
                       └───────────────┬───────────────┘
                                       │
                         Token Valid?  ├─► [No] 401 Unauthorized
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │   IsTokenRevoked(claims.ID)?  │
                       └───────────────┬───────────────┘
                                       │
                           Revoked?    ├─► [Yes] 401 "Token telah dicabut"
                                       │
                                       ▼
                                [Next Handler]
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
  [Logout Handler]           [ChangePassword]               [ResetPublicKey]
         │                             │                             │
   RevokeToken(jti)         1. Verify old password        1. Require & verify pass
         │                  2. Hash new password          2. If valid:
   ClearActiveDevice        3. UPDATE users table            ForceResetPublicKey
                            4. RevokeAllUserTokens(uid)
```

## Verification Strategy
- `go test -v ./...` di direktori `backend/` untuk memastikan seluruh unit test lulus 100%.
- `npm run build` di direktori `frontend/` untuk memastikan tidak ada regresi tipe data.
