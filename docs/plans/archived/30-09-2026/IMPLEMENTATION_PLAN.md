# Implementation Plan — Milestone M-Mobile-9.1: Fondasi Profil & Identitas Publik Mobile Fleksibel & Multi-Tenant

## Objectives
1. Memperluas skema data pengguna di database dengan kolom `bio`, `role`, dan `metadata` (JSONB) dengan dukungan multi-tenant dan cross-compatibility Postgres & SQLite.
2. Memperbarui Go backend model, repository store, dan HTTP handler untuk membaca & menyimpan field profil baru dengan validasi ketat dan isolasi tenant.
3. Mengintegrasikan pemilihan gambar kamera/galeri via `expo-image-picker` untuk upload avatar pengguna di mobile.
4. Membuat layar profil publik `UserProfileScreen.tsx` di mobile yang terdaftar di `RootStackParamList`, dengan layout modular berbasis kartu dan tombol aksi cepat yang peka terhadap privacy policy (Model A & B).
5. Memperbarui `EditProfileModal.tsx` di tab Settings agar pengguna dapat mengedit seluruh data profil baru mereka dengan nyaman.

## Target Modified & Created Files
### Backend (Go):
- `backend/internal/store/user_store.go`: Perluas `User` struct (`Bio`, `Role`, `Metadata json.RawMessage`), update query `Register`, `GetByID`, `GetByUsername`, `UpdateProfile`, dan scan helper dengan tenant isolation.
- `backend/internal/store/sql.go`: Auto-migration DDL untuk `bio`, `role`, dan `metadata` (Postgres & SQLite).
- `backend/internal/handler/auth_handler.go`: Perbarui handler `UpdateProfile` dan `GetUserByID` agar menerima dan mereturn `bio`, `role`, dan `metadata`.

### Mobile (React Native):
- `mobile/src/api/types.ts`: Perbarui tipe `User` dan request update profil (`bio`, `role`, `metadata`, `UserMetadata`, `SocialLinks`).
- `mobile/src/api/auth.ts`: Dukung pengiriman field profil baru pada `updateProfile`.
- `mobile/src/navigation/types.ts`: Tambahkan route `UserProfile: { userId: string }` pada `RootStackParamList`.
- `mobile/src/navigation/AppNavigator.tsx`: Daftarkan screen `UserProfileScreen`.
- `mobile/src/screens/UserProfileScreen.tsx` *(NEW)*: Layar profil publik modular menampilkan avatar, verified badge, bio, role, info lokasi/website/medsos, dan tombol aksi (Pesan & Panggilan).
- `mobile/src/components/EditProfileModal.tsx`: Form edit profil lengkap + integrasi `expo-image-picker` untuk ganti avatar.
- `mobile/src/screens/SettingsScreen.tsx`: Tampilkan ringkasan bio/role di kartu profil tab Settings.
- `mobile/src/screens/ChatScreen.tsx` & `GroupInfoScreen.tsx`: Tambahkan navigasi klik avatar menuju `UserProfileScreen`.

## Verification Strategy
- **Backend Quality**: Eksekusi `go test -v ./...` di direktori `backend/` memastikan 100% tes lolos dan tidak ada regresi query.
- **Mobile Typecheck**: Eksekusi `npx tsc --noEmit` di direktori `mobile/` memastikan 0 kesalahan tipe TypeScript.
- **Frontend Web Build**: Eksekusi `npm run build` di direktori `frontend/` memastikan tidak ada kontrak API web yang rusak.
- **Server Lifecycle**: Wajib mematikan port test apapun (`fuser -k <port>/tcp`) sebelum mengakhiri respons.
