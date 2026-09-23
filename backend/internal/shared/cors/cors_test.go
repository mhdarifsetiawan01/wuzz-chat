package cors

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSValidator_IsOriginAllowed(t *testing.T) {
	tests := []struct {
		name     string
		allowed  []string
		origin   string
		expected bool
	}{
		{
			name:     "Wildcard allows everything",
			allowed:  []string{"*"},
			origin:   "https://random-site.com",
			expected: true,
		},
		{
			name:     "Empty allows everything",
			allowed:  []string{},
			origin:   "https://random-site.com",
			expected: true,
		},
		{
			name:     "Exact match localhost",
			allowed:  []string{"http://localhost:3000", "http://localhost:3047", "https://wuzz-chat.vercel.app"},
			origin:   "http://localhost:3047",
			expected: true,
		},
		{
			name:     "Exact match production vercel",
			allowed:  []string{"http://localhost:3000", "http://localhost:3047", "https://wuzz-chat.vercel.app"},
			origin:   "https://wuzz-chat.vercel.app",
			expected: true,
		},
		{
			name:     "Reject unauthorized origin",
			allowed:  []string{"http://localhost:3000", "https://wuzz-chat.vercel.app"},
			origin:   "https://evil-attacker.com",
			expected: false,
		},
		{
			name:     "Wildcard subdomain match for Vercel preview URLs",
			allowed:  []string{"https://*.vercel.app"},
			origin:   "https://wuzz-chat-preview-git-dev.vercel.app",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v := NewCORSValidator(tt.allowed)
			res := v.IsOriginAllowed(tt.origin)
			if res != tt.expected {
				t.Errorf("Expected %v for origin '%s', got %v", tt.expected, tt.origin, res)
			}
		})
	}
}

func TestCORSValidator_Middleware(t *testing.T) {
	v := NewCORSValidator([]string{"http://localhost:3047", "https://wuzz-chat.vercel.app"})

	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("OK"))
	})

	handler := v.Middleware(dummyHandler)

	// 1. Valid origin request
	req1 := httptest.NewRequest("GET", "/api/test", nil)
	req1.Header.Set("Origin", "http://localhost:3047")
	rec1 := httptest.NewRecorder()
	handler.ServeHTTP(rec1, req1)

	if rec1.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3047" {
		t.Errorf("Expected Access-Control-Allow-Origin http://localhost:3047, got %s", rec1.Header().Get("Access-Control-Allow-Origin"))
	}

	// 2. Preflight OPTIONS request
	req2 := httptest.NewRequest("OPTIONS", "/api/test", nil)
	req2.Header.Set("Origin", "https://wuzz-chat.vercel.app")
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Errorf("Expected status 200 for OPTIONS, got %d", rec2.Code)
	}
	if rec2.Header().Get("Access-Control-Allow-Origin") != "https://wuzz-chat.vercel.app" {
		t.Errorf("Expected Access-Control-Allow-Origin https://wuzz-chat.vercel.app, got %s", rec2.Header().Get("Access-Control-Allow-Origin"))
	}
}
