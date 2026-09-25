# Decision Log: DEC-034 Mobile Persistent Local Media Cache

## DEC-034: Two-Tier Media Caching & Resilient Expired-State Fallback in Mobile
- **Context**: In WuzzChat's WhatsApp Store-and-Forward architecture, direct message media files are deleted from the server upon recipient download ACK (`POST /api/media/ack`), marking `media_status = 'expired'`. Because the mobile client did not persist files locally, subsequent chat history reloads caused all messages (including sender's own bubbles) to render the "Media telah kedaluwarsa" expired banner instead of the image/audio.
- **Decision**:
  1. Build a dedicated `mediaCache` service using `expo-file-system/legacy` (`FileSystem.documentDirectory + 'wuzzchat_media/'`).
  2. For Senders: Persist local copy upon sending/uploading into cache directory keyed by message ID / media URL.
  3. For Recipients: Download and cache the media file to local filesystem upon initial load/display prior to or during ACK dispatch.
  4. In `MessageBubble` & `AudioPlayerBubble`: Check local file cache first. If a local file exists, render the image/audio directly even if `message.media_status === 'expired'`. Only show the expired placeholder if the file is NOT present locally AND expired on server.
- **Impact**: True WhatsApp-grade local persistence, 0ms instant display from local storage, and elimination of false "expired" banners for downloaded/sent media.
