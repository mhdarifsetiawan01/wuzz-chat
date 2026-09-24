# Task Checklist — Milestone 1: Additive Schema Migration & Tenant Registry

- [x] Task 1.1: Tambah DDL tabel `tenants` & `tenant_api_keys` di `store/sql.go`
- [x] Task 1.2: Tambah DDL kolom aditif `tenant_id` dan indeks komposit untuk PostgreSQL & SQLite
- [x] Task 1.3: Buat fungsi automatic seeder default tenant saat startup di `store/sql.go`
- [x] Task 2.1: Buat domain entity `Tenant` dan `TenantAPIKey` di `internal/tenant/entity.go`
- [x] Task 2.2: Buat interface `TenantRepository` dan custom errors di `internal/tenant/repository.go`
- [x] Task 2.3: Buat implementasi `SQLTenantRepository` di `internal/tenant/infra/sql_repository.go`
- [x] Task 2.4: Buat `TenantService` di `internal/tenant/service.go`
- [x] Task 3.1: Hubungkan `TenantRepo` & `TenantService` ke `Application` di `internal/app/wire.go`
- [x] Task 4.1: Buat unit/integration test di `internal/tenant/tenant_test.go`
- [x] Task 4.2: Jalankan `go test -v ./internal/tenant/...` (PASS)
- [x] Task 4.3: Jalankan `go test ./...` (PASS 100%)
- [x] Task 4.4: Jalankan `npm run build` di frontend (PASS)
- [x] Task 5.1: Verifikasi port cleanup dan siapkan laporan ke pengguna
