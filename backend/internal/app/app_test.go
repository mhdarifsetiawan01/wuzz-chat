package app

import (
	"bufio"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/shared/config"
)

func TestApplication_HealthCheck(t *testing.T) {
	// Set database memory mode untuk testing
	os.Setenv("DATABASE_URL", "")
	os.Setenv("DB_DRIVER", "memory")
	defer func() {
		os.Unsetenv("DB_DRIVER")
	}()

	cfg := &config.Config{
		Port:               "8080",
		CORSAllowedOrigins: "*",
		JWTSecret:          "test_secret",
		UploadDir:          "./uploads",
		MediaRetentionDays: 7,
		AuthRateLimitIP:    100,
		AuthRateLimitUser:  15,
	}

	application, err := New(cfg)
	if err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	defer application.Close()

	router := application.setupRouter()

	req, err := http.NewRequest("GET", "/health", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rr.Code)
	}
	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected application/json content-type, got %s", contentType)
	}
}

type dummyHijackWriter struct {
	*httptest.ResponseRecorder
	hijacked bool
	flushed  bool
}

func (d *dummyHijackWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	d.hijacked = true
	return nil, nil, nil
}

func (d *dummyHijackWriter) Flush() {
	d.flushed = true
}

func TestRequestLoggerMiddleware_HijackAndFlush(t *testing.T) {
	handler := requestLoggerMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hj, ok := w.(http.Hijacker)
		if !ok {
			t.Fatalf("expected response writer to implement http.Hijacker")
		}
		_, _, _ = hj.Hijack()

		fl, ok := w.(http.Flusher)
		if !ok {
			t.Fatalf("expected response writer to implement http.Flusher")
		}
		fl.Flush()

		w.WriteHeader(http.StatusTeapot)
		_, _ = w.Write([]byte("short and stout"))
	}))

	rec := &dummyHijackWriter{
		ResponseRecorder: httptest.NewRecorder(),
	}

	req, _ := http.NewRequest("GET", "/test-log", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.195, 70.41.3.18")
	req.Header.Set("User-Agent", "WuzzChat-Test-Agent/1.0")

	handler.ServeHTTP(rec, req)

	if !rec.hijacked {
		t.Errorf("expected Hijack to be called on underlying writer")
	}
	if !rec.flushed {
		t.Errorf("expected Flush to be called on underlying writer")
	}
	if rec.Code != http.StatusTeapot {
		t.Errorf("expected status 418, got %d", rec.Code)
	}
	if rec.Body.String() != "short and stout" {
		t.Errorf("expected body 'short and stout', got %q", rec.Body.String())
	}
}

// T6: guard tenant pada router harus aktif walau TenantService tidak terpasang (fail-closed terhadap salah wiring).
func TestRouter_TenantGuardActiveWithoutTenantService(t *testing.T) {
	os.Setenv("DATABASE_URL", "")
	os.Setenv("DB_DRIVER", "memory")
	defer os.Unsetenv("DB_DRIVER")

	cfg := &config.Config{
		Port: "8080", CORSAllowedOrigins: "*", JWTSecret: "test_secret", UploadDir: t.TempDir(),
		MediaRetentionDays: 7, AuthRateLimitIP: 100, AuthRateLimitUser: 15,
	}
	application, err := New(cfg)
	if err != nil {
		t.Fatalf("failed to create application: %v", err)
	}
	defer application.Close()
	application.TenantService = nil // simulasi wiring yang tidak menyuntikkan TenantService

	token, _, err := auth.GenerateTokenDetailedWithTenant("u-alpha", "alice", "Alice", "tenant_alpha")
	if err != nil {
		t.Fatalf("gagal membuat token: %v", err)
	}
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("X-Tenant-ID", "default")
	rr := httptest.NewRecorder()
	application.setupRouter().ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("LEAK! tanpa TenantService, mismatch header/token lolos (status=%d)", rr.Code)
	}
}

// Saklar MEMORY_WORKER_ENABLED=false harus memutus jalur AI Memory: worker pemroses (yang memanggil LLM) tidak dibuat,
// sedangkan handler baca/setujui draf tetap ada. Aktif (default) = worker dibuat.
func TestApplication_MemoryWorkerSwitch(t *testing.T) {
	for _, tc := range []struct {
		name     string
		disabled bool
	}{{"aktif", false}, {"nonaktif", true}} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("DATABASE_URL", "")
			t.Setenv("DB_DRIVER", "sqlite")
			t.Setenv("SQLITE_DB_PATH", t.TempDir()+"/memsw.db")

			cfg := &config.Config{
				Port: "8080", CORSAllowedOrigins: "*", JWTSecret: "test_secret", UploadDir: t.TempDir(),
				MediaRetentionDays: 7, AuthRateLimitIP: 100, AuthRateLimitUser: 15,
				MemoryWorkerInterval: time.Minute, MemoryWorkerDisabled: tc.disabled,
			}
			application, err := New(cfg)
			if err != nil {
				t.Fatalf("New: %v", err)
			}
			defer application.Close()

			if tc.disabled && application.MemoryWorker != nil {
				t.Fatal("MEMORY_WORKER_ENABLED=false: MemoryWorker tidak boleh dibuat (akan memanggil LLM)")
			}
			if !tc.disabled && application.MemoryWorker == nil {
				t.Fatal("default: MemoryWorker harus dibuat")
			}
			if application.MemoryHandler == nil {
				t.Fatal("handler baca/setujui draf harus tetap ada walau worker dimatikan")
			}
		})
	}
}
