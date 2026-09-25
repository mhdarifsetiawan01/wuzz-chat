# Implementation Plan — Milestone M-Mobile-8.5

## Objectives
Implement WhatsApp-grade Contact Profile, Verified Identity (centang biru), and 30-Digit E2EE Safety Number verification for WuzzChat Mobile, guaranteeing 100% interoperability with Web frontend.

---

## Technical Architecture & Components

### 1. E2EE 30-Digit Safety Number Engine & Services (`mobile/src/services/e2eeService.ts`)
- **Deterministic 30-Digit Fingerprint Algorithm**:
  - `[pubKeyA, pubKeyB].sort().join('::')`
  - SHA-256 hash using `@noble/hashes/sha2.js`
  - 6 blocks of 5-digit numbers (`val = bytes[i*4..i*4+3]`, `unsigned = Math.abs(val) % 100000`, `padStart(5, '0')`)
  - Identical to `frontend/lib/crypto/e2ee.ts:generateSafetyNumber`.
- **Peer Public Key Resolution & Caching**:
  - `getOrFetchPeerPublicKey(userId: string): Promise<string | null>` with memory caching and fallback to `getUserPublicKey(userId)`.
- **Local Verification State Persistence**:
  - Store manual safety verification in `secureStorage` (`wuzz_e2ee_verified_<peerId>`).
  - Functions: `setContactSafetyVerified(peerId, safetyNumber, verified)` & `isContactSafetyVerified(peerId, safetyNumber)`.

### 2. QR Code Matrix Generator (`mobile/src/services/qrCodeService.ts` & `mobile/src/components/QRCodeView.tsx`)
- Pure TypeScript QR matrix generator or bit matrix module (100% pure JS, zero native modules).
- Clean visual `<View>` grid renderer with custom size, high contrast background, and inner quiet zone padding.

### 3. Verified Account Badge Component (`mobile/src/components/VerifiedBadge.tsx`)
- Rosette / Starburst circle badge with electric cyan & soft azure gradient (`#00f2fe` to `#3b82f6`) and crisp white checkmark `✓`.
- Reusable across `ChatScreen` header, `ChatListItem`, and `ContactInfoModal`.

### 4. Contact Profile & Info Modal (`mobile/src/components/ContactInfoModal.tsx`)
- **Theme**: WhatsApp Aurora Glassmorphism.
- **Components**:
  - Hero Header with large avatar, display name, `@username`, and `VerifiedBadge` (if `is_verified` or `peer_is_verified`).
  - Online presence dot / last seen indicator.
  - Quick Action Buttons: Voice Call (placeholder feedback), Share Contact (native `Share.share`), Mute Notifications (local toggle).
  - Status Message / Bio card with join date.
  - 🔒 E2EE Security Card: displays verified status badge, 30-digit snippet, and "Pindai / Cocokkan Kode" action button.

### 5. Dedicated Safety Number Verification Modal (`mobile/src/components/SafetyNumberModal.tsx`)
- Full 30-digit fingerprint organized in a 2-column monospace grid.
- QR Code display for in-person visual scanning.
- One-tap clipboard copy (`expo-clipboard`) with "✅ Disalin" visual feedback.
- "Tandai Terverifikasi" toggle button that persists state locally.

### 6. Integration Points
- `mobile/src/screens/ChatScreen.tsx`:
  - Enable header tap on 1-on-1 direct chats (`isDirect === true`) to trigger `ContactInfoModal`.
  - Add `VerifiedBadge` beside contact name in chat header.
- `mobile/src/components/ChatListItem.tsx`:
  - Add `VerifiedBadge` in conversation row if `peer_is_verified === true`.
- `mobile/src/api/users.ts` & `mobile/src/api/types.ts`:
  - Export `getUserProfile(userId: string): Promise<User>` with 15s `AbortController`.
  - Add `last_seen?: string` to `User` type.

---

## Target Files
1. `mobile/src/services/e2eeService.ts` *(New file)*
2. `mobile/src/services/qrCodeService.ts` *(New file)*
3. `mobile/src/services/index.ts` *(Export updates)*
4. `mobile/src/api/types.ts` *(Type enhancement)*
5. `mobile/src/api/users.ts` *(API helper addition)*
6. `mobile/src/components/VerifiedBadge.tsx` *(New component)*
7. `mobile/src/components/QRCodeView.tsx` *(New component)*
8. `mobile/src/components/SafetyNumberModal.tsx` *(New modal)*
9. `mobile/src/components/ContactInfoModal.tsx` *(New modal)*
10. `mobile/src/components/index.ts` *(Export updates)*
11. `mobile/src/screens/ChatScreen.tsx` *(Header click & modal integration)*
12. `mobile/src/components/ChatListItem.tsx` *(Verified badge integration)*

---

## Verification Strategy
- Typecheck: `npx tsc --noEmit` in `mobile/` (0 errors).
- Backend tests: `go test -v ./...` in `backend/` (100% pass).
- Deterministic 30-digit test: verify exact matching between mobile `generateSafetyNumber` and web formula.
- Zero server leak rule: verify all temporary servers killed.
