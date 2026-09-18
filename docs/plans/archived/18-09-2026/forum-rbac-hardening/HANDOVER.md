# Handover: Restrict Forum Creation to Admin & Creator (RBAC Enforcement)

## 📌 Status
✅ **SELESAI & TERVERIFIKASI**

## 🎯 Perubahan yang Dilakukan
1. **Backend Layer**:
   - `backend/internal/store/group_store.go`: Fungsi `CreateSubGroup` kini memvalidasi bahwa pembuat memiliki peran `'creator'` atau `'admin'` di grup induk melalui `GetUserRoleInGroup`. Mengembalikan `ErrUnauthorizedGroup` jika anggota biasa mencoba membuat.
   - `backend/internal/api/group_handler.go`: Handler `handleCreateSubGroup` menolak request pembuatan topik forum dari anggota biasa dengan `HTTP 403 Forbidden` (`{"error":"Akses ditolak: Hanya admin atau pembuat grup yang dapat membuat topik forum"}`).
   - `backend/internal/store/subgroup_test.go`: Menambahkan pengujian bahwa anggota biasa ditolak saat membuat subgrup dan admin berhasil membuat.
   - `backend/internal/api/group_handler_test.go`: Menambahkan pengujian endpoint HTTP bahwa anggota biasa menerima respons `403 Forbidden`.
2. **Frontend Layer**:
   - `frontend/app/chat/SubGroupListDrawer.tsx`: Tombol `➕ Buat Topik Forum Baru` kini dibungkus dengan kondisi `canCreateTopic = currentUserRole === 'creator' || currentUserRole === 'admin'`. Jika pengguna adalah anggota biasa, tombol otomatis disembunyikan. Pada kondisi daftar forum kosong, teks disesuaikan secara dinamis dan ramah.
   - `frontend/app/chat/page.tsx`: Menyimpan dan meneruskan `parentGroupRole` ke `SubGroupListDrawer` saat drawer dibuka dari dalam subgrup agar evaluasi izin di subgrup tetap mengacu pada peran pengguna di grup induk.
3. **Dokumentasi**:
   - 360-degree audit dan sinkronisasi tuntas di 8 file dokumentasi: `README.md`, `docs/BACKEND_API.md`, `docs/ROADMAP.md`, `docs/PROGRESS.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY_AND_PERFORMANCE.md`, `docs/MOBILE_INTEGRATION_GUIDE.md`, dan `PROMPT.md`.

## 🧪 Bukti Verifikasi
- **Backend Tests**: `go test -v ./...` -> 100% PASS across all packages (`store`, `api`, `ws`, `push`, `worker`, `auth`, `broker`, `storage`).
- **Frontend Build**: `npm run build` -> Next.js 16 (Turbopack) compiled successfully (0 error, 8/8 static pages generated).
