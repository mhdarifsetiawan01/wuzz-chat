# Implementation Progress — Opsi A: Quick-Patch 4 Blocker Isolasi Multi-Tenant B2B

- **Task Status**: Verification Complete / Awaiting User Confirmation ("selesai") 🏁
- **Selected Track**: Opsi A (Quick-Patch 4 Blocker + Freeze Master Plan M6 + Transisi Mobile App)

---

## 📋 Checklist Atomic Tasks

### Phase 1: Planning & Setup
- [x] Identifikasi 4 blocker teknis dari audit faktual.
- [x] Inisialisasi dokumen aktif di `docs/plans/active/`.
- [x] Presentasikan rencana implementasi ke user dan tunggu persetujuan (*approval gate*).

### Phase 2: Patch Blocker 4 (Push Subscription Schema)
- [x] Update DDL `push_subscriptions` di `internal/store/sql.go` (kolom `tenant_id` & index).
- [x] Tambahkan migrasi aditif `ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS tenant_id` di `sql.go`.
- [x] Update `SavePushSubscription` di `internal/store/user_store.go` untuk menyertakan `tenant_id`.

### Phase 3: Patch Blocker 1 (Group Isolation & Member Injection)
- [x] Update `JoinPublicGroup` di `internal/store/sql_group_store.go` agar memvalidasi kesamaan `tenant_id`.
- [x] Update `GetGroupDetails` di `internal/store/sql_group_store.go` agar memvalidasi tenant boundary.
- [x] Update `AddGroupMembers` di `internal/store/sql_group_store.go` agar memeriksa apakah `userIDs` yang ditambahkan berasal dari tenant yang sama dengan grup.
- [x] Update `group_handler.go` agar meneruskan `r.Context()` ke service.

### Phase 4: Patch Blocker 2 (User Profile Lookup Isolation)
- [x] Update `chat_handler.go:GetUserProfile` agar memvalidasi bahwa `user.TenantID == callerTenantID`. Kembalikan HTTP 404 jika ada upaya akses lintas tenant.

### Phase 5: Patch Blocker 3 (Media Storage Partitioning)
- [x] Update `internal/storage/local_storage.go` agar membuat subfolder `/uploads/{tenant_id}/` dan menyimpan file di dalamnya.
- [x] Update `internal/storage/supabase_storage.go` agar mengunggah ke path `{tenant_id}/{filename}`.
- [x] Pastikan fungsi `Delete` dan serving static file tetap kompatibel ke belakang.

### Phase 6: Automated Testing & Verification
- [x] Tambahkan skenario test multi-tenant di `internal/tenant/isolation_test.go`.
- [x] Eksekusi `go test -v ./...` di direktori `backend/` (100% PASS).
- [x] Eksekusi `npm run build` di direktori `frontend/` (100% PASS).

### Phase 7: Docs Sync, Freeze M6, & Transisi Mobile
- [x] Perbarui `docs/DUAL_MODE_READINESS_AUDIT.md` (Update skor kesiapan B2B ke 100%).
- [x] Perbarui status `docs/TENANT_ENGINE_MASTER_PLAN.md` (Tandai M0–M6 Selesai, M7–M9 Paused/Frozen).
- [x] Catat rencana inisiasi Mobile App React Native di `docs/PROGRESS.md`.
- [ ] Minta konfirmasi penyelesaian ("selesai") kepada user sebelum commit.
