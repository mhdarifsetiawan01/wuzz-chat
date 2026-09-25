# Implementation Plan — Milestone M-Mobile-4: End-to-End Encryption (E2EE) Mobile Integration

## 1. Overview & Objectives
Implement End-to-End Encryption (E2EE) for WuzzChat Mobile (`mobile/`) adhering 100% to the cryptographic standard established in `docs/MOBILE_INTEGRATION_GUIDE.md` Section 3 and `frontend/lib/crypto/e2ee.ts`:
- **Key Agreement**: ECDH NIST P-256 (`secp256r1`).
- **Key Derivation**: HKDF-SHA256 (RFC 5869) with salt = `roomId` and info = `"wuzz-chat-e2ee-aes-v1"`.
- **Symmetric Cipher**: AES-256-GCM (NIST SP 800-38D) with 12-byte CSPRNG IV.
- **Payload Wire Format**: `e2ee:v1:<base64_iv>:<base64_ciphertext_with_tag>`.
- **Interoperability**: Bit-exact compatibility with Web Crypto API used by the Next.js frontend (`chat.wuzzhub.id`).

---

## 2. Target Modified & Created Files
1. `mobile/src/services/crypto.ts` (NEW): Core cryptographic engine (P-256 keygen, JWK export/import, ECDH + HKDF, AES-GCM encrypt/decrypt, Safety Number calculation).
2. `mobile/src/services/secureStorage.ts`: Add methods to securely persist and load local E2EE keypair in `expo-secure-store`.
3. `mobile/src/api/users.ts`: Add `updatePublicKey(publicKey, deviceId)` and `resetPublicKey(publicKey, deviceId)` endpoints.
4. `mobile/src/context/AuthContext.tsx`: Lifecycle hook on authentication to ensure local keypair exists and public key is synced to backend.
5. `mobile/src/screens/ChatScreen.tsx`: Pairwise AES key derivation per room, transparent auto-decryption of `e2ee:v1:` messages, and transparent encryption on outgoing direct messages.
6. `mobile/src/components/MessageBubble.tsx`: E2EE verified indicator styling (lock icon for decrypted messages).

---

## 3. Tasks Breakdown
- [ ] Task 1: Create `mobile/src/services/crypto.ts` with NIST P-256, JWK conversion, HKDF-SHA256, and AES-256-GCM.
- [ ] Task 2: Extend `mobile/src/services/secureStorage.ts` for encrypted local E2EE keypair persistence.
- [ ] Task 3: Add public key synchronization endpoints in `mobile/src/api/users.ts`.
- [ ] Task 4: Integrate E2EE key initialization and registration into `AuthContext.tsx`.
- [ ] Task 5: Implement transparent decryption and encryption in `mobile/src/screens/ChatScreen.tsx` with peer public key caching.
- [ ] Task 6: Verify TypeScript types (`npx tsc --noEmit`) and perform live smoke test on connected Android device via ADB.
