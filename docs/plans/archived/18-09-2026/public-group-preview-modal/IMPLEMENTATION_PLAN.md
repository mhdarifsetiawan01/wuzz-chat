# Implementation Plan — Public Group Preview & Confirmation Modal

## 📌 Objective
Mengubah perilaku auto-join pada pencarian grup publik menjadi alur **Preview & Konfirmasi Eksplisit (Explicit Consent)**. Pengguna yang mengklik grup publik di hasil pencarian tidak lagi langsung otomatis bergabung dan mengirim notifikasi sistem, melainkan disajikan modal preview interaktif bertema Aurora Glassmorphic yang menampilkan profil, avatar, deskripsi, dan jumlah anggota grup dengan tombol aksi "Batal" dan "Gabung ke Grup".

## 🎯 Scope of Changes
1. **Frontend Component (`GroupPreviewModal.tsx`)**:
   - Buat komponen modal konfirmasi `frontend/app/chat/GroupPreviewModal.tsx` dengan desain Aurora Glassmorphism.
   - Menampilkan avatar (foto/preset emoji), judul grup, badge `🌐 Grup Publik`, handle `@group_username`, deskripsi lengkap, dan statistik jumlah anggota.
   - Proteksi ketahanan jaringan: `AbortController` (timeout 15s), loading spinner, dan disabled state untuk mencegah *double-click race condition*.
2. **Sidebar Integration (`Sidebar.tsx`)**:
   - Ganti *direct self-join* pada item grup publik dengan membuka `GroupPreviewModal`.
   - Eksekusi `POST /api/groups/${id}/join` hanya dilakukan jika pengguna secara sadar menekan tombol "Gabung ke Grup".
   - Setelah sukses bergabung, bersihkan state pencarian, muat ulang daftar percakapan, dan alihkan ke ruang obrolan.
3. **Deep Link / Direct URL Support (`page.tsx`)**:
   - Tambahkan penanganan jika pengguna membuka tautan grup publik (`/chat?room=grp_...`) saat belum menjadi anggota, agar tidak terjadi error WebSocket melainkan diarahkan konfirmasi gabung yang ramah.
4. **Verification**:
   - `npm run build` (0 error)
   - `cd backend && go test -v ./...` (100% pass)
5. **360-Degree Documentation Sync**:
   - Perbarui seluruh dokumen acuan arsitektur.

