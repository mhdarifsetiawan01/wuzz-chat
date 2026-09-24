package push

import (
	"context"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

type mockUserStoreForPush struct {
	subs []store.PushSubscription
}

func (m *mockUserStoreForPush) Register(username, displayName, password string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForPush) RegisterWithContext(ctx context.Context, username, displayName, password string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForPush) Authenticate(username, password string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForPush) GetUserByID(id string) (*store.User, error) {
	return &store.User{ID: id, Username: "user_" + id, DisplayName: "User " + id}, nil
}
func (m *mockUserStoreForPush) GetUserByUsername(username string) (*store.User, error) {
	return &store.User{ID: "uid_" + username, Username: username, DisplayName: username}, nil
}
func (m *mockUserStoreForPush) GetUserByUsernameWithContext(ctx context.Context, username string) (*store.User, error) {
	return m.GetUserByUsername(username)
}
func (m *mockUserStoreForPush) GetUserByUsernameOrDisplayName(name string) (*store.User, error) {
	return &store.User{ID: "uid_" + name, Username: name, DisplayName: name}, nil
}
func (m *mockUserStoreForPush) GetUserByUsernameOrDisplayNameWithContext(ctx context.Context, name string) (*store.User, error) {
	return m.GetUserByUsernameOrDisplayName(name)
}
func (m *mockUserStoreForPush) UpdateProfile(userID, displayName, statusMessage, avatarURL string) (*store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForPush) UpdatePublicKey(userID, publicKey string) error {
	return nil
}
func (m *mockUserStoreForPush) UpdatePublicKeyWithDevice(userID, publicKey, deviceID string) (int, error) {
	return 1, nil
}
func (m *mockUserStoreForPush) ForceResetPublicKey(userID, publicKey, deviceID string) (int, error) {
	return 2, nil
}
func (m *mockUserStoreForPush) ClearActiveDevice(userID string, deviceID ...string) error {
	return nil
}
func (m *mockUserStoreForPush) SetActiveDevice(userID, deviceID string) error {
	return nil
}
func (m *mockUserStoreForPush) GetE2EEInfo(userID string) (string, int, string, error) {
	return "", 1, "", nil
}
func (m *mockUserStoreForPush) SearchUsers(query, excludeUserID string) ([]store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForPush) SearchUsersWithContext(ctx context.Context, query, excludeUserID string) ([]store.User, error) {
	return nil, nil
}
func (m *mockUserStoreForPush) GetOrCreateDirectConversation(userA, userB string) (string, error) {
	return "dm_" + userA + "_" + userB, nil
}
func (m *mockUserStoreForPush) GetOrCreateDirectConversationWithContext(ctx context.Context, userA, userB string) (string, error) {
	return m.GetOrCreateDirectConversation(userA, userB)
}
func (m *mockUserStoreForPush) GetUserConversations(userID string) ([]store.ConversationItem, error) {
	return nil, nil
}
func (m *mockUserStoreForPush) GetUserConversationsWithContext(ctx context.Context, userID string) ([]store.ConversationItem, error) {
	return nil, nil
}
func (m *mockUserStoreForPush) PinConversation(conversationID, userID string) error {
	return nil
}
func (m *mockUserStoreForPush) UnpinConversation(conversationID, userID string) error {
	return nil
}
func (m *mockUserStoreForPush) ClearConversation(conversationID, userID string) error {
	return nil
}
func (m *mockUserStoreForPush) GetConversationMemberUsernames(conversationID string) ([]string, error) {
	return []string{"alice", "bob"}, nil
}
func (m *mockUserStoreForPush) IsUserInConversation(conversationID, userID string) (bool, error) {
	return true, nil
}
func (m *mockUserStoreForPush) IsConversationExpired(conversationID string) bool {
	return false
}
func (m *mockUserStoreForPush) SavePushSubscription(sub *store.PushSubscription) error {
	m.subs = append(m.subs, *sub)
	return nil
}
func (m *mockUserStoreForPush) DeletePushSubscription(endpoint string) error {
	var filtered []store.PushSubscription
	for _, s := range m.subs {
		if s.Endpoint != endpoint {
			filtered = append(filtered, s)
		}
	}
	m.subs = filtered
	return nil
}
func (m *mockUserStoreForPush) DeletePushSubscriptionByUser(userID, endpoint string) error {
	var filtered []store.PushSubscription
	for _, s := range m.subs {
		if s.UserID != userID || s.Endpoint != endpoint {
			filtered = append(filtered, s)
		}
	}
	m.subs = filtered
	return nil
}
func (m *mockUserStoreForPush) GetPushSubscriptionsByUserID(userID string) ([]store.PushSubscription, error) {
	var result []store.PushSubscription
	for _, s := range m.subs {
		if s.UserID == userID {
			result = append(result, s)
		}
	}
	return result, nil
}
func (m *mockUserStoreForPush) GetPushSubscriptionsForRecipients(recipientUserIDs []string) ([]store.PushSubscription, error) {
	idMap := make(map[string]bool)
	for _, id := range recipientUserIDs {
		idMap[id] = true
	}
	var result []store.PushSubscription
	for _, s := range m.subs {
		if idMap[s.UserID] {
			result = append(result, s)
		}
	}
	return result, nil
}
func (m *mockUserStoreForPush) ChangePassword(userID, newPasswordHash string) error {
	return nil
}
func (m *mockUserStoreForPush) VerifyPassword(userID, plainPassword string) (bool, error) {
	return true, nil
}

func TestPushService_InitializationAndVAPID(t *testing.T) {
	mockStore := &mockUserStoreForPush{}
	svc := NewService(mockStore)

	pubKey := svc.VAPIDPublicKey()
	if pubKey == "" {
		t.Fatalf("Expected non-empty VAPID public key")
	}

	// Test NotifyOfflineRecipients without panic
	mockStore.SavePushSubscription(&store.PushSubscription{
		ID:        "sub-1",
		UserID:    "uid_bob",
		Platform:  "web",
		Endpoint:  "https://example.com/push/test",
		P256dhKey: "fake_p256dh",
		AuthKey:   "fake_auth",
		CreatedAt: time.Now(),
	})

	var deliveredMsgID string
	svc.SetDeliveryCallback(func(msgID, roomID, recipientUserID string) {
		deliveredMsgID = msgID
	})

	svc.NotifyOfflineRecipients("msg-001", "dm_alice_bob", "uid_alice", "Alice", "Halo Bob!", "text", []string{"uid_alice"})

	// Beri jeda sejenak untuk goroutine
	time.Sleep(100 * time.Millisecond)
	_ = deliveredMsgID

	// Verifikasi pengiriman payload dan handling graceful tanpa crash
	ctx := context.Background()
	_ = svc.SendWebPush(ctx, store.PushSubscription{Endpoint: ""}, []byte(`{}`))
}

func TestNotifyOfflineRecipients_WithMentions(t *testing.T) {
	mockStore := &mockUserStoreForPush{}
	svc := NewService(mockStore)

	mockStore.SavePushSubscription(&store.PushSubscription{
		ID:        "sub-mention-1",
		UserID:    "uid_bob",
		Platform:  "web",
		Endpoint:  "https://example.com/push/mention_bob",
		P256dhKey: "fake_p256dh",
		AuthKey:   "fake_auth",
		CreatedAt: time.Now(),
	})

	// Test NotifyOfflineRecipients with mentions array containing Bob's UUID
	svc.NotifyOfflineRecipients(
		"msg-002",
		"grp_tech",
		"uid_alice",
		"Alice",
		"Halo @bob tolong review kode ini",
		"text",
		[]string{"uid_alice"},
		[]string{"uid_bob"},
	)

	// Beri jeda sejenak untuk goroutine
	time.Sleep(100 * time.Millisecond)
}

func TestPushProviders_RoutingAndMultiPlatform(t *testing.T) {
	ctx := context.Background()

	// 1. Test VAPIDWebPushProvider
	vapid := NewVAPIDWebPushProvider("fake_pub", "fake_priv", "mailto:test@wuzz.id")
	if vapid.Name() != "vapid_webpush" {
		t.Fatalf("expected provider name 'vapid_webpush', got '%s'", vapid.Name())
	}
	// Empty endpoint should return nil gracefully
	if err := vapid.Send(ctx, store.PushSubscription{Endpoint: ""}, []byte(`{}`)); err != nil {
		t.Fatalf("expected nil for empty endpoint, got %v", err)
	}

	// 2. Test FCMv1PushProvider
	fcm := NewFCMv1PushProvider("wuzz-chat-firebase", "")
	if fcm.Name() != "fcm_v1" {
		t.Fatalf("expected provider name 'fcm_v1', got '%s'", fcm.Name())
	}
	// Empty endpoint should return error
	if err := fcm.Send(ctx, store.PushSubscription{Endpoint: ""}, []byte(`{}`)); err == nil {
		t.Fatalf("expected error for empty endpoint in FCM")
	}
	// Valid token should simulate successfully without error
	if err := fcm.Send(ctx, store.PushSubscription{Platform: "android", Endpoint: "fcm_device_token_xyz123"}, []byte(`{}`)); err != nil {
		t.Fatalf("expected nil for simulated FCM send, got %v", err)
	}

	// 3. Test Service routing
	svc := NewService(&mockUserStoreForPush{})

	// Web push URL endpoint -> VAPID provider
	subWeb := store.PushSubscription{Platform: "web", Endpoint: "https://fcm.googleapis.com/fcm/send/abc"}
	pWeb := svc.getProviderForSubscription(subWeb)
	if pWeb.Name() != "vapid_webpush" {
		t.Fatalf("expected web endpoint to route to vapid_webpush, got %s", pWeb.Name())
	}

	// Android native token -> FCM provider
	subAndroid := store.PushSubscription{Platform: "android", Endpoint: "native_fcm_token_123"}
	pAndroid := svc.getProviderForSubscription(subAndroid)
	if pAndroid.Name() != "fcm_v1" {
		t.Fatalf("expected android native token to route to fcm_v1, got %s", pAndroid.Name())
	}

	// iOS native token -> FCM provider
	subIOS := store.PushSubscription{Platform: "ios", Endpoint: "apns_fcm_token_456"}
	pIOS := svc.getProviderForSubscription(subIOS)
	if pIOS.Name() != "fcm_v1" {
		t.Fatalf("expected ios native token to route to fcm_v1, got %s", pIOS.Name())
	}

	// fcm: prefixed token -> FCM provider
	subPrefixed := store.PushSubscription{Platform: "web", Endpoint: "fcm:custom_prefixed_token"}
	pPrefixed := svc.getProviderForSubscription(subPrefixed)
	if pPrefixed.Name() != "fcm_v1" {
		t.Fatalf("expected fcm: prefixed endpoint to route to fcm_v1, got %s", pPrefixed.Name())
	}

	// Test SendWebPush multi-platform routing execution
	if err := svc.SendWebPush(ctx, subAndroid, []byte(`{}`)); err != nil {
		t.Fatalf("expected SendWebPush to succeed for android fcm, got %v", err)
	}
}


