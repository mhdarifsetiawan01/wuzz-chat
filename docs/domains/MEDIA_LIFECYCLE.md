# 📦 Domain: Media & Attachment Lifecycle (`MEDIA_LIFECYCLE`)

Dokumen ini adalah spesifikasi definitif untuk domain **Pengelolaan Berkas, Foto, Dokumen, Voice Notes, dan Siklus Hidup Media** pada Wuzz Chat.

---

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **Arsitektur Dual Media (1-on-1 vs Grup/Forum)**:
   - **Obrolan 1-on-1 (WhatsApp Store-and-Forward / $0 Server Storage Cost)**:
     - Berkas di server hanya bersifat persinggahan sementara.
     - Begitu penerima selesai mengunduh berkas, klien mengirimkan panggilan konfirmasi `POST /api/media/ack`.
     - Server **langsung menghapus berkas fisik** dari Supabase S3 Storage dan mengubah status di basis data menjadi `'expired'`.
     - File tetap dapat dibuka di kedua perangkat karena tersimpan di cache lokal (`IndexedDB` di Web / internal storage di Mobile).
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
