# Decision Log — Milestone M-Mobile-9.3

## 🏛️ Keputusan Teknis & Arsitektur

### DEC-001: Strategi Stale-While-Revalidate (SWR) Berbasis SQLite
- **Konteks**: Linimasa sosial komunitas harus dapat dibuka instan (< 50ms) oleh pengguna di koneksi lambat atau saat offline (cold-start), tanpa membiarkan layar kosong atau memicu spinner layout shift.
- **Keputusan**: Menggunakan tabel SQLite lokal `local_feed_posts`. Pada saat `FeedScreen` dibuka, data langsung dimuat dari SQLite ke state dalam 1 cycle event loop, kemudian request jaringan `GET /api/feed` dijalankan di background untuk menyinkronkan data terbaru. Hasil revalidasi disimpan kembali ke SQLite.
- **Dampak**: Waktu muat awal linimasa instan (< 50ms), toleran terhadap jitter jaringan, dan memenuhi *Mandatory Slow & Flaky Server Resilience Rule*.

### DEC-002: Optimistic UI Rollback Pattern untuk Like & Delete
- **Konteks**: Interaksi sosial seperti menekan tombol suka (Like) harus terasa responsif seketika (0ms) di perangkat pengguna.
- **Keputusan**: Reaksi Like langsung mengubah state UI dan counter seketika, serta memperbarui record lokal di SQLite. Jika request API gagal (misal server timeout / error), state otomatis di-rollback ke nilai sebelumnya dan notifikasi error ditampilkan. Hal yang sama berlaku untuk penghapusan postingan.
- **Dampak**: Pengalaman pengguna setara aplikasi media sosial kelas dunia tanpa mengorbankan konsistensi data.

### DEC-003: Mekanisme Akuisisi Pengguna Melalui Share-to-Chat Loop
- **Konteks**: WuzzChat berfokus pada integrasi chat messaging dan social feed. Konten menarik di feed harus memicu percakapan privat atau grup antar pengguna.
- **Keputusan**: Menyediakan modal `SharePostToChatModal.tsx` yang memungkinkan pengguna memilih ruang obrolan (DM atau Grup) untuk mengirim cuplikan postingan secara langsung sebagai pesan percakapan, lengkap dengan header atribusi dan konten ringkas.
- **Dampak**: Menciptakan loop viral internal yang mengalirkan traffic dari social feed ke ruang obrolan aktif.

### DEC-004: Explore Session Seed untuk Paginasi Random Anti-Duplikasi
- **Konteks**: Pengguna menginginkan tab "Jelajah" yang menampilkan konten acak. Pengacakan murni di SQL (`ORDER BY RANDOM()`) menyebabkan duplikasi item saat pengguna melakukan scroll ke halaman berikutnya (offset/pagination).
- **Keputusan**: Mengirimkan parameter `seed` acak per sesi jelajah dan menggunakan formula hash deterministik di SQL (`md5(p.id || $seed)` di Postgres / `(p.id || ?)` di SQLite). Nilai seed diperbarui saat pull-to-refresh.
- **Dampak**: Konten teracak dinamis tetapi tetap stabil dan bebas duplikasi saat infinite scroll.

### DEC-005: Rolling Window Auto-Pruning Cap pada SQLite Lokal
- **Konteks**: Memastikan penyimpanan internal perangkat (SQLite) tidak bertambah tanpa batas saat pengguna aktif membuka linimasa.
- **Keputusan**: Menerapkan batas maksimal 50 postingan teratas per tab di SQLite lokal melalui auto-pruning query setiap kali batch postingan baru disimpan.
- **Dampak**: Jejak memori dan disk SQLite feed terjamin sangat ramping (< 200 KB per user) dan tidak akan pernah membuat memori HP penuh.
