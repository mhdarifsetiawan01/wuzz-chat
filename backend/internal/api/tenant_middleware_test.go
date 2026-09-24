package api_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/tenant"
)

// mockTenantService untuk unit testing TenantMiddleware
type mockTenantService struct {
	tenants map[string]*tenant.Tenant
}

func newMockTenantService() *mockTenantService {
	m := &mockTenantService{
		tenants: make(map[string]*tenant.Tenant),
	}
	// Tenant default aktif
	m.tenants["default"] = &tenant.Tenant{
		ID:       "default",
		Name:     "Default Tenant",
		Slug:     "default",
		IsActive: true,
	}
	// Tenant kustom aktif
	m.tenants["tenant_alpha"] = &tenant.Tenant{
		ID:       "tenant_alpha",
		Name:     "Tenant Alpha",
		Slug:     "tenant-alpha",
		IsActive: true,
	}
	// Tenant nonaktif
	m.tenants["tenant_inactive"] = &tenant.Tenant{
		ID:       "tenant_inactive",
		Name:     "Tenant Inactive",
		Slug:     "tenant-inactive",
		IsActive: false,
	}
	return m
}

func (m *mockTenantService) GetTenant(ctx context.Context, id string) (*tenant.Tenant, error) {
	t, ok := m.tenants[id]
	if !ok {
		return nil, tenant.ErrTenantNotFound
	}
	return t, nil
}

func (m *mockTenantService) GetTenantBySlug(ctx context.Context, slug string) (*tenant.Tenant, error) {
	for _, t := range m.tenants {
		if t.Slug == slug {
			return t, nil
		}
	}
	return nil, tenant.ErrTenantNotFound
}

func (m *mockTenantService) CreateTenant(ctx context.Context, name, slug string) (*tenant.Tenant, error) {
	return nil, errors.New("not implemented")
}

func (m *mockTenantService) ListTenants(ctx context.Context, limit, offset int) ([]*tenant.Tenant, error) {
	return nil, errors.New("not implemented")
}

func (m *mockTenantService) ValidateTenantActive(ctx context.Context, id string) (*tenant.Tenant, error) {
	t, ok := m.tenants[id]
	if !ok {
		return nil, tenant.ErrTenantNotFound
	}
	if !t.IsActive {
		return nil, tenant.ErrTenantInactive
	}
	return t, nil
}

func (m *mockTenantService) CreateAPIKey(ctx context.Context, tenantID, name string) (*tenant.TenantAPIKey, string, error) {
	return nil, "", errors.New("not implemented")
}

func (m *mockTenantService) ValidateAPIKey(ctx context.Context, appID, rawSecret string) (*tenant.Tenant, error) {
	return nil, errors.New("not implemented")
}

func TestTenantMiddleware_Resolution(t *testing.T) {
	mockSvc := newMockTenantService()
	mw := api.NewTenantMiddleware(mockSvc)

	// 1. Resolusi via Header X-Tenant-ID
	t.Run("Resolves from X-Tenant-ID header", func(t *testing.T) {
		var capturedTenant string
		dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tc := tenantshared.MustFromContext(r.Context())
			capturedTenant = tc.TenantID()
			w.WriteHeader(http.StatusOK)
		})

		req := httptest.NewRequest(http.MethodGet, "/api/users/search", nil)
		req.Header.Set("X-Tenant-ID", "tenant_alpha")
		rec := httptest.NewRecorder()

		mw.Handler(dummyHandler).ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}
		if capturedTenant != "tenant_alpha" {
			t.Fatalf("expected captured tenant 'tenant_alpha', got '%s'", capturedTenant)
		}
	})

	// 2. Resolusi via JWT token claim
	t.Run("Resolves from JWT token claim when header is empty", func(t *testing.T) {
		tokenStr, _, err := auth.GenerateTokenDetailedWithTenant("user-1", "alice", "Alice", "tenant_alpha")
		if err != nil {
			t.Fatalf("failed to generate token: %v", err)
		}

		var capturedTenant string
		dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tc := tenantshared.MustFromContext(r.Context())
			capturedTenant = tc.TenantID()
			w.WriteHeader(http.StatusOK)
		})

		req := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
		req.Header.Set("Authorization", "Bearer "+tokenStr)
		rec := httptest.NewRecorder()

		mw.Handler(dummyHandler).ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}
		if capturedTenant != "tenant_alpha" {
			t.Fatalf("expected captured tenant 'tenant_alpha', got '%s'", capturedTenant)
		}
	})

	// 3. Fallback ke default saat tidak ada header & token
	t.Run("Falls back to default tenant when no header or token provided", func(t *testing.T) {
		var capturedTenant string
		dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tc := tenantshared.MustFromContext(r.Context())
			capturedTenant = tc.TenantID()
			w.WriteHeader(http.StatusOK)
		})

		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		rec := httptest.NewRecorder()

		mw.Handler(dummyHandler).ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}
		if capturedTenant != "default" {
			t.Fatalf("expected captured tenant 'default', got '%s'", capturedTenant)
		}
	})

	// 4. Tolak tenant inaktif dengan 403 Forbidden
	t.Run("Rejects inactive tenant with 403 Forbidden", func(t *testing.T) {
		dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})

		req := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
		req.Header.Set("X-Tenant-ID", "tenant_inactive")
		rec := httptest.NewRecorder()

		mw.Handler(dummyHandler).ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden, got %d", rec.Code)
		}
	})

	// 5. Tolak tenant tidak ditemukan dengan 403 Forbidden
	t.Run("Rejects non-existent tenant with 403 Forbidden", func(t *testing.T) {
		dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})

		req := httptest.NewRequest(http.MethodGet, "/api/conversations", nil)
		req.Header.Set("X-Tenant-ID", "non_existent_tenant")
		rec := httptest.NewRecorder()

		mw.Handler(dummyHandler).ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden, got %d", rec.Code)
		}
	})

	// 6. Preflight OPTIONS lewati tanpa validasi
	t.Run("Bypasses OPTIONS preflight requests", func(t *testing.T) {
		dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		})

		req := httptest.NewRequest(http.MethodOptions, "/api/conversations", nil)
		req.Header.Set("X-Tenant-ID", "non_existent_tenant")
		rec := httptest.NewRecorder()

		mw.Handler(dummyHandler).ServeHTTP(rec, req)

		if rec.Code != http.StatusNoContent {
			t.Fatalf("expected 204 No Content for OPTIONS, got %d", rec.Code)
		}
	})
}
