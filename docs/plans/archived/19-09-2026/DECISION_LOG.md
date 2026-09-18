# Active Decision Log — Milestone 8.8

## DEC-014: Realtime Engine Scalability & High-ROI Optimizations

- **Konteks**:
  Audit arsitektur realtime mengungkap 5 bottleneck utama:
  1. `broadcastLocal` mengeksekusi query database SQL dan me-loop seluruh `h.clients` ($O(N)$) pada setiap broadcast pesan.
  2. `onTyping` di backend Go tidak memiliki rate limiter.
  3. `onJoin` selalu mengambil hardcoded 50 pesan terakhir, berisiko *message loss* jika user offline lama dan boros bandwidth jika tidak ada pesan baru.
  4. `ws.send()` di klien langsung membuang (*drop*) pesan jika koneksi socket belum `OPEN`.
  5. Redis Pub/Sub menggunakan satu channel global untuk semua room.

- **Keputusan Teknis**:
  1. **In-Memory Membership Indexing**: Simpan cache daftar user ID anggota percakapan di `Hub` (`roomMembersCache map[string][]string`). `broadcastLocal` hanya me-loop member percakapan tersebut ($O(M)$), lalu mengecek apakah member ada di `h.clients` ($O(1)$ map lookup). Query SQL ke DB hanya dilakukan saat cache miss atau saat mutasi member.
  2. **Sliding-Window Typing Guard**: Batasi pengiriman event typing maksimal 3 event per 2 detik per koneksi menggunakan helper `c.allowRateLimit()`.
  3. **Checkpoint-based Delta History Sync (`since`)**: Menambahkan field opsional `since` pada event `join`. Jika klien mengirimkan `since`, backend hanya mengembalikan pesan dengan `timestamp > since` terurut kronologis (`ASC`), sehingga klien mobile/web hanya mendownload selisih pesan yang belum diterima.
  4. **Outbound Queue di `WsClient`**: Menambahkan buffer FIFO di `WsClient.ts` untuk menampung pesan keluar saat socket sedang `reconnecting`, dan mem-flush antrean tersebut secara otomatis saat socket `connected` kembali.

- **Dampak & Trade-off**:
  - Positif: Beban database saat broadcast turun 100%, kompleksitas CPU loop turun dari $O(N)$ ke $O(M)$, konsistensi pesan saat reconnect terjamin tanpa batas 50 pesan, dan zero message drop pada jaringan seluler tidak stabil.
  - Mitigasi: Cache membership di-invalidation secara otomatis saat terjadi penambahan/pengurangan anggota via `BroadcastGroupSystemEvent`.
