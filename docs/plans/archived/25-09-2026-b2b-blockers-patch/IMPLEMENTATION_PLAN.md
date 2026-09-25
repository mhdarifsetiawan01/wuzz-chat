# Implementation Plan — Quick-Patch 4 Blocker Isolasi Multi-Tenant B2B & Persiapan Mobile App

## 🎯 1. Ringkasan & Sasaran Utama
Menuntaskan **Opsi A** yang dipilih oleh pengguna:
1. Melakukan quick-patch terhadap **4 Blocker Isolasi Data B2B** yang teridentifikasi dalam audit (`docs/DUAL_MODE_READINESS_AUDIT.md`), sehingga tingkat kesiapan platform mesin B2B meningkat dari **78%** menjadi **100% Enterprise-Safe**.
2. Membekukan (*freeze*) kelanjutan `docs/TENANT_ENGINE_MASTER_PLAN.md` di Milestone 6 (menunda Milestone 7–9: Webhooks, Dev Portal, SDKs).
3. Menyiapkan fondasi dan rekomendasi arsitektur untuk transisi langsung ke **Pengembangan Aplikasi Mobile (React Native)** untuk Produk Mandiri WuzzChat.

---

## 📂 2. Target File yang Dimodifikasi & Dibuat

### A. Backend Code (Isolasi 4 Blocker)
1. [`backend/internal/store/sql.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/sql.go)
   - Tambahkan kolom `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'` pada DDL `push_subscriptions` dan migrasi aditif `ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS ...`.
   - Tambahkan index `idx_push_subs_tenant_user ON push_subscriptions(tenant_id, user_id)`.
2. [`backend/internal/store/user_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/user_store.go)
   - Update `SavePushSubscription` dan `GetUserPushSubscriptions` untuk menyertakan `tenant_id`.
3. [`backend/internal/store/sql_group_store.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/store/sql_group_store.go)
   - Perbarui `GetGroupDetails`: Tambahkan validasi tenant ID jika pemanggil memiliki tenant context.
   - Perbarui `JoinPublicGroup`: Tambahkan pengecekan tenant agar user hanya bisa self-join ke grup publik di tenant miliknya sendiri.
   - Perbarui `AddGroupMembers`: Tambahkan validasi bahwa seluruh user ID yang ditambahkan berasal dari tenant yang sama dengan grup.
4. [`backend/internal/api/group_handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/group_handler.go)
   - Teruskan `r.Context()` (yang membawa tenant info) saat memanggil `groupSvc.GetGroupDetails` dan `JoinPublicGroup`.
5. [`backend/internal/api/chat_handler.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/api/chat_handler.go)
   - Pada `GetUserProfile` (`GET /api/users/{id}`), validasi bahwa tenant user yang diminta sama dengan tenant pemanggil (`callerTenantID`). Jika berbeda, kembalikan HTTP 404 (Not Found).
6. [`backend/internal/storage/local_storage.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/storage/local_storage.go) & [`backend/internal/storage/supabase_storage.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/storage/supabase_storage.go)
   - Ekstrak tenant ID dari `ctx`. Simpan file ke direktori fisik `/uploads/{tenant_id}/{uuid}.{ext}` atau bucket path `{tenant_id}/{uuid}.{ext}`.
   - Tetap sediakan graceful fallback untuk file root eksisting.

### B. Automated Tests
1. [`backend/internal/tenant/isolation_test.go`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/tenant/isolation_test.go)
   - Tambahkan test skenario:
     - Tes isolasi join grup publik antar-tenant (User Tenant B gagal join grup publik Tenant A).
     - Tes isolasi profil user by ID antar-tenant (User Tenant B tidak bisa baca profil user Tenant A via ID).
     - Tes media storage path partitioning (file terupload ke subfolder tenant masing-masing).
     - Tes push subscription tenant scoping.

### C. Dokumentasi
1. [`docs/DUAL_MODE_READINESS_AUDIT.md`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/docs/DUAL_MODE_READINESS_AUDIT.md)
   - Perbarui skor B2B menjadi 100% setelah 4 blocker ditutup.
2. [`docs/TENANT_ENGINE_MASTER_PLAN.md`](file:///home/bms-del112/BMS/personal-project/wuzz-chat/docs/TENANT_ENGINE_MASTER_PLAN.md)
   - Berikan status resmi: Milestone 0–6 Selesai & Teruji, Milestone 7–9 Di-freeze (Status: Paused).

---

## 🧪 3. Strategi Verifikasi
1. **Automated Testing**:
   - `go test -v ./internal/tenant/...`
   - `go test -v ./internal/store/...`
   - `go test -v ./internal/storage/...`
   - `go test -v ./internal/api/...`
   - `go test ./...` (seluruh package backend lulus 100%).
2. **Frontend Typecheck & Build**:
   - `npm run build` di direktori `frontend/` memastikan tidak ada regresi dan lulus kompilasi.
