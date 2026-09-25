package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/google/uuid"
)

// LocalStorage mengimplementasikan MediaStorage dengan menyimpan file langsung ke filesystem lokal.
type LocalStorage struct {
	baseDir    string // direktori fisik, misal "./uploads"
	publicPath string // prefix URL publik, misal "/uploads"
}

// NewLocalStorage membuat instance baru LocalStorage dan memastikan baseDir tersedia.
func NewLocalStorage(baseDir, publicPath string) (*LocalStorage, error) {
	if err := EnsureDir(baseDir); err != nil {
		return nil, err
	}
	if publicPath == "" {
		publicPath = "/uploads"
	}
	// Pastikan publicPath diawali "/"
	if !strings.HasPrefix(publicPath, "/") {
		publicPath = "/" + publicPath
	}

	return &LocalStorage{
		baseDir:    baseDir,
		publicPath: publicPath,
	}, nil
}

// Upload menyimpan stream data file ke baseDir dengan nama acak berbasis UUID yang aman.
// Jika tenant non-default terdeteksi di context, file disimpan dalam subfolder direktori tenant.
func (l *LocalStorage) Upload(ctx context.Context, file io.Reader, filename string, contentType string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	// Jika ekstensi kosong atau tidak wajar, berikan fallback
	if ext == "" || len(ext) > 10 {
		ext = ".bin"
	}

	// Buat nama file unik anti-collision & anti-traversal
	uniqueName := fmt.Sprintf("%s%s", uuid.New().String(), ext)

	// Cek apakah ada tenant non-default
	var subFolder string
	if t, ok := tenantshared.FromContext(ctx); ok && t.TenantID() != "" && t.TenantID() != "default" {
		subFolder = t.TenantID()
	}

	var targetDir string
	var publicURL string
	if subFolder != "" {
		targetDir = filepath.Join(l.baseDir, subFolder)
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			return "", fmt.Errorf("gagal membuat direktori tenant storage (%s): %w", targetDir, err)
		}
		publicURL = fmt.Sprintf("%s/%s/%s", strings.TrimRight(l.publicPath, "/"), subFolder, uniqueName)
	} else {
		targetDir = l.baseDir
		publicURL = strings.TrimRight(l.publicPath, "/") + "/" + uniqueName
	}

	targetPath := filepath.Join(targetDir, uniqueName)

	dst, err := os.Create(targetPath)
	if err != nil {
		return "", fmt.Errorf("gagal membuat file tujuan (%s): %w", targetPath, err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		_ = os.Remove(targetPath) // Bersihkan file parsial jika gagal
		return "", fmt.Errorf("gagal menulis isi file: %w", err)
	}

	return publicURL, nil
}

// Delete menghapus file dari baseDir.
func (l *LocalStorage) Delete(ctx context.Context, fileKey string) error {
	cleaned := strings.TrimPrefix(fileKey, l.publicPath)
	cleaned = strings.TrimPrefix(cleaned, "/")
	if idx := strings.Index(cleaned, "?"); idx != -1 {
		cleaned = cleaned[:idx]
	}

	// Coba hapus berdasarkan path relatif (misal "tenant_123/uuid.png")
	targetPath := filepath.Join(l.baseDir, filepath.Clean(cleaned))
	if err := os.Remove(targetPath); err == nil {
		return nil
	}

	// Fallback ke safeFilename di root baseDir untuk file flat / legacy
	safeFilename := filepath.Base(fileKey)
	if idx := strings.Index(safeFilename, "?"); idx != -1 {
		safeFilename = safeFilename[:idx]
	}
	targetPathFlat := filepath.Join(l.baseDir, safeFilename)
	if err := os.Remove(targetPathFlat); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("gagal menghapus file lokal (%s): %w", targetPathFlat, err)
	}
	return nil
}

// DriverName mengembalikan identifier driver.
func (l *LocalStorage) DriverName() string {
	return "local"
}

var _ MediaStorage = (*LocalStorage)(nil)
