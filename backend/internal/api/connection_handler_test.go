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
	"github.com/bms-del112/wuzz-chat/internal/connection"
	connectioninfra "github.com/bms-del112/wuzz-chat/internal/connection/infra"
	"github.com/bms-del112/wuzz-chat/internal/shared/config"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
	_ "modernc.org/sqlite"
)

func setupTestConnectionHandler(t *testing.T) (*api.ConnectionHandler, store.UserStore, *connection.ConnectionService, func()) {
	t.Helper()

	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_conn_api.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Gagal inisialisasi SQL store: %v", err)
	}

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	connRepo := connectioninfra.NewSQLConnectionRepository(sqlStore.DB(), sqlStore.DriverName())

	cfg := config.ConfigConnection{
		RateLimitPerMinute:   10,
		DailyLimit:           20,
		MaxPendingRequests:   5,
		DeclineCooldownHours: 24,
		PageDefaultLimit:     2,
		PageMaxLimit:         5,
		CacheTTL:             1 * time.Minute,
	}

	connSvc := connection.NewConnectionService(connRepo, userStore, cfg)
	handler := api.NewConnectionHandlerWithService(connSvc)

	cleanup := func() {
		_ = sqlStore.Close()
	}

	return handler, userStore, connSvc, cleanup
}

func TestConnectionHandler_HTTPEndpoints(t *testing.T) {
	handler, userStore, _, cleanup := setupTestConnectionHandler(t)
	defer cleanup()

	ctx := tenantshared.WithTenant(t.Context(), "default")

	alice, _ := userStore.RegisterWithContext(ctx, "alice", "Alice", "password123")
	bob, _ := userStore.RegisterWithContext(ctx, "bob", "Bob", "password123")

	aliceClaims := &auth.UserClaims{UserID: alice.ID, TenantID: "default", Username: "alice"}
	bobClaims := &auth.UserClaims{UserID: bob.ID, TenantID: "default", Username: "bob"}

	// 1. POST /api/connections/request (Alice minta berteman ke Bob)
	reqBody, _ := json.Marshal(map[string]string{
		"target_user_id": bob.ID,
		"source_type":    "in_app_request",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/connections/request", bytes.NewReader(reqBody))
	req = req.WithContext(auth.SetUserContext(req.Context(), aliceClaims))
	w := httptest.NewRecorder()

	handler.RouteConnectionRequest(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var connRes connection.UserConnection
	_ = json.Unmarshal(w.Body.Bytes(), &connRes)
	if connRes.Status != connection.StatusPending {
		t.Fatalf("expected status pending, got %s", connRes.Status)
	}

	// 2. GET /api/connections/status/{targetUserId} dari sudut pandang Bob
	reqStatus := httptest.NewRequest(http.MethodGet, "/api/connections/status/"+alice.ID, nil)
	reqStatus = reqStatus.WithContext(auth.SetUserContext(reqStatus.Context(), bobClaims))
	wStatus := httptest.NewRecorder()

	handler.RouteConnectionRequest(wStatus, reqStatus)
	if wStatus.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for status, got %d: %s", wStatus.Code, wStatus.Body.String())
	}

	var statusRes connection.ConnectionStatusResponse
	_ = json.Unmarshal(wStatus.Body.Bytes(), &statusRes)
	if statusRes.Status != connection.StatusPending || statusRes.Direction != "incoming" {
		t.Fatalf("expected pending incoming, got status=%s direction=%s", statusRes.Status, statusRes.Direction)
	}

	// 3. GET /api/connections/pending (Bob melihat list pending incoming)
	reqPending := httptest.NewRequest(http.MethodGet, "/api/connections/pending?direction=incoming", nil)
	reqPending = reqPending.WithContext(auth.SetUserContext(reqPending.Context(), bobClaims))
	wPending := httptest.NewRecorder()

	handler.RouteConnectionRequest(wPending, reqPending)
	if wPending.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for pending, got %d: %s", wPending.Code, wPending.Body.String())
	}

	var pendingList []*connection.PendingRequestItem
	_ = json.Unmarshal(wPending.Body.Bytes(), &pendingList)
	if len(pendingList) != 1 || pendingList[0].PeerID != alice.ID {
		t.Fatalf("expected 1 pending item from alice, got %d", len(pendingList))
	}

	// 4. POST /api/connections/respond (Bob menerima pertemanan Alice)
	respondBody, _ := json.Marshal(map[string]string{
		"connection_id": connRes.ID,
		"action":        "accept",
	})
	reqRespond := httptest.NewRequest(http.MethodPost, "/api/connections/respond", bytes.NewReader(respondBody))
	reqRespond = reqRespond.WithContext(auth.SetUserContext(reqRespond.Context(), bobClaims))
	wRespond := httptest.NewRecorder()

	handler.RouteConnectionRequest(wRespond, reqRespond)
	if wRespond.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for respond, got %d: %s", wRespond.Code, wRespond.Body.String())
	}

	// 5. GET /api/connections/friends (Alice melihat daftar teman)
	reqFriends := httptest.NewRequest(http.MethodGet, "/api/connections/friends?limit=10", nil)
	reqFriends = reqFriends.WithContext(auth.SetUserContext(reqFriends.Context(), aliceClaims))
	wFriends := httptest.NewRecorder()

	handler.RouteConnectionRequest(wFriends, reqFriends)
	if wFriends.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for friends, got %d: %s", wFriends.Code, wFriends.Body.String())
	}

	var friendsRes connection.FriendsListResponse
	_ = json.Unmarshal(wFriends.Body.Bytes(), &friendsRes)
	if len(friendsRes.Friends) != 1 || friendsRes.Friends[0].ID != bob.ID {
		t.Fatalf("expected 1 friend (Bob) in Alice's list, got %d", len(friendsRes.Friends))
	}

	// 6. DELETE /api/connections/{targetUserId} (Alice menghapus Bob)
	reqUnfriend := httptest.NewRequest(http.MethodDelete, "/api/connections/"+bob.ID, nil)
	reqUnfriend = reqUnfriend.WithContext(auth.SetUserContext(reqUnfriend.Context(), aliceClaims))
	wUnfriend := httptest.NewRecorder()

	handler.RouteConnectionRequest(wUnfriend, reqUnfriend)
	if wUnfriend.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for unfriend, got %d: %s", wUnfriend.Code, wUnfriend.Body.String())
	}
}
