# Decision Log: M-Mobile-8.30

## DEC-035: Cross-Platform Pinch-to-Zoom & Pan Gesture Architecture
- **Context**: Users expect intuitive multi-touch zoom and pan when viewing photos in WhatsApp/Telegram style chats.
- **Decision**: Combine multi-touch distance calculations and PanResponder with double-tap zoom detection and spring physics animations. Ensures 100% smooth behavior across Android and iOS without requiring heavy third-party gesture native binaries.
- **Status**: Accepted

## DEC-036: Media Query Filtering Strategy in SQLite
- **Context**: A chat room may contain thousands of messages, but users navigating to "Media & Berkas" want instant access to photos, videos, and documents.
- **Decision**: Query `local_messages` where `(media_url IS NOT NULL OR local_media_uri IS NOT NULL)` ordered by `created_at DESC`. Provide an optional `mediaType` filter ('image' | 'video' | 'file') to allow instant tab switching in the gallery.
- **Status**: Accepted
