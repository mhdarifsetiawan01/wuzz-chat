# Active Implementation Plan: Backend Logout & Encrypted Messages Banner

## 🎯 Objective
1. Mengatasi false conflict *"Perangkat lain sedang aktif"* ketika user logout dari Device 1 lalu login di Device 2, dengan menambahkan endpoint `POST /api/auth/logout` yang merilis `active_device_id` di database.
2. Menyederhanakan linimasa chat E2EE dengan mengganti tumpukan bubble `🔒 [Pesan Terenkripsi]` dengan **1 banner ringkas terpadu** di bagian atas linimasa.

## 📂 Target Files
- `backend/internal/store/user_store.go`: Menambahkan metode `ClearActiveDevice(userID string) error`.
- `backend/internal/api/auth_handler.go`: Menambahkan handler `Logout`.
- `backend/main.go`: Menambahkan rute `POST /api/auth/logout`.
- `backend/internal/api/auth_logout_test.go`: Test suite verifikasi logout.
- `frontend/lib/auth-context.tsx`: Memanggil `POST /api/auth/logout` saat fungsi `logout()` dieksekusi.
- `frontend/app/chat/page.tsx`: Menyaring pesan terenkripsi lama dan menampilkan single system banner.
- `frontend/app/globals.css`: Styling banner `.encrypted-messages-banner` sesuai Design System tokens.

## 🧪 Verification Strategy
- `cd backend && go test -v ./internal/api/...`
- `cd backend && go test -v ./...`
- `cd frontend && npm run build`
