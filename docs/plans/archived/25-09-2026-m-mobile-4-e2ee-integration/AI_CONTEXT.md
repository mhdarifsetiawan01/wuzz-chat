# AI Context & Active Workspace — Mobile E2EE Integration

- **Repository**: `wuzz-chat` (Monorepo: Go Backend + Next.js Frontend + Expo React Native Mobile)
- **Active Branch**: `dev` (strictly enforced, no direct commits to `main`)
- **Target Workspace Directory**: `mobile/`
- **Active Milestone**: `M-Mobile-4` (End-to-End Encryption Mobile Integration)
- **Tech Stack**: Expo Managed Workflow + React Native + TypeScript + `@noble/curves` + `@noble/hashes` + `@noble/ciphers`
- **Target Platforms**: Android & iOS
- **Cryptographic Specifications**:
  - Key Agreement: ECDH NIST P-256 (`secp256r1`)
  - Key Derivation: HKDF-SHA256 (RFC 5869), salt = `roomId`, info = `"wuzz-chat-e2ee-aes-v1"`
  - Cipher: AES-256-GCM (NIST SP 800-38D) with 12-byte random IV
  - Wire Format: `e2ee:v1:<base64-iv>:<base64-ciphertext+tag>`
  - Public Key Format: JWK (`{"kty":"EC","crv":"P-256","x":"...","y":"..."}`)
- **Core Constraints**:
  - Private keys must never leave local secure storage (`expo-secure-store`).
  - Bit-exact interoperability with Web Crypto API (`frontend/lib/crypto/e2ee.ts`).
  - Strict Dev-Only Branch & Git Commit Gate (require user confirmation).
