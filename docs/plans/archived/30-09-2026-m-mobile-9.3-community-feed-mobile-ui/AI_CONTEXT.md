# AI Context — Milestone M-Mobile-9.3: Integrasi Real Mobile UI, Interaksi & Viral Share Loop

## 📌 Target Repository & Workspace
- **Repository Root**: `/home/bms-del112/BMS/personal-project/wuzz-chat`
- **Active Branch**: `dev` (STRICT: main branch protected)
- **Primary Modules**:
  - `mobile/src/api/feedApi.ts` & `mobile/src/api/types.ts`
  - `mobile/src/services/sqliteStorage.ts`
  - `mobile/src/context/FeedContext.tsx` (SWR Caching Layer & Local Storage Sync)
  - `mobile/src/screens/FeedScreen.tsx`
  - `mobile/src/components/CreatePostModal.tsx`
  - `mobile/src/components/PostCommentsModal.tsx`
  - `mobile/src/components/SharePostToChatModal.tsx`

## ⚙️ Environment Dependencies & Libraries
- **React Native / Expo**: Expo SDK 52, `expo-image-picker`, `expo-sqlite`, `react-native-safe-area-context`
- **Navigation**: `@react-navigation/native`, `@react-navigation/bottom-tabs`, `@react-navigation/native-stack`
- **Design System**: Aurora theme tokens in `mobile/src/theme/`, `frontend/DESIGN.md`
- **Backend API**: REST Endpoints under `/api/feed` (`backend/internal/api/feed_handler.go`)

## 🛡️ Active Constraints & Safety Protocols
1. **Branch Protection**: Dev-only work. No commits directly to `main`.
2. **Server Lifecycle Rule**: Kill any background test servers before finishing turns (`fuser -k <port>/tcp`).
3. **Flaky & Slow Server Resilience**: Optimistic updates (0ms) with rollback, 15s AbortController timeout, offline SQLite persistence.
4. **Dual-Platform Responsive Rule**: Proper `useSafeAreaInsets` handling, FAB positioning, dynamic height modals, safe touch targets.
5. **No Blind Commit Rule**: Require user confirmation ("selesai") before archiving plans or executing git commit.
