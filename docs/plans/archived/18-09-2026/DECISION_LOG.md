# Decision Log: Shared Media Hub for Group Chats

## DEC-008: Preservation of Group Media on Download ACK (Shared Media Hub)
- **Status**: Proposed / Under Review
- **Konteks**: Media di obrolan grup terhapus seketika dari Supabase Storage begitu satu anggota grup mendownload gambar karena ACK memicu `media_status = 'expired'` dan `storage.Delete`.
- **Keputusan**:
  1. Direct message (1-on-1): Pertahankan *Store-and-Forward* instan untuk menghemat kuota storage ($0 cost).
  2. Group chats & forum topics: Pindahkan ke model *Shared Media Hub*. ACK dari salah satu anggota tidak menghapus berkas dari Supabase dan tidak mengubah status pesan menjadi expired.
  3. Pembersihan media grup hanya dilakukan oleh `PurgeWorker` berdasarkan masa TTL (`MEDIA_RETENTION_DAYS`, direkomendasikan 7 hari).
