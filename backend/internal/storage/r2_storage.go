package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/google/uuid"
)

// ErrRelayUploadDisabled dikembalikan saat unggah lewat VPS diminta pada driver yang mewajibkan direct upload.
var ErrRelayUploadDisabled = errors.New("unggah lewat server dinonaktifkan: gunakan direct signed upload")

// r2SignedUploadTTL adalah masa berlaku URL unggah presigned.
const r2SignedUploadTTL = 10 * time.Minute

// R2Config adalah konfigurasi Cloudflare R2 (API kompatibel S3).
type R2Config struct {
	AccountID       string
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	PublicBaseURL   string // basis URL publik bucket, mis. https://media.contoh.id (tanpa garis miring akhir)
	Endpoint        string // opsional; bawaan https://<AccountID>.r2.cloudflarestorage.com (dipakai tes)
}

// R2Storage mengimplementasikan MediaStorage untuk Cloudflare R2. Unggah SELALU langsung dari klien lewat URL presigned;
// server tidak pernah menjadi perantara berkas (tidak ada fallback VPS).
type R2Storage struct {
	host          string
	scheme        string
	bucket        string
	accessKeyID   string
	secretKey     string
	publicBaseURL string
	httpClient    *http.Client
	now           func() time.Time
	legacy        MediaStorage // opsional: penghapus URL lama (mis. Supabase) selama masa transisi
}

// NewR2Storage memvalidasi konfigurasi dan membuat driver. Konfigurasi tidak lengkap = galat (fail-closed).
func NewR2Storage(cfg R2Config) (*R2Storage, error) {
	var missing []string
	if cfg.AccessKeyID == "" {
		missing = append(missing, "R2_ACCESS_KEY_ID")
	}
	if cfg.SecretAccessKey == "" {
		missing = append(missing, "R2_SECRET_ACCESS_KEY")
	}
	if cfg.Bucket == "" {
		missing = append(missing, "R2_BUCKET")
	}
	if cfg.PublicBaseURL == "" {
		missing = append(missing, "R2_PUBLIC_BASE_URL")
	}
	endpoint := strings.TrimRight(cfg.Endpoint, "/")
	if endpoint == "" {
		if cfg.AccountID == "" {
			missing = append(missing, "R2_ACCOUNT_ID")
		} else {
			endpoint = "https://" + cfg.AccountID + ".r2.cloudflarestorage.com"
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("konfigurasi R2 tidak lengkap, wajib diisi: %s", strings.Join(missing, ", "))
	}

	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("endpoint R2 tidak valid: %q", endpoint)
	}
	base := strings.TrimRight(cfg.PublicBaseURL, "/")
	if pu, err := url.Parse(base); err != nil || pu.Host == "" || (pu.Scheme != "https" && pu.Scheme != "http") {
		return nil, fmt.Errorf("R2_PUBLIC_BASE_URL tidak valid: %q", cfg.PublicBaseURL)
	}

	return &R2Storage{
		host:          u.Host,
		scheme:        u.Scheme,
		bucket:        cfg.Bucket,
		accessKeyID:   cfg.AccessKeyID,
		secretKey:     cfg.SecretAccessKey,
		publicBaseURL: base,
		httpClient:    &http.Client{Timeout: 30 * time.Second},
		now:           time.Now,
	}, nil
}

// SetLegacyDeleter mendaftarkan driver lama untuk menghapus berkas yang URL-nya bukan milik R2.
func (s *R2Storage) SetLegacyDeleter(legacy MediaStorage) { s.legacy = legacy }

// Upload tidak didukung: berkas harus diunggah langsung ke R2.
func (s *R2Storage) Upload(ctx context.Context, file io.Reader, filename string, contentType string) (string, error) {
	return "", ErrRelayUploadDisabled
}

// RelayUploadDisabled memberi tahu handler agar menolak /api/media/upload sebelum membaca body.
func (s *R2Storage) RelayUploadDisabled() bool { return true }

// CreateSignedUploadURL membuat tiket tanpa penguncian ukuran (dipertahankan untuk antarmuka MediaStorage).
func (s *R2Storage) CreateSignedUploadURL(ctx context.Context, filename string, contentType string) (*SignedUploadResult, error) {
	return s.CreateSignedUploadURLSized(ctx, filename, contentType, 0)
}

// CreateSignedUploadURLSized membuat URL PUT presigned. Bila size > 0, Content-Length ikut ditandatangani sehingga
// R2 menolak unggahan yang ukurannya berbeda dari yang dideklarasikan (dan sudah divalidasi batasnya oleh handler).
func (s *R2Storage) CreateSignedUploadURLSized(ctx context.Context, filename string, contentType string, size int64) (*SignedUploadResult, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" || len(ext) > 10 {
		ext = ".bin"
	}
	key := uuid.New().String() + ext
	if t, ok := tenantshared.FromContext(ctx); ok && t.TenantID() != "" && t.TenantID() != "default" {
		key = t.TenantID() + "/" + key
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	// Video hidup di bawah awalan sendiri supaya aturan lifecycle R2 (jaring pengaman berkas yatim) bisa dibatasi ke
	// "video/" tanpa menyentuh foto profil dan media Feed yang disimpan selama akun aktif.
	if strings.HasPrefix(strings.ToLower(contentType), "video/") {
		key = VideoKeyPrefix + key
	}

	headers := map[string]string{"content-type": contentType}
	if size > 0 {
		headers["content-length"] = strconv.FormatInt(size, 10)
	}
	signed := presignURL(presignParams{
		Method:      http.MethodPut,
		Host:        s.host,
		Path:        "/" + s.bucket + "/" + key,
		Region:      "auto",
		AccessKeyID: s.accessKeyID,
		SecretKey:   s.secretKey,
		Now:         s.now(),
		Expires:     r2SignedUploadTTL,
		Headers:     headers,
	})
	return &SignedUploadResult{
		SignedURL: s.scheme + "://" + s.host + signed,
		PublicURL: s.publicBaseURL + "/" + key,
		ObjectKey: key,
	}, nil
}

// CreateSignedThumbnailURL membuat URL PUT presigned untuk thumbnail JPEG sebuah video. Kuncinya diturunkan dari
// kunci video (lihat ThumbnailKey); Content-Length ikut ditandatangani sehingga ukurannya terkunci.
func (s *R2Storage) CreateSignedThumbnailURL(ctx context.Context, videoKey string, size int64) (*SignedUploadResult, error) {
	if size <= 0 || size > MaxThumbnailBytes {
		return nil, fmt.Errorf("ukuran thumbnail harus 1..%d byte", MaxThumbnailBytes)
	}
	key := ThumbnailKey(videoKey)
	signed := presignURL(presignParams{
		Method:      http.MethodPut,
		Host:        s.host,
		Path:        "/" + s.bucket + "/" + key,
		Region:      "auto",
		AccessKeyID: s.accessKeyID,
		SecretKey:   s.secretKey,
		Now:         s.now(),
		Expires:     r2SignedUploadTTL,
		Headers: map[string]string{
			"content-type":   "image/jpeg",
			"content-length": strconv.FormatInt(size, 10),
		},
	})
	return &SignedUploadResult{
		SignedURL: s.scheme + "://" + s.host + signed,
		PublicURL: s.publicBaseURL + "/" + key,
		ObjectKey: key,
	}, nil
}

// keyFromURL mengembalikan kunci objek bila URL milik bucket R2 ini.
func (s *R2Storage) keyFromURL(fileURL string) (string, bool) {
	prefix := s.publicBaseURL + "/"
	if strings.HasPrefix(fileURL, prefix) {
		key := strings.TrimPrefix(fileURL, prefix)
		if i := strings.IndexAny(key, "?#"); i >= 0 {
			key = key[:i]
		}
		if key = strings.Trim(key, "/"); key != "" && !strings.Contains(key, "..") {
			return key, true
		}
	}
	return "", false
}

// Delete menghapus objek R2 (404 dianggap sukses). URL yang bukan milik R2 diteruskan ke driver lama bila ada.
func (s *R2Storage) Delete(ctx context.Context, fileKey string) error {
	key, ok := s.keyFromURL(fileKey)
	if !ok {
		if s.legacy != nil {
			return s.legacy.Delete(ctx, fileKey)
		}
		return fmt.Errorf("URL bukan milik bucket R2: %q", fileKey)
	}

	signed := presignURL(presignParams{
		Method:      http.MethodDelete,
		Host:        s.host,
		Path:        "/" + s.bucket + "/" + key,
		Region:      "auto",
		AccessKeyID: s.accessKeyID,
		SecretKey:   s.secretKey,
		Now:         s.now(),
		Expires:     time.Minute,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, s.scheme+"://"+s.host+signed, nil)
	if err != nil {
		return fmt.Errorf("gagal membuat request hapus R2: %w", err)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("gagal menghubungi R2: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 || resp.StatusCode == http.StatusNotFound {
		return nil
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return fmt.Errorf("R2 gagal menghapus objek (status %d): %s", resp.StatusCode, string(body))
}

// DriverName mengembalikan identifier driver.
func (s *R2Storage) DriverName() string { return "r2" }

var _ MediaStorage = (*R2Storage)(nil)
