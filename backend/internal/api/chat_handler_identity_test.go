package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestChatHandler_IdentityAndSearchThroughAuthService(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_identity.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to init SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, err := userStore.Register("alice_id", "Alice Identity", "password123")
	if err != nil {
		t.Fatalf("Failed to register Alice: %v", err)
	}
	userBob, err := userStore.Register("bob_id", "Bob Identity", "password123")
	if err != nil {
		t.Fatalf("Failed to register Bob: %v", err)
	}
	_ = userStore.UpdatePublicKey(userBob.ID, "pubkey-bob-12345")

	chatHandler := NewChatHandler(userStore, sqlStore)

	t.Run("SearchUsers with empty query returns empty list", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/users/search?q=", nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.SearchUsers(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", w.Code)
		}
		var users []authz.UserSummary
		if err := json.Unmarshal(w.Body.Bytes(), &users); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if len(users) != 0 {
			t.Errorf("expected 0 users, got %d", len(users))
		}
	})

	t.Run("SearchUsers for bob excluding alice", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/users/search?q=bob", nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.SearchUsers(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", w.Code)
		}
		var users []authz.UserSummary
		if err := json.Unmarshal(w.Body.Bytes(), &users); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if len(users) != 1 {
			t.Fatalf("expected 1 user, got %d", len(users))
		}
		if users[0].ID != userBob.ID || users[0].Username != "bob_id" {
			t.Errorf("unexpected user in search: %+v", users[0])
		}
	})

	t.Run("GetUserProfile by ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/users/profile?id="+userBob.ID, nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.GetUserProfile(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", w.Code)
		}
		var profile authz.UserProfile
		if err := json.Unmarshal(w.Body.Bytes(), &profile); err != nil {
			t.Fatalf("failed to decode profile: %v", err)
		}
		if profile.ID != userBob.ID || profile.Username != "bob_id" {
			t.Errorf("unexpected profile: %+v", profile)
		}
	})

	t.Run("GetUserProfile by @username", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/users/profile?username=@bob_id", nil)
		ctx := auth.SetUserContext(req.Context(), &auth.UserClaims{
			UserID:   userAlice.ID,
			Username: userAlice.Username,
		})
		req = req.WithContext(ctx)
		w := httptest.NewRecorder()

		chatHandler.GetUserProfile(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", w.Code)
		}
		var profile authz.UserProfile
		if err := json.Unmarshal(w.Body.Bytes(), &profile); err != nil {
			t.Fatalf("failed to decode profile: %v", err)
		}
		if profile.ID != userBob.ID {
			t.Errorf("expected user ID %s, got %s", userBob.ID, profile.ID)
		}
	})

	t.Run("GetUserPublicKey by ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/users/public-key?id="+userBob.ID, nil)
		w := httptest.NewRecorder()

		chatHandler.GetUserPublicKey(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", w.Code)
		}
		var resp map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if resp["user_id"] != userBob.ID || resp["public_key"] != "pubkey-bob-12345" {
			t.Errorf("unexpected public key response: %+v", resp)
		}
	})
}
