package storage

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
)

// SupabaseStorage mengimplementasikan MediaStorage dengan mengunggah file ke Supabase Storage via REST API.
type SupabaseStorage struct {
	supabaseURL string
	serviceKey  string
	bucket      string
	httpClient  *http.Client
}

// NewSupabaseStorage membuat instance baru SupabaseStorage.
func NewSupabaseStorage(supabaseURL, serviceKey, bucket string) *SupabaseStorage {
	baseURL := strings.TrimRight(supabaseURL, "/")
	if bucket == "" {
		bucket = "chat-media"
	}

	return &SupabaseStorage{
		supabaseURL: baseURL,
		serviceKey:  serviceKey,
		bucket:      bucket,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// Upload mengirimkan stream binary file ke REST endpoint Supabase Storage.
func (s *SupabaseStorage) Upload(ctx context.Context, file io.Reader, filename string, contentType string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == "" || len(ext) > 10 {
		ext = ".bin"
	}

	uniqueName := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	uploadURL := fmt.Sprintf("%s/storage/v1/object/%s/%s", s.supabaseURL, s.bucket, uniqueName)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, file)
	if err != nil {
		return "", fmt.Errorf("gagal membuat request upload supabase: %w", err)
	}

	if contentType == "" {
		contentType = "application/octet-stream"
	}

	req.Header.Set("Authorization", "Bearer "+s.serviceKey)
	req.Header.Set("apikey", s.serviceKey)
	req.Header.Set("Content-Type", contentType)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("gagal menghubungi supabase storage: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("supabase storage menolak upload (status %d): %s", resp.StatusCode, string(bodyBytes))
	}

	// Bentuk Public CDN URL standar Supabase Storage
	publicURL := fmt.Sprintf("%s/storage/v1/object/public/%s/%s", s.supabaseURL, s.bucket, uniqueName)
	return publicURL, nil
}

// Delete menghapus file dari Supabase bucket.
func (s *SupabaseStorage) Delete(ctx context.Context, fileKey string) error {
	safeFilename := filepath.Base(fileKey)
	if idx := strings.Index(safeFilename, "?"); idx != -1 {
		safeFilename = safeFilename[:idx]
	}

	// 1. Coba endpoint delete file langsung: DELETE /storage/v1/object/{bucket}/{filename}
	deleteURL := fmt.Sprintf("%s/storage/v1/object/%s/%s", s.supabaseURL, s.bucket, safeFilename)

	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, deleteURL, nil)
	if err == nil {
		req.Header.Set("Authorization", "Bearer "+s.serviceKey)
		req.Header.Set("apikey", s.serviceKey)

		resp, errDo := s.httpClient.Do(req)
		if errDo == nil {
			defer resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				return nil
			}
		}
	}

	// 2. Fallback ke endpoint bulk delete resmi Supabase: DELETE /storage/v1/object/{bucket} dengan body {"prefixes": ["filename"]}
	bulkURL := fmt.Sprintf("%s/storage/v1/object/%s", s.supabaseURL, s.bucket)
	bodyData := fmt.Sprintf(`{"prefixes":["%s"]}`, safeFilename)
	bulkReq, errBulk := http.NewRequestWithContext(ctx, http.MethodDelete, bulkURL, strings.NewReader(bodyData))
	if errBulk != nil {
		return fmt.Errorf("gagal membuat request bulk delete supabase: %w", errBulk)
	}

	bulkReq.Header.Set("Authorization", "Bearer "+s.serviceKey)
	bulkReq.Header.Set("apikey", s.serviceKey)
	bulkReq.Header.Set("Content-Type", "application/json")

	bulkResp, errBulkDo := s.httpClient.Do(bulkReq)
	if errBulkDo != nil {
		return fmt.Errorf("gagal menghubungi supabase storage untuk delete: %w", errBulkDo)
	}
	defer bulkResp.Body.Close()

	if bulkResp.StatusCode < 200 || bulkResp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(bulkResp.Body)
		return fmt.Errorf("supabase storage gagal menghapus file (status %d): %s", bulkResp.StatusCode, string(bodyBytes))
	}

	return nil
}

// DriverName mengembalikan identifier driver.
func (s *SupabaseStorage) DriverName() string {
	return "supabase"
}

var _ MediaStorage = (*SupabaseStorage)(nil)
