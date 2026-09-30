# Decision Log — Active Task

### DEC-028: Skema Relasi Pertemanan Canonical Ordering & Future-Ready Source Type
- **Konteks**: Diperlukan tabel relasi pertemanan yang aman dari race condition dual-direction request dan langsung siap mendukung sinkronisasi buku kontak telepon di masa depan tanpa mengubah skema tabel.
- **Keputusan**:
  1. Menerapkan constraint `UNIQUE (tenant_id, LEAST(requester_id, receiver_id), GREATEST(requester_id, receiver_id))` untuk menjamin hanya ada 1 baris antar-pasangan pengguna.
  2. Menambahkan kolom `source_type VARCHAR(20)` dengan nilai awal `'in_app_request'` dan cadangan `'phone_contact'`.
  3. Abstraksi pengecekan pertemanan terpusat pada fungsi domain `IsFriend(ctx, userA, userB)`.

### DEC-029: Cursor-Based Infinite Scroll vs Offset Pagination
- **Konteks**: User mungkin memiliki ratusan hingga ribuan teman. Penggunaan `OFFSET` pada database relasional mengakibatkan degradasi performa eksponensial (O(N) row scanning).
- **Keputusan**: Seluruh endpoint daftar teman wajib menggunakan Cursor-Based pagination (`before_timestamp` & `before_id`) yang didukung compound index `(tenant_id, user_id, status, updated_at DESC, id DESC)`.

### DEC-030: Anti-Hardcode Configurable Parameter Values
- **Konteks**: Batas rate limit, kuota pending requests, pagination limit, dan cooldown decline harus dapat diubah tanpa merombak kode program.
- **Keputusan**: Membungkus seluruh parameter dalam struct `ConfigConnection` yang membaca nilai environment variables (`CONNECTION_*`) dengan default fallback yang aman.
