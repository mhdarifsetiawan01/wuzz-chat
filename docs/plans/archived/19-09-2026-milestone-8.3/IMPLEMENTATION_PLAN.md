# Implementation Plan — Milestone 8.3: Message Management Suite

## 🎯 Objective
Mengimplementasikan rangkaian fitur manajemen pesan modern standar WhatsApp & Telegram:
1. **Sub-8.3.A**: ✏️ Edit Pesan (Window 15 menit, flag `is_edited`, `edited_at`, real-time update WebSocket, inline edit UI)
2. **Sub-8.3.B**: ↪ Forward Pesan (Penerusan ke 1-5 kontak/grup sekaligus, label `is_forwarded`)
3. **Sub-8.3.C**: 📌 Pin Chat (Pin obrolan di sidebar tingkat user, sorting prioritas)
4. **Sub-8.3.D**: 📌 Pin Message (Pin pesan penting dalam room/grup, banner interaktif max 3 pesan)
5. **Sub-8.3.E**: 🔍 In-Chat Search (Pencarian kata kunci teks riwayat obrolan aktif dengan highlight scroll)

## 📁 Target Files
### Backend (Go)
- `backend/internal/store/sql.go` — DB auto-migrations & SQL queries
- `backend/internal/store/store.go` — Contracts & structs
- `backend/internal/store/memory.go` — In-memory test store
- `backend/internal/ws/message.go` — WebSocket message types & structs
- `backend/internal/api/chat_handler.go` — REST endpoints
- `backend/main.go` — HTTP route registration
- `backend/internal/api/chat_handler_*_test.go` — Unit & integration tests

### Frontend (Next.js / React / TypeScript)
- `frontend/lib/types.ts` — Types & interfaces
- `frontend/app/chat/page.tsx` — WebSocket event handling, reducer actions, scroll helpers
- `frontend/app/chat/MessageBubble.tsx` — Context menu & labels (edited, forwarded, pin)
- `frontend/app/chat/MessageInput.tsx` — Inline edit banner & edit API call
- `frontend/app/chat/Sidebar.tsx` — Pin chat indicator & context action
- `frontend/app/chat/ChatWindow.tsx` — Pinned message banner
- `frontend/app/chat/StatusBar.tsx` — In-chat search trigger & bar
- `frontend/app/chat/ForwardMessageModal.tsx` — Multi-target forward dialog

## 🧪 Verification Strategy
1. Unit tests backend Go: `go test -v ./internal/store/... ./internal/api/... ./internal/ws/...`
2. Frontend build & lint: `npm run build`
3. Zero destructive database modifications.
