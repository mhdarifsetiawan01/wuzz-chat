package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestShortLinkHandler_CreateAndResolve(t *testing.T) {
	sqlStore, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "short_link.db"))
	if err != nil {
		t.Fatalf("Gagal init SQLMessageStore: %v", err)
	}
	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	groupStore := store.NewSQLGroupStore(sqlStore.DB(), sqlStore.DriverName())
	alice, _ := userStore.Register("alice_sl", "Alice", "pass12345")
	bob, _ := userStore.Register("bob_sl", "Bob", "pass12345")

	grp, err := groupStore.CreateGroup("Grup Tautan", "", "", alice.ID, "", false, nil)
	if err != nil {
		t.Fatalf("Gagal membuat grup: %v", err)
	}
	h := NewShortLinkHandler(store.NewShortLinkStore(sqlStore.DB(), sqlStore.DriverName()), true)

	create := func(userID, roomID string) *httptest.ResponseRecorder {
		raw, _ := json.Marshal(map[string]string{"room_id": roomID})
		req := httptest.NewRequest(http.MethodPost, "/api/links", bytes.NewReader(raw))
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userID}))
		rr := httptest.NewRecorder()
		h.Create(rr, req)
		return rr
	}

	rr := create(alice.ID, grp.ID)
	if rr.Code != http.StatusOK {
		t.Fatalf("Create anggota: want 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var created struct{ Code, Path string }
	_ = json.Unmarshal(rr.Body.Bytes(), &created)
	if !store.IsShortCode(created.Code) || created.Path != "/g/"+created.Code {
		t.Fatalf("kode/path tidak valid: %+v", created)
	}

	// Idempoten: kode yang sama tidak berganti.
	var again struct{ Code string }
	_ = json.Unmarshal(create(alice.ID, grp.ID).Body.Bytes(), &again)
	if again.Code != created.Code {
		t.Errorf("kode berganti: %s != %s", again.Code, created.Code)
	}

	if rr := create(bob.ID, grp.ID); rr.Code != http.StatusForbidden {
		t.Errorf("non-anggota: want 403, got %d", rr.Code)
	}
	if rr := create(alice.ID, "grp_tidak-ada"); rr.Code != http.StatusNotFound {
		t.Errorf("grup tak ada: want 404, got %d", rr.Code)
	}
	if rr := create(alice.ID, "dm_x"); rr.Code != http.StatusNotFound {
		t.Errorf("bukan grup: want 404, got %d", rr.Code)
	}

	resolve := func(code string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/links/"+code, nil)
		rr := httptest.NewRecorder()
		h.Resolve(rr, req)
		return rr
	}
	rr = resolve(created.Code)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), grp.ID) {
		t.Fatalf("Resolve: want 200 + %s, got %d: %s", grp.ID, rr.Code, rr.Body.String())
	}
	// Grup privat tidak boleh membocorkan nama/avatar tanpa login.
	if strings.Contains(rr.Body.String(), "preview") || strings.Contains(rr.Body.String(), "Grup Tautan") {
		t.Errorf("grup privat membocorkan pratinjau: %s", rr.Body.String())
	}

	// Grup publik: pratinjau nama + avatar tersedia.
	pub, err := groupStore.CreateGroup("Grup Publik Tautan", "", "emoji:🔥", alice.ID, "", true, nil)
	if err != nil {
		t.Fatalf("Gagal membuat grup publik: %v", err)
	}
	var pubCreated struct{ Code string }
	_ = json.Unmarshal(create(alice.ID, pub.ID).Body.Bytes(), &pubCreated)
	var pubResp struct {
		RoomID  string `json:"room_id"`
		Preview *struct {
			Title     string `json:"title"`
			AvatarURL string `json:"avatar_url"`
		} `json:"preview"`
	}
	_ = json.Unmarshal(resolve(pubCreated.Code).Body.Bytes(), &pubResp)
	if pubResp.RoomID != pub.ID || pubResp.Preview == nil || pubResp.Preview.Title != "Grup Publik Tautan" || pubResp.Preview.AvatarURL != "emoji:🔥" {
		t.Errorf("pratinjau grup publik salah: %+v", pubResp)
	}
	if rr := resolve("aaaaaaaa"); rr.Code != http.StatusNotFound {
		t.Errorf("kode tak dikenal: want 404, got %d", rr.Code)
	}
	if rr := resolve("grp_bad"); rr.Code != http.StatusNotFound {
		t.Errorf("bentuk salah: want 404, got %d", rr.Code)
	}
}

func TestShortLinkHandler_CreateDisabledStillResolves(t *testing.T) {
	sqlStore, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "short_link_off.db"))
	if err != nil {
		t.Fatalf("Gagal init SQLMessageStore: %v", err)
	}
	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	groupStore := store.NewSQLGroupStore(sqlStore.DB(), sqlStore.DriverName())
	alice, _ := userStore.Register("alice_off", "Alice", "pass12345")
	grp, err := groupStore.CreateGroup("Grup Off", "", "", alice.ID, "", true, nil)
	if err != nil {
		t.Fatalf("Gagal membuat grup: %v", err)
	}
	linkStore := store.NewShortLinkStore(sqlStore.DB(), sqlStore.DriverName())

	// Kode yang sudah ada sebelum sakelar dimatikan tetap harus bisa dibuka.
	code, err := linkStore.GetOrCreate(context.Background(), grp.ID, alice.ID)
	if err != nil {
		t.Fatalf("GetOrCreate: %v", err)
	}

	h := NewShortLinkHandler(linkStore, false)
	raw, _ := json.Marshal(map[string]string{"room_id": grp.ID})
	req := httptest.NewRequest(http.MethodPost, "/api/links", bytes.NewReader(raw))
	req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: alice.ID}))
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	if rr.Code != http.StatusServiceUnavailable || !strings.Contains(rr.Body.String(), "short_links_disabled") {
		t.Fatalf("Create saat mati: want 503 short_links_disabled, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	h.Resolve(rr, httptest.NewRequest(http.MethodGet, "/api/links/"+code, nil))
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), grp.ID) {
		t.Fatalf("Resolve saat mati: want 200 + %s, got %d: %s", grp.ID, rr.Code, rr.Body.String())
	}
}
