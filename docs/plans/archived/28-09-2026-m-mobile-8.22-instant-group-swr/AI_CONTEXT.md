# AI CONTEXT — SWR & Local Storage Hydration for Group Chat (Mobile)

## Codebase Boundaries
- `mobile/src/screens/ChatScreen.tsx`: Group verification pre-flight gatekeeper & SWR render logic.
- `mobile/src/context/MessageContext.tsx`: Local SQLite hydration & timeline in-memory SWR caching.
- `mobile/src/services/sqliteStorage.ts`: SQLite message persistence & offline-first storage.

## Target Architecture & Goals
- Eliminasi full-screen blocking `ActivityIndicator` saat pengguna membuka grup yang sudah ada di daftar percakapan lokal.
- Terapkan pola **Stale-While-Revalidate (SWR)**: Render instan 0ms dari memori atau SQLite lokal saat masuk ke grup.
- Background revalidation: Jalankan `groupsApi.getGroupDetails` dan WebSocket `joinRoom` di latar belakang secara bersamaan tanpa memblokir UI.
- Pertahankan proteksi DEC-012 (Public Group Preview) dan DEC-013 (Private Group 403 Forbidden Shield) HANYA untuk grup luar/tautan langsung yang belum terverifikasi keanggotaannya.
- Flaky / Slow server resilience: Jika server lambat atau offline, grup yang sudah ada di lokal tetap bisa dibuka dan dibaca pesan-pesannya tanpa crash atau popup error yang menutup layar (`onBack()`).

## Active Constraints & Rules
- TypeScript type-check harus 100% lolos (`npx tsc --noEmit` -> 0 errors).
- Dilarang merusak kompatibilitas WebRTC calling atau DM.
- Wajib mematuhi SOP Implementation Protocol dan Server Lifecycle.
