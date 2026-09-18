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

func TestGroupHandler_SubGroups(t *testing.T) {
	handler, userStore, userAlice, userBob, userCharlie := setupTestGroupAPI(t)

	// Buat user Dave yang bukan anggota grup utama
	userDave, _ := userStore.Register("dave_api", "Dave API", "pass12345")

	// 1. Alice membuat grup utama
	body := map[string]interface{}{
		"title":       "Grup Utama Induk",
		"description": "Parent Group Test",
		"is_public":   true,
		"member_ids":  []string{userBob.ID, userCharlie.ID},
	}
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/groups", bytes.NewReader(raw))
	ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userAlice.ID, Username: userAlice.Username})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	handler.CreateGroup(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("Failed to create parent group: %s", rr.Body.String())
	}

	var createResp struct {
		Success bool               `json:"success"`
		Group   store.GroupDetails `json:"group"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &createResp)
	parentID := createResp.Group.ID

	var subGroupID string

	// 2. Alice (anggota grup induk) membuat subgrup -> HARUS SUKSES
	t.Run("Create Subgroup by Parent Member", func(t *testing.T) {
		subBody := map[string]interface{}{
			"title":       "Topik Diskusi Backend",
			"description": "Subgrup ephemeral Go",
			"duration":    "7_days",
		}
		rawSub, _ := json.Marshal(subBody)
		subReq := httptest.NewRequest(http.MethodPost, "/api/groups/"+parentID+"/subgroups", bytes.NewReader(rawSub))
		subCtx := auth.SetUserContext(subReq.Context(), &auth.UserClaims{UserID: userAlice.ID, Username: userAlice.Username})
		subReq = subReq.WithContext(subCtx)

		subRR := httptest.NewRecorder()
		handler.RouteGroupRequest(subRR, subReq)

		if subRR.Code != http.StatusCreated {
			t.Fatalf("Expected 201 Created for subgroup, got %d: %s", subRR.Code, subRR.Body.String())
		}

		var subResp struct {
			Success  bool               `json:"success"`
			Subgroup store.GroupDetails `json:"subgroup"`
		}
		_ = json.Unmarshal(subRR.Body.Bytes(), &subResp)

		if !subResp.Success || subResp.Subgroup.ID == "" {
			t.Fatalf("Invalid subgroup response: %s", subRR.Body.String())
		}
		if subResp.Subgroup.ParentID != parentID {
			t.Errorf("Expected parent_id %s, got %s", parentID, subResp.Subgroup.ParentID)
		}
		if subResp.Subgroup.Status != "active" {
			t.Errorf("Expected status active, got %s", subResp.Subgroup.Status)
		}
		subGroupID = subResp.Subgroup.ID
	})

	// 3. Dave (bukan anggota induk) mencoba membuat subgrup -> HARUS DITOLAK 403
	t.Run("Create Subgroup by Non-Parent Member Forbidden", func(t *testing.T) {
		subBody := map[string]interface{}{
			"title":    "Subgrup Ilegal",
			"duration": "7_days",
		}
		rawSub, _ := json.Marshal(subBody)
		subReq := httptest.NewRequest(http.MethodPost, "/api/groups/"+parentID+"/subgroups", bytes.NewReader(rawSub))
		subCtx := auth.SetUserContext(subReq.Context(), &auth.UserClaims{UserID: userDave.ID, Username: userDave.Username})
		subReq = subReq.WithContext(subCtx)

		subRR := httptest.NewRecorder()
		handler.RouteGroupRequest(subRR, subReq)

		if subRR.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden, got %d: %s", subRR.Code, subRR.Body.String())
		}
	})

	// 4. Bob (anggota induk) melihat daftar subgrup -> HARUS SUKSES
	t.Run("Get Active Subgroups by Parent Member", func(t *testing.T) {
		getReq := httptest.NewRequest(http.MethodGet, "/api/groups/"+parentID+"/subgroups", nil)
		getCtx := auth.SetUserContext(getReq.Context(), &auth.UserClaims{UserID: userBob.ID, Username: userBob.Username})
		getReq = getReq.WithContext(getCtx)

		getRR := httptest.NewRecorder()
		handler.RouteGroupRequest(getRR, getReq)

		if getRR.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", getRR.Code, getRR.Body.String())
		}

		var listResp struct {
			Success   bool                 `json:"success"`
			Subgroups []store.SubGroupItem `json:"subgroups"`
		}
		_ = json.Unmarshal(getRR.Body.Bytes(), &listResp)

		if len(listResp.Subgroups) != 1 {
			t.Fatalf("Expected 1 active subgroup, got %d", len(listResp.Subgroups))
		}
		if listResp.Subgroups[0].ID != subGroupID {
			t.Errorf("Expected subgroup ID %s, got %s", subGroupID, listResp.Subgroups[0].ID)
		}
		if listResp.Subgroups[0].IsMember {
			t.Errorf("Expected Bob is_member false before joining")
		}
	})

	// 5. Dave (bukan anggota induk) mencoba melihat daftar subgrup -> HARUS DITOLAK 403
	t.Run("Get Active Subgroups by Non-Parent Member Forbidden", func(t *testing.T) {
		getReq := httptest.NewRequest(http.MethodGet, "/api/groups/"+parentID+"/subgroups", nil)
		getCtx := auth.SetUserContext(getReq.Context(), &auth.UserClaims{UserID: userDave.ID, Username: userDave.Username})
		getReq = getReq.WithContext(getCtx)

		getRR := httptest.NewRecorder()
		handler.RouteGroupRequest(getRR, getReq)

		if getRR.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden, got %d: %s", getRR.Code, getRR.Body.String())
		}
	})

	// 6. Dave (bukan anggota induk) mencoba bergabung ke subgrup -> HARUS DITOLAK 403
	t.Run("Join Subgroup by Non-Parent Member Forbidden", func(t *testing.T) {
		joinReq := httptest.NewRequest(http.MethodPost, "/api/groups/"+subGroupID+"/join", nil)
		joinCtx := auth.SetUserContext(joinReq.Context(), &auth.UserClaims{UserID: userDave.ID, Username: userDave.Username})
		joinReq = joinReq.WithContext(joinCtx)

		joinRR := httptest.NewRecorder()
		handler.RouteGroupRequest(joinRR, joinReq)

		if joinRR.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden, got %d: %s", joinRR.Code, joinRR.Body.String())
		}
	})

	// 7. Bob (anggota induk) bergabung ke subgrup -> HARUS SUKSES
	t.Run("Join Subgroup by Parent Member Success", func(t *testing.T) {
		joinReq := httptest.NewRequest(http.MethodPost, "/api/groups/"+subGroupID+"/join", nil)
		joinCtx := auth.SetUserContext(joinReq.Context(), &auth.UserClaims{UserID: userBob.ID, Username: userBob.Username})
		joinReq = joinReq.WithContext(joinCtx)

		joinRR := httptest.NewRecorder()
		handler.RouteGroupRequest(joinRR, joinReq)

		if joinRR.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", joinRR.Code, joinRR.Body.String())
		}
	})

	// 8. Bob melihat detail subgrup -> HARUS SUKSES
	t.Run("Get Subgroup Details by Member", func(t *testing.T) {
		detReq := httptest.NewRequest(http.MethodGet, "/api/groups/"+subGroupID, nil)
		detCtx := auth.SetUserContext(detReq.Context(), &auth.UserClaims{UserID: userBob.ID, Username: userBob.Username})
		detReq = detReq.WithContext(detCtx)

		detRR := httptest.NewRecorder()
		handler.RouteGroupRequest(detRR, detReq)

		if detRR.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", detRR.Code, detRR.Body.String())
		}
	})

	// 9. Dave melihat detail subgrup -> HARUS DITOLAK 403
	t.Run("Get Subgroup Details by Non-Parent Member Forbidden", func(t *testing.T) {
		detReq := httptest.NewRequest(http.MethodGet, "/api/groups/"+subGroupID, nil)
		detCtx := auth.SetUserContext(detReq.Context(), &auth.UserClaims{UserID: userDave.ID, Username: userDave.Username})
		detReq = detReq.WithContext(detCtx)

		detRR := httptest.NewRecorder()
		handler.RouteGroupRequest(detRR, detReq)

		if detRR.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden, got %d: %s", detRR.Code, detRR.Body.String())
		}
	})
}

