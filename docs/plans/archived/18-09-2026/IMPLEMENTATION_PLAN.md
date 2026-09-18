# Active Implementation Plan: Fix Premature Group Media Expiration (Shared Media Hub)

## 1. Problem Statement
Media sent in group chats (e.g. "Bacot Rumpi" with 13 members) immediately becomes "Media telah kedaluwarsa" (Expired) for other members as soon as the first recipient downloads the file. This happens because the current ACK handler treats all rooms as 1-on-1 direct messages, deleting the file from Supabase Storage and setting `media_status = 'expired'` upon receiving the very first download ACK.

## 2. Target Architecture
- **Direct Messages (1-on-1)**: Instant Store-and-Forward deletion ($0 server cost).
- **Group Chats & Forum Topics (1-to-Many)**: Shared Media Hub. Download ACK by any member does NOT delete the file from Supabase and does NOT mark the message as expired. Files remain accessible to all group members until TTL expiration via `PurgeWorker` (e.g. 7 days).

## 3. Impacted Components
- `backend/internal/store/sql.go`: Update `AcknowledgeMediaDownload` to check room type (`grp_` prefix or conversations table lookup).
- `backend/internal/store/memory.go`: Mirror logic for in-memory testing.
- `backend/internal/api/media_handler.go`: Guard file deletion logic against group conversations.
- `backend/internal/api/media_handler_test.go`: Add test cases for group media download ACK vs direct message ACK.
- `docs/*`: Keep all project documentation synchronized.
