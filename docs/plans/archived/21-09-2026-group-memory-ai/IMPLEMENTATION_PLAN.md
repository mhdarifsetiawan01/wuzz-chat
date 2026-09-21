# Implementation Plan: Milestone 7 — E2E Integration, Web Push Notifications & Final Polish

## 🎯 Objective
Menyelesaikan milestone penutup (Milestone 7) dari Fase 10 Group Memory AI:
1. Menghubungkan Web Push Notifications dan WebSocket real-time broadcast untuk seluruh event siklus hidup memori (`memory_draft_ready`, `memory_job_failed`, `memory_published`).
2. Menerapkan Provider Factory multi-vendor (`AI_PROVIDER`, `AI_MODEL`) dan unifikasi penanganan error (Retryable vs Terminal) di layer AI Go.
3. Mendukung deep-linking PWA Service Worker (`sw.js`) dan dynamic URL routing di frontend Next.js.
4. Menjalankan verifikasi integrasi E2E komprehensif (`go test ./...` dan `npm run build`).

## 📦 Scope of Work

### 1. Multi-Vendor Provider Factory & Universal Error Taxonomy (`backend/internal/ai/`)
- Buat `factory.go`:
  - Membaca `AI_PROVIDER` (default `gemini`, opsi: `gemini`, `openai`, `ollama`, `mock`).
  - Membaca `AI_MODEL` (default `gemini-1.5-flash`).
  - Fallback aman: jika API key tidak diset di dev/test environment, gunakan `MockAIService` dengan peringatan log ramah tanpa membuat server crash.
- Unifikasi error classification:
  - Deteksi HTTP 429 / Rate Limit / Timeout sebagai retryable error.
  - Deteksi Invalid Auth (401/403) sebagai fatal terminal error.

### 2. Push & Real-Time Event Dispatch (`backend/internal/push/` & `backend/internal/ai/processor.go`)
- Tambahkan helper method di `push.Service`:
  - `NotifyMemoryEvent(userIDs []string, title, body, tag string, data map[string]interface{})`.
- Di `MemoryProcessor.ProcessMemoryJob`:
  - Saat draft berhasil dibuat: ambil user IDs admin/creator grup (`SELECT user_id FROM conversation_members WHERE conversation_id = ? AND role IN ('admin', 'creator')`).
  - Dispatch Web Push Notification: `type: "memory_draft_ready"`, title: `📝 Draft Memory Siap Direview`, deep-link: `/chat?roomId={group_id}&openDraft={draft_id}`.
  - Broadcast via WebSocket Hub (jika ada admin online).
  - Jika job gagal terminal (attempt >= 3): dispatch notifikasi push `memory_job_failed`.
- Di `MemoryHandler.handleApproveDraft`:
  - Saat draft di-approve menjadi `ApprovedMemory`:
  - Ambil seluruh user IDs anggota grup kecuali admin yang menyetujui (`user_id != claims.UserID`).
  - Dispatch Web Push Notification: `type: "memory_published"`, title: `✅ Memory Grup Tersedia`, deep-link: `/chat?roomId={group_id}&openMemory={memory_id}`.
  - Broadcast event WebSocket `memory_published`.

### 3. Server Startup Wiring (`backend/main.go`)
- Hubungkan `pushService` dan `hub` ke `MemoryProcessor` agar background worker dapat mengirim notifikasi tanpa dependensi sirkular.

### 4. PWA Deep-Linking & Frontend Parameter Handling (`frontend/public/sw.js` & `page.tsx`)
- Di `frontend/public/sw.js`:
  - Dukung `data.deep_link || data.url` pada handler `notificationclick`.
- Di `frontend/app/chat/page.tsx`:
  - Tambahkan `useEffect` pembacaan URL search params:
    - Jika ada parameter `?openDraft=<id>`, otomatis buka `reviewDraftId = <id>`.
    - Jika ada parameter `?openMemory=<id>`, otomatis buka `selectedApprovedMemoryId = <id>`.

### 5. Verification Plan
- **Automated Backend Suite**: `go test -v ./...` (memastikan seluruh paket lulus 100%).
- **Frontend Turbopack Build**: `npm run build` (0 error TypeScript & Turbopack).
- **Server Zero-Port Lifecycle**: `ss -tulpn` bersih.
