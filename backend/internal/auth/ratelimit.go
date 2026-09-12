package auth

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// IPRateLimiter mengimplementasikan sliding window rate limiter berbasis alamat IP.
type IPRateLimiter struct {
	mu          sync.Mutex
	requests    map[string][]time.Time
	limit       int
	window      time.Duration
	lastCleanup time.Time
}

// NewIPRateLimiter membuat rate limiter baru dengan limit N request per window waktu.
func NewIPRateLimiter(limit int, window time.Duration) *IPRateLimiter {
	return &IPRateLimiter{
		requests:    make(map[string][]time.Time),
		limit:       limit,
		window:      window,
		lastCleanup: time.Now(),
	}
}

// Allow memeriksa apakah IP diizinkan membuat request baru.
func (rl *IPRateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()

	// Bersihkan riwayat lama secara berkala
	if now.Sub(rl.lastCleanup) > rl.window*2 {
		for k, timestamps := range rl.requests {
			var valid []time.Time
			for _, t := range timestamps {
				if now.Sub(t) <= rl.window {
					valid = append(valid, t)
				}
			}
			if len(valid) == 0 {
				delete(rl.requests, k)
			} else {
				rl.requests[k] = valid
			}
		}
		rl.lastCleanup = now
	}

	// Filter timestamp request dalam window aktif
	var recent []time.Time
	for _, t := range rl.requests[ip] {
		if now.Sub(t) <= rl.window {
			recent = append(recent, t)
		}
	}

	if len(recent) >= rl.limit {
		rl.requests[ip] = recent
		return false
	}

	recent = append(recent, now)
	rl.requests[ip] = recent
	return true
}

// GetClientIP mengekstrak IP client dari header X-Forwarded-For, X-Real-IP, atau RemoteAddr.
func GetClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		ip := strings.TrimSpace(parts[0])
		if ip != "" {
			return ip
		}
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// RateLimitMiddleware membungkus handler dengan rate limiter HTTP 429.
func RateLimitMiddleware(limiter *IPRateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := GetClientIP(r)
			if !limiter.Allow(ip) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				_, _ = w.Write([]byte(`{"error":"Terlalu banyak permintaan. Silakan coba beberapa saat lagi."}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
