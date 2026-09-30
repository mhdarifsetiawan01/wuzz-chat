# Implementation Plan — Milestone M-Mobile-9.3

## 🎯 Sasaran & Arsitektur Solusi
Milestone ini melengkapi Fase 12 dengan menghadirkan antarmuka mobile produksi untuk linimasa sosial komunitas WuzzChat, didukung oleh SQLite local cache layer, interaksi real-time dengan Optimistic UI, modal pembuatan postingan berkemampuan media, dan loop viral akuisisi pengguna (*Share to Chat Loop*).

---

## 🏗️ Komponen & Rencana Modifikasi File

### 1. Data Contracts & API Client (`mobile/src/api/types.ts` & `mobile/src/api/feedApi.ts`)
- **Penambahan Tipe**:
  - `FeedAuthor`: `id`, `username`, `display_name`, `avatar_url`, `role`, `is_verified`
  - `FeedPost`: `id`, `tenant_id`, `user_id`, `content`, `media_urls`, `post_type`, `is_pinned`, `metadata`, `likes_count`, `comments_count`, `is_liked`, `author`, `created_at`, `updated_at`
  - `FeedComment`: `id`, `tenant_id`, `post_id`, `user_id`, `content`, `author`, `created_at`
  - `FeedTimelineResponse`, `FeedCommentsResponse`, `FeedLikeResponse`, `CreateFeedPostRequest`, `CreateFeedCommentRequest`
  - Update `User`: pastikan field `system_role?: 'wuzz_admin' | 'wuzz_moderator' | 'user' | string` tercakup.
- **Implementasi `feedApi.ts`**:
  - `getTimeline(params?: { before?: string; limit?: number })`: Memanggil `GET /api/feed`.
  - `createPost(data: CreateFeedPostRequest)`: Memanggil `POST /api/feed`.
  - `toggleLike(postId: string)`: Memanggil `POST /api/feed/:id/like`.
  - `getComments(postId: string, params?: { before?: string; limit?: number })`: Memanggil `GET /api/feed/:id/comments`.
  - `createComment(postId: string, content: string)`: Memanggil `POST /api/feed/:id/comments`.
  - `deletePost(postId: string)`: Memanggil `DELETE /api/feed/:id`.

### 2. SQLite Offline Caching Layer (`mobile/src/services/sqliteStorage.ts`)
- **Tabel `local_feed_posts`**:
  - Kolom: `user_id`, `id`, `tenant_id`, `content`, `media_urls`, `post_type`, `is_pinned`, `metadata`, `likes_count`, `comments_count`, `is_liked`, `author_id`, `author_username`, `author_display_name`, `author_avatar_url`, `author_role`, `author_is_verified`, `created_at`, `updated_at`, `raw_json`.
  - Index: `idx_feed_sort ON local_feed_posts(user_id, is_pinned DESC, created_at DESC)`.
- **Fungsi Storage**:
  - `saveFeedPosts(userId: string, posts: FeedPost[])`
  - `getFeedPosts(userId: string, limit?: number)`
  - `updateFeedPostLike(userId: string, postId: string, isLiked: boolean, likesCount: number)`
  - `deleteLocalFeedPost(userId: string, postId: string)`
  - `clearFeedPosts(userId: string)`

### 3. State Management & SWR Hook (`mobile/src/context/FeedContext.tsx`)
- Pola *Stale-While-Revalidate* (SWR):
  - Membaca data dari `sqliteStorage` secara instan (< 50ms) saat mount.
  - Melakukan background fetch ke `feedApi.getTimeline()` dan mengupdate state secara mulus tanpa layout shift.
  - Menyimpan postingan yang baru di-fetch ke SQLite.
- Cursor Pagination (`loadMore`):
  - Mengambil batch postingan selanjutnya dengan parameter `before` dari `created_at` postingan non-pinned tertua.
- Optimistic Like Toggle:
  - Mengubah state `is_liked` dan `likes_count` seketika (0ms).
  - Mengupdate SQLite.
  - Memanggil `feedApi.toggleLike(postId)`. Jika gagal, otomatis rollback state lokal dan tampilkan notifikasi alert / toast.
- Penghapusan Postingan:
  - Optimistic removal dari state & SQLite, dilanjutkan dengan panggilan `feedApi.deletePost(postId)`.

### 4. Modal Pembuatan Postingan (`mobile/src/components/CreatePostModal.tsx`)
- Input teks dengan batas 1.000 karakter dan live counter bertransformasi warna (normal -> warning di > 900 -> error di 1.000).
- Pilihan lampiran gambar via kamera atau galeri foto (`expo-image-picker`), dengan preview thumbnail dan tombol hapus lampiran (maksimal 4 gambar).
- Upload media otomatis via `mediaApi.uploadMedia` sebelum publikasi postingan.
- Kontrol khusus Admin: Jika akun pemanggil memiliki `system_role === 'wuzz_admin'`, tampilkan toggle "Sematkan Postingan (Sticky Pin)" dan pemilih tipe konten (Pengumuman Resmi / Artikel Editorial).
- Status pengiriman terisolasi dengan spinner loading dan guard anti-double-submit.

### 5. Komentar & Reaksi (`mobile/src/components/PostCommentsModal.tsx`)
- Bottom sheet / modal interaktif menampilkan header postingan ringkas.
- Daftar komentar dari `feedApi.getComments(postId)`.
- Form input komentar di bagian bawah (maksimal 500 karakter) dengan tombol kirim dan indikator status pengiriman.
- Sinkronisasi otomatis `comments_count` pada kartu postingan saat komentar baru berhasil dipublikasikan.

### 6. Viral Share to Chat Loop (`mobile/src/components/SharePostToChatModal.tsx`)
- Modal pemilih obrolan tujuan (DM atau Grup) dari riwayat obrolan aktif.
- Menghasilkan pesan preview postingan dengan format:
  ```text
  📢 [Postingan Komunitas oleh @author]
  "{konten cuplikan...}"
  ```
  beserta tautan/referensi postingan.
- Mengirim pesan langsung menggunakan `messagesApi.sendMessage` / `useMessages()`.
- Menampilkan feedback visual "Berhasil dibagikan ke obrolan!".

### 7. Transformasi `FeedScreen.tsx`
- Mengganti mock data `SAMPLE_POSTS` dengan data linimasa riil dari `useFeed()`.
- Menambahkan FAB `+` di pojok kanan bawah yang terintegrasi dengan `useSafeAreaInsets`.
- Visual rendering:
  - Sticky pinned indicator (ikon sematan 📌 & background kartu bergradien/aksen halus).
  - Badge khusus: `Pengumuman Resmi` (emas/biru untuk admin) atau `Artikel`.
  - Media image gallery preview jika postingan memiliki `media_urls`.
  - Tombol menu aksi (titik tiga atau tombol hapus) jika user adalah pemilik postingan atau memiliki role `wuzz_admin` / `wuzz_moderator`.
  - Tombol Like (dengan animasi hati), Komentar, dan Bagikan ke Obrolan.

---

## 🧪 Strategi Verifikasi & Testing
1. **Type Checking & Static Analysis**:
   - Jalankan `npx tsc --noEmit` di direktori `mobile/` untuk memastikan zero type error.
2. **Kompilasi Frontend Web**:
   - Jalankan `npm run build` di direktori `frontend/` untuk memastikan integritas monorepo tidak terganggu.
3. **Backend Unit & Integration Tests**:
   - Jalankan `go test -v ./...` di direktori `backend/` untuk memverifikasi endpoint `/api/feed` tetap berjalan 100% stabil.
