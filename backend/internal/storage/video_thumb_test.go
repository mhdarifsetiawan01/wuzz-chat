package storage

import (
	"context"
	"io"
	"testing"
)

func TestThumbnailKeyAndURL(t *testing.T) {
	if got := ThumbnailKey("t1/abc.mp4"); got != "t1/abc.thumb.jpg" {
		t.Fatalf("ThumbnailKey = %q", got)
	}
	cases := map[string]string{
		"https://m.id/abc.mp4":          "https://m.id/abc.thumb.jpg",
		"https://m.id/t1/abc.MOV?x=1#y": "https://m.id/t1/abc.thumb.jpg",
		"https://m.id/abc.webm":         "https://m.id/abc.thumb.jpg",
	}
	for in, want := range cases {
		if got, ok := VideoThumbnailURL(in); !ok || got != want {
			t.Errorf("VideoThumbnailURL(%q) = %q,%v; want %q", in, got, ok, want)
		}
	}
	for _, in := range []string{"https://m.id/abc.jpg", "https://m.id/abc.pdf", "https://m.id/abc"} {
		if _, ok := VideoThumbnailURL(in); ok {
			t.Errorf("%q bukan video, tidak boleh punya thumbnail", in)
		}
	}
}

func TestR2Storage_SignedThumbnailURL(t *testing.T) {
	s, _ := NewR2Storage(testR2Config())
	res, err := s.CreateSignedThumbnailURL(context.Background(), "t1/abc.mp4", 2048)
	if err != nil {
		t.Fatal(err)
	}
	if res.ObjectKey != "t1/abc.thumb.jpg" || res.PublicURL != "https://media.contoh.id/t1/abc.thumb.jpg" {
		t.Fatalf("kunci/URL thumbnail salah: %+v", res)
	}
	for _, bad := range []int64{0, -1, MaxThumbnailBytes + 1} {
		if _, err := s.CreateSignedThumbnailURL(context.Background(), "t1/abc.mp4", bad); err == nil {
			t.Errorf("ukuran %d harus ditolak", bad)
		}
	}
}

type recordingStorage struct{ deleted []string }

func (r *recordingStorage) Upload(context.Context, io.Reader, string, string) (string, error) {
	return "", nil
}
func (r *recordingStorage) CreateSignedUploadURL(context.Context, string, string) (*SignedUploadResult, error) {
	return nil, ErrSignedUploadNotSupported
}
func (r *recordingStorage) Delete(_ context.Context, k string) error {
	r.deleted = append(r.deleted, k)
	return nil
}
func (r *recordingStorage) DriverName() string { return "rec" }

func TestPurgeWorker_DeletesVideoThumbnailToo(t *testing.T) {
	rec := &recordingStorage{}
	w := &PurgeWorker{storage: rec}
	if err := w.deleteWithThumbnail(context.Background(), "https://m.id/abc.mp4"); err != nil {
		t.Fatal(err)
	}
	if len(rec.deleted) != 2 || rec.deleted[1] != "https://m.id/abc.thumb.jpg" {
		t.Fatalf("video + thumbnail harus terhapus: %v", rec.deleted)
	}
	rec.deleted = nil
	_ = w.deleteWithThumbnail(context.Background(), "https://m.id/foto.jpg")
	if len(rec.deleted) != 1 {
		t.Fatalf("foto tidak punya thumbnail: %v", rec.deleted)
	}
}
