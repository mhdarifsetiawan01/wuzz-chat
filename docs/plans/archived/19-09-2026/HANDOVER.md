# Handover Notes

## 📦 Changes Summary
1. **Backend Logout & Active Device Release**:
   - `backend/internal/store/user_store.go`: Interface `UserStore` & `SQLUserStore.ClearActiveDevice(userID string) error`.
   - `backend/internal/api/auth_handler.go`: Handler `Logout` yang memvalidasi JWT dan mengosongkan `active_device_id` di database.
   - `backend/main.go`: Rute `POST /api/auth/logout` dibungkus middleware CORS & JWT.
   - `backend/internal/api/auth_logout_test.go`: 5 skenario test verifikasi alur logout, pelepasan device, dan transisi ke device baru.
2. **Frontend Logout API Integration**:
   - `frontend/lib/auth-context.tsx`: `logout()` memanggil `POST /api/auth/logout` sebelum menghapus token lokal.
3. **Encrypted Messages Single Banner UX**:
   - `frontend/app/chat/ChatWindow.tsx`: Menyaring pesan gagal dekripsi dan merangkumnya ke dalam 1 buah banner `.encrypted-messages-banner` di linimasa chat.
   - `frontend/app/globals.css`: Styling token design system untuk `.encrypted-messages-banner`.

## 🧪 Verification Evidence
- `backend`: `go test -v ./...` -> 100% PASS across all packages.
- `frontend`: `npm run build` -> Next.js 16.3.5 compiled successfully with 0 TypeScript/lint errors.
