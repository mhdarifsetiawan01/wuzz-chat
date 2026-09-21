# Implementation Plan — Phase 1: Session Foundation & Remote Logout

## 1. Objectives
- Implementasi auto-migration skema `sessions` di PostgreSQL dan SQLite.
- Abstraksi `SessionStore` dan implementasi `SQLSessionStore`.
- Penambahan helper `GenerateTokenDetailed` pada modul `internal/auth/jwt.go`.
- Pengikatan sesi saat login/register (`CreateSession`) dengan JTI token JWT.
- Penyediaan endpoint REST:
  - `GET /api/auth/sessions`: Menampilkan sesi aktif milik user.
  - `DELETE /api/auth/sessions/:id`: Mencabut sesi tertentu (remote logout).
  - `POST /api/auth/sessions/revoke-others`: Mencabut seluruh sesi lain.
- Sinkronisasi pencabutan sesi dengan `RequireJWT` middleware.
- Penambahan UI inventaris sesi login aktif di `ProfileModal.tsx` (Tab Keamanan).
- Background cleanup worker untuk sesi kedaluwarsa.

## 2. Target Files
- `backend/internal/store/sql.go`
- `backend/internal/store/session_store.go` [NEW]
- `backend/internal/store/token_store.go`
- `backend/internal/auth/jwt.go`
- `backend/internal/api/auth_handler.go`
- `backend/internal/api/auth_session_test.go` [NEW]
- `backend/main.go`
- `frontend/app/chat/ProfileModal.tsx`

## 3. Verification Strategy
- Backend test suite: `go test -v -run "TestSession" ./...` dan `go test -v ./...`.
- Frontend build check: `npm run build`.
