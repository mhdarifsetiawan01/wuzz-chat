# Implementation Plan — Restrict Forum / Subgroup Creation to Admin & Creator (RBAC Enforcement)

## 📌 Objective
Membatasi hak pembuatan ruang diskusi / topik forum (`subgroups`) di dalam grup hanya untuk peran Pembuat (`creator`) dan Admin (`admin`) grup induk. Anggota biasa (`member`) dilarang membuat forum, tombol pembuatan forum disembunyikan di UI untuk anggota biasa, dan request API divalidasi fail-closed (HTTP 403 Forbidden).

## 🎯 Scope of Changes
1. **Backend Layer**:
   - `backend/internal/store/group_store.go`: Perketat `CreateSubGroup` untuk memverifikasi `role == "creator" || role == "admin"`, mengembalikan `ErrUnauthorizedGroup` jika anggota biasa mencoba membuat.
   - `backend/internal/api/group_handler.go`: Perketat `handleCreateSubGroup` untuk menolak request dari anggota biasa dengan `HTTP 403 Forbidden`.
   - `backend/internal/store/subgroup_test.go`: Tambahkan pengujian bahwa anggota biasa ditolak membuat subgrup dan admin berhasil membuat.
   - `backend/internal/api/group_handler_test.go`: Tambahkan pengujian API handler bahwa anggota biasa menerima `403 Forbidden`.
2. **Frontend Layer**:
   - `frontend/app/chat/SubGroupListDrawer.tsx`: Sembunyikan tombol `➕ Buat Topik Forum Baru` jika `currentUserRole !== 'creator' && currentUserRole !== 'admin'`, serta sesuaikan pesan informatif pada kondisi daftar topik kosong.
   - `frontend/app/chat/page.tsx`: Ambil dan simpan `parentGroupRole` saat berada di subgrup agar drawer subgrup tetap menerima role yang tepat dari grup induk.
3. **Verification**:
   - Backend: `go test -v ./...`
   - Frontend: `npm run build`
4. **Documentation Sync**:
   - Sinkronisasi seluruh dokumen (README.md, docs/BACKEND_API.md, docs/ARCHITECTURE.md, docs/SECURITY_AND_PERFORMANCE.md, docs/ROADMAP.md, docs/PROGRESS.md, docs/MOBILE_INTEGRATION_GUIDE.md, PROMPT.md).

