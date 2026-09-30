# Implementation Progress — Milestone M-Mobile-9.1: Fondasi Profil & Identitas Publik Mobile Fleksibel & Multi-Tenant

## Checklist Pengerjaan Atomic

### Phase 1: Backend Go & Database Skema Multi-Tenant
- [x] Task 1.1: Tambahkan auto-migration untuk kolom `bio VARCHAR(255)`, `role VARCHAR(64)`, dan `metadata JSONB/TEXT` pada `backend/internal/store/sql.go` (PostgreSQL & SQLite).
- [x] Task 1.2: Perbarui struct `User` dan query SQL (`GetByIDWithContext`, `GetUserByUsernameWithContext`, `UpdateProfileWithContext`) di `backend/internal/store/user_store.go` dengan isolasi `tenant_id`.
- [x] Task 1.3: Perbarui HTTP handler `UpdateProfile` dan `GetUserByID` di `backend/internal/handler/auth_handler.go` untuk membaca dan memvalidasi `bio`, `role`, serta `metadata`.
- [x] Task 1.4: Jalankan verifikasi backend `go test -v ./...` dan pastikan lulus 100%.

### Phase 2: Mobile Contract Types & Native Avatar Picker
- [x] Task 2.1: Perbarui tipe canonical `User`, `UserMetadata`, `SocialLinks`, dan API request di `mobile/src/api/types.ts` dan `mobile/src/api/auth.ts`.
- [x] Task 2.2: Pasang/integrasikan `expo-image-picker` di mobile untuk memilih foto profil dari galeri atau kamera, kemudian upload ke endpoint media.

### Phase 3: Layar Profil Publik Modular (`UserProfileScreen.tsx`)
- [x] Task 3.1: Daftarkan route `UserProfile: { userId: string }` di `mobile/src/navigation/types.ts` dan `mobile/src/navigation/AppNavigator.tsx`.
- [x] Task 3.2: Buat komponen `UserProfileScreen.tsx` dengan desain modular: Header dengan Avatar besar & VerifiedBadge, Role & Bio, Section Info (Lokasi, Website, Medsos), dan Action Buttons (Pesan & Panggilan) berbasis permission state.
- [x] Task 3.3: Sambungkan trigger klik avatar di `ChatScreen.tsx`, `GroupInfoScreen.tsx`, dan `RecentChatsScreen.tsx` untuk membuka `UserProfileScreen`.

### Phase 4: Pengeditan Profil Lengkap di Mobile
- [x] Task 4.1: Perbarui `EditProfileModal.tsx` di mobile agar mendukung ganti avatar via native picker, display name, bio, role, lokasi, website, social links (Instagram, YouTube, LinkedIn, TikTok), dan privacy policy dasar.
- [x] Task 4.2: Perbarui tampilan ringkasan profil di `SettingsScreen.tsx` agar menampilkan avatar, role, dan bio terkini.

### Phase 5: Verification & Quality Gate
- [x] Task 5.1: Jalankan `npx tsc --noEmit` di `mobile/` (0 errors).
- [x] Task 5.2: Jalankan `go test -v ./...` di `backend/` (100% PASS).
- [x] Task 5.3: Jalankan `npm run build` di `frontend/` (0 errors).
- [x] Task 5.4: Laporan akhir ke pengguna & konfirmasi status penyelesaian tugas.
