# AI Context: M-Mobile-8.30 Interactive Media Viewer (Pinch-to-Zoom) & Room Media Gallery

## 🎯 Target Platform & Repositories
- **Target Repository**: `mobile/` (React Native Expo 57, TypeScript, React 19)
- **Active Branch**: `dev`
- **Domain Focus**: Media lifecycle & interactive UX (`M-Mobile-8.30`)

## 🧱 Architectural Boundaries & Constraints
- **Design System**: WhatsApp Aurora Dark Theme (`#090d16`, `colors.ts`, `spacing.ts`, `typography.ts`).
- **Binary Media Isolation**: SQLite stores string pointers (`media_url`, `local_media_uri`). File caching handled via `mediaCache`.
- **Cross-Platform Compatibility**: Full pinch-to-zoom, pan, swipe-down dismiss on both iOS and Android.
- **Zero Native Regressions**: Automated checks (`npx tsc --noEmit` in `mobile/`, `npm run build` in `frontend/`, `go test ./...` in `backend/`).
