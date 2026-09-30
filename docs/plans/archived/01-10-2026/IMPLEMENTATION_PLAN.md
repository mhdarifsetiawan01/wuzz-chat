# Implementation Plan — Milestone M-Mobile-10: Private Profile, Scalable User Connections & Friendlist Engine

- **Target Branch**: `dev`
- **Tujuan**: Membangun sistem Profil Privat, Manajemen Pertemanan (*User Connections*), dan Layar Friendlist ber-Infinite Scroll dengan jaminan keamanan anti-IDOR/anti-spam, performa O(1) cache, dan arsitektur anti-hardcode.
- **Dokumen Acuan Domain**: [`docs/domains/USER_CONNECTIONS.md`](../../domains/USER_CONNECTIONS.md)

---

## 🏛️ Arsitektur & Spesifikasi Komponen

### 1. Backend Go Engine (`backend/internal/connection/` & `backend/internal/api/`)
1. **Config Struct (`ConfigConnection`)**:
   - Menampung seluruh variabel konfigurasi dinamis yang dapat dioverride via `.env`.
2. **Entity & Repository**:
   - `entity.go`: Model `UserConnection`, status `pending`, `accepted`, `declined`, `blocked`, dan source `in_app_request`, `phone_contact`.
   - `repository.go`: Kontrak interface CRUD & cursor pagination query.
   - `infra/sql_repository.go`: Implementasi Postgres & SQLite dengan constraint `LEAST/GREATEST` dan composite indexes.
3. **Service Layer (`ConnectionService`)**:
   - `RequestConnection`: Validasi limit kuota pending, rate limit, cooldown, dan atomic mutual accept.
   - `RespondConnection`: Proteksi IDOR (`receiver_id == claims.UserID`).
   - `GetFriends`: Cursor-based infinite scroll list dengan `INNER JOIN users`.
   - `GetPendingRequests`: Daftar permintaan masuk dan keluar.
   - `IsFriend`: Pengecekan relasi teman cepat dengan cache layer.
4. **REST Handlers & Middleware Enforcement**:
   - `POST /api/connections/request`
   - `POST /api/connections/respond`
   - `GET /api/connections/friends?before={timestamp}&limit=20` (Cursor pagination)
   - `GET /api/connections/pending`
   - `GET /api/connections/status/:targetUserId`
   - `DELETE /api/connections/:targetUserId` (Unfriend)
   - Gatekeeping pada `POST /api/conversations/direct` dan WebSocket Hub signaling (`call_offer`).

---

### 2. Mobile Client App (`mobile/src/`)
1. **API Client & Type Contracts (`mobile/src/api/connections.ts` & `types.ts`)**:
   - Definisi tipe `UserConnection`, `FriendItem`, dan response cursor.
2. **Context & State Management (`mobile/src/context/ConnectionContext.tsx`)**:
   - SWR cache layer & SQLite storage persistensi untuk daftar teman dan pending badge counter.
3. **Komponen & Layar Baru**:
   - `FriendsListScreen.tsx`: Tab "Teman" (dengan cursor-based infinite scroll `FlatList`) dan Tab "Permintaan" (Terima / Tolak).
   - Penyesuaian `UserProfileScreen.tsx`: Tombol dinamis (*Kirim Pesan vs Terhubung / Minta Pertemanan*).
   - Penyesuaian `EditProfileModal.tsx` & `SettingsScreen.tsx`: Toggle switch *"🔒 Akun Privat"*.
   - Integrasi tombol Teman Terhubung pada `SettingsScreen.tsx` dan `NewChatScreen.tsx`.

---

## 🧪 Strategi Verifikasi
1. **Unit & Integration Test Backend**: `go test -v ./internal/connection/...` dan `go test ./...` (100% PASS).
2. **Mobile TypeScript Verification**: `cd mobile && npx tsc --noEmit` (0 errors).
3. **Frontend Web Build Verification**: `cd frontend && npm run build` (0 errors).
4. **Smoke Test Skenario**:
   - Skenario A: User publik bisa langsung di-DM dan ditelepon.
   - Skenario B: User privat menolak DM & telepon dari non-teman (HTTP 403).
   - Skenario C: User A kirim request ke User B ➔ User B terima ➔ status `accepted` ➔ User A kini bisa DM & telepon User B.
   - Skenario D: Cursor pagination infinite scroll memuat halaman berikutnya tanpa duplikasi.
