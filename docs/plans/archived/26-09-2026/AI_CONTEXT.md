# AI Context — Milestone M-Mobile-8.7

- **Milestone**: M-Mobile-8.7 (Real-time Message Deletion: "Hapus untuk Semua Orang" & "Hapus untuk Saya")
- **Active Branch**: `dev`
- **Target Directories**:
  - `mobile/src/api/` (API client & helpers)
  - `mobile/src/components/` (`MessageActionSheet.tsx`, `MessageBubble.tsx`)
  - `mobile/src/screens/` (`ChatScreen.tsx`)
- **Key Reference Implementations**:
  - `docs/MOBILE_INTEGRATION_GUIDE.md` (Bagian 7: Checklist & UUID-First Identity)
  - `docs/BACKEND_API.md` (`DELETE /api/messages`, `POST /api/messages/delete`, `message_deleted` WS event)
  - `frontend/app/chat/page.tsx` & `frontend/app/chat/MessageBubble.tsx` (WhatsApp-style delete UX, countdown, optimistic update, placeholder `🚫 Pesan ini telah dihapus`)
- **Constraints**:
  - Strict Dev-Only Branch (`dev`), dilarang bekerja di `main`.
  - Slow & Flaky Server Resilience: AbortController 15s timeout, optimistic local state update.
  - UUID-First Identity Rule: Pemilik pesan diidentifikasi via `message.from === currentUser.id`.
  - Anti-Magic Numbers & Token Compliance (`colors.ts`, `spacing.ts`, aurora theme).
