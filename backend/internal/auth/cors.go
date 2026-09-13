package auth

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// CORSValidator mengelola daftar domain origin yang diizinkan untuk REST API dan WebSocket handshake.
type CORSValidator struct {
	allowedOrigins []string
	allowAll       bool
}

// NewCORSValidator membuat CORSValidator dari list string origins.
func NewCORSValidator(origins []string) *CORSValidator {
	for _, o := range origins {
		if strings.TrimSpace(o) == "*" {
			return &CORSValidator{allowAll: true}
		}
	}
	var clean []string
	for _, o := range origins {
		t := strings.ToLower(strings.TrimSpace(o))
		if t != "" {
			clean = append(clean, t)
		}
	}
	return &CORSValidator{
		allowedOrigins: clean,
		allowAll:       len(clean) == 0,
	}
}

// NewCORSValidatorFromEnv membuat CORSValidator dari env CORS_ALLOWED_ORIGINS atau CORS_ALLOWED_ORIGIN.
func NewCORSValidatorFromEnv() *CORSValidator {
	raw := os.Getenv("CORS_ALLOWED_ORIGINS")
	if raw == "" {
		raw = os.Getenv("CORS_ALLOWED_ORIGIN")
	}
	if raw == "" || strings.TrimSpace(raw) == "*" {
		return &CORSValidator{allowAll: true}
	}

	var origins []string
	for _, part := range strings.Split(raw, ",") {
		clean := strings.TrimSpace(part)
		if clean != "" {
			if clean == "*" {
				return &CORSValidator{allowAll: true}
			}
			origins = append(origins, strings.ToLower(clean))
		}
	}

	return &CORSValidator{
		allowedOrigins: origins,
		allowAll:       false,
	}
}

// IsOriginAllowed memeriksa apakah origin yang diberikan diizinkan (mendukung exact match & wildcard subdomain).
func (c *CORSValidator) IsOriginAllowed(origin string) bool {
	if c.allowAll || origin == "" {
		return true
	}

	originLower := strings.ToLower(strings.TrimSpace(origin))
	for _, pattern := range c.allowedOrigins {
		if pattern == originLower {
			return true
		}
		// Dukung wildcard domain seperti https://*.vercel.app
		if strings.Contains(pattern, "*") {
			if matched, _ := filepath.Match(pattern, originLower); matched {
				return true
			}
		}
	}

	return false
}

// CheckWebSocketOrigin adalah fungsi helper untuk websocket.Upgrader.CheckOrigin.
func (c *CORSValidator) CheckWebSocketOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	return c.IsOriginAllowed(origin)
}

// Middleware membuat HTTP middleware untuk menangani CORS header secara dinamis.
func (c *CORSValidator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if c.allowAll {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if origin != "" && c.IsOriginAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
