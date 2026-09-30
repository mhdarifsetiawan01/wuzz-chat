# Task Checklist — Milestone M-Mobile-10: Private Profile, User Connections & Friendlist Engine

## 阶段 1: Backend Go Engine & Database Schema
- [x] **Task 1.1**: Buat skema tabel `user_connections`, indeks komposit cursor, dan alter tabel `users` (tambah kolom `is_private_account BOOLEAN DEFAULT FALSE`).
- [x] **Task 1.2**: Implementasi domain struct `ConfigConnection` (anti-hardcode) dengan env parser di `backend/internal/shared/config/`.
- [x] **Task 1.3**: Implementasi package `backend/internal/connection/`: `entity.go`, `repository.go`, `infra/sql_repository.go`, dan `service.go`.
- [x] **Task 1.4**: Implementasi REST Handlers di `backend/internal/api/connection_handler.go` dan registrasi rute di `router.go`.
- [x] **Task 1.5**: Pasang guard privasi `IsFriend` pada pembuatan DM (`chat_handler.go`) dan WebSocket Hub WebRTC signaling (`hub.go` / `client.go`).
- [x] **Task 1.6**: Buat automated unit & integration test `backend/internal/connection/connection_test.go` dan `connection_handler_test.go` (100% PASS).

## 阶段 2: Mobile Client Types, Context & SQLite Persistensi
- [x] **Task 2.1**: Buat tipe `UserConnection`, `FriendItem`, `ConnectionStatus` di `mobile/src/api/types.ts` dan client di `mobile/src/api/connections.ts`.
- [x] **Task 2.2**: Tambahkan tabel `local_friends` dan helper CRUD di `mobile/src/services/sqliteStorage.ts`.
- [x] **Task 2.3**: Buat `mobile/src/context/ConnectionContext.tsx` dengan SWR cache dan live pending requests badge.

## 阶段 3: Mobile UI Screens & Modals
- [x] **Task 3.1**: Buat `FriendsListScreen.tsx` dengan dua tab ("Teman" ber-cursor infinite scroll dan "Permintaan" masuk/keluar).
- [x] **Task 3.2**: Daftarkan route `FriendsList` di `RootStackParamList` & `AppNavigator.tsx`.
- [x] **Task 3.3**: Perbarui `UserProfileScreen.tsx` dengan tombol dinamis (*Kirim Pesan vs Terhubung / Menunggu*).
- [x] **Task 3.4**: Tambahkan toggle switch *"🔒 Akun Privat"* di `EditProfileModal.tsx` dan baris *"👥 Teman Terhubung"* di `SettingsScreen.tsx`.
- [x] **Task 3.5**: Integrasikan daftar teman terhubung di `NewChatScreen.tsx`.

## 阶段 4: Verifikasi & Audit Kualitas
- [x] **Task 4.1**: Eksekusi `npx tsc --noEmit` di `mobile/` (0 errors).
- [x] **Task 4.2**: Eksekusi `go test ./...` di `backend/` (100% PASS).
- [x] **Task 4.3**: Eksekusi `npm run build` di `frontend/` (0 errors).
