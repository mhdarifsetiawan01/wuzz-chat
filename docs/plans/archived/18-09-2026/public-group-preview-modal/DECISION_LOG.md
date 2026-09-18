# Decision Log — Active Workspace

Log keputusan aktif untuk milestone yang sedang berjalan. Catatan keputusan lampau telah diarsipkan di `docs/plans/archived/`.

## DEC-012: Transisi dari Auto-Join ke Modal Preview Konfirmasi untuk Grup Publik
- **Konteks:** Sebelumnya, mengklik baris grup publik pada hasil pencarian langsung memicu `POST /api/groups/{id}/join` tanpa konfirmasi. Ini menyebabkan *accidental join*, mengotori daftar chat pengguna, dan langsung memicu notifikasi sistem broadcast ("X telah bergabung ke grup").
- **Keputusan:**
  1. **Modal Preview Eksplisit (`GroupPreviewModal.tsx`):** Mengklik grup publik di hasil pencarian akan membuka modal preview bertema Aurora Glassmorphic (avatar, judul, badge publik, deskripsi, hitungan anggota) dengan tombol "Batal" dan "Gabung ke Grup".
  2. **Explicit Consent First:** Pemanggilan `POST /api/groups/{id}/join` hanya dieksekusi saat tombol "Gabung ke Grup" ditekan secara sadar oleh pengguna.
  3. **Proteksi Jaringan Lambat:** Tombol gabung dilengkapi loading spinner dan disabled state serta `AbortController` (15s timeout).

