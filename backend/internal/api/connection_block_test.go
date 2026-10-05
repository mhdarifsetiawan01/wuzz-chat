package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/connection"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
)

func TestConnectionHandler_BlockUnblockAndDMAccess(t *testing.T) {
	handler, userStore, _, cleanup := setupTestConnectionHandler(t)
	defer cleanup()

	ctx := tenantshared.WithTenant(t.Context(), "default")
	alice, _ := userStore.RegisterWithContext(ctx, "blk_alice", "Alice", "password123")
	bob, _ := userStore.RegisterWithContext(ctx, "blk_bob", "Bob", "password123")
	aliceC := &auth.UserClaims{UserID: alice.ID, TenantID: "default"}
	bobC := &auth.UserClaims{UserID: bob.ID, TenantID: "default"}

	call := func(method, path, body string, c *auth.UserClaims) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewReader([]byte(body)))
		req = req.WithContext(auth.SetUserContext(req.Context(), c))
		w := httptest.NewRecorder()
		handler.RouteConnectionRequest(w, req)
		return w
	}
	status := func(c *auth.UserClaims, target string) connection.ConnectionStatusResponse {
		var res connection.ConnectionStatusResponse
		w := call(http.MethodGet, "/api/connections/status/"+target, "", c)
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		return res
	}

	// Berteman dulu, lalu buat DM
	if w := call(http.MethodPost, "/api/connections/request", `{"target_user_id":"`+bob.ID+`"}`, aliceC); w.Code != http.StatusCreated {
		t.Fatalf("request: %d %s", w.Code, w.Body.String())
	}
	if w := call(http.MethodPost, "/api/connections/request", `{"target_user_id":"`+alice.ID+`"}`, bobC); w.Code >= 300 {
		t.Fatalf("mutual accept: %d %s", w.Code, w.Body.String())
	}
	roomID, err := userStore.GetOrCreateDirectConversationWithContext(ctx, alice.ID, bob.ID)
	if err != nil {
		t.Fatalf("dm: %v", err)
	}
	for _, u := range []string{alice.ID, bob.ID} {
		if ok, _ := userStore.IsUserInConversation(roomID, u); !ok {
			t.Fatalf("sebelum blokir %s harus anggota DM", u)
		}
	}

	// Alice memblokir Bob (idempoten)
	for i := 0; i < 2; i++ {
		if w := call(http.MethodPost, "/api/connections/block", `{"user_id":"`+bob.ID+`"}`, aliceC); w.Code != http.StatusOK {
			t.Fatalf("block: %d %s", w.Code, w.Body.String())
		}
	}
	if s := status(aliceC, bob.ID); s.Status != connection.StatusBlocked || !s.BlockedByMe || s.CanMessage {
		t.Fatalf("status Alice salah: %+v", s)
	}
	if s := status(bobC, alice.ID); s.Status != connection.StatusBlocked || !s.BlockedByThem || s.CanMessage {
		t.Fatalf("status Bob salah: %+v", s)
	}
	if ok, _ := userStore.IsUserInConversation(roomID, bob.ID); ok {
		t.Fatal("Bob (diblokir) tidak boleh lagi mengakses DM")
	}
	if ok, _ := userStore.IsUserInConversation(roomID, alice.ID); !ok {
		t.Fatal("Alice (pemblokir) tetap boleh membaca DM")
	}

	// Bob tak bisa meminta berteman ataupun membuka blokir lewat unfriend/unblock
	if w := call(http.MethodPost, "/api/connections/request", `{"target_user_id":"`+alice.ID+`"}`, bobC); w.Code < 400 {
		t.Fatalf("Bob tidak boleh mengirim permintaan ke pemblokirnya: %d", w.Code)
	}
	if w := call(http.MethodDelete, "/api/connections/"+alice.ID, "", bobC); w.Code < 400 {
		t.Fatalf("Bob tidak boleh melepas blokir lewat unfriend: %d", w.Code)
	}
	if w := call(http.MethodDelete, "/api/connections/block/"+alice.ID, "", bobC); w.Code != http.StatusNotFound {
		t.Fatalf("Bob unblock: want 404, got %d", w.Code)
	}
	if s := status(aliceC, bob.ID); s.Status != connection.StatusBlocked {
		t.Fatalf("blokir harus bertahan: %+v", s)
	}

	// Alice membuka blokir -> Bob kembali punya akses
	if w := call(http.MethodDelete, "/api/connections/block/"+bob.ID, "", aliceC); w.Code != http.StatusOK {
		t.Fatalf("unblock: %d %s", w.Code, w.Body.String())
	}
	if ok, _ := userStore.IsUserInConversation(roomID, bob.ID); !ok {
		t.Fatal("setelah unblock Bob harus bisa mengakses DM lagi")
	}
	if s := status(aliceC, bob.ID); s.Status != connection.StatusNone {
		t.Fatalf("setelah unblock status harus none: %+v", s)
	}
}
