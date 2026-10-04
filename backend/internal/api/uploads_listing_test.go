package api_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
)

// T5: /uploads/ tidak boleh membuka daftar isi direktori (enumerasi file semua tenant).
func TestUploadsFileSystem_NoDirectoryListing(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "tenant_alpha"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "tenant_alpha", "rahasia.png"), []byte("png-bytes"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "umum.txt"), []byte("halo"), 0o644); err != nil {
		t.Fatal(err)
	}

	h := http.StripPrefix("/uploads/", http.FileServer(api.NewUploadsFileSystem(dir)))
	get := func(path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		return rec
	}

	for _, p := range []string{"/uploads/", "/uploads", "/uploads/tenant_alpha/", "/uploads/tenant_alpha"} {
		rec := get(p)
		if rec.Code == http.StatusOK {
			t.Errorf("LEAK! %s menampilkan daftar direktori: %s", p, rec.Body.String())
		}
	}
	if rec := get("/uploads/tenant_alpha/rahasia.png"); rec.Code != http.StatusOK || rec.Body.String() != "png-bytes" {
		t.Errorf("file di subfolder tenant harus tetap bisa diunduh, status=%d", rec.Code)
	}
	if rec := get("/uploads/umum.txt"); rec.Code != http.StatusOK {
		t.Errorf("file umum harus tetap bisa diunduh, status=%d", rec.Code)
	}
	if rec := get("/uploads/../../etc/passwd"); rec.Code == http.StatusOK {
		t.Errorf("path traversal harus ditolak, status=%d", rec.Code)
	}
}
