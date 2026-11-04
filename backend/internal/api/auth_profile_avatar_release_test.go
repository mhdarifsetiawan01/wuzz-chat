package api_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type recordingReleaser struct{ urls []string }

func (r *recordingReleaser) Release(_ context.Context, urls ...string) { r.urls = append(r.urls, urls...) }

func TestAuthHandler_UpdateProfile_ReleasesReplacedAvatar(t *testing.T) {
	sqlStore, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "avatar_release.db"))
	if err != nil {
		t.Fatalf("init store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	h := api.NewAuthHandler(userStore)
	rel := &recordingReleaser{}
	h.SetMediaReleaser(rel)

	u, err := userStore.Register("alice_avrel", "Alice", "password123")
	if err != nil {
		t.Fatal(err)
	}
	token, _ := auth.GenerateToken(u.ID, u.Username, u.DisplayName)
	handler := auth.RequireJWT()(http.HandlerFunc(h.UpdateProfile))
	put := func(body string) int {
		req := httptest.NewRequest(http.MethodPut, "/api/auth/profile", bytes.NewReader([]byte(body)))
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		return w.Code
	}

	// Avatar pertama: belum ada yang lama -> tidak ada pelepasan.
	if c := put(`{"avatar_url":"https://m.id/a1.jpg"}`); c != http.StatusOK {
		t.Fatalf("want 200, got %d", c)
	}
	if len(rel.urls) != 0 {
		t.Fatalf("avatar pertama tidak boleh melepas apa pun: %v", rel.urls)
	}
	// Ganti avatar -> yang lama dilepas.
	if c := put(`{"avatar_url":"https://m.id/a2.jpg"}`); c != http.StatusOK {
		t.Fatalf("want 200, got %d", c)
	}
	if len(rel.urls) != 1 || rel.urls[0] != "https://m.id/a1.jpg" {
		t.Fatalf("want a1 dilepas, got %v", rel.urls)
	}
	// Mengirim URL yang sama, atau tanpa avatar_url -> tidak ada pelepasan baru.
	put(`{"avatar_url":"https://m.id/a2.jpg"}`)
	put(`{"display_name":"Alice B"}`)
	if len(rel.urls) != 1 {
		t.Fatalf("tidak boleh ada pelepasan tambahan: %v", rel.urls)
	}
}
