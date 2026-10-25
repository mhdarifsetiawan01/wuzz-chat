package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/game"
	gameinfra "github.com/bms-del112/wuzz-chat/internal/game/infra"
)

func (e *modEnv) boardCall(method, userID, body, tok string) (int, map[string]any) {
	w := e.call(method, "/api/admin/users/"+userID+"/game-board", body, tok, e.handler.HandleUser)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func (e *modEnv) boardAudit(userID string) []string {
	rows, err := e.sqlStore.DB().Query(e.rb(`SELECT action FROM game_board_audit WHERE user_id = ? ORDER BY created_at`), userID)
	if err != nil {
		e.t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var a string
		_ = rows.Scan(&a)
		out = append(out, a)
	}
	return out
}

func TestModerationGameBoard_HideAndRestore(t *testing.T) {
	e := newModEnv(t)
	svc := game.NewService(gameinfra.NewSQLRepository(e.sqlStore.DB(), e.driver), true)
	e.handler.SetGameBoardModerator(svc)

	staff, normal, target := e.user("staff"), e.user("normal"), e.user("target")
	staffTok := e.token(staff, "default", "wuzz_moderator")
	userTok := e.token(normal, "default", "user")

	// Akses: tanpa token 401, user biasa 403.
	if w := e.call(http.MethodGet, "/api/admin/users/"+target.ID+"/game-board", "", "", e.handler.HandleUser); w.Code != http.StatusUnauthorized {
		t.Errorf("tanpa token: %d", w.Code)
	}
	if code, _ := e.boardCall(http.MethodPost, target.ID, `{"hidden":true,"note":"x"}`, userTok); code != http.StatusForbidden {
		t.Errorf("user biasa: %d, mau 403", code)
	}

	// Status awal tidak disembunyikan.
	if code, body := e.boardCall(http.MethodGet, target.ID, "", staffTok); code != http.StatusOK || body["hidden"] != false {
		t.Fatalf("status awal: %d %v", code, body)
	}
	// Mengeluarkan tanpa catatan ditolak.
	if code, _ := e.boardCall(http.MethodPost, target.ID, `{"hidden":true}`, staffTok); code != http.StatusBadRequest {
		t.Errorf("tanpa catatan: %d, mau 400", code)
	}
	if code, _ := e.boardCall(http.MethodPost, target.ID, `{bukan json`, staffTok); code != http.StatusBadRequest {
		t.Errorf("payload rusak: %d, mau 400", code)
	}
	// Mengeluarkan dengan catatan berhasil dan bisa dibaca kembali.
	if code, body := e.boardCall(http.MethodPost, target.ID, `{"hidden":true,"note":"username menyinggung"}`, staffTok); code != http.StatusOK || body["hidden"] != true {
		t.Fatalf("keluarkan: %d %v", code, body)
	}
	if _, body := e.boardCall(http.MethodGet, target.ID, "", staffTok); body["hidden"] != true {
		t.Errorf("GET setelah keluarkan: %v", body)
	}
	// Mengembalikan tidak butuh catatan.
	if code, body := e.boardCall(http.MethodPost, target.ID, `{"hidden":false}`, staffTok); code != http.StatusOK || body["hidden"] != false {
		t.Fatalf("kembalikan: %d %v", code, body)
	}
	if got := e.boardAudit(target.ID); len(got) != 2 || got[0] != "hide" || got[1] != "show" {
		t.Errorf("audit %v, mau [hide show]", got)
	}

	// Pengguna tak dikenal 404; metode lain 405.
	if code, _ := e.boardCall(http.MethodPost, "tidak-ada", `{"hidden":true,"note":"x"}`, staffTok); code != http.StatusNotFound {
		t.Errorf("pengguna tak dikenal: %d, mau 404", code)
	}
	if code, _ := e.boardCall(http.MethodDelete, target.ID, "", staffTok); code != http.StatusMethodNotAllowed {
		t.Errorf("DELETE: %d, mau 405", code)
	}
}

func TestModerationGameBoard_DisabledWithoutModerator(t *testing.T) {
	e := newModEnv(t) // game tidak dipasang
	staff, target := e.user("staff"), e.user("target")
	staffTok := e.token(staff, "default", "wuzz_moderator")
	if code, _ := e.boardCall(http.MethodGet, target.ID, "", staffTok); code != http.StatusNotFound {
		t.Errorf("tanpa pengelola game: %d, mau 404", code)
	}
}
