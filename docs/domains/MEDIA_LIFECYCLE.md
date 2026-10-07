# 📦 Domain: Media & Attachment Lifecycle (`MEDIA_LIFECYCLE`)

Dokumen ini adalah spesifikasi definitif untuk domain **Pengelolaan Berkas, Foto, Dokumen, Voice Notes, dan Siklus Hidup Media** pada Wuzz Chat.

---

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **Arsitektur Dual Media (1-on-1 vs Grup/Forum)**:
   - **Obrolan 1-on-1 (WhatsApp Store-and-Forward dengan 24h Multi-Device Grace Period / $0 Long-term Cost)**:
     - Berkas di server hanya bersifat persinggahan sementara.
     - Saat salah satu perangkat mengunduh berkas, klien mengirimkan konfirmasi `POST /api/media/ack`. Status pesan beralih menjadi `'downloaded'`.
     - Berkas fisik **TIDAK langsung dihapus seketika (0ms)**, melainkan dipertahankan selama masa retensi tenggang **24 jam (1 hari)** agar perangkat kedua (Multi-Device: Web atau HP lain) memiliki waktu luang untuk mengunduh berkas ke penyimpanan lokal masing-masing secara independen.
     - Setelah 24 jam terlewati, goroutine latar belakang `PurgeWorker` secara otomatis menghapus berkas fisik dari storage Supabase S3 dan memperbarui status di database menjadi `'expired'`.
     - Berkas tetap dapat diakses di perangkat yang telah mengunduh karena tersimpan di cache lokal (`IndexedDB` di Web / internal SQLite/filesystem di Mobile).
   - **Obrolan Grup & Topik Forum (Shared Media Hub / TTL 7 Hari)**:
     - Panggilan ACK unduhan dari salah satu anggota **DILARANG** menghapus berkas dari server.
     - Berkas dipertahankan selama masa retensi TTL (7 hari) agar seluruh anggota grup dapat mengunduh secara bergantian.
     - Berkas dibersihkan secara massal oleh goroutine `PurgeWorker` setelah 7 hari.
2. **Kompresi Gambar Sisi Klien (*Pre-Upload WebP Compressor*)**:
   - Gambar yang diunggah dikompresi di sisi klien via `imageCompressor.ts` (resolusi maks 1600px, format WebP kualitas 0.82) untuk menghemat bandwidth hingga 80%.
3. **Pesan Suara (*Voice Notes*)**:
   - Direkam via Web Audio API (`MediaRecorder`) di Web dan `expo-audio` di Mobile.
   - Menggunakan format audio efisien (`audio/webm` / `audio/m4a`).
   - Dirender dengan waveform dinamis 24-bar, scrubber posisi, dan opsi kecepatan putar (1x, 1.5x, 2x).

---

## 🏛️ 2. Arsitektur Storage Driver (`backend/internal/storage/`)

- **Interface `StorageDriver`**: Abstraksi penyimpanan berkas (`Save`, `Delete`, `GetReader`, `GetURL`).
- **Implementasi Driver**:
  - `SupabaseStorageDriver`: Berkomunikasi dengan bucket S3 Supabase Storage.
  - `LocalStorageDriver`: Fallback penyimpanan disk lokal untuk development offline.
- **Background Purge Worker (`worker/purge_worker.go`)**:
  - Berjalan berkala (`24h ticker`) untuk membersihkan berkas grup yang telah melewati batas `MEDIA_RETENTION_DAYS=7`.
- **Antrean berkas yatim (`media_purge_queue`, `store/media_purge_queue.go`)**: hapus akun (`EraseUser`) menghapus baris pesan, sehingga berkas fisiknya tak terjangkau `GetExpiredMediaMessages`. Karena itu `EraseUser` memasukkan berkas milik user (lampiran pesan, lampiran grup yang ikut terhapus, `media_urls` postingan, `avatar_url`) ke tabel `media_purge_queue` dalam transaksi yang sama; `PurgeWorker.DrainQueue` menghapus berkas fisiknya tiap siklus (maks 100 berkas x 10 kelompok), antrean tetap jalan walau retensi diset permanen.
  - Gagal hapus: dicoba ulang dengan jeda 1, 2, 4 jam (maks 24 jam); setelah 10 kali dibuang dari antrean dan dicatat di log `❌ [PurgeWorker] Menyerah`.
  - Berkas yang masih dirujuk `messages.media_url` atau `users.avatar_url` milik orang lain tidak dihapus. Media feed tidak dicek rujukannya (diasumsikan tak dipakai ulang).
  - **Jangan** mengganti pengecekan rujukan menjadi per berkas: terukur 3 menit 7 detik untuk 5.000 berkas (100 ribu pesan), versi set-based 0,29 detik.
  - Berkas yatim dari akun yang dihapus sebelum fitur ini tidak ikut dibersihkan.
  - **Catatan skala (ditunda, belum perlu):** produksi 1 node, penghapusan berkas berurutan. Bila antrean menumpuk, naikkan paralelisme `DrainQueue` (goroutine, disarankan diatur lewat env) atau batas/intervalnya. Bila node ditambah, `ClaimDue` perlu `FOR UPDATE SKIP LOCKED` + sewa lewat `next_attempt_at` (PostgreSQL) agar node tak mengambil berkas yang sama.

---

## 🔌 3. Kontrak REST API

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `POST` | `/api/media/upload` | Terproteksi | Mengunggah file (Multipart form-data: `file`, `room_id`) |
| `POST` | `/api/media/ack` | Terproteksi | Mengonfirmasi unduhan selesai (memicu hapus fisik pada 1-on-1 DM) |
| `GET` | `/api/media/{id}` | Terproteksi | Mengambil file / streaming media |

---

## 💻📱 4. Antarmuka Pengguna (Web & Mobile)
- **Modal Lightbox**: Penampil gambar fullscreen interaktif dengan zoom dan download langsung.
- **Document Card**: Kartu pratinjau dokumen dengan badge ekstensi berwarna (PDF, DOCX, ZIP) dan tombol unduh.
- **Voice Note Bar**: Visualizer mikrofon dengan indikator timer dan tombol batal/kirim.
