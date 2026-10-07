package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// Hapus percakapan: id yang tidak ada dibalas 404 (bukan 500) dan akun lawan bicara yang sudah dihapus
// tampil sebagai "Akun dihapus" (bukan judul kosong).
func TestClearConversation_EdgeCases(t *testing.T) {
	sqlStore, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "clear_edge.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer sqlStore.Close()
	us := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	h := NewChatHandler(us, sqlStore)
	a, _ := us.Register("alice_edge", "Alice", "password123")
	c, _ := us.Register("carol_edge", "Carol", "password123")
	room, _ := us.GetOrCreateDirectConversation(a.ID, c.ID)

	do := func(fn http.HandlerFunc, method, url string, body any) *httptest.ResponseRecorder {
		bs, _ := json.Marshal(body)
		r := httptest.NewRequest(method, url, bytes.NewReader(bs))
		r = r.WithContext(auth.SetUserContext(r.Context(), &auth.UserClaims{UserID: a.ID}))
		w := httptest.NewRecorder()
		fn(w, r)
		return w
	}

	if w := do(h.ClearConversation, "POST", "/api/conversations/clear", map[string]string{"id": "conv_tidak_ada"}); w.Code != http.StatusNotFound {
		t.Errorf("id tidak ada: want 404, got %d %s", w.Code, w.Body.String())
	}

	if err := store.NewSQLAccountEraser(sqlStore.DB(), sqlStore.DriverName()).EraseUser(t.Context(), c.ID); err != nil {
		t.Fatalf("erase: %v", err)
	}
	var items []store.ConversationItem
	_ = json.Unmarshal(do(h.GetConversations, "GET", "/api/conversations", nil).Body.Bytes(), &items)
	if len(items) != 1 || items[0].Title != "Akun dihapus" {
		t.Fatalf("want 1 item titled 'Akun dihapus', got %+v", items)
	}
	if w := do(h.ClearConversation, "POST", "/api/conversations/clear", map[string]string{"id": room}); w.Code != http.StatusOK {
		t.Errorf("clear room peer terhapus: want 200, got %d", w.Code)
	}
}
