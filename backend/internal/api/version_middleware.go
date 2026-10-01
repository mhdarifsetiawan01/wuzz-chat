package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

// VersionMiddleware menegakkan batas versi minimal untuk klien mobile (Android & iOS).
// Mengembalikan HTTP 426 (StatusUpgradeRequired) jika versi aplikasi berada di bawah ambang batas.
type VersionMiddleware struct {
	minMobileBuild int
	playStoreURL   string
	appStoreURL    string
	apkURL         string
}

// UpdateRequiredResponse mendefinisikan bentuk JSON saat versi aplikasi usang.
type UpdateRequiredResponse struct {
	Code        int    `json:"code"`
	Error       string `json:"error"`
	Message     string `json:"message"`
	MinBuild    int    `json:"min_build"`
	ClientBuild int    `json:"client_build"`
	UpdateURL   string `json:"update_url,omitempty"`
}

// NewVersionMiddleware menginisialisasi middleware pelindung versi aplikasi.
func NewVersionMiddleware(minMobileBuild int, playStoreURL, appStoreURL string) *VersionMiddleware {
	return &VersionMiddleware{
		minMobileBuild: minMobileBuild,
		playStoreURL:   playStoreURL,
		appStoreURL:    appStoreURL,
	}
}

// WithAPKURL mengatur URL unduh untuk klien channel "apk" (sideload, bukan Play Store).
func (m *VersionMiddleware) WithAPKURL(url string) *VersionMiddleware {
	m.apkURL = strings.TrimSpace(url)
	return m
}

// ResolveUpdateURL memilih URL pembaruan menurut platform dan channel instalasi ("apk" | "play").
func ResolveUpdateURL(platform, channel, playStoreURL, appStoreURL, apkURL string) string {
	if platform == "ios" {
		return appStoreURL
	}
	if strings.EqualFold(strings.TrimSpace(channel), "apk") && strings.TrimSpace(apkURL) != "" {
		return strings.TrimSpace(apkURL)
	}
	return playStoreURL
}

func requestChannel(r *http.Request) string {
	if c := strings.TrimSpace(r.Header.Get("X-App-Channel")); c != "" {
		return c
	}
	return strings.TrimSpace(r.URL.Query().Get("app_channel"))
}

// Middleware membungkus http.Handler untuk memvalidasi header versi klien mobile.
func (m *VersionMiddleware) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Lewatkan rute health check dan dokumentasi API
		if r.URL.Path == "/health" || strings.HasPrefix(r.URL.Path, "/uploads/") || strings.HasPrefix(r.URL.Path, "/api/docs") || r.URL.Path == VersionInfoPath || r.URL.Path == "/api/openapi.yaml" {
			next.ServeHTTP(w, r)
			return
		}

		platform := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Device-Platform")))
		if platform == "" {
			platform = strings.ToLower(strings.TrimSpace(r.URL.Query().Get("platform")))
		}

		// Jika bukan mobile (misal: browser web atau request tanpa platform mobile), lewatkan langsung
		if platform != "android" && platform != "ios" {
			next.ServeHTTP(w, r)
			return
		}

		// Jika proteksi aktif (minMobileBuild > 0)
		if m.minMobileBuild > 0 {
			buildStr := strings.TrimSpace(r.Header.Get("X-App-Build"))
			if buildStr == "" {
				buildStr = strings.TrimSpace(r.URL.Query().Get("app_build"))
			}
			clientBuild, err := strconv.Atoi(buildStr)

			if err != nil || clientBuild < m.minMobileBuild {
				updateURL := ResolveUpdateURL(platform, requestChannel(r), m.playStoreURL, m.appStoreURL, m.apkURL)

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUpgradeRequired) // 426
				_ = json.NewEncoder(w).Encode(UpdateRequiredResponse{
					Code:        http.StatusUpgradeRequired,
					Error:       "APP_UPDATE_REQUIRED",
					Message:     "Versi aplikasi Anda sudah tidak didukung. Silakan perbarui aplikasi untuk melanjutkan.",
					MinBuild:    m.minMobileBuild,
					ClientBuild: clientBuild,
					UpdateURL:   updateURL,
				})
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// ValidateWSVersion memvalidasi versi klien mobile pada saat handshake WebSocket.
// Mengembalikan false jika aplikasi mobile usang dan harus ditolak handshake-nya.
func (m *VersionMiddleware) ValidateWSVersion(platform string, buildStr string) (bool, string) {
	platform = strings.ToLower(strings.TrimSpace(platform))
	if platform != "android" && platform != "ios" {
		return true, "" // web client lolos
	}

	if m.minMobileBuild <= 0 {
		return true, ""
	}

	clientBuild, err := strconv.Atoi(strings.TrimSpace(buildStr))
	if err != nil || clientBuild < m.minMobileBuild {
		updateURL := m.playStoreURL
		if platform == "ios" {
			updateURL = m.appStoreURL
		}
		return false, updateURL
	}

	return true, ""
}
