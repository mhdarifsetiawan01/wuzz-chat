package storage

import (
	"context"
	"net/http"
	"net/http/httptest"
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

	// 3. Test CreateSignedUploadURL on LocalStorage
	_, errSigned := ls.CreateSignedUploadURL(context.Background(), "test.png", "image/png")
	if errSigned != ErrSignedUploadNotSupported {
		t.Fatalf("Ekspektasi ErrSignedUploadNotSupported, dapat: %v", errSigned)
	}
}

func TestSupabaseStorage_CreateSignedUploadURL(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/storage/v1/object/upload/sign/") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.Header.Get("apikey") != "test-service-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"url":"/storage/v1/object/upload/sign/chat-media/uuid-123.jpg?token=mocktoken123","token":"mocktoken123"}`))
	}))
	defer mockServer.Close()

	sbStorage := NewSupabaseStorage(mockServer.URL, "test-service-key", "chat-media")
	res, err := sbStorage.CreateSignedUploadURL(context.Background(), "avatar.jpg", "image/jpeg")
	if err != nil {
		t.Fatalf("CreateSignedUploadURL gagal: %v", err)
	}

	if !strings.Contains(res.SignedURL, mockServer.URL) || !strings.Contains(res.SignedURL, "token=mocktoken123") {
		t.Errorf("Format SignedURL salah: %s", res.SignedURL)
	}
	if !strings.Contains(res.PublicURL, "/storage/v1/object/public/chat-media/") {
		t.Errorf("Format PublicURL salah: %s", res.PublicURL)
	}
	if res.Token != "mocktoken123" {
		t.Errorf("Ekspektasi token mocktoken123, dapat: %s", res.Token)
	}
}


