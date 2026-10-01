# AI Context — Client App Versioning & Force Update Gatekeeper

- **Target Workspace**: `wuzz-chat` (Monorepo Go + Next.js + React Native Expo)
- **Active Branch**: `dev` (STRICT: Do NOT touch `main`)
- **Active Task**: Client App Versioning, Build Tracking & Force Update Gatekeeper (Tahap 1)
- **Active Constraints**:
  1. Non-breaking Web: Browser web (`frontend`) tidak boleh terblokir oleh pengecekan versi mobile.
  2. Zero Hardcoding: Versi dibaca dinamis via `expo-constants` dari `app.json`.
  3. Dynamic Backend Control: `MIN_MOBILE_BUILD` dikontrol lewat environment variable (default: `0` = bypass/nonaktif).
  4. Server Lifecycle: Kill server port jika dijalankan sementara untuk verifikasi (`fuser -k <port>/tcp`).
  5. Commit Approval: Dilarang `git commit` sebelum konfirmasi "selesai".
