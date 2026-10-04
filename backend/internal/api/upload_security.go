package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/shared/ratelimit"
)

// blockedUploadExts: ekstensi yang dapat dieksekusi / dirender sebagai konten aktif oleh browser atau OS.
// Sengaja konservatif agar tidak mengganggu tipe file sah yang sudah dipakai klien lama.
var blockedUploadExts = map[string]bool{
	".exe": true, ".bat": true, ".cmd": true, ".sh": true, ".msi": true,
	".php": true, ".py": true, ".pl": true, ".cgi": true, ".jsp": true,
	".html": true, ".htm": true, ".xhtml": true, ".shtml": true,
	".js": true, ".mjs": true, ".jar": true, ".hta": true, ".vbs": true,
	".ps1": true, ".scr": true, ".dll": true, ".com": true, ".lnk": true,
}

func isBlockedUploadExt(ext string) bool {
	return blockedUploadExts[strings.ToLower(ext)]
}

// feedImageExts: satu-satunya ekstensi yang boleh untuk lampiran feed (purpose=feed).
var feedImageExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true, ".heic": true, ".heif": true,
}

const uploadPurposeFeed = "feed"

// validateFeedImage memastikan file benar-benar gambar: ekstensi ada di allowlist DAN magic bytes cocok.
// head adalah awal file (maks 512 byte); MIME dari header klien sengaja diabaikan.
func validateFeedImage(ext string, head []byte) bool {
	ext = strings.ToLower(ext)
	if !feedImageExts[ext] {
		return false
	}
	if ext == ".heic" || ext == ".heif" {
		return len(head) >= 12 && string(head[4:8]) == "ftyp"
	}
	switch http.DetectContentType(head) {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
		return true
	}
	return false
}

// UserRateLimit membatasi request per user (fallback ke IP). Dipasang setelah RequireJWT.
func UserRateLimit(limiter *ratelimit.IPRateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := ratelimit.GetClientIP(r)
			if claims, ok := auth.GetUserFromContext(r.Context()); ok && claims != nil && claims.UserID != "" {
				key = claims.UserID
			}
			if !limiter.Allow(key) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "60")
				w.WriteHeader(http.StatusTooManyRequests)
				_, _ = w.Write([]byte(`{"error":"Terlalu banyak permintaan unggah, coba lagi sebentar lagi."}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// activeContentExts: tipe yang bisa menjalankan script bila dibuka browser pada origin kita.
var activeContentExts = map[string]bool{
	".html": true, ".htm": true, ".xhtml": true, ".shtml": true,
	".svg": true, ".svgz": true, ".xml": true, ".js": true, ".mjs": true, ".css": true,
}

// UploadsSecurityHeaders menambahkan header pengaman pada file statis /uploads/.
// nosniff berlaku untuk semua file; untuk konten aktif ditambah sandbox + attachment
// sehingga tidak pernah dirender inline (gambar/audio/video/pdf tetap normal).
func UploadsSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if activeContentExts[strings.ToLower(filepath.Ext(r.URL.Path))] {
			w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
			w.Header().Set("Content-Disposition", "attachment")
		}
		next.ServeHTTP(w, r)
	})
}

// uploadsFileSystem membungkus http.Dir agar direktori tidak pernah dilayani sebagai daftar isi.
// Tanpa ini http.FileServer menampilkan listing /uploads/ dan /uploads/<tenant>/, sehingga nama file
// acak (UUID) semua tenant bisa dienumerasi tanpa autentikasi.
type uploadsFileSystem struct {
	fs http.FileSystem
}

// NewUploadsFileSystem membuat http.FileSystem untuk /uploads/ yang hanya melayani file, bukan direktori.
func NewUploadsFileSystem(dir string) http.FileSystem {
	return uploadsFileSystem{fs: http.Dir(dir)}
}

func (u uploadsFileSystem) Open(name string) (http.File, error) {
	f, err := u.fs.Open(name)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, err
	}
	if info.IsDir() {
		_ = f.Close()
		return nil, os.ErrNotExist
	}
	return f, nil
}
