package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/storage"
)

type recordedTicket struct{ url, tenant, user, purpose string }

type fakeTicketRecorder struct{ got []recordedTicket }

func (f *fakeTicketRecorder) Record(_ context.Context, publicURL, tenantID, userID, purpose string) {
	f.got = append(f.got, recordedTicket{publicURL, tenantID, userID, purpose})
}

func TestMediaHandler_SignedUploadURL_RecordsTicket(t *testing.T) {
	mock := &mockSupabaseStorage{signedResult: &storage.SignedUploadResult{
		SignedURL: "https://s/signed", PublicURL: "https://m.id/uuid.png", ObjectKey: "uuid.png",
	}}
	h := NewMediaHandler(mock, nil)
	rec := &fakeTicketRecorder{}
	h.SetUploadTicketRecorder(rec)

	body, _ := json.Marshal(SignedUploadURLRequest{FileName: "a.png", FileSize: 1024, MIMEType: "image/png"})
	req := httptest.NewRequest(http.MethodPost, "/api/media/signed-upload-url?purpose=feed", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	h.CreateSignedUploadURL(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if len(rec.got) != 1 || rec.got[0].url != "https://m.id/uuid.png" || rec.got[0].purpose != "feed" {
		t.Fatalf("tiket tidak tercatat benar: %+v", rec.got)
	}

	// Penerbitan gagal -> tidak ada tiket.
	rec.got = nil
	mock.signedResult, mock.err = nil, storage.ErrSignedUploadNotSupported
	rr = httptest.NewRecorder()
	h.CreateSignedUploadURL(rr, httptest.NewRequest(http.MethodPost, "/api/media/signed-upload-url", bytes.NewReader(body)))
	if len(rec.got) != 0 {
		t.Fatalf("tiket tidak boleh dicatat saat penerbitan gagal: %+v", rec.got)
	}
}
