package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type mockUserStoreForNotificationAPI struct {
	subs []store.PushSubscription
}

func (m *mockUserStoreForNotificationAPI) Register(username, displayName, password string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) RegisterWithContext(ctx context.Context, username, displayName, password string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) Authenticate(username, password string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) GetUserByID(id string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) GetByExternalIDWithContext(ctx context.Context, externalUserID string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) UpsertExternalUserWithContext(ctx context.Context, externalUserID, displayName, avatarURL string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) GetUserByUsername(username string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) GetUserByUsernameWithContext(ctx context.Context, username string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) GetUserByUsernameOrDisplayName(name string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) GetUserByUsernameOrDisplayNameWithContext(ctx context.Context, name string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) UpdateProfile(userID, displayName, statusMessage, avatarURL string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) UpdatePublicKey(userID, publicKey string) error {
	return nil
}
func (m *mockUserStoreForNotificationAPI) UpdatePublicKeyWithDevice(userID, publicKey, deviceID string) (int, error) {
	return 1, nil
}
func (m *mockUserStoreForNotificationAPI) ForceResetPublicKey(userID, publicKey, deviceID string) (int, error) {
	return 2, nil
}
func (m *mockUserStoreForNotificationAPI) ClearActiveDevice(userID string, deviceID ...string) error {
	return nil
}
func (m *mockUserStoreForNotificationAPI) SetActiveDevice(userID, deviceID string) error {
	return nil
}
func (m *mockUserStoreForNotificationAPI) GetE2EEInfo(userID string) (string, int, string, error) {
	return "", 1, "", nil
}
func (m *mockUserStoreForNotificationAPI) SearchUsers(query, excludeUserID string) ([]store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) SearchUsersWithContext(ctx context.Context, query, excludeUserID string) ([]store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) GetOrCreateDirectConversation(userA, userB string) (string, error) {
	return "", nil
}
func (m *mockUserStoreForNotificationAPI) GetOrCreateDirectConversationWithContext(ctx context.Context, userA, userB string) (string, error) {
	return "", nil
}
func (m *mockUserStoreForNotificationAPI) GetUserConversations(userID string) ([]store.ConversationItem, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) GetUserConversationsWithContext(ctx context.Context, userID string) ([]store.ConversationItem, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) PinConversation(conversationID, userID string) error {
	return nil
}
func (m *mockUserStoreForNotificationAPI) UnpinConversation(conversationID, userID string) error {
	return nil
}
func (m *mockUserStoreForNotificationAPI) ClearConversation(conversationID, userID string) error {
	return nil
}
func (m *mockUserStoreForNotificationAPI) GetConversationMemberUsernames(conversationID string) ([]string, error) {
	return nil, nil
}
func (m *mockUserStoreForNotificationAPI) IsUserInConversation(conversationID, userID string) (bool, error) {
	return true, nil
}
func (m *mockUserStoreForNotificationAPI) IsConversationExpired(conversationID string) bool {
	return false
}
func (m *mockUserStoreForNotificationAPI) SavePushSubscription(sub *store.PushSubscription) error {
	m.subs = append(m.subs, *sub)
	return nil
}
func (m *mockUserStoreForNotificationAPI) DeletePushSubscription(endpoint string) error {
	var filtered []store.PushSubscription
	for _, s := range m.subs {
		if s.Endpoint != endpoint {
			filtered = append(filtered, s)
		}
	}
	m.subs = filtered
	return nil
}
func (m *mockUserStoreForNotificationAPI) DeletePushSubscriptionByUser(userID, endpoint string) error {
	var filtered []store.PushSubscription
	for _, s := range m.subs {
		if s.UserID != userID || s.Endpoint != endpoint {
			filtered = append(filtered, s)
		}
	}
	m.subs = filtered
	return nil
}
func (m *mockUserStoreForNotificationAPI) GetPushSubscriptionsByUserID(userID string) ([]store.PushSubscription, error) {
	return m.subs, nil
}
func (m *mockUserStoreForNotificationAPI) GetPushSubscriptionsForRecipients(recipientUserIDs []string) ([]store.PushSubscription, error) {
	return m.subs, nil
}
func (m *mockUserStoreForNotificationAPI) ChangePassword(userID, newPasswordHash string) error {
	return nil
}
func (m *mockUserStoreForNotificationAPI) VerifyPassword(userID, plainPassword string) (bool, error) {
	return true, nil
}

func TestNotificationHandler_Endpoints(t *testing.T) {
	mockStore := &mockUserStoreForNotificationAPI{}
	pushSvc := push.NewService(mockStore)
	handler := NewNotificationHandler(pushSvc, mockStore)

	// 1. Test GetVAPIDPublicKey
	req := httptest.NewRequest(http.MethodGet, "/api/notifications/vapid-public-key", nil)
	w := httptest.NewRecorder()
	handler.GetVAPIDPublicKey(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", w.Code)
	}
	var vapidResp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&vapidResp); err != nil || vapidResp["public_key"] == "" {
		t.Fatalf("Expected valid public_key in response")
	}

	// 2. Test Subscribe Endpoint
	claims := &auth.UserClaims{
		UserID:      "test-user-123",
		Username:    "alice",
		DisplayName: "Alice",
	}

	subPayload := PushSubscribeRequest{
		Platform: "web",
		Endpoint: "https://push.example.com/sub/1",
	}
	subPayload.Keys.P256dh = "test-p256dh"
	subPayload.Keys.Auth = "test-auth"
	body, _ := json.Marshal(subPayload)

	reqSub := httptest.NewRequest(http.MethodPost, "/api/notifications/subscribe", bytes.NewReader(body))
	ctx := auth.SetUserContext(context.Background(), claims)
	reqSub = reqSub.WithContext(ctx)
	wSub := httptest.NewRecorder()

	handler.Subscribe(wSub, reqSub)
	if wSub.Code != http.StatusOK {
		t.Fatalf("Expected status 200 on subscribe, got %d: %s", wSub.Code, wSub.Body.String())
	}

	if len(mockStore.subs) != 1 {
		t.Fatalf("Expected 1 subscription in store, got %d", len(mockStore.subs))
	}

	// 3. Test Unsubscribe Endpoint
	unsubPayload := PushUnsubscribeRequest{
		Endpoint: "https://push.example.com/sub/1",
	}
	unsubBody, _ := json.Marshal(unsubPayload)
	reqUnsub := httptest.NewRequest(http.MethodPost, "/api/notifications/unsubscribe", bytes.NewReader(unsubBody))
	reqUnsub = reqUnsub.WithContext(ctx)
	wUnsub := httptest.NewRecorder()

	handler.Unsubscribe(wUnsub, reqUnsub)
	if wUnsub.Code != http.StatusOK {
		t.Fatalf("Expected status 200 on unsubscribe, got %d", wUnsub.Code)
	}

	if len(mockStore.subs) != 0 {
		t.Fatalf("Expected 0 subscriptions after unsubscribe, got %d", len(mockStore.subs))
	}
}
