package storage

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func testR2Config() R2Config {
	return R2Config{
		AccountID: "acc", AccessKeyID: "AK", SecretAccessKey: "SK",
		Bucket: "bkt", PublicBaseURL: "https://media.contoh.id/",
	}
}

func TestNewR2Storage_FailClosedOnMissingConfig(t *testing.T) {
	for _, mutate := range []func(*R2Config){
		func(c *R2Config) { c.AccessKeyID = "" },
		func(c *R2Config) { c.SecretAccessKey = "" },
		func(c *R2Config) { c.Bucket = "" },
		func(c *R2Config) { c.PublicBaseURL = "" },
		func(c *R2Config) { c.AccountID = "" },
		func(c *R2Config) { c.PublicBaseURL = "bukan-url" },
	} {
		cfg := testR2Config()
		mutate(&cfg)
		if _, err := NewR2Storage(cfg); err == nil {
			t.Fatalf("konfigurasi %+v seharusnya ditolak", cfg)
		}
	}
}

func TestNewMediaStorageFromEnv_R2MissingConfigDoesNotFallBack(t *testing.T) {
	t.Setenv("STORAGE_DRIVER", "r2")
	for _, k := range []string{"R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL", "R2_ENDPOINT"} {
		t.Setenv(k, "")
	}
	ms, err := NewMediaStorageFromEnv()
	if err == nil || ms != nil {
		t.Fatalf("driver r2 tanpa konfigurasi harus galat, dapat storage=%v err=%v", ms, err)
	}
}

func TestR2Storage_RelayUploadDisabled(t *testing.T) {
	s, _ := NewR2Storage(testR2Config())
	if !s.RelayUploadDisabled() {
		t.Fatal("RelayUploadDisabled harus true")
	}
	if _, err := s.Upload(context.Background(), strings.NewReader("x"), "a.mp4", "video/mp4"); !errors.Is(err, ErrRelayUploadDisabled) {
		t.Fatalf("Upload harus ErrRelayUploadDisabled, dapat %v", err)
	}
}

func TestR2Storage_SignedUploadURL(t *testing.T) {
	s, _ := NewR2Storage(testR2Config())
	res, err := s.CreateSignedUploadURLSized(context.Background(), "Klip.MP4", "video/mp4", 12345)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(res.SignedURL, "https://acc.r2.cloudflarestorage.com/bkt/") || !strings.HasSuffix(res.ObjectKey, ".mp4") {
		t.Fatalf("URL/kunci tidak sesuai: %s | %s", res.SignedURL, res.ObjectKey)
	}
	if res.PublicURL != "https://media.contoh.id/"+res.ObjectKey {
		t.Fatalf("public URL salah: %s", res.PublicURL)
	}
	u, err := url.Parse(res.SignedURL)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	if q.Get("X-Amz-SignedHeaders") != "content-length;content-type;host" || q.Get("X-Amz-Signature") == "" || q.Get("X-Amz-Expires") != "600" {
		t.Fatalf("query presign tidak sesuai: %v", q)
	}

	// Tanpa ukuran: content-length tidak ikut ditandatangani.
	res2, _ := s.CreateSignedUploadURL(context.Background(), "a.jpg", "image/jpeg")
	u2, _ := url.Parse(res2.SignedURL)
	if got := u2.Query().Get("X-Amz-SignedHeaders"); got != "content-type;host" {
		t.Fatalf("signed headers tanpa ukuran = %q", got)
	}
}

func TestR2Storage_Delete(t *testing.T) {
	var gotMethod, gotPath, gotSig string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath, gotSig = r.Method, r.URL.Path, r.URL.Query().Get("X-Amz-Signature")
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	cfg := testR2Config()
	cfg.Endpoint = srv.URL
	s, err := NewR2Storage(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(context.Background(), "https://media.contoh.id/t1/abc.mp4"); err != nil {
		t.Fatalf("Delete gagal: %v", err)
	}
	if gotMethod != http.MethodDelete || gotPath != "/bkt/t1/abc.mp4" || gotSig == "" {
		t.Fatalf("request hapus tidak sesuai: %s %s sig=%q", gotMethod, gotPath, gotSig)
	}

	// Kunci berbahaya ditolak, URL asing tanpa driver lama = galat.
	if err := s.Delete(context.Background(), "https://media.contoh.id/../x"); err == nil {
		t.Fatal("path traversal harus ditolak")
	}
	if err := s.Delete(context.Background(), "https://proj.supabase.co/storage/v1/object/public/b/x.jpg"); err == nil {
		t.Fatal("URL asing tanpa legacy harus galat")
	}
}

type fakeLegacy struct{ deleted []string }

func (f *fakeLegacy) Upload(context.Context, io.Reader, string, string) (string, error) {
	return "", nil
}
func (f *fakeLegacy) CreateSignedUploadURL(context.Context, string, string) (*SignedUploadResult, error) {
	return nil, ErrSignedUploadNotSupported
}
func (f *fakeLegacy) Delete(_ context.Context, k string) error {
	f.deleted = append(f.deleted, k)
	return nil
}
func (f *fakeLegacy) DriverName() string { return "fake" }

func TestR2Storage_DeleteDelegatesForeignURLToLegacy(t *testing.T) {
	s, _ := NewR2Storage(testR2Config())
	legacy := &fakeLegacy{}
	s.SetLegacyDeleter(legacy)
	const old = "https://proj.supabase.co/storage/v1/object/public/b/x.jpg"
	if err := s.Delete(context.Background(), old); err != nil {
		t.Fatal(err)
	}
	if len(legacy.deleted) != 1 || legacy.deleted[0] != old {
		t.Fatalf("legacy tidak dipanggil: %v", legacy.deleted)
	}
}
