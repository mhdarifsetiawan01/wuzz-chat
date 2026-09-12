package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
)

// MediaStorage mendefinisikan interface tunggal untuk seluruh provider penyimpanan media.
type MediaStorage interface {
	// Upload menyimpan file ke storage dan mengembalikan public URL yang dapat diakses browser.
	Upload(ctx context.Context, file io.Reader, filename string, contentType string) (publicURL string, err error)

	// Delete menghapus file dari storage berdasarkan nama/key file.
	Delete(ctx context.Context, fileKey string) error

	// DriverName mengembalikan nama driver yang sedang aktif ("local", "supabase", "s3").
	DriverName() string
}

// NewMediaStorageFromEnv menginisialisasi MediaStorage sesuai konfigurasi environment variable STORAGE_DRIVER.
// Pilihan: "local" (default), "supabase", "s3".
func NewMediaStorageFromEnv() (MediaStorage, error) {
	driver := strings.ToLower(os.Getenv("STORAGE_DRIVER"))
	if driver == "" {
		driver = "local"
	}

	switch driver {
	case "supabase":
		supabaseURL := os.Getenv("SUPABASE_URL")
		serviceKey := os.Getenv("SUPABASE_SERVICE_KEY")
		if serviceKey == "" {
			serviceKey = os.Getenv("SUPABASE_KEY")
		}
		bucket := os.Getenv("SUPABASE_STORAGE_BUCKET")
		if bucket == "" {
			bucket = "chat-media"
		}

		if supabaseURL == "" || serviceKey == "" {
			log.Printf("⚠️ SUPABASE_URL atau SUPABASE_SERVICE_KEY tidak ditemukan, fallback ke LocalStorage.")
			return NewLocalStorage("./uploads", "/uploads")
		}

		log.Printf("☁️ Inisialisasi Supabase Media Storage (Bucket: %s)", bucket)
		return NewSupabaseStorage(supabaseURL, serviceKey, bucket), nil

	case "local":
		fallthrough
	default:
		uploadDir := os.Getenv("UPLOAD_DIR")
		if uploadDir == "" {
			uploadDir = "./uploads"
		}
		publicPath := os.Getenv("UPLOAD_PUBLIC_PATH")
		if publicPath == "" {
			publicPath = "/uploads"
		}
		log.Printf("💾 Inisialisasi Local Media Storage (Dir: %s, URL Path: %s)", uploadDir, publicPath)
		return NewLocalStorage(uploadDir, publicPath)
	}
}

// EnsureDir memastikan direktori lokal sudah dibuat.
func EnsureDir(dir string) error {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("gagal membuat direktori (%s): %w", dir, err)
	}
	return nil
}
