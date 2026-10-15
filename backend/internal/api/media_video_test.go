package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/storage"
)

func newTestR2(t *testing.T) *storage.R2Storage {
	t.Helper()
	r2, err := storage.NewR2Storage(storage.R2Config{
		AccountID: "acc", AccessKeyID: "AK", SecretAccessKey: "SK",
		Bucket: "bkt", PublicBaseURL: "https://media.contoh.id",
	})
	if err != nil {
		t.Fatal(err)
	}
	return r2
}

func signedReq(t *testing.T, h *MediaHandler, query string, body SignedUploadURLRequest) *httptest.ResponseRecorder {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/media/signed-upload-url"+query, bytes.NewReader(b))
	rr := httptest.NewRecorder()
	h.CreateSignedUploadURL(rr, req)
	return rr
}

func TestMediaHandler_Video_SignedUploadURL_R2(t *testing.T) {
	h := NewMediaHandler(newTestR2(t), nil)

	rr := signedReq(t, h, "?purpose=video", SignedUploadURLRequest{FileName: "klip.mp4", FileSize: 5 << 20, MIMEType: "video/mp4", ThumbSize: 1000})
	if rr.Code != http.StatusOK {
		t.Fatalf("video sah harus 200, dapat %d: %s", rr.Code, rr.Body.String())
	}
	var res SignedUploadURLResponse
	_ = json.Unmarshal(rr.Body.Bytes(), &res)
	if !strings.Contains(res.SignedURL, "r2.cloudflarestorage.com") || !strings.Contains(res.SignedURL, "content-length") {
		t.Fatalf("URL R2 harus mengunci content-length: %s", res.SignedURL)
	}
}

func TestMediaHandler_Video_Validation(t *testing.T) {
	h := NewMediaHandler(newTestR2(t), nil)

	cases := []struct {
		name string
		req  SignedUploadURLRequest
	}{
		{"terlalu besar (>25 MB)", SignedUploadURLRequest{FileName: "a.mp4", FileSize: 26 << 20, MIMEType: "video/mp4"}},
		{"ukuran kosong", SignedUploadURLRequest{FileName: "a.mp4", FileSize: 0, MIMEType: "video/mp4"}},
		{"ekstensi bukan video", SignedUploadURLRequest{FileName: "a.png", FileSize: 1024, MIMEType: "video/mp4"}},
		{"MIME bukan video", SignedUploadURLRequest{FileName: "a.mp4", FileSize: 1024, MIMEType: "image/png"}},
		{"ekstensi berbahaya", SignedUploadURLRequest{FileName: "a.exe", FileSize: 1024, MIMEType: "video/mp4"}},
	}
	for _, c := range cases {
		if rr := signedReq(t, h, "?purpose=video", c.req); rr.Code != http.StatusBadRequest {
			t.Errorf("%s: ekspektasi 400, dapat %d", c.name, rr.Code)
		}
	}
}

func TestMediaHandler_Video_LimitFollowsEnv(t *testing.T) {
	t.Setenv("MAX_VIDEO_UPLOAD_MB", "40")
	h := NewMediaHandler(newTestR2(t), nil)
	if rr := signedReq(t, h, "?purpose=video", SignedUploadURLRequest{FileName: "a.mp4", FileSize: 30 << 20, MIMEType: "video/mp4", ThumbSize: 1000}); rr.Code != http.StatusOK {
		t.Fatalf("30 MB harus lolos saat batas 40 MB, dapat %d", rr.Code)
	}
}

func TestMediaHandler_RelayUploadRejectedOnR2(t *testing.T) {
	h := NewMediaHandler(newTestR2(t), nil)
	req := httptest.NewRequest(http.MethodPost, "/api/media/upload", strings.NewReader("x"))
	rr := httptest.NewRecorder()
	h.Upload(rr, req)
	if rr.Code != http.StatusGone {
		t.Fatalf("relay VPS pada R2 harus 410, dapat %d", rr.Code)
	}
}

func TestMediaHandler_Config_ExposesVideoLimits(t *testing.T) {
	h := NewMediaHandler(newTestR2(t), nil)
	rr := httptest.NewRecorder()
	h.Config(rr, httptest.NewRequest(http.MethodGet, "/api/config", nil))
	var res AppConfigResponse
	_ = json.Unmarshal(rr.Body.Bytes(), &res)
	if res.MaxVideoSizeMB != 25 || res.MaxVideoDurationSec != 60 || res.StorageDriver != "r2" {
		t.Fatalf("config video salah: %+v", res)
	}
}

func TestMediaHandler_Video_IssuesThumbnailTicket(t *testing.T) {
	h := NewMediaHandler(newTestR2(t), nil)

	rr := signedReq(t, h, "?purpose=video", SignedUploadURLRequest{FileName: "klip.mp4", FileSize: 5 << 20, MIMEType: "video/mp4", ThumbSize: 20_000})
	if rr.Code != http.StatusOK {
		t.Fatalf("200 diharapkan, dapat %d: %s", rr.Code, rr.Body.String())
	}
	var res SignedUploadURLResponse
	_ = json.Unmarshal(rr.Body.Bytes(), &res)
	wantThumb := strings.TrimSuffix(res.PublicURL, ".mp4") + ".thumb.jpg"
	if res.ThumbPublicURL != wantThumb || !strings.Contains(res.ThumbSignedURL, ".thumb.jpg") {
		t.Fatalf("tiket thumbnail salah: %+v", res)
	}

	// thumb_size wajib & dibatasi.
	for _, sz := range []int64{0, storage.MaxThumbnailBytes + 1} {
		rr := signedReq(t, h, "?purpose=video", SignedUploadURLRequest{FileName: "klip.mp4", FileSize: 1024, MIMEType: "video/mp4", ThumbSize: sz})
		if rr.Code != http.StatusBadRequest {
			t.Errorf("thumb_size=%d harus 400, dapat %d", sz, rr.Code)
		}
	}

	// Non-video tidak mendapat tiket thumbnail.
	rr = signedReq(t, h, "", SignedUploadURLRequest{FileName: "a.png", FileSize: 1024, MIMEType: "image/png"})
	var img SignedUploadURLResponse
	_ = json.Unmarshal(rr.Body.Bytes(), &img)
	if rr.Code != http.StatusOK || img.ThumbSignedURL != "" {
		t.Fatalf("gambar tidak boleh mendapat tiket thumbnail: %d %+v", rr.Code, img)
	}
}
