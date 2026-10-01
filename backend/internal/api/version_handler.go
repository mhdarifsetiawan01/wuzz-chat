package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

// VersionInfoPath adalah endpoint publik info versi aplikasi mobile.
// Dikecualikan dari VersionMiddleware agar aplikasi usang tetap bisa menanyakan versi terbaru.
const VersionInfoPath = "/api/app/version"

// VersionInfoHandler melayani info pembaruan aplikasi mobile (banner "Pembaruan tersedia").
type VersionInfoHandler struct {
	minBuild      int
	latestBuild   int
	latestVersion string
	releaseNotes  string
	playStoreURL  string
	appStoreURL   string
	apkURL        string
}

// VersionInfoResponse adalah bentuk JSON info versi untuk klien.
type VersionInfoResponse struct {
	MinBuild      int    `json:"min_build"`
	LatestBuild   int    `json:"latest_build"`
	LatestVersion string `json:"latest_version,omitempty"`
	DownloadURL   string `json:"download_url,omitempty"`
	ReleaseNotes  string `json:"release_notes,omitempty"`
}

// NewVersionInfoHandler membuat handler. latestBuild < minBuild dikoreksi ke minBuild
// agar konfigurasi yang salah tidak memunculkan info yang tidak masuk akal.
func NewVersionInfoHandler(minBuild, latestBuild int, latestVersion, releaseNotes, playStoreURL, appStoreURL, apkURL string) *VersionInfoHandler {
	if latestBuild < minBuild {
		latestBuild = minBuild
	}
	return &VersionInfoHandler{
		minBuild:      minBuild,
		latestBuild:   latestBuild,
		latestVersion: strings.TrimSpace(latestVersion),
		releaseNotes:  strings.TrimSpace(releaseNotes),
		playStoreURL:  playStoreURL,
		appStoreURL:   appStoreURL,
		apkURL:        apkURL,
	}
}

func (h *VersionInfoHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method tidak diizinkan"}`, http.StatusMethodNotAllowed)
		return
	}

	platform := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("platform")))
	if platform != "ios" {
		platform = "android"
	}
	channel := r.URL.Query().Get("channel")

	w.Header().Set("Content-Type", "application/json")
	// Cache singkat: ringan untuk banyak klien, tetapi rilis baru cepat terlihat
	w.Header().Set("Cache-Control", "public, max-age=300")
	_ = json.NewEncoder(w).Encode(VersionInfoResponse{
		MinBuild:      h.minBuild,
		LatestBuild:   h.latestBuild,
		LatestVersion: h.latestVersion,
		DownloadURL:   ResolveUpdateURL(platform, channel, h.playStoreURL, h.appStoreURL, h.apkURL),
		ReleaseNotes:  h.releaseNotes,
	})
}
