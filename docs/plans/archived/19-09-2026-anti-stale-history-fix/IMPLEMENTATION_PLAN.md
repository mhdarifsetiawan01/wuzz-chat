# Active Implementation Plan: Fix Accidental Logout on Browser Back Navigation (`/login?logout=1`)

Status: **Active** (Menunggu persetujuan user).

---

## 🎯 Akar Masalah (Root Cause)
1. **Penumpukan Entri History (`router.push` vs `router.replace`)**:
   - Setelah pengguna berhasil login di `/login?logout=1`, `handleSubmit` menggunakan `router.push('/chat')`.
   - Akibatnya, `/login?logout=1` tetap tersimpan di riwayat tumpukan peramban (*history stack*).
2. **Query Parameter `?logout=1` Masih Menempel di History**:
   - URL `/login?logout=1` tidak pernah disanitasi (*URL query strip*) setelah dibaca.
3. **Eksekusi `localLogout()` Tanpa Memeriksa Status Autentikasi Pengguna**:
   - Pada `useEffect` di `frontend/app/login/page.tsx`, blok `if (isLogout)` dieksekusi **sebelum** pengecekan `if (!isAuthLoading && user)`.
   - Ketika pengguna yang sudah login di `/chat` menekan tombol *Back* dan mendarat kembali di `/login?logout=1`, aplikasi langsung mengeksekusi `localLogout()` dan menghapus token yang baru saja aktif.

---

## 🛠️ Rencana Solusi Komprehensif

### 1. `frontend/app/login/page.tsx`
- **Prioritaskan Pengecekan Sesi Aktif**:
  - Jika pengguna sudah terautentikasi (`!isAuthLoading && user`), **JANGAN PERNAH** lakukan logout! Langsung redirect kembali ke `/chat` via `router.replace('/chat')`.
- **Sanitasi URL Segera (*History Replace State*)**:
  - Begitu parameter `?logout=1` terdeteksi dan diproses pada initial mount, segera hapus `?logout=1` dari URL dan riwayat peramban menggunakan `window.history.replaceState(null, '', window.location.pathname)`. Dengan demikian, riwayat di browser menjadi `/login` bersih.
- **Gunakan `router.replace` Pasca-Login Berhasil**:
  - Pada `handleSubmit`, ganti `router.push(...)` menjadi `router.replace(...)`. Pengguna yang sudah login tidak boleh memiliki halaman login di belakang riwayat obrolan mereka.

### 2. `frontend/app/chat/page.tsx` & `frontend/app/chat/ProfileModal.tsx`
- Gunakan `window.location.replace('/login?logout=1')` alih-alih `window.location.href = ...` saat logout agar halaman obrolan yang sedang ditinggalkan langsung ditimpa (*replaced*), mencegah penumpukan riwayat mati.

---

## 🧪 Rencana Verifikasi
1. Jalankan `npm run build` di `frontend/` untuk memastikan 0 error TypeScript/lint.
2. Jalankan `go test -count=1 ./...` di `backend/` untuk memastikan seluruh test suite lulus 100%.
3. Verifikasi alur logika:
   - Login -> Tiba di `/chat`.
   - Back peramban -> Otomatis tetap di `/chat` / tidak ter-logout.
   - Logout sukarela / rotasi -> Tiba di `/login` dengan notifikasi keluar berhasil -> URL bersih menjadi `/login` -> Login kembali -> Berhasil.
