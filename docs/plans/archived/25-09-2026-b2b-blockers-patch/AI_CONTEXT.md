# AI Context & Active Workspace — Opsi A: Quick-Patch 4 Blocker Isolasi B2B & Transisi Mobile

## 1. Project Identity
- **Repository**: `wuzz-chat` (Monorepo Go Backend + Next.js Frontend)
- **Active Branch**: `dev`
- **Canonical Architecture Blueprint**: `docs/TENANT_ENGINE_MASTER_PLAN.md` & `docs/DUAL_MODE_READINESS_AUDIT.md`
- **Active Task**: **Opsi A — Quick-Patch 4 Blocker Isolasi Multi-Tenant B2B & Persiapan Transisi Mobile**
- **Date**: 25 September 2026

## 2. Objective & Scope
1. **Patch Blocker 1 (Group Isolation Gap)**:
   - Validasi klausa `tenant_id` pada `GetGroupDetails` dan `JoinPublicGroup` di `internal/store/sql_group_store.go` dan `internal/api/group_handler.go`.
   - Validasi kesamaan tenant saat admin menambahkan anggota (`AddGroupMembers`).
2. **Patch Blocker 2 (User ID Profile Lookup Gap)**:
   - Pasang filter tenant pada lookup profil by user ID UUID di `internal/api/chat_handler.go:GetUserProfile` agar user antar tenant tidak bisa saling mengintip profil publik jika UUID diketahui.
3. **Patch Blocker 3 (Media Storage Partition)**:
   - Perbarui `internal/storage/local_storage.go` dan `internal/storage/supabase_storage.go` agar mengunggah file media ke subdirektori per tenant (`/uploads/{tenant_id}/{uuid}.{ext}`).
4. **Patch Blocker 4 (Push Subscription Schema)**:
   - Tambahkan kolom `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'` pada tabel `push_subscriptions` (`internal/store/sql.go`) melalui migrasi aditif dan update kueri penyimpanan di `internal/store/user_store.go`.
5. **Freeze Master Plan & Update Status**:
   - Catat status resmi bahwa Milestone 0–6 selesai, 4 blocker tertutup 100%, Milestone 7–9 di-freeze, dan arah pengembangan selanjutnya dialihkan ke pembuatan Mobile App (React Native) untuk Produk Mandiri WuzzChat.

## 3. Mandatory Safety & Protocol Rules
- **Dev-Only Work**: Seluruh perubahan kode, pengujian, dan komitmen wajib berada di branch `dev`. Dilarang menyentuh `main`.
- **Zero-Breakage Guarantee**: Seluruh perubahan bersifat backward compatible; `tenant_default` tetap berfungsi normal 100%.
- **Automated Verification**: Wajib menjalankan `go test -v ./...` dan `npm run build` dengan hasil 100% PASS sebelum meminta konfirmasi.
- **Pre-Commit Gate**: Tidak boleh menjalankan `git commit` sebelum ada konfirmasi eksplisit ("selesai") dari pengguna.
