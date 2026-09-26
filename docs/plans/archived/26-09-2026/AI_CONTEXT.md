# AI Context — Milestone M-Mobile-8.10

## Codebase Boundaries & Target Modules
- **Target Repository**: `wuzz-chat` (Monorepo)
- **Active Module**: `mobile/` (React Native / Expo 57)
- **Interoperability Targets**: `frontend/` (Next.js PWA) & `backend/` (Go 1.24)
- **Branch**: `dev` (Strict Dev-Only Work, main branch protected)

## Environment & Tooling
- **Mobile Stack**: Expo ~57.0.25, React Native 0.86.3, React 19.2.3, TypeScript ~6.0.3
- **Crypto Libraries**: `@noble/curves` (NIST P-256), `@noble/hashes` (PBKDF2, SHA-256), `@noble/ciphers` (AES-GCM), `expo-crypto` (CSPRNG)
- **Hardware & Native**: `expo-camera` (`CameraView`), `expo-secure-store`, `react-native-safe-area-context`
- **UI Components**: `CameraQRScannerModal.tsx`, `QRCodeView.tsx`, `Button.tsx`, `Input.tsx`

## Active Constraints & Rules
- **Mandatory Dual-Platform Frontend Architecture Rule**: Seamless UI/UX and state lifecycle on both Mobile & Desktop.
- **Mandatory Frontend Design System & Token Compliance Rule**: Zero magic numbers, strict use of theme tokens from `mobile/src/theme`.
- **Mandatory Slow & Flaky Server Resilience Rule**: Explicit timeouts, optimistic state, graceful error fallbacks, and retry protection.
- **Token Efficiency & Context Window Optimization Rule**: Grep-first & line-range reading.
- **Implementation Protocol**: Phase 1 active tracking, user confirmation gate before Git commit.
