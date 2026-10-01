# Backlog: Feed Reader, Upload Hardening & Optimasi Gambar

> Dibuat 2026-10-02 dari audit fitur Feed mobile. Berisi pekerjaan yang **belum** diterapkan.
> Yang sudah diterapkan (branch `dev`, belum di-commit saat dokumen ini ditulis): link aktif, "Selengkapnya" 6 baris,
> Mode Baca (`PostReaderScreen`), link preview, zoom gambar, validasi `media_urls`, hardening link-preview,
> header keamanan `/uploads/`, rate limit upload, daftar hitam ekstensi, mode `?purpose=feed`.

## Prioritas A — Dampak besar, risiko rendah
| # | Pekerjaan | Catatan |
|---|---|---|
| A1 | **Kompresi & resize gambar di mobile** (sisi terpanjang ~1600px, JPEG/WebP q≈0.8) | Butuh dependency `expo-image-manipulator` ⇒ **build native baru** (APK/EAS), bukan OTA. Sekaligus menghapus EXIF/GPS. Terapkan di `CreatePostModal` (juga pertimbangkan chat & avatar). Target: 3–5 MB ⇒ 200–500 KB. |
| A2 | **Thumbnail / ukuran responsif untuk feed** | Feed saat ini memuat gambar asli ke kotak 120–200px. Opsi: transform Supabase Storage (`/render/image`) atau thumbnail saat upload. |
| A3 | **Pembersihan file yatim** | Upload feed yang ditolak/gagal posting meninggalkan file di storage. Tambah job pembersih (file tak direferensikan > N jam). |
| A4 | **Cek EXIF/GPS terbawa** | Pastikan picker tidak mengirim lokasi; A1 menutup ini. |

## Prioritas B — Keamanan lanjutan
| # | Pekerjaan | Catatan |
|---|---|---|
| B1 | **Validasi isi file pada jalur signed upload (Supabase)** | File langsung ke storage; server hanya melihat nama+MIME klaim klien. Opsi: set `nosniff`/`Content-Disposition` di bucket, atau lampiran feed lewat jalur upload server, atau verifikasi pasca-upload (HEAD + sniff byte awal) sebelum `POST /api/feed`. Perlu cek konfigurasi bucket. |
| B2 | **Putuskan nasib `.svg` & `.apk` di chat** | Saat ini tetap boleh (kompatibilitas); `.svg` disajikan sebagai unduhan di `/uploads/` tapi di Supabase hanya `.html/.js` yang diblok pada tahap tiket. Opsi: blok total `.svg`; blok/peringatkan `.apk`. |
| B3 | **Daftar putih tipe file untuk chat** | Perlu inventaris semua tipe sah (dokumen, voice note m4a/webm, video, dll.) sebelum menerapkan; risiko memutus fitur lama. |
| B4 | **Kuota total per user** (jumlah/ukuran upload per hari) | Rate limit per menit sudah ada; kuota harian belum. |
| B5 | **Pemindai malware** untuk dokumen chat | Butuh layanan eksternal (mis. ClamAV); putuskan apakah risiko diterima. |
| B6 | **Homograph/IDN & peringatan domain mencurigakan** | Link unicode saat ini hanya tampil sebagai teks (tidak aktif). Opsi: konfirmasi sebelum membuka domain non-ASCII/baru. |
| B7 | **Paksa update klien lama (opsional)** | Klien lama masih bisa upload non-gambar lewat jalur longgar chat. Lewat `ForceUpdateModal` + middleware versi bila ingin menutup total. |

## Prioritas C — Kualitas & konsistensi
| # | Pekerjaan | Catatan |
|---|---|---|
| C1 | **Satukan `MessageBubble.tsx` ke `LinkifiedText`/`tokenizeLinks`** | Logika link chat masih terpisah; sengaja tidak disentuh agar tanpa regresi. |
| C2 | **Zoom gambar bisa geser antar gambar (galeri)** | `MediaViewerModal` saat ini satu gambar per buka. |
| C3 | **Komentar inline di Mode Baca** | Saat ini tombol membuka `PostCommentsModal`. |
| C4 | **Render `metadata` (CTA / deep-link) di mobile** | Ada di kontrak data tapi belum dirender. |
| C5 | **Bagikan ke chat menyertakan link ke postingan** | Saat ini hanya potongan 250 karakter; butuh deep link `/post/:id`. |
| C6 | **Token tema / dark mode untuk Feed** | Warna masih hardcoded (`#f4f7fb`, `#0f172a`, dll.). |
| C7 | **Normalisasi nama file tanpa ekstensi** | Klien baru dengan `?purpose=feed` menolak nama tanpa ekstensi; beri fallback `.jpg` bila MIME image. |
| C8 | **Test otomatis mobile** untuk `tokenizeLinks` & `ExpandableText` | Saat ini hanya `tsc --noEmit`; belum diuji di perangkat/emulator. |

## Catatan deployment
- Perubahan `backend/` ⇒ `ssh deploy@<VPS_IP> ./deploy-chat.sh` (hanya dengan izin eksplisit pengguna).
- Rilis mobile baru diperlukan agar `?purpose=feed`, Mode Baca, dan A1 aktif di pengguna.
- Backend baru menolak lampiran feed non-gambar dari **semua** versi klien (aplikasi lama gagal posting dengan pesan jelas).

---

## Panduan Keputusan Force Update

### Cara kerja mekanisme saat ini
- `MIN_MOBILE_BUILD` (env backend) + `VersionMiddleware`: request dari klien mobile (`X-Device-Platform: android|ios`) dengan build di bawah ambang dijawab **HTTP 426** di **seluruh** endpoint API; app menampilkan `ForceUpdateModal` yang tidak bisa ditutup. Web tidak terpengaruh. Channel `apk` diarahkan ke `apkURL`, channel Play ke Play Store.
- Ada juga jalur lunak: `UpdateBanner` + endpoint info versi (pembaruan opsional).
- Build mobile saat ini: **1.8.0 / versionCode 13**. Perubahan feed/upload di dokumen ini akan menjadi build berikutnya.
- Sifat force update: **tumpul** — memblokir semua fitur (chat, telepon, dll.), bukan hanya feed. Tarik hanya bila ada alasan kuat.

### Prinsip utama
1. **Force update BUKAN kontrol keamanan.** Penyerang tidak memakai aplikasi resmi (curl/skrip, header versi bisa dipalsukan, `?purpose=feed` bisa dihilangkan). Semua perlindungan wajib ditegakkan **di server** dan berlaku untuk semua klien. Force update hanya soal **kompatibilitas dan pengalaman pengguna**.
2. **Urutan aman:** rilis klien baru → (opsional) banner pembaruan → ukur adopsi → baru aktifkan perubahan server yang akan merusak klien lama → naikkan `MIN_MOBILE_BUILD` hanya bila memang perlu.
3. Jangan naikkan `MIN_MOBILE_BUILD` **sebelum** build barunya tersedia di semua channel (APK `apkURL`, dan Play Store bila sudah live), kalau tidak pengguna terkunci tanpa jalan keluar.

### Klasifikasi item backlog
| Kelompok | Item | Perlu klien baru? | Perlu force update? |
|---|---|---|---|
| **Server-only, efektif untuk semua klien langsung** | Hardening link-preview, header `/uploads/`, rate limit, daftar hitam ekstensi, allowlist gambar `media_urls`, A3 (pembersihan yatim), B1 (config bucket), B4 (kuota), B5 (pemindai) | Tidak | **Tidak** |
| **Server-only tapi mengubah perilaku klien lama (mereka mendapat error)** | B2 (blok `.svg`/`.apk` di chat), B3 (allowlist tipe file chat) | Tidak | **Tidak wajib**, tapi klien lama gagal upload tipe tsb. Pertimbangkan banner dulu |
| **Butuh klien baru, klien lama tetap jalan** | A1 (kompresi, build native), A2 (thumbnail, bila URL transform dipakai klien baru), `?purpose=feed`, Mode Baca/zoom/preview, B6, C2–C8 | Ya | **Tidak** — cukup banner opsional |
| **Hanya bila ingin menutup jalur longgar** | B7 | Ya | **Ya**, tetapi tidak menambah keamanan nyata (lihat prinsip 1) |

### Kapan force update layak dilakukan (pemicu)
- Server akan **menghapus jalur lama** yang masih dipakai klien lama (mis. wajib `purpose` pada upload, wajib gambar terkompresi, allowlist chat B3 yang menolak tipe yang masih dikirim klien lama).
- Perubahan **kontrak API/protokol** yang tidak backward-compatible (mis. format URL gambar baru, perubahan skema E2EE).
- **Bug kritis di sisi klien** yang tidak bisa ditambal dari server.
- Biaya server/egress akibat klien lama (gambar mentah 3–5 MB) sudah **terlalu besar** dan A1 sudah dirilis.

### Syarat sebelum menaikkan `MIN_MOBILE_BUILD`
- [ ] Build target sudah live di APK (`apkURL`) dan Play Store (bila sudah ada).
- [ ] Ada data adopsi: persentase pengguna aktif di build ≥ target (disarankan ≥ 90%). *(Belum ada telemetri; lihat D1.)*
- [ ] Banner opsional sudah tampil minimal 1–2 minggu.
- [ ] `ForceUpdateModal` diuji di kedua channel (apk & play).
- [ ] Rencana rollback: turunkan lagi `MIN_MOBILE_BUILD` (cukup ubah env + restart).

### Item tambahan untuk menunjang keputusan
| # | Pekerjaan | Catatan |
|---|---|---|
| D1 | **Telemetri distribusi versi klien** | Catat hitungan per `X-App-Build`/platform/channel (counter ringan di middleware, tanpa data pribadi) agar keputusan force update berbasis data. |
| D2 | **Rencana rilis build berikutnya (14+)** | Gabungkan A1 + `?purpose=feed` + Mode Baca dalam satu build native agar hanya satu kali rilis/update bagi pengguna. |
| D3 | **Sinkronisasi dengan migrasi Play Store** | Lihat `docs/PLAY_STORE_MIGRATION.md`; jadwalkan force update setelah channel Play siap agar pengguna tidak terkunci. |
