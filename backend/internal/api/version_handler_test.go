package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
)

func TestVersionInfoHandler(t *testing.T) {
	h := api.NewVersionInfoHandler(3, 10, "1.6.0", "", "https://play/x", "https://apple/x", "https://drive/apk")

	get := func(query string) api.VersionInfoResponse {
		req := httptest.NewRequest(http.MethodGet, api.VersionInfoPath+query, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		var out api.VersionInfoResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}

	if out := get("?platform=android&channel=apk"); out.DownloadURL != "https://drive/apk" || out.LatestBuild != 10 || out.MinBuild != 3 {
		t.Fatalf("apk channel salah: %+v", out)
	}
	if out := get("?platform=android&channel=play"); out.DownloadURL != "https://play/x" {
		t.Fatalf("play channel salah: %+v", out)
	}
	if out := get("?platform=ios"); out.DownloadURL != "https://apple/x" {
		t.Fatalf("ios salah: %+v", out)
	}

	t.Run("latest di bawah min dikoreksi", func(t *testing.T) {
		bad := api.NewVersionInfoHandler(5, 2, "", "", "p", "a", "")
		rec := httptest.NewRecorder()
		bad.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, api.VersionInfoPath, nil))
		var out api.VersionInfoResponse
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		if out.LatestBuild != 5 {
			t.Fatalf("expected latest 5, got %d", out.LatestBuild)
		}
	})

	t.Run("endpoint lolos middleware untuk klien usang", func(t *testing.T) {
		vm := api.NewVersionMiddleware(9, "p", "a")
		req := httptest.NewRequest(http.MethodGet, api.VersionInfoPath, nil)
		req.Header.Set("X-Device-Platform", "android")
		req.Header.Set("X-App-Build", "1")
		rec := httptest.NewRecorder()
		vm.Middleware(h).ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("426 memakai URL APK untuk channel apk", func(t *testing.T) {
		vm := api.NewVersionMiddleware(9, "https://play/x", "a").WithAPKURL("https://drive/apk")
		req := httptest.NewRequest(http.MethodGet, "/api/chat/messages", nil)
		req.Header.Set("X-Device-Platform", "android")
		req.Header.Set("X-App-Build", "1")
		req.Header.Set("X-App-Channel", "apk")
		rec := httptest.NewRecorder()
		vm.Middleware(http.NotFoundHandler()).ServeHTTP(rec, req)
		var out api.UpdateRequiredResponse
		_ = json.Unmarshal(rec.Body.Bytes(), &out)
		if rec.Code != http.StatusUpgradeRequired || out.UpdateURL != "https://drive/apk" {
			t.Fatalf("got %d %+v", rec.Code, out)
		}
	})
}
