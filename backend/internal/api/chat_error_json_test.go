package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Pesan galat dari service bisa memuat tanda kutip, garis miring terbalik, atau baris baru. Dulu chat_handler menyusun
// JSON dengan penggabungan string sehingga body seperti itu menjadi JSON tidak valid.
func TestWriteChatError_EscapesMessage(t *testing.T) {
	msg := `pesan "kutip" \ garis` + "\nbaris baru"
	rec := httptest.NewRecorder()
	writeChatError(rec, http.StatusBadRequest, msg)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body bukan JSON valid: %v (%q)", err, rec.Body.String())
	}
	if body["error"] != msg {
		t.Fatalf("error = %q, want %q", body["error"], msg)
	}
}
