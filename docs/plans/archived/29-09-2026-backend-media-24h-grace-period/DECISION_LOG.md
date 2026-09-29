# Decision Log — Multi-Device Media Sharing (24-Hour Grace Period Retention)

### DEC-036: 24-Hour Retention Window for Direct Message Media Sharing Across Devices
- **Status**: Proposed & Approved
- **Context**: In WuzzChat's original 1-on-1 DM architecture, media download ACK (`POST /api/media/ack`) triggered immediate 0ms deletion of the physical file from Supabase S3 storage. While this achieved strict $0 server storage cost, it broke multi-device synchronization: when Device 1 downloaded the image, Device 2 (Web or 2nd mobile phone) received HTTP 404 and could never download or view the image.
- **Decision**:
  1. Transition DM Store-and-Forward from immediate 0ms deletion to a **24-hour delayed purge grace period**.
  2. On `POST /api/media/ack`, the server updates `media_status = 'downloaded'` and returns `canDelete = false`, leaving the file intact on storage.
  3. The background `PurgeWorker` runs periodically and purges media files whose age exceeds 24 hours (`MEDIA_RETENTION_DAYS = 1`).
  4. Once purged by `PurgeWorker`, the physical file is deleted and `media_status` becomes `'expired'`.
- **Consequences**:
  - Device 1 and Device 2 can both independently download and store the file in their local cache within 24 hours.
  - Server storage remains lean and clean ($0 long-term cost).
  - No breaking client protocol changes.
