# Implementation Plan — Milestone M-Mobile-8.9: E2EE Key Conflict Handling & Reset Dialog (HTTP 409)

## 1. Problem Statement & Motivation
When an existing user logs in from a fresh phone (or installs the app on a secondary device) without transferring their local E2EE keys, the client attempts to register its new public key via `PUT /api/users/public-key`. The backend responds with `HTTP 409: KEY_ALREADY_REGISTERED` to protect the existing key from accidental overwriting.
Currently, `AuthContext` catches this error and transitions `e2eeStatus` to `'conflict'`, but no UI modal is presented to the user. The app hangs or remains in conflict mode without giving the user the ability to verify their password and force-reset the key, or cancel and return to login without killing the primary device's active session.

## 2. Technical Architecture & Component Flow

### A. New UI Modal: `KeyConflictModal.tsx`
- **Location**: `mobile/src/components/KeyConflictModal.tsx`
- **Export**: `mobile/src/components/index.ts`
- **Visual Design**:
  - Centered card overlay with frosted backdrop (`colors.bgOverlay`).
  - Warning/Key badge (`🔐`) with error/warning tint (`colors.tintWarning10` / `colors.tintAccent10`).
  - Header: *"Kunci Keamanan Terdaftar"* / *"Perangkat Lain Sedang Aktif"*.
  - Body: *"Akun Anda telah memiliki kunci enkripsi di perangkat lain. Untuk mengaktifkan obrolan terenkripsi (E2EE) pada perangkat ini, Anda dapat mereset kunci keamanan menggunakan password akun Anda."*.
  - Interactive Action Modes:
    1. **Default State**:
       - Button "Reset Kunci ke Perangkat Ini" (variant: `primary`).
       - Button "Batal / Kembali" (variant: `secondary` / `ghost`).
    2. **Password Verification Prompt State**:
       - Animated/Visible input field with password masking (`secureTextEntry`).
       - Inline error message for wrong password or network failure.
       - Button "Konfirmasi Reset" (calls `onConfirmReset(password)` with loading indicator).
       - Button "Kembali" (returns to default state).

### B. Auth Context Integration: `mobile/src/context/AuthContext.tsx`
- Add `cancelKeyConflict()` method:
  - Clears local tokens and stored session (`secureStorage.clearSession()`).
  - Sets `user = null`, `token = null`, `e2eeKeyPair = null`, `e2eeStatus = 'uninitialized'`.
  - Does NOT call remote `POST /api/auth/logout` (preserves the primary device's active session per `docs/MOBILE_INTEGRATION_GUIDE.md` line 84).
- Ensure `resetE2EEKeys(password)` handles invalid password error reporting cleanly.

### C. Root Navigator Mounting: `mobile/App.tsx`
- In `AppNavigator`, read `e2eeStatus`, `resetE2EEKeys`, and `cancelKeyConflict` from `useAuth()`.
- Mount `<KeyConflictModal visible={e2eeStatus === 'conflict'} ... />` globally.

## 3. Impacted Files
- `mobile/src/components/KeyConflictModal.tsx` (new)
- `mobile/src/components/index.ts`
- `mobile/src/context/AuthContext.tsx`
- `mobile/App.tsx`
- `docs/MOBILE_INTEGRATION_GUIDE.md`
- `docs/plans/active/*`

## 4. Verification & Testing Strategy
- Automated Typecheck: `npx tsc --noEmit` in `mobile/`
- Automated Backend Tests: `go test -v ./...` in `backend/`
- Automated Frontend Build: `npm run build` in `frontend/`
- Integration Script: Verify key conflict 409 and reset flow in an integration test.
