# AI Context — Direct Signed Upload (Supabase Storage)

- **Target Repository**: `wuzz-chat` (Monorepo: `backend/`, `frontend/`, `mobile/`, `docs/`)
- **Active Branch**: `dev`
- **Objective**: Implement Direct Signed Upload (Presigned URL) directly to Supabase Storage so that client uploads consume 0 MB Egress on the VPS.
- **Constraints**:
  - Never commit on `main`. Branch is currently `dev`.
  - Server lifecycle rule: Terminate temporary test servers immediately.
  - Tiered documentation sync: Update `docs/BACKEND_API.md` and `docs/PROGRESS.md`.
  - Backend Fly.io warning required for backend modifications.
  - Graceful fallback: Keep existing `POST /api/media/upload` working seamlessly if signed upload fails or if using `local` storage driver.
  - Store-and-Forward (`/api/media/ack`) and Auto-Purge Worker must remain intact and functional.
