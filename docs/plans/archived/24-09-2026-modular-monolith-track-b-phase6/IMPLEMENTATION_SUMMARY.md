# Implementation Summary — Track B: Fase 6

- **Current Status**: Plan Formulated (Menunggu Persetujuan Pengguna)
- **Active Milestone**: Track B — Fase 6: Cleanup & Slim Entrypoint Wiring (`wire.go` / `app.go`)
- **Active Branch**: `dev`
- **Tujuan Utama**:
  1. Mentransformasi `backend/main.go` dari god object 598 baris menjadi slim bootstrap (< 60 baris) dengan graceful shutdown standar Go.
  2. Memusatkan parsing environment variables ke `internal/shared/config`.
  3. Memusatkan orkestrasi dependency injection dan server lifecycle ke `internal/app/wire.go`.
  4. Memisahkan registrasi routing HTTP ke `internal/app/router.go`.
  5. Mengemas goroutine pembersih background ke `internal/authz/worker/cleaner_worker.go`.
- **Target Pembaca**: Junior Programmer & Maintainer (jelas, modular, terdokumentasi rapi).
