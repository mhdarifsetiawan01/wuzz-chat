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

// GetClientIP mengekstrak IP client secara dinamis & multi-cloud (Cloudflare, Fly.io, Nginx, AWS, dsb).
func GetClientIP(r *http.Request) string {
	// 1. Cloudflare header
	if cfIP := r.Header.Get("CF-Connecting-IP"); cfIP != "" {
		return strings.TrimSpace(cfIP)
	}
	// 2. Fly.io client IP header
	if flyIP := r.Header.Get("Fly-Client-IP"); flyIP != "" {
		return strings.TrimSpace(flyIP)
	}
	// 3. Akamai / Fastly / CDN True-Client-IP
	if trueIP := r.Header.Get("True-Client-IP"); trueIP != "" {
		return strings.TrimSpace(trueIP)
	}
	// 4. Nginx / Reverse Proxy Real IP
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	// 5. Standard X-Forwarded-For (ambil IP client paling awal)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		ip := strings.TrimSpace(parts[0])
		if ip != "" {
			return ip
		}
	}
	// 6. Direct TCP Remote Address
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
