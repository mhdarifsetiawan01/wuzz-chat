# Task Checklist: Milestone 8.2B — Ephemeral Sub-Groups & TTL Lifecycle

## 📋 Status Milestone
- **Target**: Milestone 8.2B (Ephemeral Sub-Groups & TTL Lifecycle)
- **Branch**: `dev`
- **Kondisi Awal**: Bersih, tests passing.

---

## 🎯 Task Breakdown

### Tahap 1: Database Schema & Auto-Migration Hardening
- [x] Tambahkan kolom `status VARCHAR(32) NOT NULL DEFAULT 'active'` pada tabel `conversations` di PostgreSQL & SQLite auto-migration (`backend/internal/store/sql.go`).
- [x] Tambahkan kolom `ai_summary TEXT DEFAULT ''` pada tabel `conversations` di PostgreSQL & SQLite auto-migration (`backend/internal/store/sql.go`).
- [x] Tambahkan composite index `idx_subgroups_active ON conversations(parent_id, expires_at)` di PostgreSQL & SQLite (`backend/internal/store/sql.go`).

### Tahap 2: Backend Group Store & Immutable-Only Methods
- [x] Perbarui `GroupDetails` struct dengan field `Status`, `ExpiresAt`, `AISummary`.
- [x] Definisikan struct `SubGroupItem` dengan immutable ID, parent_id, expires_at, remaining_seconds, title, status, member_count.
- [x] Implementasikan `CreateSubGroup(parentID, title, description, creatorID string, duration string) (*GroupDetails, error)` di `backend/internal/store/group_store.go`:
  - Gunakan prefix immutable `sub_<UUIDv4>`.
  - Validasi bahwa pembuat adalah member aktif di parent group (berdasarkan UUID).
  - Hitung `expires_at` deterministik: 7 hari atau 30 hari.
- [x] Implementasikan `GetActiveSubGroups(parentID, currentUserID string) ([]SubGroupItem, error)`:
  - Validasi bahwa `currentUserID` (UUID) adalah member aktif di parent group.
  - Query teroptimasi $O(1)$ untuk mengambil subgrup dengan `expires_at > NOW()` dan `status = 'active'`.
- [x] Implementasikan `IsParentMember(parentID, userID string) (bool, error)` menggunakan UUID-only match.
- [x] Implementasikan `ExpireSubGroupsBatch() (int, error)` untuk auto-update status ke `'expired'`.

### Tahap 3: REST API & WebSocket Parent Gate Security
- [x] Tambahkan endpoint `GET /api/groups/:id/subgroups` di `backend/internal/api/group_handler.go` dengan validasi kepemilikan parent membership (UUID).
- [x] Tambahkan endpoint `POST /api/groups/:id/subgroups` dengan validasi durasi (hanya `"7_days"` atau `"30_days"`), sanitasi judul, dan pengecekan role parent group.
- [x] Perketat endpoint `POST /api/groups/:id/join`: Jika group bertipe subgrup (`parent_id != ''`), tolak jika user belum menjadi member di parent group (HTTP 403).
- [x] Update WebSocket admission di `backend/internal/ws/client.go` (`isAuthorizedForRoom`): Jika roomID memiliki prefix `sub_`, verifikasi keanggotaan aktif di grup induk menggunakan immutable UUID.
- [x] Fail-Closed write gate: Tolak pengiriman pesan jika subgrup sudah berstatus `'expired'` atau `expires_at <= NOW()`.

### Tahap 4: Background TTL Worker
- [x] Implementasikan `backend/internal/worker/subgroup_ttl_worker.go` dengan ticker periodik non-blocking untuk memperbarui subgrup expired ke `status = 'expired'`.
- [x] Sambungkan worker ke `main.go`.

### Tahap 5: Frontend Integration & Dual-Platform UI
- [x] Perbarui `frontend/lib/types.ts` dengan interface `SubGroupItem`.
- [x] Buat modal `frontend/app/chat/CreateSubGroupModal.tsx` (pilihan durasi 1 minggu [default] dan 1 bulan, spinner anti-double action, sanitasi input).
- [x] Buat drawer / panel `frontend/app/chat/SubGroupListDrawer.tsx` (daftar subgrup aktif, badge sisa waktu real-time, tombol buka chat & buat subgrup).
- [x] Integrasikan ke `StatusBar.tsx` dan `GroupInfoDrawer.tsx` (tombol akses subgrup, banner navigasi kembali ke grup induk, immutable ID matching).

### Tahap 6: Automated Testing & Verifikasi
- [x] Tulis unit & integration test backend Go (`backend/internal/store/subgroup_test.go`, `worker_test.go`, `group_handler_test.go`).
- [x] Jalankan `go test -v ./...` dan pastikan 100% PASS.
- [x] Jalankan `npm run build` dan pastikan 0 error.
- [x] Verifikasi keamanan: Parent membership gate, expired room write rejection, immutable ID matching.
