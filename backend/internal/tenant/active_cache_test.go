package tenant_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/tenant"
	tenantinfra "github.com/bms-del112/wuzz-chat/internal/tenant/infra"
)

type countingRepo struct {
	tenant.TenantRepository
	getByID atomic.Int32
}

func (c *countingRepo) GetByID(ctx context.Context, id string) (*tenant.Tenant, error) {
	c.getByID.Add(1)
	return c.TenantRepository.GetByID(ctx, id)
}

type ttlSetter interface{ SetActiveCacheTTL(time.Duration) }

func newCachedService(t *testing.T, ttl time.Duration) (tenant.TenantService, *countingRepo, *tenant.Tenant) {
	t.Helper()
	_, db := setupTestDB(t)
	repo := &countingRepo{TenantRepository: tenantinfra.NewSQLTenantRepository(db, "sqlite")}
	svc := tenant.NewTenantService(repo)
	if ttl > 0 {
		svc.(ttlSetter).SetActiveCacheTTL(ttl)
	}
	ctx := context.Background()
	tn, err := svc.CreateTenant(ctx, "Acme", "acme-cache")
	if err != nil {
		t.Fatal(err)
	}
	repo.getByID.Store(0)
	return svc, repo, tn
}

func TestValidateTenantActive_NoCacheByDefault(t *testing.T) {
	svc, repo, tn := newCachedService(t, 0)
	for i := 0; i < 3; i++ {
		if _, err := svc.ValidateTenantActive(context.Background(), tn.ID); err != nil {
			t.Fatal(err)
		}
	}
	if n := repo.getByID.Load(); n != 3 {
		t.Fatalf("tanpa cache: 3 pembacaan, got %d", n)
	}
}

func TestValidateTenantActive_CachesActiveOnly(t *testing.T) {
	svc, repo, tn := newCachedService(t, 80*time.Millisecond)
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		got, err := svc.ValidateTenantActive(ctx, tn.ID)
		if err != nil || got.ID != tn.ID {
			t.Fatalf("validasi: %v %v", got, err)
		}
	}
	if n := repo.getByID.Load(); n != 1 {
		t.Fatalf("lima validasi dalam TTL harus 1 pembacaan database, got %d", n)
	}

	// Setelah TTL habis, dibaca ulang.
	time.Sleep(120 * time.Millisecond)
	if _, err := svc.ValidateTenantActive(ctx, tn.ID); err != nil {
		t.Fatal(err)
	}
	if n := repo.getByID.Load(); n != 2 {
		t.Fatalf("setelah TTL: pembacaan ke-2, got %d", n)
	}

	// Penonaktifan terlihat paling lambat sebesar TTL (batas yang terdokumentasi), lalu ditolak.
	tn.IsActive = false
	if err := repo.Update(ctx, tn); err != nil {
		t.Fatal(err)
	}
	time.Sleep(120 * time.Millisecond)
	if _, err := svc.ValidateTenantActive(ctx, tn.ID); !errors.Is(err, tenant.ErrTenantInactive) {
		t.Fatalf("setelah TTL tenant nonaktif harus ditolak, got %v", err)
	}
	// Hasil tidak aktif TIDAK disimpan: diaktifkan kembali langsung terlihat.
	tn.IsActive = true
	if err := repo.Update(ctx, tn); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ValidateTenantActive(ctx, tn.ID); err != nil {
		t.Fatalf("diaktifkan kembali harus langsung diterima (tanpa cache negatif), got %v", err)
	}
	// Tenant tidak ada tidak disimpan dan selalu ditolak.
	for i := 0; i < 2; i++ {
		if _, err := svc.ValidateTenantActive(ctx, "tidak-ada"); err == nil {
			t.Fatal("tenant tidak ada harus ditolak")
		}
	}
}

// Jalur kunci API tidak boleh memakai cache: penonaktifan tenant harus langsung menolak penukaran/validasi kunci.
func TestValidateAPIKey_IgnoresActiveCache(t *testing.T) {
	svc, repo, tn := newCachedService(t, time.Hour)
	ctx := context.Background()
	key, secret, err := svc.CreateAPIKey(ctx, tn.ID, "kunci")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ValidateTenantActive(ctx, tn.ID); err != nil { // hangatkan cache
		t.Fatal(err)
	}
	if _, err := svc.ValidateAPIKey(ctx, key.AppID, secret); err != nil {
		t.Fatalf("kunci valid: %v", err)
	}
	tn.IsActive = false
	if err := repo.Update(ctx, tn); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ValidateAPIKey(ctx, key.AppID, secret); !errors.Is(err, tenant.ErrTenantInactive) {
		t.Fatalf("validasi kunci API harus langsung menolak tenant nonaktif walau cache hangat, got %v", err)
	}
	if _, _, err := svc.CreateAPIKey(ctx, tn.ID, "lagi"); !errors.Is(err, tenant.ErrTenantInactive) {
		t.Fatalf("pembuatan kunci API juga tanpa cache, got %v", err)
	}
}
