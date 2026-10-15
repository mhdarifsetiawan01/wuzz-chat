# Kirim Video di Chat (Mobile + Web) dengan Cloudflare R2 — Rencana

> Dirancang 16 Okt 2026. Status: **rencana, belum ada kode**. Dibahas bersama user; keputusan di bagian 1 sudah disetujui.

## 1. Keputusan

1. **Video dikirim lewat chat** (DM, grup, topik forum) di mobile dan web.
2. **Penyimpanan: Cloudflare R2** (gratis bagi anggaran saat ini; egress tanpa biaya). Backend tetap memakai antarmuka `MediaStorage`; ditambah satu driver baru `r2`.
3. **DILARANG fallback upload lewat VPS.** Bila `STORAGE_DRIVER=r2`, semua unggah media wajib langsung ke R2 memakai signed URL. Gagal berarti tampil galat + tombol coba lagi, bukan jatuh ke `POST /api/media/upload`. Karena driver bersifat global, aturan ini berlaku untuk semua jenis media (foto, voice note, dokumen), bukan hanya video.
4. **Retensi tetap 1 hari** (`MEDIA_RETENTION_DAYS`, store-and-forward). Inilah yang membuat penyimpanan murah.
5. **Isi media tidak dienkripsi** (sama seperti foto sekarang; hanya teks pesan yang E2EE). Konsekuensi baiknya: video bisa diputar bertahap dari URL tanpa dekripsi.

## 2. Keadaan sekarang (hasil pemeriksaan 16 Okt 2026)

- Skema `messages` sudah punya `media_url`, `media_type`, `file_name`, `file_size`, `media_status`. **Belum ada** durasi dan thumbnail.
- Backend: `classifyMediaType` dan struct WS sudah mengenal `video`. Batas unggah bawaan 25 MB (`MAX_UPLOAD_SIZE_MB`).
- Unggah langsung sudah ada: `POST /api/media/signed-upload-url` (`CreateSignedUploadURL` di `MediaStorage`). Mobile memakainya lalu **fallback ke VPS** (`/api/media/upload`) bila gagal; fallback inilah yang dihapus.
- Unduhan = URL publik langsung (`media_url`), tanpa lewat backend. Nama objek UUID acak (`<uuid><ext>`, diawali `<tenant>/` bila bukan tenant `default`).
- `NewMediaStorageFromEnv` hanya mengenal `supabase` dan `local`; **jatuh diam-diam ke penyimpanan lokal** bila konfigurasi Supabase kurang. Perilaku itu tidak boleh ditiru untuk `r2`.
- Mobile: kamera/galeri `mediaTypes: ['images']` + `base64: true`; `uploadMedia` **membaca seluruh berkas ke memori** (`bytes`). Tidak aman untuk video.
- Tidak ada `expo-document-picker`, tidak ada pemutar video (`expo-video`) di dependensi. `MediaViewerModal` sudah punya tipe `'video'` tetapi belum memutar.
- Web: input unggah (`MessageInput.tsx`) hanya `image/*` + dokumen; tidak ada `<video>`.

## 3. Tahapan

### Tahap 0 — Persiapan (dikerjakan user)
- Akun Cloudflare, aktifkan R2, buat bucket (mis. `wuzz-chat-media`).
- Buat API token R2 (Access Key ID + Secret) dengan izin Object Read & Write pada bucket itu saja.
- Domain publik bucket: pakai **domain custom** di Cloudflare (disarankan). Subdomain `r2.dev` hanya untuk uji (dibatasi lajunya; periksa dokumentasi terkini).
- Atur CORS bucket: metode `PUT`, `GET`, `HEAD`; header `Content-Type`, `Range`; origin aplikasi web (mobile tidak terkena CORS).
- (Opsional, jaring pengaman gratis) lifecycle rule: hapus objek lebih tua dari 3 hari, kalau `PurgeWorker` gagal.
- **Periksa halaman harga/kuota R2 terkini** (penyimpanan, operasi, dan apakah kartu pembayaran wajib terdaftar). Angka di rencana ini dari ingatan, belum diverifikasi.

### Tahap 1 — Backend: driver R2 + metadata video
- `storage/r2_storage.go` mengimplementasikan `MediaStorage` (SDK S3: `aws-sdk-go-v2/service/s3`, endpoint `https://<account>.r2.cloudflarestorage.com`, region `auto`).
  - `CreateSignedUploadURL`: presigned **PUT** berumur pendek (±10 mnt), `Content-Type` dan `Content-Length` ikut ditandatangani agar ukuran/tipe tidak bisa dipalsukan. Kunci objek meniru pola sekarang (`<tenant>/<uuid><ext>`).
  - `Delete`: turunkan kunci dari `R2_PUBLIC_BASE_URL`.
  - `Upload` (relay VPS): mengembalikan galat tetap; tidak dipakai.
- `NewMediaStorageFromEnv`: case `r2` dengan env `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`. **Fail-closed**: konfigurasi kurang = server menolak start dengan pesan jelas, bukan jatuh ke lokal.
- `MediaHandler.Upload` (`/api/media/upload`): bila driver `r2`, balas 410/403 dengan pesan jelas untuk semua tipe.
- Batas ukuran per jenis: `MAX_VIDEO_UPLOAD_MB` (awal 25) di `signed-upload-url`, validasi `video/*` + ekstensi (`.mp4`, `.mov`, `.webm`), tolak sisanya untuk `purpose=video`.
- **Keputusan desain (16 Okt 2026, menyimpang dari draf awal): TANPA kolom baru di `messages`.** Menambah kolom menyentuh ±30 query SELECT dan 7 titik pemindaian baris di jalur pesan yang kritis. Gantinya: **thumbnail diturunkan dari kunci video** (`<uuid>.mp4` -> `<uuid>.thumb.jpg`; helper `storage.ThumbnailKey`/`VideoThumbnailURL`, klien memakai aturan sama), dan **durasi dibaca dari pemutar** saat video dimuat. `forward pesan` otomatis ikut karena `media_url` yang sama.
- Tiket unggah video (`?purpose=video`) mengembalikan juga `thumb_signed_url`/`thumb_public_url` (request wajib memuat `file_size` dan `thumb_size` <= 512 KB; keduanya ikut ditandatangani).
- Pembersihan: `PurgeWorker` (retensi dan antrean berkas yatim dari hapus akun) menghapus thumbnail turunan bersama video. Selama masa transisi `R2Storage.Delete` meneruskan URL non-R2 (Supabase lama) ke driver Supabase bila env Supabase masih diisi; berkas lama habis dalam 1 hari.
- Periksa juga: bukti moderasi/laporan (`content_reports`, retensi bukti) agar tidak mengabaikan video; penghitungan di `StorageSettingsModal`.
- Status (16 Okt 2026): **Tahap 1-4 (kode) selesai dan sudah di `main`; Tahap 5 berjalan: R2 + backend produksi aktif, uji HP lulus sebagian (lihat `docs/progress/MOBILE.md`); sisi web ditunda** (`go test ./...` lulus). Penanda tangan SigV4 diuji dengan vektor resmi AWS; kecocokan dengan bucket R2 nyata (termasuk penandatanganan `content-length`) baru bisa dipastikan di Tahap 5 langkah 2.
- Tes Go: pembuatan presigned URL (tanpa jaringan), turunan kunci, fail-closed, penolakan `/api/media/upload` saat `r2`, penolakan ukuran/tipe, migrasi kolom, forward menyalin metadata, purge menghapus thumbnail.

### Tahap 2 — Mobile: pilih, kompres, unggah
- Picker kamera/galeri: `mediaTypes: ['images','videos']`, `videoMaxDuration` 60 dtk; `base64` hanya untuk gambar. Cek izin mikrofon di plugin `expo-image-picker` (`app.json`) dan dampaknya pada Data Safety Play Console.
- Kompresi video sebelum kirim (target 720p, bitrate rendah) dengan `react-native-compressor` (**modul native: butuh build APK baru; wajib diperiksa kecocokan dengan versi Expo/RN proyek sebelum dipasang**). Bila hasil > batas, tolak dengan pesan jelas.
- Unggah **berbasis berkas, bukan memori**: `FileSystem.createUploadTask(url, uri, { httpMethod: 'PUT', uploadType: BINARY_CONTENT, headers: { 'Content-Type': ... } })` dengan callback progres. Ganti jalur `uploadMedia` untuk video; pertimbangkan hal sama untuk semua tipe agar konsisten.
- **Hapus fallback VPS** di `mobile/src/api/media.ts`; gagal = galat + tombol coba lagi (bubble status "gagal kirim"), sesuai aturan jaringan lambat (AbortController, optimistic UI).
- Thumbnail: `expo-video-thumbnails` (bingkai awal, JPEG kecil), diunggah lewat alur yang sama; URL disimpan di `media_thumb_url`.
- Pesan dikirim hanya setelah unggah video + thumbnail sukses.

### Tahap 3 — Mobile: tampilan dan pemutaran
- `expo-video` (modul native, ikut build yang sama). Bubble: thumbnail + ikon putar + durasi; ketuk membuka `MediaViewerModal` mode video (kontrol putar, layar penuh) memutar langsung dari URL (Range request ditangani R2).
- Status `expired`: tampilkan "Video kedaluwarsa". Alur `media/ack` (DM) tetap.
- `ChatMediaGalleryModal` menampilkan thumbnail video di tab Media. Cuplikan daftar obrolan, kutipan balasan, notifikasi push/latar belakang: teks "Video" (cek `notificationBackgroundTask.ts`).
- Ikon: tambah `video`/`play` bila belum ada di `icons/registry.ts`.

### Tahap 4 — Web
- `MessageInput.tsx`: terima `video/*`, alur signed-upload yang sama, **tanpa fallback VPS**, batas 25 MB dan durasi dibaca dari metadata `<video>`; thumbnail dibuat lewat canvas. Tampilkan dengan `<video controls preload="metadata" poster=...>`. Kompresi sisi web ditunda (opsional kelak: ffmpeg.wasm).
- Audit jalur unggah web yang lain agar tidak ada fallback VPS tersisa.

### Tahap 5 — Rilis bertahap
1. Deploy backend dengan `STORAGE_DRIVER=supabase` tetap (kode R2 tidak aktif). Perlu izin user: `ssh wuzz-vps ./deploy-chat.sh`.
2. Isi env R2 di VPS, uji unggah+putar dari skrip/curl terhadap bucket nyata.
3. Ganti `STORAGE_DRIVER=r2` + restart. APK lama tetap berfungsi untuk foto (kontrak `signed_url`/`public_url`/PUT sama), tetapi fallback VPS-nya kini ditolak.
4. Build APK baru (release workflow), uji di HP (lihat bawaan di bawah), lalu rilis.
5. Rollback: kembalikan `STORAGE_DRIVER=supabase`.

## 4. Uji

- Otomatis (aturan proyek): `go test -v ./...` di `backend/`, `npx tsc --noEmit` di `mobile/`, `npm run build` di `frontend/`.
- Di HP (akun uji dua perangkat): kirim video kamera dan galeri, ukuran/durasi melewati batas (ditolak), jaringan putus saat unggah (galat + coba lagi, tanpa fallback), putar di penerima, grup dan topik forum, forward, video kedaluwarsa setelah 1 hari, HP murah (memori) dan Android 11 s/d 16, Wi-Fi vs data seluler.

## 5. Risiko dan keputusan terbuka

- **Kompresi di HP** adalah bagian paling berisiko (kecocokan pustaka, lama proses, baterai, HP murah). Putuskan batas durasi/ukuran setelah uji nyata.
- **Domain bucket**: `r2.dev` vs domain custom (butuh domain di Cloudflare).
- **Keamanan akses**: URL publik acak (UUID) tanpa pemeriksaan keanggotaan, sama seperti foto sekarang. Perbaikan kelak: bucket privat + presigned GET lewat backend.
- **Validasi isi**: unggah langsung tidak melewati pemeriksaan magic bytes di server (sudah demikian untuk foto). Mitigasi: tanda tangan `Content-Type`/`Content-Length`, daftar ekstensi, dan (opsional) `HeadObject` saat pesan dikirim.
- **Kuota gratis R2** dan ketentuan akun belum diverifikasi (lihat Tahap 0).
- **Play Store**: perbarui kebijakan privasi `/privacy` dan Data Safety (video konten pengguna); cek izin kamera/mikrofon.
- Antrean `forum_memory_jobs` / AI Memory tidak terpengaruh (video bukan teks).
