# Decision Log — Milestone M-Mobile-9.2

## DEC-001: Cursor-Based Pagination vs Offset-Based Pagination
- **Konteks**: Linimasa sosial media memiliki frekuensi penambahan postingan yang dinamis dan berpotensi mengalami perubahan urutan data saat pengguna sedang melakukan scroll (pagination drift / duplikasi item).
- **Keputusan**: Menggunakan pagination berbasis cursor (`before={ISO8601/UnixTimestamp}&limit=20`) dengan indeks komposit `(tenant_id, created_at DESC)`.
- **Rasional**: Mencegah postingan bergeser (drift) saat ada postingan baru dibuat, menjamin performa query tetap konstan O(1) bahkan pada jutaan data tanpa scanning offset.

## DEC-002: Modular DDD Package `internal/feed/`
- **Konteks**: Menjaga arsitektur Pragmatic Modular Monolith yang bersih (Clean Architecture) seperti paket `group`, `tenant`, dan `memory`.
- **Keputusan**: Memisahkan domain Community Feed ke dalam paket `backend/internal/feed/` dengan sub-paket `infra/` untuk database adapter SQL, serta transport handler di `backend/internal/api/feed_handler.go`.
- **Rasional**: Memastikan decoupled domain logic, kemudahan pengujian unit (mocking repository), dan kejelasan boundary tanpa polusi dependency antar modul.

## DEC-003: Multi-Tenant Scoping & Dual DB Compatibility
- **Konteks**: WuzzChat beroperasi dengan dukungan multi-tenant dan harus kompatibel dengan PostgreSQL (Supabase/Produksi) serta SQLite (Testing/Development).
- **Keputusan**: Menyertakan `tenant_id` pada seluruh tabel `feed_posts`, `feed_likes`, dan `feed_comments`, serta menggunakan query ANSI SQL standar dengan placeholder parameter yang dinamis/sesuai driver (`$` untuk PostgreSQL atau `?` untuk SQLite via query builder/helper internal).
- **Rasional**: Mencegah kebocoran data antar tenant (data isolation) dan menjaga fleksibilitas environment pengujian lokal tanpa dependensi eksternal yang berat.

## DEC-004: Global `system_role` with `wuzz_` Prefix & Strict Privilege Escalation Protection
- **Konteks**: Diperlukan peran administratif/moderasi sistem global untuk mengelola dan memoderasi linimasa sosial tanpa merusak field `role` profil pengguna (yang berfungsi sebagai pekerjaan/posisi publik pengguna).
- **Keputusan**: 
  1. Menambahkan kolom `system_role VARCHAR(32) NOT NULL DEFAULT 'user'` di tabel `users`.
  2. Standarisasi penamaan peran sistem menggunakan prefix `wuzz_` untuk peran berprivilese khusus:
     - `'user'` (default): pengguna umum.
     - `'wuzz_moderator'`: petugas moderasi konten (hanya bertugas menghapus postingan/komentar yang melanggar aturan).
     - `'wuzz_admin'`: administrator platform (menerbitkan pengumuman resmi, artikel, sponsor, pinning, serta moderasi hapus).
  3. **Strict Privilege Escalation Guard**: Kolom `system_role` diisolasi sepenuhnya dari request publik. DILARANG KERAS menerima mutasi `system_role` dari payload `PUT /api/auth/profile` atau endpoint registrasi pengguna. Perubahan role hanya dapat dilakukan via database seeder atau panel administrasi internal.
  4. **Tenant Scoping Guard**: Tindakan moderasi staf (`wuzz_admin` / `wuzz_moderator`) hanya berlaku di dalam tenant yang sama (`post.tenant_id == caller.tenant_id`).

## DEC-005: Flexible Post Types, Sticky Pinning & Custom Metadata for Announcements/Articles
- **Konteks**: Community feed membutuhkan kemampuan mempublikasikan pengumuman resmi sistem, artikel editorial, serta postingan bersponsor/promosi tanpa perlu membuat tabel baru yang terfragmentasi.
- **Keputusan**:
  1. Menambahkan kolom `post_type VARCHAR(32) DEFAULT 'standard'`, `is_pinned BOOLEAN DEFAULT FALSE`, dan `metadata TEXT DEFAULT '{}'` pada tabel `feed_posts`.
  2. Mengoptimalkan indeks linimasa komposit menjadi `(tenant_id, is_pinned DESC, created_at DESC)` sehingga postingan yang disematkan (`is_pinned = TRUE`) otomatis berada di puncak feed secara instan tanpa subquery terpisah.
  3. **Role Normalization Guard**: Hanya pengguna dengan `system_role == 'wuzz_admin'` yang diizinkan mengatur `is_pinned: true`, `post_type != 'standard'`, atau menyertakan payload `metadata` kustom. Request pembuatan post dari `user` biasa maupun `wuzz_moderator` dinormalisasi secara otomatis ke `is_pinned = false`, `post_type = 'standard'`, dan `metadata = '{}'`.



