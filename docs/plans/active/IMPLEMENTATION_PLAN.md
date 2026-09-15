# IMPLEMENTATION_PLAN.md — Rencana Perbaikan Device Conflict Bypass & In-App QR Scanner

## 1. Tujuan
Memperbaiki celah keamanan di mana pengguna dapat menutup modal konflik perangkat untuk masuk ke halaman chat tanpa kunci enkripsi lokal yang valid, menambahkan pemindai kamera (QR scanner) langsung di dalam web app, mencegah kebocoran pesan plaintext (fail-closed E2EE), dan membatasi koneksi WebSocket menjadi single active session.

## 2. Cakupan Perubahan
1. **Frontend UI & Hard Blocker**:
   - `frontend/app/chat/page.tsx`: Blokir total tampilan chat saat terjadi konflik, tahan WebSocket, dan cegah pengiriman plaintext.
   - `frontend/app/chat/DeviceConflictModal.tsx`: Hapus opsi tutup tanpa logout, sembunyikan tab generate pada perangkat baru.
   - `frontend/app/chat/DeviceTransferModal.tsx`: Tambahkan mode `scan` dengan in-app camera viewfinder, sembunyikan tab generate jika `hideGenerate` bernilai true.
2. **Frontend Dependencies**:
   - `frontend/package.json`: Tambahkan `html5-qrcode` untuk web camera QR scanning.
3. **Backend WebSocket Enforcer**:
   - `backend/internal/ws/hub.go`: Putus koneksi WebSocket lama jika ada koneksi baru dari user yang sama.
   - `backend/internal/ws/hub_single_device_test.go`: Unit test single active WebSocket session.

## 3. Strategi Verifikasi
- Unit test backend Go: `go test -v ./backend/internal/ws/...`
- Build frontend: `npm run build` di folder `frontend`
- Smoke test: simulasi login 2 perangkat, penutupan modal konflik, dan scan kamera.
