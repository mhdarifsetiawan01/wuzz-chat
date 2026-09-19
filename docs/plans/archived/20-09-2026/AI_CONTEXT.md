# AI Context — Sub-Group Private Join Request Notification Engine

## 🎯 Active Project Boundaries
- **Project**: Wuzz Chat
- **Active Task**: Real-Time Join Request Notification & Badge Counter for Private Sub-Groups/Forums
- **Target Subsystems**:
  - Backend: Go (`backend/internal/api/group_handler.go`, `backend/internal/store/group_store.go`, `backend/internal/ws/hub.go`, `backend/internal/push/push.go`)
  - Frontend: Next.js / TypeScript (`frontend/app/chat/SubGroupListDrawer.tsx`, `frontend/app/chat/page.tsx`, `frontend/lib/types.ts`)
- **Git Branch**: `dev`
- **Environment**: Linux, Go 1.24+, Next.js Turbopack, SQLite/PostgreSQL dual compatibility.

## 🛡️ Constraints & Rules
1. **Zero Spam for External Admins**: Hanya creator subgrup dan anggota subgrup dengan role admin yang menerima notifikasi. Admin grup induk yang tidak bergabung ke subgrup TIDAK menerima notifikasi.
2. **Dual Delivery**: WebSocket event untuk user online + Web Push Notification untuk user offline.
3. **Optimistic & Resilient**: Error handling fail-safe, tidak memblokir alur utama jika push service atau socket gagal.
4. **Clean Architecture & Token Compliance**: Gunakan token CSS dari `globals.css` untuk badge UI.
