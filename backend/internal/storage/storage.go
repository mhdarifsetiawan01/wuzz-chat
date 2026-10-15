package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
)

// SignedUploadResult berisi tiket URL upload bertanda tangan dan metadata object.
type SignedUploadResult struct {
	SignedURL string `json:"signed_url"`
	PublicURL string `json:"public_url"`
	ObjectKey string `json:"object_key"`
	Token     string `json:"token"`
}

// ErrSignedUploadNotSupported menandakan bahwa storage driver aktif tidak mendukung direct signed upload.
var ErrSignedUploadNotSupported = fmt.Errorf("signed upload not supported by current storage driver")

// MediaStorage mendefinisikan interface tunggal untuk seluruh provider penyimpanan media.
type MediaStorage interface {
	// Upload menyimpan file ke storage dan mengembalikan public URL yang dapat diakses browser.
	Upload(ctx context.Context, file io.Reader, filename string, contentType string) (publicURL string, err error)

	// CreateSignedUploadURL membuat tiket upload bertanda tangan untuk direct upload dari client.
	CreateSignedUploadURL(ctx context.Context, filename string, contentType string) (*SignedUploadResult, error)

	// Delete menghapus file dari storage berdasarkan nama/key file.
	Delete(ctx context.Context, fileKey string) error

	// DriverName mengembalikan nama driver yang sedang aktif ("local", "supabase", "s3").
	DriverName() string
}

// NewMediaStorageFromEnv menginisialisasi MediaStorage sesuai konfigurasi environment variable STORAGE_DRIVER.
// Pilihan: "local" (default), "supabase", "r2".
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

	case "r2":
		// Fail-closed: konfigurasi tidak lengkap = galat (TIDAK jatuh ke penyimpanan lokal/VPS).
		r2, err := NewR2Storage(R2Config{
			AccountID:       os.Getenv("R2_ACCOUNT_ID"),
			AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
			SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
			Bucket:          os.Getenv("R2_BUCKET"),
			PublicBaseURL:   os.Getenv("R2_PUBLIC_BASE_URL"),
			Endpoint:        os.Getenv("R2_ENDPOINT"),
		})
		if err != nil {
			return nil, err
		}
		// Masa transisi: media lama masih berupa URL Supabase; purge tetap bisa menghapusnya.
		if supabaseURL, serviceKey := os.Getenv("SUPABASE_URL"), firstNonEmpty(os.Getenv("SUPABASE_SERVICE_KEY"), os.Getenv("SUPABASE_KEY")); supabaseURL != "" && serviceKey != "" {
			r2.SetLegacyDeleter(NewSupabaseStorage(supabaseURL, serviceKey, os.Getenv("SUPABASE_STORAGE_BUCKET")))
		}
		log.Printf("☁️ Inisialisasi Cloudflare R2 Media Storage (Bucket: %s)", r2.bucket)
		return r2, nil

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

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
