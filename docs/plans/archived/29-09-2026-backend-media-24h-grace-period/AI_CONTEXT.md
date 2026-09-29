# AI Context — Multi-Device Media Sharing (24-Hour Grace Period Retention)

- **Target Systems**: Backend Golang (`backend/internal/store/`, `backend/internal/api/`, `backend/internal/storage/`, `backend/internal/shared/config/`).
- **Domain**: Media & Attachment Lifecycle (`MEDIA_LIFECYCLE`), Multi-Device Support.
- **Problem Statement**: In 1-on-1 Direct Message, when Device 1 downloaded media and sent `POST /api/media/ack`, the backend immediately deleted the physical file from Supabase S3 storage (0ms immediate purge) and marked `media_status = 'expired'`. As a result, Device 2 (companion device: Web or 2nd mobile phone) received HTTP 404 and could never download or view the media.
- **Solution Choice**: Option A with 24-hour retention window. Download ACK from Device 1 will transition `media_status` to `'downloaded'` without immediate physical deletion (`canDelete = false`). The physical file is retained for 24 hours in storage, allowing Device 2 to independently download and cache the media. The background `PurgeWorker` will safely delete files older than 24 hours (1 day).
- **Constraints**:
  - Zero-breaking changes for mobile and web clients (both already call `POST /api/media/ack`).
  - Backward compatibility for Group/Forum shared media hub (remains safe with TTL).
  - All automated backend tests (`go test -v ./...`) must pass 100%.
  - Dev branch only; no auto-commit without user approval.
