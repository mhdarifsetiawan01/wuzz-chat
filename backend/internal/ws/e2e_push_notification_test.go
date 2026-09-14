package ws_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
	"github.com/gorilla/websocket"
)

func TestE2E_PushNotificationLifecycle(t *testing.T) {
	// 1. Inisialisasi Database SQLite terisolasi
	dbPath := filepath.Join(t.TempDir(), "test_e2e_push.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Gagal inisialisasi SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	clientStore := store.NewMemoryClientStore()

	// 2. Inisialisasi Push Service & Hub
	pushSvc := push.NewService(userStore)
	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)
	hub.SetPushService(pushSvc)

	notificationHandler := api.NewNotificationHandler(pushSvc, userStore)

	// 3. Registrasi User Alice dan Bob
	userAlice, err := userStore.Register("alice_notif", "Alice Notif", "pass123")
	if err != nil {
		t.Fatalf("Gagal register Alice: %v", err)
	}
	userBob, err := userStore.Register("bob_notif", "Bob Notif", "pass123")
	if err != nil {
		t.Fatalf("Gagal register Bob: %v", err)
	}

	// 4. Bob berlangganan Push Notification via REST API
	tokenBob, err := auth.GenerateToken(userBob.ID, userBob.Username, userBob.DisplayName)
	if err != nil {
		t.Fatalf("Gagal generate token Bob: %v", err)
	}

	subPayload := api.PushSubscribeRequest{
		Platform: "web",
		Endpoint: "https://push.browser.test/sub/bob-device-1",
	}
	subPayload.Keys.P256dh = "test_p256dh_key"
	subPayload.Keys.Auth = "test_auth_key"
	bodyBytes, _ := json.Marshal(subPayload)

	reqSub := httptest.NewRequest(http.MethodPost, "/api/notifications/subscribe", bytes.NewReader(bodyBytes))
	claimsBob, _ := auth.ValidateToken(tokenBob)
	reqSub = reqSub.WithContext(auth.SetUserContext(context.Background(), claimsBob))
	wSub := httptest.NewRecorder()

	notificationHandler.Subscribe(wSub, reqSub)
	if wSub.Code != http.StatusOK {
		t.Fatalf("Subscribe Bob gagal: %d - %s", wSub.Code, wSub.Body.String())
	}

	// Verifikasi Bob memiliki 1 subscription aktif
	bobSubs, err := userStore.GetPushSubscriptionsByUserID(userBob.ID)
	if err != nil || len(bobSubs) != 1 {
		t.Fatalf("Expected 1 subscription for Bob, got %d (err: %v)", len(bobSubs), err)
	}

	// 5. Buat percakapan direct antara Alice dan Bob
	roomID, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)
	if err != nil {
		t.Fatalf("Gagal buat percakapan direct: %v", err)
	}

	// 6. Hubungkan Alice via WebSocket (Bob sengaja offline / tidak connect socket)
	server := httptest.NewServer(ws.NewHandler(hub, auth.NewCORSValidator([]string{"*"})))
	defer server.Close()

	wsURL := "ws" + server.URL[4:] + "/ws?token="
	tokenAlice, _ := auth.GenerateToken(userAlice.ID, userAlice.Username, userAlice.DisplayName)

	wsAlice, _, err := websocket.DefaultDialer.Dial(wsURL+tokenAlice, nil)
	if err != nil {
		t.Fatalf("Gagal koneksi WS Alice: %v", err)
	}
	defer wsAlice.Close()

	// Alice join ke room
	_ = wsAlice.WriteJSON(ws.Message{
		Type: ws.TypeJoin,
		Room: roomID,
	})
	time.Sleep(50 * time.Millisecond)

	// 7. Alice mengirim pesan teks ke room saat Bob offline
	msgAlice := ws.Message{
		Type:      ws.TypeMessage,
		Room:      roomID,
		From:      userAlice.ID,
		Nickname:  userAlice.DisplayName,
		Content:   "Halo Bob, ini pesan saat kamu offline!",
		Timestamp: time.Now().UTC(),
	}

	if err := wsAlice.WriteJSON(msgAlice); err != nil {
		t.Fatalf("Gagal kirim pesan Alice: %v", err)
	}

	// Berikan jeda waktu untuk pemrosesan goroutine push notification di backend
	time.Sleep(200 * time.Millisecond)

	// 8. Bob login kembali dan mematikan Push Notification (Unsubscribe)
	unsubPayload := api.PushUnsubscribeRequest{
		Endpoint: "https://push.browser.test/sub/bob-device-1",
	}
	unsubBytes, _ := json.Marshal(unsubPayload)
	reqUnsub := httptest.NewRequest(http.MethodPost, "/api/notifications/unsubscribe", bytes.NewReader(unsubBytes))
	reqUnsub = reqUnsub.WithContext(auth.SetUserContext(context.Background(), claimsBob))
	wUnsub := httptest.NewRecorder()

	notificationHandler.Unsubscribe(wUnsub, reqUnsub)
	if wUnsub.Code != http.StatusOK {
		t.Fatalf("Unsubscribe Bob gagal: %d", wUnsub.Code)
	}

	// Verifikasi subscriptions Bob sekarang 0
	bobSubsAfter, err := userStore.GetPushSubscriptionsByUserID(userBob.ID)
	if err != nil || len(bobSubsAfter) != 0 {
		t.Fatalf("Expected 0 subscription for Bob after unsubscribe, got %d", len(bobSubsAfter))
	}

	t.Log("✅ E2E Push Notification Lifecycle (Subscribe -> Offline Push Dispatch -> Unsubscribe) PASSED successfully!")
}
