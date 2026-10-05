package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestAuthHandler_DeleteAccount(t *testing.T) {
	sqlStore, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "delete_account.db"))
	if err != nil {
		t.Fatalf("init store: %v", err)
	}
	defer sqlStore.Close()
	db := sqlStore.DB()

	userStore := store.NewSQLUserStore(db, sqlStore.DriverName())
	authHandler := api.NewAuthHandler(userStore)
	authHandler.SetAccountEraser(store.NewSQLAccountEraser(db, sqlStore.DriverName()))

	alice, err := userStore.Register("alice_del", "Alice", "password123")
	if err != nil {
		t.Fatalf("register alice: %v", err)
	}
	bob, err := userStore.Register("bob_del", "Bob", "password123")
	if err != nil {
		t.Fatalf("register bob: %v", err)
	}
	token, _ := auth.GenerateToken(alice.ID, alice.Username, alice.DisplayName)

	now := time.Now().UTC()
	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatalf("seed (%s): %v", q, err)
		}
	}
	// Grup: alice creator, bob member -> bob harus mewarisi creator
	mustExec(`INSERT INTO conversations (id, type, title, created_by, created_at, updated_at) VALUES ('grp_x','group','G',?,?,?)`, alice.ID, now, now)
	mustExec(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES ('grp_x',?,'creator',?)`, alice.ID, now)
	mustExec(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES ('grp_x',?,'member',?)`, bob.ID, now)
	// Grup solo milik alice -> harus ikut terhapus
	mustExec(`INSERT INTO conversations (id, type, title, created_by, created_at, updated_at) VALUES ('grp_solo','group','S',?,?,?)`, alice.ID, now, now)
	mustExec(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES ('grp_solo',?,'creator',?)`, alice.ID, now)
	// Pesan alice dan bob
	mustExec(`INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, created_at) VALUES ('m1','grp_x',?,'Alice','grp_x','halo',?)`, alice.ID, now)
	mustExec(`INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, created_at) VALUES ('m2','grp_x',?,'Bob','grp_x','hai',?)`, bob.ID, now)
	// Feed: post bob disukai alice
	mustExec(`INSERT INTO feed_posts (id, user_id, content, likes_count, created_at, updated_at) VALUES ('p1',?,'post bob',1,?,?)`, bob.ID, now, now)
	mustExec(`INSERT INTO feed_likes (post_id, user_id, created_at) VALUES ('p1',?,?)`, alice.ID, now)
	mustExec(`INSERT INTO push_subscriptions (id, user_id, platform, endpoint, created_at) VALUES ('ps1',?,'android','tok',?)`, alice.ID, now)

	handler := auth.RequireJWT()(http.HandlerFunc(authHandler.DeleteAccount))
	do := func(method, body, tok string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "/api/auth/me", bytes.NewReader([]byte(body)))
		if tok != "" {
			req.Header.Set("Authorization", "Bearer "+tok)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		return w
	}

	if w := do(http.MethodDelete, `{"password":"password123"}`, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("tanpa token: want 401, got %d", w.Code)
	}
	if w := do(http.MethodDelete, `{"password":"salah"}`, token); w.Code != http.StatusUnauthorized {
		t.Fatalf("password salah: want 401, got %d", w.Code)
	}
	if w := do(http.MethodDelete, `{}`, token); w.Code != http.StatusBadRequest {
		t.Fatalf("tanpa password: want 400, got %d", w.Code)
	}
	var count int
	db.QueryRow(`SELECT COUNT(1) FROM messages WHERE from_id = ?`, alice.ID).Scan(&count)
	if count != 1 {
		t.Fatalf("data tidak boleh berubah sebelum konfirmasi sukses, pesan alice=%d", count)
	}

	w := do(http.MethodDelete, `{"password":"password123"}`, token)
	if w.Code != http.StatusOK {
		t.Fatalf("hapus akun: want 200, got %d: %s", w.Code, w.Body.String())
	}
	var res map[string]string
	_ = json.NewDecoder(w.Body).Decode(&res)
	if res["status"] != "ok" {
		t.Fatalf("respons tak terduga: %v", res)
	}

	check := func(label, q string, want int, args ...any) {
		t.Helper()
		var n int
		if err := db.QueryRow(q, args...).Scan(&n); err != nil {
			t.Fatalf("%s: %v", label, err)
		}
		if n != want {
			t.Fatalf("%s: want %d, got %d", label, want, n)
		}
	}
	check("pesan alice terhapus", `SELECT COUNT(1) FROM messages WHERE from_id = ?`, 0, alice.ID)
	check("pesan bob utuh", `SELECT COUNT(1) FROM messages WHERE from_id = ?`, 1, bob.ID)
	check("membership alice hilang", `SELECT COUNT(1) FROM conversation_members WHERE user_id = ?`, 0, alice.ID)
	check("bob jadi creator", `SELECT COUNT(1) FROM conversation_members WHERE user_id = ? AND role = 'creator'`, 1, bob.ID)
	check("grup solo terhapus", `SELECT COUNT(1) FROM conversations WHERE id = 'grp_solo'`, 0)
	check("grup bersama utuh", `SELECT COUNT(1) FROM conversations WHERE id = 'grp_x'`, 1)
	check("push token hilang", `SELECT COUNT(1) FROM push_subscriptions WHERE user_id = ?`, 0, alice.ID)
	check("like alice hilang", `SELECT COUNT(1) FROM feed_likes WHERE user_id = ?`, 0, alice.ID)
	check("counter post bob disinkronkan", `SELECT likes_count FROM feed_posts WHERE id = 'p1'`, 0)
	check("kredensial hilang", `SELECT COUNT(1) FROM user_credentials WHERE user_id = ?`, 0, alice.ID)

	var username, display string
	db.QueryRow(`SELECT username, display_name FROM users WHERE id = ?`, alice.ID).Scan(&username, &display)
	if username == "alice_del" || display != "Akun Terhapus" {
		t.Fatalf("user harus dianonimkan, got %q / %q", username, display)
	}

	// Login ulang gagal dan username bisa dipakai lagi
	if ok, _ := userStore.VerifyPassword(alice.ID, "password123"); ok {
		t.Fatal("password lama tidak boleh valid setelah akun dihapus")
	}
	if _, err := userStore.Register("alice_del", "Alice Baru", "password123"); err != nil {
		t.Fatalf("username harus bisa didaftarkan ulang: %v", err)
	}
}
