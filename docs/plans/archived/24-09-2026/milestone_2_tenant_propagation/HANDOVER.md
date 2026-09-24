# Handover & Verification Protocol — Milestone 2: Tenant Context Propagation in Services & Repositories

## 📋 Verification Checklist

1. [x] **Tenant Middleware Unit Tests**:
   - Status 200 OK dengan header `X-Tenant-ID`.
   - Status 200 OK dengan JWT claim `tenant_id`.
   - Status 200 OK dengan fallback default tenant.
   - Status 403 Forbidden jika tenant inaktif.
   - Status 403/404 jika tenant id tidak ditemukan.
2. [x] **Multi-Tenant Data Isolation Tests**:
   - Pengguna dengan username sama di 2 tenant berbeda berhasil dibuat dan diautentikasi tanpa bentrok.
   - Pencarian kontak di Tenant A tidak membocorkan pengguna di Tenant B.
   - Percakapan dan riwayat pesan di Tenant A tidak dapat diakses atau di-list oleh user Tenant B.
   - Grup publik di Tenant A tidak muncul di pencarian publik Tenant B.
   - Job dan draf memori AI di Tenant A tidak tampak oleh Tenant B.
3. [x] **Regression & Build Verification**:
   - `go test -v ./...` di folder `backend/` passing 100%.
   - `npm run build` di folder `frontend/` passing dengan 0 error.
4. [x] **Cleanup**:
   - Seluruh port lokal pengujian dimatikan (`fuser -k <port>/tcp`).
