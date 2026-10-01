# Decision Log: Mobile Clickable Links & Link Preview Card

### DEC-037: Sanitasi URL & Whitelist Skema Ketat
- **Konteks**: Pengguna dapat mengirim link sembarang, termasuk link dengan tanda baca di akhir atau skema berbahaya.
- **Keputusan**:
  1. Hapus karakter trailing punctuation (`.,;:!?()[]"'`) dari string URL hasil match regex.
  2. Hanya izinkan protokol `http:` dan `https:` untuk dibuka via `Linking.openURL` dan dikirim ke backend scraper.
  3. Skema berbahaya seperti `file:`, `javascript:`, `intent:`, `content:` otomatis ditolak demi keamanan perangkat.

### DEC-038: In-Memory Caching & 1 Card per Message Limit (Performa)
- **Konteks**: FlatList pada mobile merender puluhan pesan saat di-scroll cepat. Melakukan scrape berulang akan memicu jank dan pemborosan bandwidth.
- **Keputusan**:
  1. Implementasikan global in-memory cache berkapasitas 100 entri untuk menyimpan hasil fetch `LinkPreview`.
  2. Hanya 1 URL pertama di dalam sebuah pesan yang menampilkan kartu pratinjau (`LinkPreviewCard`), mengikuti pola standar WhatsApp dan Telegram.

### DEC-039: Cache Expiration TTL (Anti-Stale Metadata)
- **Konteks**: Website dapat mengubah judul, thumbnail, atau deskripsi artikel/konten. Cache tanpa batas waktu dapat membuat data menjadi usang jika aplikasi berjalan lama di latar belakang.
- **Keputusan**:
  1. Pasang TTL (Time-To-Live) sebesar 1 Jam (`CACHE_TTL_MS = 3600000`) pada setiap entri cache mobile.
  2. Jika entri sudah berumur lebih dari 1 jam, cache dianggap stale dan dihapus sehingga aplikasi meminta data terbaru ke backend.
  3. Di sisi server backend, Redis cache juga menggunakan TTL 24 jam (`24*time.Hour`) untuk menyegarkan data dari website target secara periodik.

### DEC-040: Bypass `Linking.canOpenURL` Gate di Android (Package Visibility Fix)
- **Konteks**: Pada Android 11+ (API 30+), `Linking.canOpenURL` sering mengembalikan `false` untuk link web (`https://`) akibat pembatasan Package Visibility Filtering di Android OS. Hal ini memicu Alert: *"Perangkat tidak memiliki aplikasi untuk membuka tautan ini"*.
- **Keputusan**:
  1. Hapus percabangan `canOpenURL` pada URL yang telah lolos validasi `isSafeHttpUrl`.
  2. Panggil `Linking.openURL(targetUrl)` secara langsung di dalam blok `try...catch` (mengikuti rekomendasi resmi React Native untuk skema `http/https`).
  3. Tambahkan deklarasi `<queries>` intent `ACTION_VIEW` untuk `https` dan `http` di `AndroidManifest.xml`.
  4. Perluas `URL_REGEX` agar dapat mengenali nama domain umum (seperti `chat.wuzzhub.id` atau `youtube.com`) dan menambahkan skema `https://` otomatis.
