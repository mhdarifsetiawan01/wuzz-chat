package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/storage"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// MediaUploadResponse adalah struktur JSON respon saat file berhasil diunggah.
type MediaUploadResponse struct {
	URL       string `json:"url"`
	FileName  string `json:"file_name"`
	FileSize  int64  `json:"file_size"`
	MediaType string `json:"media_type"`
	MIMEType  string `json:"mime_type"`
}

// SignedUploadURLRequest adalah struktur request JSON untuk meminta tiket direct signed upload.
type SignedUploadURLRequest struct {
	FileName string `json:"file_name"`
	FileSize int64  `json:"file_size"`
	MIMEType string `json:"mime_type"`
	// ThumbSize: ukuran thumbnail JPEG (byte). Wajib untuk purpose=video pada driver yang mendukung thumbnail.
	ThumbSize int64 `json:"thumb_size,omitempty"`
}

// SignedUploadURLResponse adalah struktur response JSON tiket direct signed upload.
type SignedUploadURLResponse struct {
	SignedURL string `json:"signed_url"`
	PublicURL string `json:"public_url"`
	ObjectKey string `json:"object_key"`
	Token     string `json:"token"`
	// Hanya untuk purpose=video: tiket unggah thumbnail. URL publiknya selalu sama dengan media_url video dengan
	// ekstensi diganti ".thumb.jpg", sehingga tidak disimpan di database.
	ThumbSignedURL string `json:"thumb_signed_url,omitempty"`
	ThumbPublicURL string `json:"thumb_public_url,omitempty"`
}

// AppConfigResponse adalah struktur JSON konfigurasi publik untuk frontend.
type AppConfigResponse struct {
	MediaUploadEnabled   bool   `json:"media_upload_enabled"`
	MaxFileSizeMB        int64  `json:"max_file_size_mb"`
	MaxVideoSizeMB       int64  `json:"max_video_size_mb"`
	MaxVideoDurationSec  int    `json:"max_video_duration_seconds"`
	StorageDriver        string `json:"storage_driver"`
	MediaRetentionDays   int    `json:"media_retention_days"`
	AutoDeleteOnDownload bool   `json:"auto_delete_on_download"`
}

// MediaAckRequest payload untuk konfirmasi download file oleh client.
type MediaAckRequest struct {
	MessageID string `json:"message_id"`
	RoomID    string `json:"room_id,omitempty"`
}

// MediaHandler menangani operasi pengunggahan berkas, konfirmasi unduhan (ACK), dan penyajian konfigurasi media.
type MediaHandler struct {
	storage              storage.MediaStorage
	msgStore             store.MessageStore
	userStore            store.UserStore
	enabled              bool
	maxFileSizeMB        int64
	maxVideoSizeMB       int64
	maxVideoDurationSec  int
	retentionDays        int
	autoDeleteOnDownload bool
}

// NewMediaHandler membuat instance baru MediaHandler dengan membaca environment variable.
func NewMediaHandler(mediaStorage storage.MediaStorage, msgStore store.MessageStore) *MediaHandler {
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

	maxVideoSize := int64(25) // Default 25 MB per video
	if envMax := os.Getenv("MAX_VIDEO_UPLOAD_MB"); envMax != "" {
		if val, err := strconv.ParseInt(envMax, 10, 64); err == nil && val > 0 {
			maxVideoSize = val
		}
	}
	maxVideoDuration := 60 // Default 60 detik (ditegakkan klien; server hanya menyajikan nilainya)
	if envDur := os.Getenv("MAX_VIDEO_DURATION_SEC"); envDur != "" {
		if val, err := strconv.Atoi(envDur); err == nil && val > 0 {
			maxVideoDuration = val
		}
	}

	retentionDays := 7 // Default TTL 7 hari
	if envRetention := os.Getenv("MEDIA_RETENTION_DAYS"); envRetention != "" {
		if val, err := strconv.Atoi(envRetention); err == nil && val >= 0 {
			retentionDays = val
		}
	}

	autoDelete := true // Default auto delete setelah diunduh (WhatsApp Store-and-Forward)
	if envAutoDel := strings.ToLower(os.Getenv("MEDIA_AUTO_DELETE_ON_DOWNLOAD")); envAutoDel == "false" || envAutoDel == "0" {
		autoDelete = false
	}

	return &MediaHandler{
		storage:              mediaStorage,
		msgStore:             msgStore,
		enabled:              enabled,
		maxFileSizeMB:        maxSize,
		maxVideoSizeMB:       maxVideoSize,
		maxVideoDurationSec:  maxVideoDuration,
		retentionDays:        retentionDays,
		autoDeleteOnDownload: autoDelete,
	}
}

// SetUserStore menyuntikkan UserStore untuk validasi otorisasi anggota percakapan.
func (h *MediaHandler) SetUserStore(us store.UserStore) {
	h.userStore = us
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
		MediaUploadEnabled:   h.enabled,
		MaxFileSizeMB:        h.maxFileSizeMB,
		MaxVideoSizeMB:       h.maxVideoSizeMB,
		MaxVideoDurationSec:  h.maxVideoDurationSec,
		StorageDriver:        driverName,
		MediaRetentionDays:   h.retentionDays,
		AutoDeleteOnDownload: h.autoDeleteOnDownload,
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

	// 1b. Driver yang mewajibkan direct upload (R2) menolak relay lewat VPS sebelum membaca body.
	if rd, ok := h.storage.(interface{ RelayUploadDisabled() bool }); ok && rd.RelayUploadDisabled() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusGone)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Unggah lewat server tidak tersedia. Perbarui aplikasi atau coba lagi (unggah langsung ke penyimpanan).",
		})
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
		if strings.HasPrefix(headerMIME, "audio/") || strings.HasPrefix(headerMIME, "video/") || strings.HasPrefix(headerMIME, "image/") {
			finalMIME = headerMIME
		}
	}

	// 4. Validasi Ekstensi & Keamanan
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if isBlockedUploadExt(ext) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Tipe file yang dapat dieksekusi (.exe, .sh, .bat, script) dilarang demi keamanan sistem.",
		})
		return
	}

	// 4b. Lampiran feed (purpose=feed, klien baru): hanya gambar asli, divalidasi via magic bytes.
	// Klien lama tidak mengirim purpose sehingga perilakunya tidak berubah.
	if r.URL.Query().Get("purpose") == uploadPurposeFeed && !validateFeedImage(ext, buffer[:n]) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Lampiran postingan hanya boleh berupa gambar (JPG, PNG, WebP, GIF, HEIC).",
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
	userTagLegacy := "anonymous"
	if claims, ok := auth.GetUserFromContext(r.Context()); ok && claims != nil && claims.Username != "" {
		userTagLegacy = fmt.Sprintf("%s (%s)", claims.Username, claims.UserID)
	}
	log.Printf("⚠️ [LegacyUpload] User=%s mengunggah via relay VPS (1x Egress): %s (%d bytes) -> %s", userTagLegacy, header.Filename, header.Size, publicURL)

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

// CreateSignedUploadURL menerbitkan tiket signed URL berbatas waktu untuk direct upload dari client ke Supabase Storage (0 MB Egress VPS).
func (h *MediaHandler) CreateSignedUploadURL(w http.ResponseWriter, r *http.Request) {
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

	// 2. Decode JSON body
	var req SignedUploadURLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.FileName) == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Request body tidak valid atau field 'file_name' kosong",
		})
		return
	}

	// 3. Validasi batas ukuran file (MAX_UPLOAD_SIZE_MB; video: MAX_VIDEO_UPLOAD_MB)
	isVideo := r.URL.Query().Get("purpose") == uploadPurposeVideo
	limitMB := h.maxFileSizeMB
	if isVideo {
		limitMB = h.maxVideoSizeMB
	}
	maxBytes := limitMB * 1024 * 1024
	if req.FileSize > maxBytes {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("Ukuran file (%d byte) melebihi batas maksimal (%d MB)", req.FileSize, limitMB),
		})
		return
	}
	if isVideo && req.FileSize <= 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Ukuran video wajib diisi pada field 'file_size'",
		})
		return
	}

	// 4. Validasi Ekstensi Berbahaya
	ext := strings.ToLower(filepath.Ext(req.FileName))
	if isBlockedUploadExt(ext) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Tipe file yang dapat dieksekusi (.exe, .sh, .bat, script) dilarang demi keamanan sistem.",
		})
		return
	}

	if r.URL.Query().Get("purpose") == uploadPurposeFeed &&
		(!feedImageExts[ext] || !strings.HasPrefix(strings.ToLower(req.MIMEType), "image/")) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Lampiran postingan hanya boleh berupa gambar (JPG, PNG, WebP, GIF, HEIC).",
		})
		return
	}

	if isVideo && (!videoUploadExts[ext] || !strings.HasPrefix(strings.ToLower(req.MIMEType), "video/")) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Video hanya boleh berformat MP4, MOV, M4V, atau WebM.",
		})
		return
	}

	if req.MIMEType == "" {
		req.MIMEType = "application/octet-stream"
	}

	// 5. Mint signed upload URL dari storage provider (driver yang mendukung mengunci Content-Length)
	var (
		res *storage.SignedUploadResult
		err error
	)
	if sized, ok := h.storage.(interface {
		CreateSignedUploadURLSized(ctx context.Context, filename, contentType string, size int64) (*storage.SignedUploadResult, error)
	}); ok {
		res, err = sized.CreateSignedUploadURLSized(r.Context(), req.FileName, req.MIMEType, req.FileSize)
	} else {
		res, err = h.storage.CreateSignedUploadURL(r.Context(), req.FileName, req.MIMEType)
	}
	if err != nil {
		if err == storage.ErrSignedUploadNotSupported {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotImplemented)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": "Direct signed upload tidak didukung oleh storage driver aktif (gunakan fallback /api/media/upload)",
				"code":  "NOT_SUPPORTED",
			})
			return
		}

		log.Printf("[MediaHandler] Gagal membuat signed upload URL (%s): %v", req.FileName, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "Gagal membuat signed upload URL: " + err.Error(),
		})
		return
	}

	// 5b. Video: terbitkan juga tiket thumbnail (URL turunan dari kunci video).
	var thumbSigned, thumbPublic string
	if isVideo {
		if ts, ok := h.storage.(interface {
			CreateSignedThumbnailURL(ctx context.Context, videoKey string, size int64) (*storage.SignedUploadResult, error)
		}); ok {
			thumb, terr := ts.CreateSignedThumbnailURL(r.Context(), res.ObjectKey, req.ThumbSize)
			if terr != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"error": fmt.Sprintf("Thumbnail video tidak valid: ukuran wajib 1..%d byte (field 'thumb_size')", storage.MaxThumbnailBytes),
				})
				return
			}
			thumbSigned, thumbPublic = thumb.SignedURL, thumb.PublicURL
		}
	}

	// 6. Respon sukses dengan tiket upload
	userTag := "anonymous"
	if claims, ok := auth.GetUserFromContext(r.Context()); ok && claims != nil && claims.Username != "" {
		userTag = fmt.Sprintf("%s (%s)", claims.Username, claims.UserID)
	}

	log.Printf("🎟️ [DirectUpload] Tiket signed upload diterbitkan untuk user=%s | file=%s (%d bytes, %s) | key=%s | provider=%s",
		userTag, req.FileName, req.FileSize, req.MIMEType, res.ObjectKey, h.storage.DriverName())

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(SignedUploadURLResponse{
		SignedURL: res.SignedURL,
		PublicURL: res.PublicURL,
		ObjectKey: res.ObjectKey,
		Token:     res.Token,

		ThumbSignedURL: thumbSigned,
		ThumbPublicURL: thumbPublic,
	})
}

// AcknowledgeDownload menangani laporan penerima bahwa file media telah berhasil diunduh ke penyimpanan lokal.
// Jika auto-delete aktif, file fisik di storage akan langsung dihapus untuk menghemat server disk.
func (h *MediaHandler) AcknowledgeDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req MediaAckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.MessageID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "message_id wajib diisi"})
		return
	}

	if h.msgStore == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"status": "acknowledged"})
		return
	}

	// Validasi Otorisasi (IDOR Prevention): Pastikan user pengirim ACK adalah anggota sah dari percakapan pesan ini
	claims, _ := auth.GetUserFromContext(r.Context())
	var targetMsg *store.StoredMessage
	if h.msgStore != nil {
		targetMsg, _ = h.msgStore.GetMessageByID(req.MessageID)
	}

	if claims != nil && claims.UserID != "" && h.userStore != nil {
		if targetMsg == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Pesan media tidak ditemukan"})
			return
		}
		if targetMsg.RoomID != "" {
			allowed, err := h.userStore.IsUserInConversation(targetMsg.RoomID, claims.UserID)
			if err == nil && !allowed {
				log.Printf("[Security] Akses ditolak: User %s (%s) bukan anggota room %s untuk ACK media %s", claims.UserID, claims.Username, targetMsg.RoomID, req.MessageID)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "Akses ditolak: Anda bukan anggota percakapan media ini"})
				return
			}
		}
	}

	mediaURL, status, canDelete, err := h.msgStore.AcknowledgeMediaDownload(req.MessageID)
	if err != nil {
		log.Printf("[MediaHandler] Gagal memproses ACK download media (%s): %v", req.MessageID, err)
	}

	// Defense in Depth: Pastikan canDelete tidak pernah true jika room adalah grup atau subgrup/forum
	if targetMsg != nil && (strings.HasPrefix(targetMsg.RoomID, "grp_") || strings.HasPrefix(targetMsg.RoomID, "sub_")) {
		canDelete = false
	}

	// Jika file sudah siap dihapus dan auto-delete aktif, hapus dari storage fisik
	if canDelete && h.autoDeleteOnDownload && mediaURL != "" && h.storage != nil {
		if delErr := h.storage.Delete(r.Context(), mediaURL); delErr != nil {
			log.Printf("⚠️ [MediaHandler] Gagal menghapus file fisik setelah download (%s): %v", mediaURL, delErr)
		} else {
			log.Printf("🗑️ [Store-and-Forward] File fisik berhasil dihapus dari storage setelah diunduh client: %s", mediaURL)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "acknowledged",
		"media_status": status,
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
