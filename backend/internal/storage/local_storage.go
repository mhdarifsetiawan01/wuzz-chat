package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

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
func (l *LocalStorage) Upload(ctx context.Context, file io.Reader, filename string, contentType string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	// Jika ekstensi kosong atau tidak wajar, berikan fallback
	if ext == "" || len(ext) > 10 {
		ext = ".bin"
	}

	// Buat nama file unik anti-collision & anti-traversal
	uniqueName := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	targetPath := filepath.Join(l.baseDir, uniqueName)

	dst, err := os.Create(targetPath)
	if err != nil {
		return "", fmt.Errorf("gagal membuat file tujuan (%s): %w", targetPath, err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		_ = os.Remove(targetPath) // Bersihkan file parsial jika gagal
		return "", fmt.Errorf("gagal menulis isi file: %w", err)
	}

	// URL publik: misal "/uploads/<uuid>.png"
	publicURL := strings.TrimRight(l.publicPath, "/") + "/" + uniqueName
	return publicURL, nil
}

// Delete menghapus file dari baseDir.
func (l *LocalStorage) Delete(ctx context.Context, fileKey string) error {
	safeFilename := filepath.Base(fileKey)
	targetPath := filepath.Join(l.baseDir, safeFilename)
	if err := os.Remove(targetPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("gagal menghapus file lokal (%s): %w", targetPath, err)
	}
	return nil
}

// DriverName mengembalikan identifier driver.
func (l *LocalStorage) DriverName() string {
	return "local"
}

var _ MediaStorage = (*LocalStorage)(nil)
