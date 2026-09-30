# Handover Document — Milestone M-Mobile-9.2

## 📝 Status Pelaksanaan
- **Fase**: Fase 12 - Community Social Feed & User Acquisition Engine (Model B)
- **Milestone**: M-Mobile-9.2: Spesifikasi Domain, Skema DB & Backend Go Engine
- **Status Sesi**: `IMPLEMENTATION_VERIFIED_WAITING_USER_CONFIRMATION`

## 🔍 Bukti Hasil Verifikasi Pengujian
1. **Backend Unit & Domain Tests (`internal/feed`)**:
   - `go test -v ./internal/feed/...` ➔ **100% PASS**
   - Menguji validasi input postingan (kosong, batas 1.000 karakter, batas 4 media), toggle like atomic, validasi komentar (kosong, batas 500 karakter), otorisasi delete (moderator vs author vs stranger), serta guard role untuk pinning & pengumuman (`TestFeedService_CreatePost_RolePermissions`).
2. **Backend HTTP & Integration Tests (`internal/api`)**:
   - `go test -v ./internal/api/... -run TestFeedHandler_FullFlow` ➔ **100% PASS**
   - Menguji pembuatan postingan, query timeline dengan JOIN author profil publik, sticky pinned sorting, toggle like/unlike, pembuatan & daftar komentar, proteksi 403 Forbidden pada stranger, keberhasilan penghapusan oleh moderator, serta normalisasi otomatis input pin/post_type dari user biasa vs eksekusi moderator.
3. **Full Backend Suite Clean Run (`go test -count=1 ./...`)**:
   - **100% PASS** di seluruh paket: `ai`, `api`, `app`, `auth`, `authz`, `broker`, `feed`, `group`, `memory`, `messaging`, `push`, `store`, `tenant`, `worker`, `ws`.
4. **Mobile TypeCheck Gate**:
   - `cd mobile && npx tsc --noEmit` ➔ **0 errors** (Exit code 0).
5. **Frontend Web Build Gate**:
   - `cd frontend && npm run build` ➔ **Compiled successfully** (Next.js 16.3.5 Turbopack, Exit code 0).

## 📌 Catatan Penyerahan & Guard Keamanan
- **Anti-Privilege Escalation**: Field `system_role` pada tabel `users` tidak dapat dimutasi dari request body publik (`PUT /api/auth/profile`, `POST /api/auth/register`).
- **Role Permission Normalization**: Pembuatan post dengan `is_pinned: true`, `post_type != 'standard'`, atau `metadata` kustom hanya diizinkan untuk `system_role == 'wuzz_admin'`. Input dari `user` biasa maupun `wuzz_moderator` dinormalisasi secara otomatis ke `standard` & unpinned.
- **Moderation Rights**: Otorisasi penghapusan postingan (`DELETE /api/feed/:id`) hanya diizinkan untuk pemilik postingan asli (`user_id`) atau staf berprivilese (`wuzz_admin` / `wuzz_moderator`) dalam tenant yang sama.
- **Tenant Scoping Guard**: Seluruh query data feed dan tindakan moderasi terkunci pada `tenant_id` pemanggil.
- **Auto-Migration Non-Destruktif**: Menambahkan tabel `feed_posts` (dengan `post_type`, `is_pinned`, `metadata`), `feed_likes`, `feed_comments`, composite index `(tenant_id, is_pinned DESC, created_at DESC)`, serta kolom `users.system_role` dengan kompatibilitas penuh SQLite & PostgreSQL.

## 🔮 Rencana Masa Depan (Backlog / Future Enhancements)
- **Role Assignment CLI / Admin Tool**: Membuat CLI helper tool (`cmd/set_role`) atau endpoint terproteksi (`PATCH /api/admin/users/:id/role`) untuk mempermudah penetapan `system_role` tanpa perlu akses langsung ke query SQL database.


