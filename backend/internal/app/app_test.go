package app

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

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
