# AI Context & Implementation Bounds

## 1. Project Overview
- **Repository:** Wuzz Chat (Monorepo Go + Next.js 16 App Router)
- **Active Branch:** `dev`
- **Target Architecture:** Modern Chat Platform (WhatsApp / Telegram Grade)
- **Active Milestone:** Fase 4 — Modern Chat UX & Interactive Dynamics

## 2. Technical Boundaries
- **Backend:** Go 1.26+, `gorilla/websocket`, `lib/pq` (Supabase Pooler), JWT Auth
- **Frontend:** Next.js 16 (App Router), TypeScript, Vanilla CSS Design System, AuthContext
- **Proxy:** Custom `server.js` forwarding `/ws` and `/api/*` to Go backend (`http://localhost:8080`)
- **Database:** PostgreSQL (Supabase) with auto-migration on start

## 3. Strict Rules & Constraints
- Protected Branches: `main`, `master`, `staging` (Never commit directly).
- Destructive DB: Strict prohibition on `DROP TABLE/DB` or bulk wipe without explicit written user approval.
- Server Lifecycle: Kill temporary test ports (`fuser -k <port>/tcp`) before finishing turns.
- Git Push: Never execute automatic `git push` to remote.
- Documentation Sync: Every change must be updated across `docs/` before marking tasks complete.
