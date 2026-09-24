# Implementation Plan — Bugfix: AI Memory Review Floating Toast Sticking & Header Collision

## 1. Problem Statement
Setelah admin/creator menyetujui (approve) atau menolak draft memori AI di `MemoryDraftReviewModal`:
- Muncul floating pill toast `🔔 🧠 Memori grup berhasil divalidasi dan dipublikasikan!`.
- Bug 1: Toast **tidak pernah hilang** (stuck permanen) karena `setInAppToast` dipanggil tanpa `setTimeout` / lifecycle auto-dismiss.
- Bug 2: Toast berposisi `fixed` di `top: 16px; left: 50%`:
  - Pada Mobile: Mengambang tepat di atas sticky header chat (menutupi tombol back, avatar, nama grup, dan tombol forum), serta teks bertumpuk berantakan.
  - Pada Laptop: Mengambang di tengah bilah header chat di antara nama grup dan deretan tombol aksi.
- Bug 3: `backgroundColor: 'var(--bg-card)'` bernilai transparan karena token `--bg-card` belum terdefinisi di `:root` `globals.css`, sehingga teks toast bertubrukan langsung dengan teks di belakangnya.
- Bug 4: Toast memiliki `pointerEvents: 'none'` dan tidak dapat di-dismiss manual dengan klik/tap.

## 2. Technical Architecture & Changes
1. `frontend/app/globals.css`:
   - Daftarkan token `--bg-card: rgba(30, 41, 59, 0.95);` di `:root`.
   - Definisikan utility class `.in-app-toast-banner` dan `@keyframes inAppToastSlideDown` dengan frosted glass, border token, safe area positioning (`top: calc(56px + env(...) + 12px)`), dan responsivitas mobile & desktop.
2. `frontend/app/chat/page.tsx`:
   - Implementasikan fungsi helper terpusat `showInAppToast(message, duration, icon)` dengan `inAppToastTimeoutRef` untuk auto-dismiss bersih tanpa memory leak.
   - Perbarui handler `onApproved` dan `onRejected` di `MemoryDraftReviewModal` untuk menggunakan `showInAppToast`.
   - Perbarui `join_request` handler untuk menggunakan `showInAppToast`.
   - Ubah elemen JSX render toast menggunakan class `.in-app-toast-banner`, event `onClick` untuk dismiss instan, dan tombol tutup `✕`.
   - Sempurnakan `onJumpToMessage` untuk navigasi pesan sumber memori.

## 3. Verification Strategy
- `npm run build` di direktori `frontend/` (lolos typecheck dan zero lint error).
- `go test -v ./...` di direktori `backend/`.

