# Decision Log — Milestone M-Mobile-4: End-to-End Encryption (E2EE) Mobile Integration

### `DEC-M11`: Pure-TypeScript NIST P-256 Curve & HKDF Engine (@noble)
- **Decision**: Use `@noble/curves/nist.js`, `@noble/hashes`, and `@noble/ciphers/aes.js` for mobile E2EE cryptography.
- **Rationale**: Web Crypto API is not natively uniform across all React Native / Hermes engines. The `@noble` suite is zero-dependency, audited, and mathematically verified to produce 100% bit-exact ECDH shared secrets, HKDF-derived keys, and AES-256-GCM ciphertexts compatible with the web frontend (`frontend/lib/crypto/e2ee.ts`).

### `DEC-M12`: Local E2EE Keypair Persistence in Expo SecureStore
- **Decision**: Store the local user's P-256 private key and public key JWK in `expo-secure-store` indexed by user ID.
- **Rationale**: Guarantees that private keys never leave the physical device and remain encrypted by hardware keystore (Android Keystore / iOS Keychain), while allowing seamless key rehydration across app restarts.
