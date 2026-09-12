package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/storage"
)

// MediaUploadResponse adalah struktur JSON respon saat file berhasil diunggah.
type MediaUploadResponse struct {
	URL       string `json:"url"`
	FileName  string `json:"file_name"`
	FileSize  int64  `json:"file_size"`
	MediaType string `json:"media_type"`
	MIMEType  string `json:"mime_type"`
}

// AppConfigResponse adalah struktur JSON konfigurasi publik untuk frontend.
type AppConfigResponse struct {
	MediaUploadEnabled bool   `json:"media_upload_enabled"`
	MaxFileSizeMB      int64  `json:"max_file_size_mb"`
	StorageDriver      string `json:"storage_driver"`
}

// MediaHandler menangani operasi pengunggahan berkas dan penyajian konfigurasi media.
type MediaHandler struct {
	storage       storage.MediaStorage
	enabled       bool
	maxFileSizeMB int64
}

// NewMediaHandler membuat instance baru MediaHandler dengan membaca environment variable.
func NewMediaHandler(mediaStorage storage.MediaStorage) *MediaHandler {
	// Fitur toggle on/off: Default true, jika diset "false" / "0" maka off
	enabledStr := strings.ToLower(os.Getenv("ENABLE_MEDIA_UPLOAD"))
	enabled := true
	if enabledStr == "false" || enabledStr == "0" || enabledStr == "off" {
		enabled = false
	}

	maxSize := int64(25) // Default 25 MB
	if envMax := os.Getenv("MAX_UPLOAD_SIZE_MB"); envMax != "" {
		if val, err := strconv.ParseInt(envMax, 10, 64); err == nil && val > 0 {
			maxSize = val
		}
	}

	return &MediaHandler{
		storage:       mediaStorage,
		enabled:       enabled,
		maxFileSizeMB: maxSize,
	}
}

// SetEnabled mengubah status aktif fitur upload (untuk dynamic toggling runtime / test).
func (h *MediaHandler) SetEnabled(enabled bool) {
	h.enabled = enabled
}

// Config menyajikan status fitur publik ke frontend.
func (h *MediaHandler) Config(w http.ResponseWriter, r *http.Request) {
	driverName := "none"
	if h.storage != nil {
		driverName = h.storage.DriverName()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(AppConfigResponse{
		MediaUploadEnabled: h.enabled,
		MaxFileSizeMB:      h.maxFileSizeMB,
		StorageDriver:      driverName,
	})
}

// Upload menerima multipart/form-data ("file") dan mengunggahnya ke storage engine.
func (h *MediaHandler) Upload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// 1. Validasi Dynamic Toggle
	if !h.enabled {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Fitur unggah media sedang dinonaktifkan oleh administrator.",
		})
		return
	}

	if h.storage == nil {
		http.Error(w, `{"error":"Media storage engine tidak terkonfigurasi"}`, http.StatusInternalServerError)
		return
	}

	// 2. Batasi ukuran maksimal request body
	maxBytes := h.maxFileSizeMB * 1024 * 1024
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)

	if err := r.ParseMultipartForm(maxBytes); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("Ukuran file melebihi batas maksimal (%d MB) atau format form tidak valid", h.maxFileSizeMB),
		})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Field 'file' wajib disertakan dalam form-data",
		})
		return
	}
	defer file.Close()

	// 3. Deteksi MIME type berbasis Magic Bytes
	buffer := make([]byte, 512)
	n, _ := file.Read(buffer)
	detectedMIME := http.DetectContentType(buffer[:n])

	// Kembalikan pointer pembacaan ke awal file
	if seeker, ok := file.(io.Seeker); ok {
		_, _ = seeker.Seek(0, io.SeekStart)
	}

	// Tentukan MIME type final (prioritaskan header jika browser mengirim MIME audio/video spesifik)
	finalMIME := detectedMIME
	if header.Header.Get("Content-Type") != "" && header.Header.Get("Content-Type") != "application/octet-stream" {
		headerMIME := header.Header.Get("Content-Type")
		// Jika sniffing mendeteksi octet-stream atau plain text tapi extension audio/video, gunakan header MIME
		if strings.HasPrefix(headerMIME, "audio/") || strings.HasPrefix(headerMIME, "video/") || strings.HasPrefix(headerMIME, "image/") {
			finalMIME = headerMIME
		}
	}

	// 4. Validasi Ekstensi & Keamanan
	ext := strings.ToLower(filepath.Ext(header.Filename))
	dangerousExts := map[string]bool{
		".exe": true, ".bat": true, ".cmd": true, ".sh": true, ".msi": true,
		".php": true, ".py": true, ".pl": true, ".cgi": true, ".jsp": true,
	}
	if dangerousExts[ext] {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Tipe file yang dapat dieksekusi (.exe, .sh, .bat, script) dilarang demi keamanan sistem.",
		})
		return
	}

	// 5. Klasifikasi MediaType
	mediaType := classifyMediaType(finalMIME, ext)

	// 6. Eksekusi Upload ke Storage Driver
	publicURL, err := h.storage.Upload(r.Context(), file, header.Filename, finalMIME)
	if err != nil {
		log.Printf("[MediaHandler] Gagal mengunggah file (%s): %v", header.Filename, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Gagal menyimpan file ke storage: " + err.Error(),
		})
		return
	}

	// 7. Berikan respon sukses
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(MediaUploadResponse{
		URL:       publicURL,
		FileName:  header.Filename,
		FileSize:  header.Size,
		MediaType: mediaType,
		MIMEType:  finalMIME,
	})
}

// classifyMediaType menentukan kategori media ('image', 'audio', 'video', 'document')
func classifyMediaType(mimeType string, ext string) string {
	lowerMIME := strings.ToLower(mimeType)
	lowerExt := strings.ToLower(ext)

	if strings.HasPrefix(lowerMIME, "image/") || lowerExt == ".jpg" || lowerExt == ".jpeg" || lowerExt == ".png" || lowerExt == ".webp" || lowerExt == ".gif" || lowerExt == ".svg" {
		return "image"
	}
	if strings.HasPrefix(lowerMIME, "audio/") || lowerExt == ".mp3" || lowerExt == ".wav" || lowerExt == ".ogg" || lowerExt == ".webm" || lowerExt == ".m4a" || lowerExt == ".aac" {
		return "audio"
	}
	if strings.HasPrefix(lowerMIME, "video/") || lowerExt == ".mp4" || lowerExt == ".webm" || lowerExt == ".mov" || lowerExt == ".avi" {
		return "video"
	}
	return "document"
}
