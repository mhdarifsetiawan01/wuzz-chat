package api_test

import (
	"context"
	"bytes"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestReportHandler_CreateAndModerate(t *testing.T) {
	sqlStore, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "reports.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer sqlStore.Close()
	rs, err := store.NewSQLReportStore(sqlStore.DB(), "sqlite")
	if err != nil {
		t.Fatal(err)
	}
	h := api.NewReportHandler(rs)

	userTok, _ := auth.GenerateToken("usr_a", "a", "A")
	modTok, _, _ := auth.GenerateSessionTokenWithRole("usr_m", "m", "M", "default", "dev", "wuzz_moderator")

	call := func(method, path, body, tok string, fn http.HandlerFunc) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewReader([]byte(body)))
		req.Header.Set("Authorization", "Bearer "+tok)
		w := httptest.NewRecorder()
		auth.RequireJWT()(fn).ServeHTTP(w, req)
		return w
	}

	if w := call(http.MethodPost, "/api/reports", `{"target_type":"post","target_id":"p1","reason":"bogus"}`, userTok, h.Handle); w.Code != http.StatusBadRequest {
		t.Fatalf("alasan tak valid: want 400, got %d", w.Code)
	}
	if w := call(http.MethodPost, "/api/reports", `{"target_type":"user","target_id":"usr_a","reason":"spam"}`, userTok, h.Handle); w.Code != http.StatusBadRequest {
		t.Fatalf("lapor diri sendiri: want 400, got %d", w.Code)
	}
	body := `{"target_type":"post","target_id":"p1","target_user_id":"usr_b","reason":"spam"}`
	for i := 0; i < 2; i++ { // kedua kali sukses, tersimpan satu (idempoten)
		if w := call(http.MethodPost, "/api/reports", body, userTok, h.Handle); w.Code != http.StatusCreated {
			t.Fatalf("buat laporan: want 201, got %d: %s", w.Code, w.Body.String())
		}
	}
	if w := call(http.MethodGet, "/api/reports", "", userTok, h.Handle); w.Code != http.StatusForbidden {
		t.Fatalf("user biasa list: want 403, got %d", w.Code)
	}
	w := call(http.MethodGet, "/api/reports", "", modTok, h.Handle)
	if w.Code != http.StatusOK {
		t.Fatalf("moderator list: got %d: %s", w.Code, w.Body.String())
	}
	list, _ := rs.List(context.Background(), "default", "open", 10)
	if len(list) != 1 {
		t.Fatalf("want 1 laporan, got %d", len(list))
	}
	if w := call(http.MethodPatch, "/api/reports/"+list[0].ID, `{"status":"resolved"}`, modTok, h.HandleItem); w.Code != http.StatusOK {
		t.Fatalf("resolve: got %d: %s", w.Code, w.Body.String())
	}
	if w := call(http.MethodPatch, "/api/reports/"+list[0].ID, `{"status":"resolved"}`, userTok, h.HandleItem); w.Code != http.StatusForbidden {
		t.Fatalf("user biasa resolve: want 403, got %d", w.Code)
	}
}
