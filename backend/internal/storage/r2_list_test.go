package storage

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestR2Storage_ListObjects_PaginatesAndSigns(t *testing.T) {
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.URL.RawQuery)
		q := r.URL.Query()
		if r.Method != http.MethodGet || r.URL.Path != "/bkt" {
			t.Errorf("request tak terduga: %s %s", r.Method, r.URL.Path)
		}
		if q.Get("list-type") != "2" || q.Get("X-Amz-Signature") == "" || q.Get("X-Amz-SignedHeaders") != "host" {
			t.Errorf("query tidak lengkap/tertandatangani: %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/xml")
		if q.Get("continuation-token") == "" {
			_, _ = w.Write([]byte(`<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>tok2</NextContinuationToken>
<Contents><Key>a.jpg</Key><Size>10</Size><LastModified>2026-10-01T00:00:00.000Z</LastModified></Contents></ListBucketResult>`))
			return
		}
		_, _ = w.Write([]byte(`<ListBucketResult><IsTruncated>false</IsTruncated>
<Contents><Key>video/b.mp4</Key><Size>20</Size><LastModified>2026-10-02T00:00:00.000Z</LastModified></Contents></ListBucketResult>`))
	}))
	defer srv.Close()

	cfg := testR2Config()
	cfg.Endpoint = srv.URL
	cfg.Bucket = "bkt"
	s, err := NewR2Storage(cfg)
	if err != nil {
		t.Fatal(err)
	}

	p1, err := s.ListObjects(context.Background(), "", "", 1000)
	if err != nil || len(p1.Objects) != 1 || p1.Objects[0].Key != "a.jpg" || p1.Objects[0].Size != 10 || p1.NextToken != "tok2" {
		t.Fatalf("halaman 1 salah: %+v err=%v", p1, err)
	}
	if p1.Objects[0].LastModified.IsZero() {
		t.Error("LastModified tidak terurai")
	}
	p2, err := s.ListObjects(context.Background(), "video/", p1.NextToken, 5000) // maxKeys dibatasi 1000
	if err != nil || len(p2.Objects) != 1 || p2.Objects[0].Key != "video/b.mp4" || p2.NextToken != "" {
		t.Fatalf("halaman 2 salah: %+v err=%v", p2, err)
	}
	if !strings.Contains(seen[1], "prefix=video%2F") || !strings.Contains(seen[1], "continuation-token=tok2") || !strings.Contains(seen[1], "max-keys=1000") {
		t.Errorf("parameter halaman 2 salah: %s", seen[1])
	}
}

func TestR2Storage_ListObjects_ErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte("<Error>AccessDenied</Error>"))
	}))
	defer srv.Close()
	cfg := testR2Config()
	cfg.Endpoint = srv.URL
	s, _ := NewR2Storage(cfg)
	if _, err := s.ListObjects(context.Background(), "", "", 10); err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("want galat 403, got %v", err)
	}
}
