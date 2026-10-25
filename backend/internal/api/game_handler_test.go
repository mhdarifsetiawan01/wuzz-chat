package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/game"
	gameinfra "github.com/bms-del112/wuzz-chat/internal/game/infra"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func newGameHandler(t *testing.T, enabled bool) *api.GameHandler {
	t.Helper()
	ms, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "game.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ms.Close() })
	svc := game.NewService(gameinfra.NewSQLRepository(ms.DB(), ms.DriverName()), enabled)
	return api.NewGameHandler(svc)
}

func gameCall(h *api.GameHandler, method, path string, body any, authed bool) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	if authed {
		req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: "u1", TenantID: "default"}))
	}
	rec := httptest.NewRecorder()
	h.Route(rec, req)
	return rec
}

func TestGameHandler_RequiresAuth(t *testing.T) {
	h := newGameHandler(t, true)
	if rec := gameCall(h, http.MethodGet, "/api/game/today", nil, false); rec.Code != http.StatusUnauthorized {
		t.Fatalf("kode %d, mau 401", rec.Code)
	}
}

func TestGameHandler_DisabledMeansHiddenCardAndForbiddenWrites(t *testing.T) {
	h := newGameHandler(t, false)

	rec := gameCall(h, http.MethodGet, "/api/game/today", nil, true)
	var today map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &today)
	if rec.Code != http.StatusOK || today["enabled"] != false || today["puzzle"] != nil {
		t.Fatalf("today saat mati: %d %s", rec.Code, rec.Body.String())
	}
	for _, c := range []struct{ method, path string }{
		{http.MethodPost, "/api/game/today/start"},
		{http.MethodPost, "/api/game/today/submit"},
		{http.MethodGet, "/api/game/settings"},
	} {
		if rec := gameCall(h, c.method, c.path, map[string]any{"placement": []int{}}, true); rec.Code != http.StatusForbidden {
			t.Errorf("%s %s: %d, mau 403", c.method, c.path, rec.Code)
		}
	}
}

func TestGameHandler_PlayFlowNeverLeaksSolution(t *testing.T) {
	h := newGameHandler(t, true)

	rec := gameCall(h, http.MethodGet, "/api/game/today", nil, true)
	if rec.Code != http.StatusOK {
		t.Fatalf("today: %d %s", rec.Code, rec.Body.String())
	}
	var raw map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &raw)
	puzzle, _ := raw["puzzle"].(map[string]any)
	if puzzle == nil || puzzle["regions"] == nil {
		t.Fatalf("puzzle harus memuat regions: %s", rec.Body.String())
	}
	if _, leaked := puzzle["solution"]; leaked || bytes.Contains(rec.Body.Bytes(), []byte("Solution")) {
		t.Fatalf("solusi bocor ke klien: %s", rec.Body.String())
	}

	// Submit sebelum start -> 409.
	size := int(puzzle["size"].(float64))
	empty := make([]int, size)
	for i := range empty {
		empty[i] = -1
	}
	if rec := gameCall(h, http.MethodPost, "/api/game/today/submit", map[string]any{"placement": empty}, true); rec.Code != http.StatusConflict {
		t.Errorf("submit tanpa start: %d, mau 409", rec.Code)
	}

	if rec := gameCall(h, http.MethodPost, "/api/game/today/start", nil, true); rec.Code != http.StatusOK {
		t.Fatalf("start: %d %s", rec.Code, rec.Body.String())
	}
	// Panjang salah -> 400.
	if rec := gameCall(h, http.MethodPost, "/api/game/today/submit", map[string]any{"placement": []int{0}}, true); rec.Code != http.StatusBadRequest {
		t.Errorf("placement salah panjang: %d, mau 400", rec.Code)
	}
	// Kosong tapi sah secara struktur -> belum selesai.
	rec = gameCall(h, http.MethodPost, "/api/game/today/submit", map[string]any{"placement": empty}, true)
	var res map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &res)
	if rec.Code != http.StatusOK || res["solved"] != false {
		t.Errorf("submit kosong: %d %s", rec.Code, rec.Body.String())
	}
}

func TestGameHandler_SettingsAndRouting(t *testing.T) {
	h := newGameHandler(t, true)

	rec := gameCall(h, http.MethodPut, "/api/game/settings", map[string]any{"timezone": "Mars/Olympus"}, true)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("zona tidak sah: %d, mau 400", rec.Code)
	}
	rec = gameCall(h, http.MethodPut, "/api/game/settings", map[string]any{"leaderboard_public": true, "timezone": "Asia/Makassar"}, true)
	if rec.Code != http.StatusOK {
		t.Fatalf("simpan: %d %s", rec.Code, rec.Body.String())
	}
	var st map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &st)
	if st["leaderboard_public"] != true || st["timezone"] != "Asia/Makassar" {
		t.Errorf("tersimpan: %v", st)
	}

	for _, c := range []struct {
		method, path string
		want         int
	}{
		{http.MethodPost, "/api/game/today", http.StatusMethodNotAllowed},
		{http.MethodGet, "/api/game/today/start", http.StatusMethodNotAllowed},
		{http.MethodDelete, "/api/game/settings", http.StatusMethodNotAllowed},
		{http.MethodGet, "/api/game/unknown", http.StatusNotFound},
	} {
		if rec := gameCall(h, c.method, c.path, nil, true); rec.Code != c.want {
			t.Errorf("%s %s: %d, mau %d", c.method, c.path, rec.Code, c.want)
		}
	}
}

func TestGameHandler_Leaderboard(t *testing.T) {
	h := newGameHandler(t, true)

	rec := gameCall(h, http.MethodGet, "/api/game/leaderboard?scope=friends", nil, true) // period bawaan = day
	var board map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &board)
	if rec.Code != http.StatusOK || board["scope"] != "friends" || board["period"] != "day" {
		t.Fatalf("papan teman: %d %s", rec.Code, rec.Body.String())
	}
	if entries, ok := board["entries"].([]any); !ok || len(entries) != 0 {
		t.Errorf("entries harus array kosong (bukan null): %s", rec.Body.String())
	}

	for _, c := range []struct {
		name, url string
		want      int
	}{
		{"scope tidak dikenal", "/api/game/leaderboard?scope=global", http.StatusBadRequest},
		{"periode tidak dikenal", "/api/game/leaderboard?scope=friends&period=month", http.StatusBadRequest},
		{"grup tanpa id", "/api/game/leaderboard?scope=group", http.StatusBadRequest},
		{"bukan anggota grup", "/api/game/leaderboard?scope=group&group_id=grp_orang_lain", http.StatusForbidden},
	} {
		if rec := gameCall(h, http.MethodGet, c.url, nil, true); rec.Code != c.want {
			t.Errorf("%s: %d, mau %d (%s)", c.name, rec.Code, c.want, rec.Body.String())
		}
	}
	if rec := gameCall(h, http.MethodPost, "/api/game/leaderboard", nil, true); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST: %d, mau 405", rec.Code)
	}
	if rec := gameCall(h, http.MethodGet, "/api/game/leaderboard?scope=friends", nil, false); rec.Code != http.StatusUnauthorized {
		t.Errorf("tanpa login: %d, mau 401", rec.Code)
	}

	off := newGameHandler(t, false)
	if rec := gameCall(off, http.MethodGet, "/api/game/leaderboard?scope=friends", nil, true); rec.Code != http.StatusForbidden {
		t.Errorf("fitur mati: %d, mau 403", rec.Code)
	}
}
