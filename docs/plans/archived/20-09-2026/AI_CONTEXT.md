# AI Context — Backend Optimizations

## 🎯 Target Repository & Scope
- **Repository**: `wuzz-chat`
- **Sub-system**: `backend/` (Go HTTP Server, Auth Middleware, Database Store, WebSocket Broker)
- **Active Branch**: `dev`

## 🧱 Key Constraints
1. Work sequentially: Selesaikan satu per satu (dimulai dari Rate Limiter Dual-Tier).
2. Never commit to `main` directly; work strictly on `dev`.
3. Automated testing must pass (`go test -v ./...` & `npm run build`).
4. Server lifecycle: Never leave long-running server background processes after tests.
5. In-memory rate limiting must be thread-safe (`sync.Mutex`), zero data loss, safe JSON body reading.
