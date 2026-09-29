# Decision Log — Direct Signed Upload (Supabase Storage)

## DEC-001: Signed Upload Ticket API & Interface Design
- **Context**: To achieve 0 MB VPS egress for media uploads, clients must upload directly to Supabase Storage via pre-signed URLs.
- **Decision**:
  - Add `CreateSignedUploadURL(ctx context.Context, filename string, contentType string) (*SignedUploadResult, error)` to `MediaStorage`.
  - For `SupabaseStorage`: Calls `POST /storage/v1/object/upload/sign/{bucket}/{objectKey}`, returns `SignedUploadResult{ SignedURL, PublicURL, ObjectKey, Token }`.
  - For `LocalStorage`: Returns `ErrSignedUploadNotSupported`.
  - Backend exposes `POST /api/media/signed-upload-url` (JWT authenticated).
  - Web & Mobile clients first attempt direct signed upload; on failure or if unsupported, they transparently fall back to `POST /api/media/upload`.
  - Preserves Store-and-Forward (`/api/media/ack`) and Auto-Purge Worker because the file storage key/URL conventions remain identical.
