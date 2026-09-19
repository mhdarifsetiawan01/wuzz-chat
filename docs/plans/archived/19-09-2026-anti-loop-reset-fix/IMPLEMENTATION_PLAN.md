# Active Implementation Plan

## Tujuan
Memperbaiki isu *Infinite Ping-Pong Reset Loop* saat pengguna memilih *"Atau Keluar & Masuk Ulang Akun"* di modal konflik, dan menerapkan pola *Synchronous Local-First Purge & Server-Timeout Immunity* agar proses logout tidak pernah gagal atau menggantung saat server lambat/timeout.

## Rencana Perubahan
1. **`frontend/lib/auth-context.tsx`**:
   - Pindahkan `localLogout()` ke baris pertama `logout()` (pembersihan 0ms instan).
   - Lindungi request `POST /api/auth/logout` dengan `AbortController` timeout ketat 3 detik.
   - Sediakan snapshot token eksplisit agar otorisasi tetap terkirim meski `localStorage` sudah dibersihkan.
2. **`frontend/app/chat/page.tsx`**:
   - Pastikan `handleDeviceConflictLogout` membersihkan key lokal dan mengarahkan ke `/login?logout=1`.
3. **`frontend/app/chat/DeviceConflictModal.tsx`**:
   - Pastikan `onClick` pada tombol keluar meng-`await onLogout()`.
4. **`frontend/app/login/page.tsx`**:
   - Tangani parameter `?logout=1` untuk memblokir auto-redirect ke `/chat` dan menampilkan notifikasi berhasil keluar.

## Verifikasi
- `npm run build`
- `go test -count=1 ./...`
