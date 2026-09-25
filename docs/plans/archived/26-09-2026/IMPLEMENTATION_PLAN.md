# Implementation Plan: DEC-012 & DEC-013 Mobile

## 1. Objectives & Context
Implement two critical group discovery and access protection specifications from `docs/MOBILE_INTEGRATION_GUIDE.md`:
- **DEC-012**: Public Group Discovery & Preview Confirmation (anti-accidental auto-join).
- **DEC-013**: Private Group Direct Link Gate & Authorization Shield (403 Forbidden interceptor, WebSocket join guard, false-timeout prevention).

## 2. Target Modified & Created Files
- `mobile/src/components/GroupPreviewModal.tsx` *(New)*: Aurora Glassmorphism confirmation modal for public groups.
- `mobile/src/components/AuthorizationShield.tsx` *(New)*: Aurora Glassmorphism access protection screen/card for private groups.
- `mobile/src/components/index.ts` *(Modified)*: Export new components.
- `mobile/src/screens/NewChatScreen.tsx` *(Modified)*: Support parallel search for contacts and public groups (`groupsApi.searchPublicGroups`), render categorized results, and wire tap to `GroupPreviewModal`.
- `mobile/src/screens/ChatScreen.tsx` *(Modified)*: Pre-flight group details check before WebSocket connect. Intercept 403 Forbidden to show `AuthorizationShield` (suppress WebSocket join & false timeout). If public group without membership, trigger `GroupPreviewModal` before joining.
- `mobile/App.tsx` *(Modified)*: Deep link URL listener (`Linking.addEventListener('url', ...)` and `Linking.getInitialURL()`) to support direct group links (`wuzzchat://chat?room=grp_...`).

## 3. Technical Architecture & Constraints
1. **Aurora Glassmorphism UI**:
   - Card background: `rgba(15, 23, 42, 0.94)` / `colors.bgCardSolid`.
   - Borders: `colors.borderSubtle`, `colors.borderStrong`, or `colors.borderError`.
   - Glow effects and status tints: `colors.tintAccent10`, `colors.tintError10`.
   - Typography and radius from `mobile/src/theme/`.
2. **Anti-Accidental Auto-Join (DEC-012)**:
   - Selecting a public group never executes `POST /api/groups/{id}/join` immediately.
   - Shows modal with avatar, status badge 🌐 Publik, title, @group_username, member_count, and description.
   - Button states:
     - Member (`my_role` defined / `is_member === true`): "Buka Obrolan" (navigates without API join call).
     - Non-member: "Gabung ke Grup" with loading spinner, disabled state during flight, and 15s timeout via `apiClient`.
3. **Authorization Shield & Invariants (DEC-013)**:
   - When entering a private group (`grp_...`) without membership (`GET /api/groups/{id}` returns 403):
     - Invariant 1: Suppress WebSocket `{ type: "join" }` frame.
     - Invariant 2: Suppress empty chat timeline rendering.
     - Invariant 3: Suppress false connection timeout ("Koneksi Sedang Terhambat").
     - Render `AuthorizationShield` with "🔒 Grup Ini Bersifat Privat" and navigation back to home (`onBack()`).

## 4. Verification & Testing Strategy
- Run `npx tsc --noEmit` in `mobile/` to ensure zero compilation or typing errors.
- Validate component interfaces and exports.
- Verify safe lifecycle cleanup (timers, AbortController, back-handlers).
