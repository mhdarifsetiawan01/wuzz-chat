package storage

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalStorage_UploadAndDelete(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "wuzz_test_uploads_*")
	if err != nil {
		t.Fatalf("Gagal membuat temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	ls, err := NewLocalStorage(tempDir, "/uploads")
	if err != nil {
		t.Fatalf("NewLocalStorage gagal: %v", err)
	}

	if ls.DriverName() != "local" {
		t.Errorf("Ekspektasi driver local, dapat: %s", ls.DriverName())
	}

	// 1. Test Upload
	fileContent := "hello image content binary dummy"
	reader := strings.NewReader(fileContent)
	publicURL, err := ls.Upload(context.Background(), reader, "test_foto.png", "image/png")
	if err != nil {
		t.Fatalf("Upload gagal: %v", err)
	}

	if !strings.HasPrefix(publicURL, "/uploads/") || !strings.HasSuffix(publicURL, ".png") {
		t.Errorf("Format public URL tidak sesuai: %s", publicURL)
	}

	// Verifikasi file ada di disk fisik
	filename := filepath.Base(publicURL)
	diskPath := filepath.Join(tempDir, filename)
	if _, err := os.Stat(diskPath); os.IsNotExist(err) {
		t.Fatalf("File tidak ditemukan di disk: %s", diskPath)
	}

	// 2. Test Delete
	if err := ls.Delete(context.Background(), publicURL); err != nil {
		t.Fatalf("Delete gagal: %v", err)
	}

	if _, err := os.Stat(diskPath); !os.IsNotExist(err) {
		t.Fatalf("File seharusnya sudah terhapus dari disk: %s", diskPath)
	}
}
