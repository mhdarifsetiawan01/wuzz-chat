package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
)

func TestVersionMiddleware(t *testing.T) {
	dummyNext := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	vm := api.NewVersionMiddleware(2, "https://play.google.com/store/apps/details?id=com.wuzzchat.mobile", "https://apps.apple.com/app/wuzz-chat/id123")
	handler := vm.Middleware(dummyNext)

	t.Run("Web request should pass regardless of build header", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/chat/messages", nil)
		req.Header.Set("X-Device-Platform", "web")
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected HTTP 200, got %d", rec.Code)
		}
	})

	t.Run("Mobile Android with build equal or above minBuild should pass", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/chat/messages", nil)
		req.Header.Set("X-Device-Platform", "android")
		req.Header.Set("X-App-Build", "2")
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected HTTP 200, got %d", rec.Code)
		}
	})

	t.Run("Mobile Android with build below minBuild should return 426 Upgrade Required", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/chat/messages", nil)
		req.Header.Set("X-Device-Platform", "android")
		req.Header.Set("X-App-Build", "1")
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusUpgradeRequired {
			t.Fatalf("expected HTTP 426, got %d", rec.Code)
		}

		var resp api.UpdateRequiredResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode JSON response: %v", err)
		}

		if resp.Error != "APP_UPDATE_REQUIRED" {
			t.Fatalf("expected error APP_UPDATE_REQUIRED, got %s", resp.Error)
		}
		if resp.MinBuild != 2 {
			t.Fatalf("expected MinBuild 2, got %d", resp.MinBuild)
		}
		if resp.UpdateURL != "https://play.google.com/store/apps/details?id=com.wuzzchat.mobile" {
			t.Fatalf("expected PlayStore URL, got %s", resp.UpdateURL)
		}
	})

	t.Run("Mobile iOS with missing or invalid build should return 426 with AppStore URL", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/chat/messages", nil)
		req.Header.Set("X-Device-Platform", "ios")
		req.Header.Set("X-App-Build", "invalid")
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusUpgradeRequired {
			t.Fatalf("expected HTTP 426, got %d", rec.Code)
		}

		var resp api.UpdateRequiredResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode JSON response: %v", err)
		}

		if resp.UpdateURL != "https://apps.apple.com/app/wuzz-chat/id123" {
			t.Fatalf("expected AppStore URL, got %s", resp.UpdateURL)
		}
	})

	t.Run("Health and public docs routes should be exempt from version check", func(t *testing.T) {
		paths := []string{"/health", "/uploads/photo.jpg", "/api/docs", "/api/openapi.yaml"}
		for _, p := range paths {
			req := httptest.NewRequest(http.MethodGet, p, nil)
			req.Header.Set("X-Device-Platform", "android")
			req.Header.Set("X-App-Build", "0") // obsolete
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("path %s should be exempt, got %d", p, rec.Code)
			}
		}
	})
}

func TestValidateWSVersion(t *testing.T) {
	vm := api.NewVersionMiddleware(2, "https://play.google.com", "https://apple.com")

	valid, _ := vm.ValidateWSVersion("web", "0")
	if !valid {
		t.Fatal("web should always be valid")
	}

	valid, _ = vm.ValidateWSVersion("android", "2")
	if !valid {
		t.Fatal("android with build 2 should be valid")
	}

	valid, updateURL := vm.ValidateWSVersion("android", "1")
	if valid {
		t.Fatal("android with build 1 should be invalid")
	}
	if updateURL != "https://play.google.com" {
		t.Fatalf("expected play store url, got %s", updateURL)
	}

	valid, updateURL = vm.ValidateWSVersion("ios", "0")
	if valid {
		t.Fatal("ios with build 0 should be invalid")
	}
	if updateURL != "https://apple.com" {
		t.Fatalf("expected apple store url, got %s", updateURL)
	}
}

func TestVersionMiddleware_LiveHTTPServer(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/chat/messages", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"messages":[]}`))
	})

	vm := api.NewVersionMiddleware(1, "https://play.google.com/store/apps/details?id=com.wuzzchat.mobile", "https://apps.apple.com/app/wuzz-chat/id123")
	server := httptest.NewServer(vm.Middleware(mux))
	defer server.Close()

	client := &http.Client{}

	// Skenario 1: Web Request -> 200 OK
	reqWeb, _ := http.NewRequest(http.MethodGet, server.URL+"/api/chat/messages", nil)
	reqWeb.Header.Set("X-Device-Platform", "web")
	resWeb, err := client.Do(reqWeb)
	if err != nil {
		t.Fatalf("failed web request: %v", err)
	}
	defer resWeb.Body.Close()
	if resWeb.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for web, got %d", resWeb.StatusCode)
	}

	// Skenario 2: Mobile Android tanpa build -> 426 Upgrade Required
	reqMobNoBuild, _ := http.NewRequest(http.MethodGet, server.URL+"/api/chat/messages", nil)
	reqMobNoBuild.Header.Set("X-Device-Platform", "android")
	resMobNoBuild, err := client.Do(reqMobNoBuild)
	if err != nil {
		t.Fatalf("failed mobile request: %v", err)
	}
	defer resMobNoBuild.Body.Close()
	if resMobNoBuild.StatusCode != http.StatusUpgradeRequired {
		t.Fatalf("expected 426 for mobile without build, got %d", resMobNoBuild.StatusCode)
	}

	// Skenario 3: Mobile Android dengan build valid (Build: 1) -> 200 OK
	reqMobValid, _ := http.NewRequest(http.MethodGet, server.URL+"/api/chat/messages", nil)
	reqMobValid.Header.Set("X-Device-Platform", "android")
	reqMobValid.Header.Set("X-App-Build", "1")
	reqMobValid.Header.Set("X-App-Version", "1.0.0")
	resMobValid, err := client.Do(reqMobValid)
	if err != nil {
		t.Fatalf("failed mobile valid request: %v", err)
	}
	defer resMobValid.Body.Close()
	if resMobValid.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for mobile build 1, got %d", resMobValid.StatusCode)
	}
}

