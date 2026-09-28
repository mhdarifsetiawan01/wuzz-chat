# Implementation Plan: M-Mobile-8.30 Interactive Media Viewer & Room Media Gallery

## 🎯 Objectives
1. Implement `MediaViewerModal.tsx` with:
   - Fullscreen deep black background (`rgba(0,0,0,0.95)`).
   - Smooth Pinch-to-Zoom (up to 4x) and 2D Pan support.
   - Double-tap to zoom (toggle 1x <-> 2.5x).
   - Swipe-down to dismiss gesture + clean top close button (`✕`).
   - Cinematic mode toggle on single tap (fade header/footer overlays).
   - Native Share button via `Share.share`.
2. Implement `getRoomMediaMessages` in `mobile/src/services/sqliteStorage.ts`.
3. Implement `ChatMediaGalleryModal.tsx` with tabs (Media Grid & Documents List).
4. Integrate `MediaViewerModal` in `mobile/src/components/MessageBubble.tsx`.
5. Integrate `ChatMediaGalleryModal` in `mobile/src/screens/ChatScreen.tsx`.
6. Run full automated verification (`npx tsc --noEmit`, `npm run build`, `go test ./...`).
