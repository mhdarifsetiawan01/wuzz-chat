# Implementation Plan — Direct Signed Upload (Supabase Storage)

## 1. Objectives & Architectural Overview
Implement Direct Signed Upload (Presigned URL) directly to Supabase Storage:
- When a user uploads media in Web or Mobile, client requests a pre-signed upload ticket via `POST /api/media/signed-upload-url`.
- The backend verifies JWT, validates file size and extension, generates a unique UUID-based object path (including tenant prefix if multi-tenant), calls Supabase Storage REST endpoint `POST /storage/v1/object/upload/sign/{bucket}/{objectKey}`, and returns the presigned upload URL and public URL.
- Client uploads raw file bytes directly to the Supabase signed upload URL using `PUT`. Egress on VPS is 0 MB.
- Client uses returned `public_url` in chat message payload.
- If storage driver is `local` or if signed URL request/upload fails, client gracefully falls back to `POST /api/media/upload`.
- WhatsApp-style Store-and-Forward (`/api/media/ack`) and auto-purge background worker continue to operate smoothly.

## 2. Target Modified / Created Files
- `backend/internal/storage/storage.go`: Add `CreateSignedUploadURL` and `SignedUploadResult` struct to `MediaStorage` interface.
- `backend/internal/storage/supabase_storage.go`: Implement `CreateSignedUploadURL` using Supabase REST API `POST /storage/v1/object/upload/sign/{bucket}/{objectKey}`.
- `backend/internal/storage/local_storage.go`: Implement `CreateSignedUploadURL` returning `ErrSignedUploadNotSupported`.
- `backend/internal/api/media_handler.go`: Add `CreateSignedUploadURL` handler method, request/response models, validation logic.
- `backend/internal/app/router.go`: Mount `POST /api/media/signed-upload-url` protected by `auth.RequireJWT()`.
- `backend/internal/api/media_handler_test.go`: Add comprehensive unit tests for signed upload URL endpoint.
- `frontend/lib/api.ts`: Update `uploadMedia` to request signed upload URL and perform direct `PUT` to Supabase, with automatic fallback to `/api/media/upload`.
- `mobile/src/api/media.ts`: Update `uploadMedia` to request signed upload URL and perform direct `PUT` to Supabase, with automatic fallback to `/api/media/upload`.
- `mobile/src/api/types.ts`: Add `SignedUploadTicketRequest` and `SignedUploadTicketResponse`.
- `docs/BACKEND_API.md`: Document `POST /api/media/signed-upload-url`.
- `docs/PROGRESS.md`: Record progress entry for Direct Signed Upload.

## 3. Verification Strategy
- Backend: `cd backend && go test -v ./...`
- Frontend: `cd frontend && npm run build`
- Mobile: `cd mobile && npx tsc --noEmit`
