# Implementation Progress — Direct Signed Upload (Supabase Storage)

## Checklist
- [x] **M1: Storage Layer Definition & Implementations**
  - [x] Add `SignedUploadResult` and `CreateSignedUploadURL(ctx context.Context, filename, contentType string) (*SignedUploadResult, error)` to `MediaStorage` interface in `backend/internal/storage/storage.go`.
  - [x] Implement `CreateSignedUploadURL` in `backend/internal/storage/supabase_storage.go`.
  - [x] Implement `CreateSignedUploadURL` in `backend/internal/storage/local_storage.go` (returns `ErrSignedUploadNotSupported`).
- [x] **M2: Backend Handler & Routing**
  - [x] Add `CreateSignedUploadURL` to `backend/internal/api/media_handler.go`.
  - [x] Add payload struct `SignedUploadURLRequest` (`file_name`, `file_size`, `mime_type`).
  - [x] Implement validation (file size max check, dangerous extensions filter, mime type check).
  - [x] Mount `POST /api/media/signed-upload-url` in `backend/internal/app/router.go` under `auth.RequireJWT()`.
- [x] **M3: Backend Unit Tests**
  - [x] Add unit tests in `backend/internal/api/media_handler_test.go` verifying valid ticket generation, size limit rejection, extension block, disabled toggle, and mock storage behavior.
  - [x] Run `go test -v ./...` in `backend/`.
- [x] **M4: Frontend Web Integration**
  - [x] Update `uploadMedia` in `frontend/lib/api.ts` to request signed upload URL and perform direct `PUT` to Supabase Storage with 60s abort timeout.
  - [x] Add automatic fallback to `POST /api/media/upload` if signed upload request or upload fails.
- [x] **M5: Mobile Expo Integration**
  - [x] Add types in `mobile/src/api/types.ts`.
  - [x] Update `uploadMedia` in `mobile/src/api/media.ts` to request signed upload URL, upload raw binary bytes directly via `fetch` (`PUT`), with seamless fallback to `POST /api/media/upload`.
- [x] **M6: Verification & Quality Gate**
  - [x] Backend: `go test ./...` (PASS 100%)
  - [x] Frontend: `npm run build` (PASS 100%, 0 Turbopack/TS errors)
  - [x] Mobile: `npx tsc --noEmit` (PASS 100%, 0 TS errors)
- [x] **M7: Tiered Documentation Sync**
  - [x] Update `docs/BACKEND_API.md` with `POST /api/media/signed-upload-url` specs.
  - [x] Update `docs/PROGRESS.md` with milestone and feature changelog.
