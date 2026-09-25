# Task Checklist — Milestone M-Mobile-4: End-to-End Encryption (E2EE) Mobile Integration

- [x] Task 1: Create `mobile/src/services/crypto.ts` with NIST P-256, JWK conversion, HKDF-SHA256, and AES-256-GCM
- [x] Task 2: Extend `mobile/src/services/secureStorage.ts` for encrypted local E2EE keypair persistence
- [x] Task 3: Add public key synchronization endpoints in `mobile/src/api/users.ts`
- [x] Task 4: Integrate E2EE key initialization and registration into `AuthContext.tsx`
- [x] Task 5: Implement transparent decryption and encryption in `mobile/src/screens/ChatScreen.tsx` with peer public key caching
- [x] Task 6: Verify TypeScript types (`npx tsc --noEmit` — 0 errors) and live smoke test on Android device via ADB — PASSED
