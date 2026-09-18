# Active Implementation Plan — Private Group Access Denied Gate (DEC-013)

## 📌 Problem & Objective
Menangani akses tautan grup privat (`/chat?room=grp_xxx`) bagi pengguna yang bukan anggota, menggantikan pesan false positive "Koneksi Sedang Terhambat" dengan antarmuka otorisasi "Grup Bersifat Privat" (Aurora Glassmorphism) dan mencegah pengiriman frame WebSocket join ilegal.

## 🎯 Target File Changes
1. `frontend/app/chat/page.tsx`:
   - State `privateGroupDenied`
   - Validasi HTTP 403 pada `fetchGroupDetails` tanpa `alert()` mengganggu
   - Penahanan WebSocket join untuk grup privat non-member
   - Render layar proteksi grup privat dengan tombol kembali ke beranda
2. Sinkronisasi dokumentasi (8 file acuan)

## 🧪 Verifikasi
- `npm run build` di `frontend/`
- `go test -v ./...` di `backend/`
