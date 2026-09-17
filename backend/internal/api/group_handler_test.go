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
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

func setupTestGroupAPI(t *testing.T) (*GroupHandler, *store.SQLUserStore, *store.User, *store.User, *store.User) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_group_api.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Gagal init SQLMessageStore: %v", err)
	}

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userA, _ := userStore.Register("alice_api", "Alice API", "pass12345")
	userB, _ := userStore.Register("bob_api", "Bob API", "pass12345")
	userC, _ := userStore.Register("charlie_api", "Charlie API", "pass12345")

	clientStore := store.NewMemoryClientStore()
	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)

	handler := NewGroupHandler(userStore, userStore)
	handler.SetHub(hub)

	return handler, userStore, userA, userB, userC
}

func TestGroupHandler_CreateAndManage(t *testing.T) {
	handler, _, userAlice, userBob, userCharlie := setupTestGroupAPI(t)

	var groupID string

	// 1. Test POST /api/groups
	t.Run("Create Private Group", func(t *testing.T) {
		body := map[string]interface{}{
			"title":       "Tim Engineering",
			"description": "Grup teknis Wuzz Chat",
			"avatar_url":  "https://avatar.com/eng.png",
			"is_public":   false,
			"member_ids":  []string{userBob.ID},
		}
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/api/groups", bytes.NewReader(raw))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userAlice.ID, Username: userAlice.Username})
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.CreateGroup(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp struct {
			Success bool               `json:"success"`
			Group   store.GroupDetails `json:"group"`
		}
		_ = json.Unmarshal(rr.Body.Bytes(), &resp)

		if !resp.Success || resp.Group.ID == "" {
			t.Fatalf("Response format invalid: %s", rr.Body.String())
		}
		if resp.Group.Title != "Tim Engineering" {
			t.Errorf("Expected title 'Tim Engineering', got %s", resp.Group.Title)
		}
		if resp.Group.MyRole != "creator" {
			t.Errorf("Expected creator role, got %s", resp.Group.MyRole)
		}

		groupID = resp.Group.ID
	})

	// 2. Test GET /api/groups/{id}
	t.Run("Get Group Details by Member", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/groups/"+groupID, nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userBob.ID, Username: userBob.Username})
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.RouteGroupRequest(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// 3. Test POST /api/groups/{id}/members (Alice adds Charlie)
	t.Run("Add Member by Creator", func(t *testing.T) {
		body := map[string]interface{}{
			"member_ids": []string{userCharlie.ID},
		}
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/api/groups/"+groupID+"/members", bytes.NewReader(raw))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userAlice.ID, Username: userAlice.Username})
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.RouteGroupRequest(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// 4. Test PATCH /api/groups/{id}/members/{userId}/role (Alice promotes Bob to admin)
	t.Run("Promote Member to Admin", func(t *testing.T) {
		body := map[string]interface{}{
			"role": "admin",
		}
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPatch, "/api/groups/"+groupID+"/members/"+userBob.ID+"/role", bytes.NewReader(raw))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userAlice.ID, Username: userAlice.Username})
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.RouteGroupRequest(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// 5. Test DELETE /api/groups/{id}/members/{userId} (Bob kicks Charlie)
	t.Run("Admin Kicks Member", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/api/groups/"+groupID+"/members/"+userCharlie.ID, nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userBob.ID, Username: userBob.Username})
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.RouteGroupRequest(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// 6. Test Non-Member Unauthorized on Private Group
	t.Run("Kicked Member Cannot Access Private Group", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/groups/"+groupID, nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userCharlie.ID, Username: userCharlie.Username})
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.RouteGroupRequest(rr, req)

		if rr.Code != http.StatusForbidden {
			t.Errorf("Expected 403 Forbidden, got %d: %s", rr.Code, rr.Body.String())
		}
	})
}

func TestGroupHandler_PublicGroupAndJoin(t *testing.T) {
	handler, _, userAlice, userBob, _ := setupTestGroupAPI(t)

	var pubGroupID string

	t.Run("Create Public Group with Username", func(t *testing.T) {
		body := map[string]interface{}{
			"title":          "Wuzz Indonesia",
			"description":    "Komunitas pengguna Wuzz",
			"is_public":      true,
			"group_username": "wuzz_id",
		}
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, "/api/groups", bytes.NewReader(raw))
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userAlice.ID, Username: userAlice.Username})
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.CreateGroup(rr, req)

		if rr.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp struct {
			Group store.GroupDetails `json:"group"`
		}
		_ = json.Unmarshal(rr.Body.Bytes(), &resp)
		pubGroupID = resp.Group.ID
	})

	t.Run("Search Public Group", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/groups/search?q=wuzz", nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userBob.ID, Username: userBob.Username})
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.SearchPublicGroups(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		var list []store.GroupDetails
		_ = json.Unmarshal(rr.Body.Bytes(), &list)
		if len(list) != 1 {
			t.Fatalf("Expected 1 group, got %d", len(list))
		}
		if list[0].GroupUsername != "wuzz_id" {
			t.Errorf("Expected username 'wuzz_id', got %s", list[0].GroupUsername)
		}
	})

	t.Run("Self-Join Public Group", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/groups/"+pubGroupID+"/join", nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userBob.ID, Username: userBob.Username})
		req = req.WithContext(ctx)

		rr := httptest.NewRecorder()
		handler.RouteGroupRequest(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
	})
}
