# AI Context — Milestone M-Mobile-10

- **Target Workspace**: `wuzz-chat` (Monorepo Go + Next.js + React Native Expo)
- **Active Branch**: `dev` (STRICT: Do NOT touch `main`)
- **Active Task**: Milestone M-Mobile-10: Private Profile, Scalable User Connections & Friendlist Engine
- **Active Constraints**:
  1. Anti-Hardcode: Nilai batasan wajib via `ConfigConnection` / environment variables.
  2. Anti-Offset: Pagination daftar teman wajib menggunakan Cursor-Based (`before_timestamp`, `before_id`).
  3. Zero-Trust Security: Proteksi IDOR, validasi `receiver_id == claims.UserID`, dan multi-tenant isolation.
  4. Server Lifecycle: Kill server port jika dijalankan sementara untuk verifikasi.
  5. Commit Approval: Dilarang `git commit` sebelum konfirmasi "selesai".
