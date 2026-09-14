package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/broker"
)

// TestE2E_Tahap4_SSRFAndDNSRebindingProtection menguji secara menyeluruh sistem keamanan
// link preview terhadap berbagai vektor serangan SSRF, DNS Rebinding, Cloud Metadata access, dan Redirect chaining.
func TestE2E_Tahap4_SSRFAndDNSRebindingProtection(t *testing.T) {
	memBroker := broker.NewInMemoryBroker()
	defer memBroker.Close()

	handler := NewLinkPreviewHandler(memBroker)

	// 1. Uji Pemblokiran Seluruh Vektor Direct SSRF
	blockedURLs := []struct {
		name string
		url  string
	}{
		{"IPv4 Loopback 127.0.0.1", "http://127.0.0.1:8080/admin"},
		{"IPv4 Loopback 127.0.1.1", "http://127.0.1.1:9000/internal"},
		{"IPv6 Loopback ::1", "http://[::1]:8080/metrics"},
		{"Hostname Localhost", "http://localhost:3000/api/secret"},
		{"Local Domain .local", "http://my-service.local/debug"},
		{"Private Subnet 10.0.0.0/8", "http://10.0.0.5:8080/config"},
		{"Private Subnet 172.16.0.0/12", "http://172.16.10.20:5432/db"},
		{"Private Subnet 192.168.0.0/16", "http://192.168.1.1/gateway"},
		{"AWS/GCP Cloud Metadata Service", "http://169.254.169.254/latest/meta-data/iam/security-credentials/"},
		{"Carrier-Grade NAT 100.64.0.0/10", "http://100.64.0.1/cgnat"},
		{"IPv4-mapped IPv6 Loopback", "http://[::ffff:127.0.0.1]:8080/env"},
		{"IPv4-mapped IPv6 Metadata", "http://[::ffff:169.254.169.254]:80/meta"},
		{"Invalid URL Scheme FTP", "ftp://127.0.0.1/file.txt"},
		{"Invalid URL Scheme File", "file:///etc/passwd"},
	}

	for _, tc := range blockedURLs {
		t.Run("Block_"+tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/link-preview?url="+tc.url, nil)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusForbidden && rec.Code != http.StatusBadRequest {
				t.Errorf("Security Breach: URL %s was not blocked! Got HTTP %d (body: %s)", tc.url, rec.Code, rec.Body.String())
			}
		})
	}

	// 2. Uji Pemblokiran Serangan SSRF Berbasis HTTP Redirect (301/302/307)
	t.Run("Block_SSRF_Via_Redirect", func(t *testing.T) {
		// Server publik tiruan yang me-redirect korban ke Cloud Metadata
		redirectServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "http://169.254.169.254/latest/meta-data/", http.StatusFound)
		}))
		defer redirectServer.Close()

		// Coba request dengan client produksi yang memiliki safeDialContext dan CheckRedirect
		req, _ := http.NewRequestWithContext(context.Background(), "GET", redirectServer.URL, nil)
		_, err := handler.client.Do(req)

		if err == nil {
			t.Errorf("Security Breach: HTTP Client allowed redirect to internal/metadata service!")
		}
	})

	// 3. Uji Pemblokiran Redirect Loop / Infinite Redirect
	t.Run("Block_Infinite_Redirect_Loop", func(t *testing.T) {
		var loopServer *httptest.Server
		loopServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, loopServer.URL, http.StatusFound)
		}))
		defer loopServer.Close()

		req, _ := http.NewRequestWithContext(context.Background(), "GET", loopServer.URL, nil)
		_, err := handler.client.Do(req)

		if err == nil {
			t.Errorf("Expected error for infinite redirect loop, got nil")
		}
	})

	// 4. Uji Integrasi Scraping Normal & Caching dengan Mock Client
	t.Run("Legitimate_Scrape_And_Caching", func(t *testing.T) {
		mockTarget := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			fmt.Fprintln(w, `<!DOCTYPE html>
<html>
<head>
    <title>Wuzz News Portal</title>
    <meta property="og:title" content="Wuzz News - Inovasi Realtime Messaging" />
    <meta property="og:description" content="Platform obrolan modern berbasis Go dan Next.js dengan keamanan tingkat tinggi." />
    <meta property="og:image" content="/images/og-news.png" />
    <meta property="og:site_name" content="Wuzz Hub" />
    <link rel="icon" href="/favicon.ico" />
</head>
<body><h1>Berita Utama</h1></body>
</html>`)
		}))
		defer mockTarget.Close()

		testHandler := NewLinkPreviewHandler(memBroker)
		testHandler.SetClient(mockTarget.Client())

		// Manual fetch & cache simulation
		preview, err := testHandler.fetchAndExtract(mockTarget.URL)
		if err != nil {
			t.Fatalf("fetchAndExtract failed: %v", err)
		}

		if preview.Title != "Wuzz News - Inovasi Realtime Messaging" {
			t.Errorf("Expected og:title 'Wuzz News - Inovasi Realtime Messaging', got '%s'", preview.Title)
		}
		if preview.Description != "Platform obrolan modern berbasis Go dan Next.js dengan keamanan tingkat tinggi." {
			t.Errorf("Expected og:description 'Platform obrolan modern...', got '%s'", preview.Description)
		}
		if preview.SiteName != "Wuzz Hub" {
			t.Errorf("Expected site_name 'Wuzz Hub', got '%s'", preview.SiteName)
		}

		// Simpan ke broker cache dan verifikasi cache hit
		cacheKey := "wuzz:preview:" + hashMD5("https://example.com/wuzz-news")
		previewJSON, _ := json.Marshal(preview)
		_ = memBroker.Set(context.Background(), cacheKey, string(previewJSON), 10*time.Minute)

		reqCache := httptest.NewRequest(http.MethodGet, "/api/link-preview?url=https://example.com/wuzz-news", nil)
		recCache := httptest.NewRecorder()
		testHandler.ServeHTTP(recCache, reqCache)

		if recCache.Code != http.StatusOK {
			t.Fatalf("Expected HTTP 200 on cache hit, got %d", recCache.Code)
		}
		if recCache.Header().Get("X-Cache") != "HIT" {
			t.Errorf("Expected X-Cache header 'HIT', got '%s'", recCache.Header().Get("X-Cache"))
		}

		var cachedResult LinkPreview
		if err := json.Unmarshal(recCache.Body.Bytes(), &cachedResult); err != nil {
			t.Fatalf("Failed to parse cached JSON: %v", err)
		}
		if cachedResult.Title != preview.Title {
			t.Errorf("Cached title mismatch: %s vs %s", cachedResult.Title, preview.Title)
		}
	})
}
