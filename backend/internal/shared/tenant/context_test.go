package tenant_test

import (
	"context"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/shared/tenant"
)

func TestTenantContext_Basics(t *testing.T) {
	t.Run("DefaultTenant initialization", func(t *testing.T) {
		tc := tenant.DefaultTenant()
		if tc.TenantID() != tenant.DefaultTenantID {
			t.Errorf("expected tenant ID %q, got %q", tenant.DefaultTenantID, tc.TenantID())
		}
		if !tc.IsDefault() {
			t.Errorf("expected IsDefault() to be true, got false")
		}
	})

	t.Run("NewTenantContext with empty or whitespace fallback to default", func(t *testing.T) {
		tcEmpty := tenant.NewTenantContext("")
		if tcEmpty.TenantID() != tenant.DefaultTenantID {
			t.Errorf("expected %q, got %q", tenant.DefaultTenantID, tcEmpty.TenantID())
		}
		if !tcEmpty.IsDefault() {
			t.Errorf("expected IsDefault() to be true")
		}

		tcSpace := tenant.NewTenantContext("   ")
		if tcSpace.TenantID() != tenant.DefaultTenantID {
			t.Errorf("expected %q, got %q", tenant.DefaultTenantID, tcSpace.TenantID())
		}
		if !tcSpace.IsDefault() {
			t.Errorf("expected IsDefault() to be true")
		}
	})

	t.Run("NewTenantContext with specific tenant ID", func(t *testing.T) {
		tc := tenant.NewTenantContext("tenant-alpha")
		if tc.TenantID() != "tenant-alpha" {
			t.Errorf("expected 'tenant-alpha', got %q", tc.TenantID())
		}
		if tc.IsDefault() {
			t.Errorf("expected IsDefault() to be false")
		}
	})

	t.Run("Zero value TenantContext fallback to default", func(t *testing.T) {
		var tcZero tenant.TenantContext
		if tcZero.TenantID() != tenant.DefaultTenantID {
			t.Errorf("expected %q, got %q", tenant.DefaultTenantID, tcZero.TenantID())
		}
		if !tcZero.IsDefault() {
			t.Errorf("expected IsDefault() to be true")
		}
	})
}

func TestTenantContext_ContextPropagation(t *testing.T) {
	t.Run("WithTenant and FromContext", func(t *testing.T) {
		ctx := tenant.WithTenant(context.Background(), "acme-corp")
		tc, ok := tenant.FromContext(ctx)
		if !ok {
			t.Fatalf("expected FromContext to return true, got false")
		}
		if tc.TenantID() != "acme-corp" {
			t.Errorf("expected 'acme-corp', got %q", tc.TenantID())
		}
		if tc.IsDefault() {
			t.Errorf("expected IsDefault() to be false")
		}

		must := tenant.MustFromContext(ctx)
		if must.TenantID() != "acme-corp" {
			t.Errorf("expected 'acme-corp', got %q", must.TenantID())
		}
	})

	t.Run("WithTenantContext", func(t *testing.T) {
		tcOriginal := tenant.NewTenantContext("enterprise-1")
		ctx := tenant.WithTenantContext(context.Background(), tcOriginal)
		tcExtracted, ok := tenant.FromContext(ctx)
		if !ok {
			t.Fatalf("expected FromContext to return true")
		}
		if tcExtracted.TenantID() != "enterprise-1" {
			t.Errorf("expected 'enterprise-1', got %q", tcExtracted.TenantID())
		}

		// With zero-value TenantContext
		var zeroTc tenant.TenantContext
		ctxZero := tenant.WithTenantContext(context.Background(), zeroTc)
		tcZeroExtracted, okZero := tenant.FromContext(ctxZero)
		if !okZero {
			t.Fatalf("expected FromContext to return true for zeroTc converted to default")
		}
		if tcZeroExtracted.TenantID() != tenant.DefaultTenantID {
			t.Errorf("expected default tenant ID, got %q", tcZeroExtracted.TenantID())
		}
	})

	t.Run("FromContext with nil context or empty context", func(t *testing.T) {
		tcNil, okNil := tenant.FromContext(nil)
		if okNil {
			t.Errorf("expected ok to be false for nil context")
		}
		if tcNil.TenantID() != tenant.DefaultTenantID {
			t.Errorf("expected default tenant ID, got %q", tcNil.TenantID())
		}

		tcBg, okBg := tenant.FromContext(context.Background())
		if okBg {
			t.Errorf("expected ok to be false for background context")
		}
		if tcBg.TenantID() != tenant.DefaultTenantID {
			t.Errorf("expected default tenant ID, got %q", tcBg.TenantID())
		}

		must := tenant.MustFromContext(context.Background())
		if must.TenantID() != tenant.DefaultTenantID {
			t.Errorf("expected default tenant ID, got %q", must.TenantID())
		}
	})
}
