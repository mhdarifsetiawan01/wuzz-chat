# Decision Log — Active Workspace

Log keputusan aktif untuk milestone yang sedang berjalan. Catatan keputusan lampau telah diarsipkan di `docs/plans/archived/`.

## DEC-011: Restriksi Pembuatan Forum/Subgrup Hanya untuk Admin dan Pembuat Grup (RBAC)
- **Konteks:** Sebelumnya, validasi subgrup hanya menerapkan *Strict Parent-Membership Gate* (setiap anggota aktif grup induk dapat membuat subgrup). Hal ini menimbulkan risiko spamming topik dan kehilangan kontrol moderasi grup.
- **Keputusan:**
  1. **Backend Enforcement:** API `POST /api/groups/:id/subgroups` dan method store `CreateSubGroup` wajib memeriksa peran pembuat (`creator` atau `admin`). Jika pemanggil adalah `member`, tolak dengan status fail-closed `403 Forbidden` (`ErrUnauthorizedGroup`).
  2. **Frontend UI Hidden:** Tombol `➕ Buat Topik Forum Baru` pada drawer `SubGroupListDrawer.tsx` disembunyikan jika `currentUserRole` bukan `creator` atau `admin`. Jika daftar topik kosong, teks penjelasan yang ramah ditampilkan memberitahukan bahwa topik dibuat oleh admin.
  3. **Role Propagation:** Di `page.tsx`, saat drawer subgrup dibuka dari dalam subgrup, role pengguna diambil dari grup induk (`parentGroupRole`) untuk memastikan evaluasi hak akses tetap akurat.

