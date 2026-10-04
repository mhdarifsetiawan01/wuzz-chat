package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// T1: pendaftaran publik hanya untuk tenant default. Tenant B2B hanya menerima user lewat provisioning.
func TestAuthHandler_RegisterClosedForNonDefaultTenant(t *testing.T) {
	sqlStore, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "reg_tenant.db"))
	if err != nil {
		t.Fatalf("gagal init SQLite store: %v", err)
	}
	defer sqlStore.Close()
	handler := NewAuthHandler(store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName()))

	register := func(tenantID, username string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]string{"username": username, "password": "password123"})
		req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(body))
		if tenantID != "" {
			req = req.WithContext(tenantshared.WithTenant(req.Context(), tenantID))
		}
		rec := httptest.NewRecorder()
		handler.Register(rec, req)
		return rec
	}

	if rec := register("tenant_alpha", "intruder"); rec.Code != http.StatusForbidden {
		t.Fatalf("LEAK! register publik ke tenant non-default lolos, status=%d body=%s", rec.Code, rec.Body.String())
	}
	if rec := register("default", "warga_default"); rec.Code != http.StatusCreated {
		t.Fatalf("register tenant default harus tetap berjalan, status=%d body=%s", rec.Code, rec.Body.String())
	}
	if rec := register("", "warga_tanpa_ctx"); rec.Code != http.StatusCreated {
		t.Fatalf("register tanpa tenant context harus fallback default, status=%d body=%s", rec.Code, rec.Body.String())
	}
}
