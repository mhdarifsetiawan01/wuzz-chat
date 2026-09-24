package tenant_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/tenant"
	tenantinfra "github.com/bms-del112/wuzz-chat/internal/tenant/infra"
	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) (*store.SQLMessageStore, *sql.DB) {
	t.Helper()
	sqlStore, err := store.NewSQLMessageStore("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("gagal inisialisasi SQL store in-memory: %v", err)
	}
	return sqlStore, sqlStore.DB()
}

func TestAutoMigrateAndDefaultTenantSeeder(t *testing.T) {
	_, db := setupTestDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	repo := tenantinfra.NewSQLTenantRepository(db, "sqlite")

	// 1. Verifikasi seeder otomatis default tenant
	defaultTenant, err := repo.GetByID(ctx, tenant.DefaultTenantID)
	if err != nil {
		t.Fatalf("default tenant harus ada otomatis: %v", err)
	}
	if defaultTenant.Name != "Default Tenant" {
		t.Errorf("nama default tenant salah: dapat %q, ingin %q", defaultTenant.Name, "Default Tenant")
	}
	if !defaultTenant.IsActive {
		t.Errorf("default tenant harus berstatus aktif")
	}
	if defaultTenant.Slug != "default" {
		t.Errorf("slug default tenant salah: dapat %q, ingin %q", defaultTenant.Slug, "default")
	}

	// 2. Verifikasi kolom tenant_id ada pada tabel relasional
	tables := []string{"users", "conversations", "forum_memory_jobs", "memory_drafts", "approved_memories"}
	for _, tbl := range tables {
		query := "SELECT tenant_id FROM " + tbl + " LIMIT 1;"
		_, err := db.ExecContext(ctx, query)
		if err != nil {
			t.Errorf("tabel %q harus memiliki kolom tenant_id, error: %v", tbl, err)
		}
	}
}

func TestTenantRepositoryCRUD(t *testing.T) {
	_, db := setupTestDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	repo := tenantinfra.NewSQLTenantRepository(db, "sqlite")

	// 1. Create tenant
	newTenant := &tenant.Tenant{
		ID:       "tenant_acme",
		Name:     "Acme Corporation",
		Slug:     "acme",
		IsActive: true,
	}
	err := repo.Create(ctx, newTenant)
	if err != nil {
		t.Fatalf("gagal create tenant: %v", err)
	}

	// 2. Duplicate slug error
	dupTenant := &tenant.Tenant{
		ID:       "tenant_acme_2",
		Name:     "Acme Copy",
		Slug:     "acme",
		IsActive: true,
	}
	err = repo.Create(ctx, dupTenant)
	if err != tenant.ErrDuplicateSlug {
		t.Errorf("ekspektasi ErrDuplicateSlug, dapat %v", err)
	}

	// 3. GetByID
	fetched, err := repo.GetByID(ctx, "tenant_acme")
	if err != nil {
		t.Fatalf("gagal get tenant by id: %v", err)
	}
	if fetched.Name != "Acme Corporation" {
		t.Errorf("nama tidak cocok: dapat %q", fetched.Name)
	}

	// 4. GetBySlug
	fetchedSlug, err := repo.GetBySlug(ctx, "acme")
	if err != nil {
		t.Fatalf("gagal get tenant by slug: %v", err)
	}
	if fetchedSlug.ID != "tenant_acme" {
		t.Errorf("id tidak cocok: dapat %q", fetchedSlug.ID)
	}

	// 5. Update tenant
	fetched.Name = "Acme Corp International"
	fetched.IsActive = false
	err = repo.Update(ctx, fetched)
	if err != nil {
		t.Fatalf("gagal update tenant: %v", err)
	}

	updated, err := repo.GetByID(ctx, "tenant_acme")
	if err != nil {
		t.Fatalf("gagal get updated tenant: %v", err)
	}
	if updated.Name != "Acme Corp International" || updated.IsActive != false {
		t.Errorf("update gagal diterapkan: %+v", updated)
	}

	// 6. List tenants (minimal 'default' dan 'tenant_acme')
	tenants, err := repo.List(ctx, 10, 0)
	if err != nil {
		t.Fatalf("gagal list tenants: %v", err)
	}
	if len(tenants) < 2 {
		t.Errorf("ekspektasi minimal 2 tenants, dapat %d", len(tenants))
	}
}

func TestTenantAPIKeyRepository(t *testing.T) {
	_, db := setupTestDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	repo := tenantinfra.NewSQLTenantRepository(db, "sqlite")

	key := &tenant.TenantAPIKey{
		ID:         "key_1",
		TenantID:   tenant.DefaultTenantID,
		AppID:      "app_test_123",
		SecretHash: "hashed_secret_xyz",
		Name:       "Production API Key",
		IsActive:   true,
	}

	// 1. Create API Key
	if err := repo.CreateAPIKey(ctx, key); err != nil {
		t.Fatalf("gagal create api key: %v", err)
	}

	// 2. Duplicate AppID
	dupKey := &tenant.TenantAPIKey{
		ID:         "key_2",
		TenantID:   tenant.DefaultTenantID,
		AppID:      "app_test_123",
		SecretHash: "another_hash",
		IsActive:   true,
	}
	if err := repo.CreateAPIKey(ctx, dupKey); err != tenant.ErrDuplicateAppID {
		t.Errorf("ekspektasi ErrDuplicateAppID, dapat: %v", err)
	}

	// 3. GetAPIKeyByAppID
	fetchedKey, err := repo.GetAPIKeyByAppID(ctx, "app_test_123")
	if err != nil {
		t.Fatalf("gagal get api key by app id: %v", err)
	}
	if fetchedKey.Name != "Production API Key" {
		t.Errorf("nama key tidak sesuai: %q", fetchedKey.Name)
	}

	// 4. ListAPIKeysByTenantID
	keys, err := repo.ListAPIKeysByTenantID(ctx, tenant.DefaultTenantID)
	if err != nil {
		t.Fatalf("gagal list api keys: %v", err)
	}
	if len(keys) != 1 {
		t.Errorf("ekspektasi 1 key, dapat: %d", len(keys))
	}
}

func TestTenantServiceFlow(t *testing.T) {
	_, db := setupTestDB(t)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	repo := tenantinfra.NewSQLTenantRepository(db, "sqlite")
	svc := tenant.NewTenantService(repo)

	// 1. Create Tenant via Service
	t1, err := svc.CreateTenant(ctx, "Fintech Corp", "fintech")
	if err != nil {
		t.Fatalf("gagal create tenant via service: %v", err)
	}
	if t1.ID == "" || t1.Slug != "fintech" {
		t.Errorf("tenant tidak valid: %+v", t1)
	}

	// 2. Validate Tenant Active
	validated, err := svc.ValidateTenantActive(ctx, t1.ID)
	if err != nil {
		t.Fatalf("tenant harus aktif: %v", err)
	}
	if validated.ID != t1.ID {
		t.Errorf("id tenant tidak cocok")
	}

	// 3. Create API Key via Service
	apiKey, rawSecret, err := svc.CreateAPIKey(ctx, t1.ID, "Fintech Backend Server")
	if err != nil {
		t.Fatalf("gagal generate api key: %v", err)
	}
	if apiKey.AppID == "" || rawSecret == "" {
		t.Fatalf("app_id atau raw_secret kosong")
	}

	// 4. Validate API Key: Sukses
	authedTenant, err := svc.ValidateAPIKey(ctx, apiKey.AppID, rawSecret)
	if err != nil {
		t.Fatalf("validasi api key gagal: %v", err)
	}
	if authedTenant.ID != t1.ID {
		t.Errorf("tenant hasil validasi salah: %q vs %q", authedTenant.ID, t1.ID)
	}

	// 5. Validate API Key: Salah Secret
	_, err = svc.ValidateAPIKey(ctx, apiKey.AppID, "sec_wrongpassword")
	if err == nil {
		t.Errorf("ekspektasi error dengan secret yang salah")
	}

	// 6. Validate API Key: Inactive Tenant
	t1.IsActive = false
	if err := repo.Update(ctx, t1); err != nil {
		t.Fatalf("gagal nonaktifkan tenant: %v", err)
	}

	_, err = svc.ValidateAPIKey(ctx, apiKey.AppID, rawSecret)
	if err != tenant.ErrTenantInactive {
		t.Errorf("ekspektasi ErrTenantInactive saat tenant nonaktif, dapat: %v", err)
	}
}
