# Implementation Plan — Mobile Persistent Local Media Cache (DEC-034)

## 1. Problem Statement
Media in 1-on-1 direct messages is deleted from the server upon recipient ACK per the WhatsApp Store-and-Forward architecture. When chat history is subsequently fetched from the server, `media_status` is `'expired'`, which immediately renders the banner *"Media telah kedaluwarsa"* across all bubbles (both sender and recipient) because the mobile client lacked local filesystem persistence.

## 2. Solution Architecture
1. **`mobile/src/services/mediaCache.ts`**:
   - `initMediaCacheDirectory()`: Ensure `FileSystem.documentDirectory + 'wuzzchat_media/'` exists.
   - `getLocalPathForMedia(url, messageId, ext)`: Deterministic hashing/naming for cached files.
   - `getCachedMediaUri(url, messageId)`: Quick async check if file exists locally.
   - `cacheMediaFromUri(remoteUrl, messageId)`: Download from server and save to local filesystem.
   - `saveLocalFileToCache(localSourceUri, messageId, remoteUrl)`: Copy local uploaded asset into cache.
2. **`mobile/src/components/MessageBubble.tsx`**:
   - Load `localMediaUri` on mount / URL change.
   - Guard `isExpired`: Only consider a message expired if `message.media_status === 'expired'` AND `!localMediaUri` (and not currently downloading).
   - Render `<Image source={{ uri: localMediaUri || message.media_url }} />` seamlessly.
   - When image loads successfully, trigger `cacheMediaFromUri` if not already cached, then trigger `onMediaLoaded(message)`.
   - In Fullscreen preview modal: use `localMediaUri || message.media_url`.
3. **`mobile/src/components/AudioPlayerBubble.tsx`**:
   - Support `localUri` so voice notes can be played from local cache even after server file deletion.
4. **`mobile/src/screens/ChatScreen.tsx`**:
   - When user selects and sends an image or voice note, write the staged local file into `mediaCache` keyed by temporary ID / final ID.

## 3. Verification Plan
- Automated TypeScript check: `npx tsc --noEmit` in `mobile/`.
- Frontend build: `npm run build` in `frontend/`.
- Backend tests: `go test ./...` in `backend/`.
- Hot-reload verification in Expo.
