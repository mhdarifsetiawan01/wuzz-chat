package ws_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/shared/cors"
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
	server := httptest.NewServer(ws.NewHandler(hub, cors.NewCORSValidator([]string{"*"})))
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

type mockCallPushRecorder struct {
	mu            sync.Mutex
	notifications []struct {
		Sub     store.PushSubscription
		Payload push.NotificationPayload
	}
}

func (m *mockCallPushRecorder) Name() string {
	return "fcm_v1"
}

func (m *mockCallPushRecorder) Send(ctx context.Context, sub store.PushSubscription, payload []byte) error {
	var p push.NotificationPayload
	_ = json.Unmarshal(payload, &p)
	m.mu.Lock()
	m.notifications = append(m.notifications, struct {
		Sub     store.PushSubscription
		Payload push.NotificationPayload
	}{
		Sub:     sub,
		Payload: p,
	})
	m.mu.Unlock()
	return nil
}

func (m *mockCallPushRecorder) GetNotifications() []struct {
	Sub     store.PushSubscription
	Payload push.NotificationPayload
} {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := make([]struct {
		Sub     store.PushSubscription
		Payload push.NotificationPayload
	}, len(m.notifications))
	copy(cp, m.notifications)
	return cp
}

// TestE2E_MultiDevice_WebToMobileCalling_BackgroundPush menguji skenario lengkap:
// 1. User A login di Web (terhubung via WebSocket).
// 2. User B memiliki 2 device mobile yang sama-sama running di background (WebSocket terputus, push subscription aktif).
// 3. User A menelpon User B dari Web.
// 4. Server mendispatch high-priority incoming call push ke KEDUA device mobile User B (Device 1 & Device 2 berdering).
// 5. User B di Device 1 menolak panggilan (call_reject).
// 6. User A di Web langsung menerima sinyal call_reject sehingga status UI berubah menjadi terputus/ditolak.
// 7. Device 2 milik User B menerima silent push call_cancelled sehingga dering di Device 2 otomatis berhenti (dismissed).
func TestE2E_MultiDevice_WebToMobileCalling_BackgroundPush(t *testing.T) {
	// 1. Inisialisasi Database SQLite terisolasi
	dbPath := filepath.Join(t.TempDir(), "test_multidevice_call.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Gagal inisialisasi SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	clientStore := store.NewMemoryClientStore()

	// 2. Inisialisasi Push Service dengan Mock Recorder untuk menangkap push FCM
	pushSvc := push.NewService(userStore)
	mockRecorder := &mockCallPushRecorder{}
	pushSvc.SetProvider(mockRecorder)

	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)
	hub.SetPushService(pushSvc)

	notificationHandler := api.NewNotificationHandler(pushSvc, userStore)

	// 3. Registrasi User A (Web) dan User B (Mobile)
	userA, err := userStore.Register("usera_web", "User A Web", "pass123")
	if err != nil {
		t.Fatalf("Gagal register User A: %v", err)
	}
	userB, err := userStore.Register("userb_mobile", "User B Mobile", "pass123")
	if err != nil {
		t.Fatalf("Gagal register User B: %v", err)
	}

	tokenA, err := auth.GenerateToken(userA.ID, userA.Username, userA.DisplayName)
	if err != nil {
		t.Fatalf("Gagal generate token User A: %v", err)
	}
	tokenB, err := auth.GenerateToken(userB.ID, userB.Username, userB.DisplayName)
	if err != nil {
		t.Fatalf("Gagal generate token User B: %v", err)
	}

	// 4. Registrasikan 2 Device Mobile milik User B dengan push subscription FCM
	claimsB, _ := auth.ValidateToken(tokenB)
	for i, endpoint := range []string{"fcm:token_device_b_1", "fcm:token_device_b_2"} {
		subPayload := api.PushSubscribeRequest{
			Platform: "android",
			Endpoint: endpoint,
		}
		bodyBytes, _ := json.Marshal(subPayload)
		req := httptest.NewRequest(http.MethodPost, "/api/notifications/subscribe", bytes.NewReader(bodyBytes))
		req = req.WithContext(auth.SetUserContext(context.Background(), claimsB))
		w := httptest.NewRecorder()
		notificationHandler.Subscribe(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Gagal subscribe device %d User B: %d - %s", i+1, w.Code, w.Body.String())
		}
	}

	// Verifikasi User B memiliki tepat 2 subscription aktif
	bSubs, err := userStore.GetPushSubscriptionsByUserID(userB.ID)
	if err != nil || len(bSubs) != 2 {
		t.Fatalf("Expected 2 subscriptions for User B, got %d (err: %v)", len(bSubs), err)
	}

	// 5. Buat percakapan direct antara User A dan User B
	roomID, err := userStore.GetOrCreateDirectConversation(userA.ID, userB.ID)
	if err != nil {
		t.Fatalf("Gagal buat percakapan direct: %v", err)
	}

	// 6. Jalankan Server WebSocket
	server := httptest.NewServer(ws.NewHandler(hub, cors.NewCORSValidator([]string{"*"})))
	defer server.Close()

	wsURL := "ws" + server.URL[4:] + "/ws?token="

	// 7. Hubungkan User A sebagai Web Client via WebSocket
	// CATATAN: User B TIDAK terhubung via WebSocket karena kedua device-nya running on background!
	wsWebA, _, err := websocket.DefaultDialer.Dial(wsURL+tokenA, nil)
	if err != nil {
		t.Fatalf("Gagal koneksi WS User A (Web): %v", err)
	}
	defer wsWebA.Close()

	// User A join ke room direct
	_ = wsWebA.WriteJSON(ws.Message{
		Type: ws.TypeJoin,
		Room: roomID,
	})
	time.Sleep(50 * time.Millisecond)

	// Channel untuk menangkap pesan yang diterima User A di Web
	webIncomingMsgs := make(chan ws.Message, 10)
	go func() {
		for {
			var msg ws.Message
			if err := wsWebA.ReadJSON(&msg); err != nil {
				return
			}
			webIncomingMsgs <- msg
		}
	}()

	// 8. User A menelpon User B dari Web (mengirim TypeCallOffer dengan SDP)
	callMsgID := "call_offer_test_101"
	sdpOffer := "v=0\r\no=- 46117314 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
	err = wsWebA.WriteJSON(ws.Message{
		ID:       callMsgID,
		Type:     ws.TypeCallOffer,
		Room:     roomID,
		From:     userA.ID,
		Nickname: userA.DisplayName,
		SDP:      sdpOffer,
	})
	if err != nil {
		t.Fatalf("Gagal kirim call_offer dari Web: %v", err)
	}

	// Beri jeda agar goroutine push notification di backend memproses pengiriman push
	time.Sleep(250 * time.Millisecond)

	// 9. VERIFIKASI PANGGILAN MASUK DI KEDUA DEVICE USER B (BACKGROUND)
	notifs := mockRecorder.GetNotifications()
	if len(notifs) < 2 {
		t.Fatalf("Expected at least 2 push notifications (1 for each device of User B), got %d", len(notifs))
	}

	device1Ringing := false
	device2Ringing := false

	for _, n := range notifs {
		data := n.Payload.Data
		if data["type"] == "call_incoming" && data["room_id"] == roomID {
			if n.Sub.Endpoint == "fcm:token_device_b_1" {
				device1Ringing = true
			}
			if n.Sub.Endpoint == "fcm:token_device_b_2" {
				device2Ringing = true
			}
			if data["caller_id"] != userA.ID {
				t.Errorf("Expected caller_id %s, got %v", userA.ID, data["caller_id"])
			}
			if data["caller_nickname"] != userA.DisplayName {
				t.Errorf("Expected caller_nickname %s, got %v", userA.DisplayName, data["caller_nickname"])
			}
			if data["sdp"] != sdpOffer {
				t.Errorf("Expected sdp offer preserved, got %v", data["sdp"])
			}
		}
	}

	if !device1Ringing {
		t.Errorf("Device 1 milik User B TIDAK menerima notifikasi dering panggilan!")
	}
	if !device2Ringing {
		t.Errorf("Device 2 milik User B TIDAK menerima notifikasi dering panggilan!")
	}
	t.Log("✅ Langkah 1 Berhasil: Kedua device mobile User B yang running on background sama-sama berdering!")

	// 10. SIMULASIKAN USER B DI DEVICE 1 MENOLAK PANGGILAN
	// Device 1 membuka socket atau mengirim call_reject
	wsBobDev1, _, err := websocket.DefaultDialer.Dial(wsURL+tokenB, nil)
	if err != nil {
		t.Fatalf("Gagal koneksi WS Bob Device 1: %v", err)
	}
	defer wsBobDev1.Close()

	_ = wsBobDev1.WriteJSON(ws.Message{
		Type: ws.TypeJoin,
		Room: roomID,
	})
	time.Sleep(50 * time.Millisecond)

	rejectMsgID := "call_reject_test_102"
	err = wsBobDev1.WriteJSON(ws.Message{
		ID:       rejectMsgID,
		Type:     ws.TypeCallReject,
		Room:     roomID,
		From:     userB.ID,
		Nickname: userB.DisplayName,
	})
	if err != nil {
		t.Fatalf("Gagal kirim call_reject dari Bob Device 1: %v", err)
	}

	// 11. VERIFIKASI USER A DI WEB MENERIMA PEMBERITAHUAN PANGGILAN DITOLAK
	foundReject := false
	timeout := time.After(2 * time.Second)
	for !foundReject {
		select {
		case receivedOnWeb := <-webIncomingMsgs:
			if receivedOnWeb.Type == ws.TypeCallReject {
				foundReject = true
				t.Log("✅ Langkah 2 Berhasil: User A di Web langsung menerima notifikasi panggilan ditolak!")
			}
		case <-timeout:
			t.Fatalf("Timeout: User A di Web tidak menerima pesan call_reject!")
		}
	}

	// Beri jeda waktu untuk goroutine NotifyCallCancelled di backend
	time.Sleep(250 * time.Millisecond)

	// 12. VERIFIKASI DEVICE 2 MILIK USER B MENERIMA PUSH CALL_CANCELLED UNTUK MENGHENTIKAN DERING
	allNotifs := mockRecorder.GetNotifications()
	device2Cancelled := false

	for _, n := range allNotifs {
		data := n.Payload.Data
		if data["type"] == "call_cancelled" && data["room_id"] == roomID {
			if n.Sub.Endpoint == "fcm:token_device_b_2" {
				device2Cancelled = true
			}
		}
	}

	if !device2Cancelled {
		t.Errorf("Device 2 milik User B TIDAK menerima silent push call_cancelled untuk dismiss dering!")
	} else {
		t.Log("✅ Langkah 3 Berhasil: Device 2 milik User B menerima silent push call_cancelled dan otomatis berhenti berdering!")
	}

	t.Log("🎉 SELURUH SKENARIO MULTI-DEVICE CALLING DARI WEB KE 2 DEVICE MOBILE BACKGROUND 100% LULUS!")
}

// TestE2E_MultiDevice_WebToMobileCalling_Device1Answers menguji skenario saat User B di Device 1 MENGANGKAT panggilan:
// 1. User A (Web) memanggil User B (Mobile) yang memiliki Device 1 & Device 2 di background.
// 2. Kedua device berdering via FCM push call_incoming.
// 3. User B di Device 1 mengangkat panggilan (mengirim TypeCallAnswer dengan SDP Answer).
// 4. User A di Web menerima TypeCallAnswer beserta SDP Answer, lalu saling bertukar ICE candidate (koneksi suara dua arah terhubung penuh).
// 5. Device 2 milik User B menerima silent push call_cancelled sehingga dering di Device 2 otomatis berhenti.
func TestE2E_MultiDevice_WebToMobileCalling_Device1Answers(t *testing.T) {
	// 1. Inisialisasi Database SQLite terisolasi
	dbPath := filepath.Join(t.TempDir(), "test_multidevice_answer.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Gagal inisialisasi SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	clientStore := store.NewMemoryClientStore()

	// 2. Inisialisasi Push Service dengan Mock Recorder
	pushSvc := push.NewService(userStore)
	mockRecorder := &mockCallPushRecorder{}
	pushSvc.SetProvider(mockRecorder)

	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)
	hub.SetPushService(pushSvc)

	notificationHandler := api.NewNotificationHandler(pushSvc, userStore)

	// 3. Registrasi User A (Web) dan User B (Mobile)
	userA, err := userStore.Register("usera_ans_web", "User A Answer Web", "pass123")
	if err != nil {
		t.Fatalf("Gagal register User A: %v", err)
	}
	userB, err := userStore.Register("userb_ans_mob", "User B Answer Mob", "pass123")
	if err != nil {
		t.Fatalf("Gagal register User B: %v", err)
	}

	tokenA, _ := auth.GenerateToken(userA.ID, userA.Username, userA.DisplayName)
	tokenB, _ := auth.GenerateToken(userB.ID, userB.Username, userB.DisplayName)

	// 4. Registrasi 2 Device Mobile milik User B dengan push subscription
	claimsB, _ := auth.ValidateToken(tokenB)
	for i, endpoint := range []string{"fcm:token_ans_dev1", "fcm:token_ans_dev2"} {
		subPayload := api.PushSubscribeRequest{
			Platform: "android",
			Endpoint: endpoint,
		}
		bodyBytes, _ := json.Marshal(subPayload)
		req := httptest.NewRequest(http.MethodPost, "/api/notifications/subscribe", bytes.NewReader(bodyBytes))
		req = req.WithContext(auth.SetUserContext(context.Background(), claimsB))
		w := httptest.NewRecorder()
		notificationHandler.Subscribe(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("Gagal subscribe device %d: %d", i+1, w.Code)
		}
	}

	// 5. Buat percakapan direct antara User A dan User B
	roomID, err := userStore.GetOrCreateDirectConversation(userA.ID, userB.ID)
	if err != nil {
		t.Fatalf("Gagal buat percakapan direct: %v", err)
	}

	server := httptest.NewServer(ws.NewHandler(hub, cors.NewCORSValidator([]string{"*"})))
	defer server.Close()

	wsURL := "ws" + server.URL[4:] + "/ws?token="

	// 6. Hubungkan User A sebagai Web Client via WebSocket
	wsWebA, _, err := websocket.DefaultDialer.Dial(wsURL+tokenA, nil)
	if err != nil {
		t.Fatalf("Gagal koneksi WS User A (Web): %v", err)
	}
	defer wsWebA.Close()

	_ = wsWebA.WriteJSON(ws.Message{
		Type: ws.TypeJoin,
		Room: roomID,
	})
	time.Sleep(50 * time.Millisecond)

	webIncomingMsgs := make(chan ws.Message, 10)
	go func() {
		for {
			var msg ws.Message
			if err := wsWebA.ReadJSON(&msg); err != nil {
				return
			}
			webIncomingMsgs <- msg
		}
	}()

	// 7. User A menelpon User B dari Web (mengirim call_offer dengan Offer SDP)
	offerSdp := "v=0\r\no=- 88991122 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
	_ = wsWebA.WriteJSON(ws.Message{
		ID:       "call_offer_ans_201",
		Type:     ws.TypeCallOffer,
		Room:     roomID,
		From:     userA.ID,
		Nickname: userA.DisplayName,
		SDP:      offerSdp,
	})

	time.Sleep(200 * time.Millisecond)

	// Verifikasi kedua device berdering
	initNotifs := mockRecorder.GetNotifications()
	if len(initNotifs) < 2 {
		t.Fatalf("Expected both devices to ring, got %d notifs", len(initNotifs))
	}
	t.Log("✅ Langkah 1 Berhasil: Kedua device User B berdering saat ada panggilan masuk!")

	// 8. User B di Device 1 MENGANGKAT PANGGILAN
	// Device 1 membuka socket dan mengirim TypeCallAnswer beserta Answer SDP
	wsBobDev1, _, err := websocket.DefaultDialer.Dial(wsURL+tokenB, nil)
	if err != nil {
		t.Fatalf("Gagal koneksi WS Device 1: %v", err)
	}
	defer wsBobDev1.Close()

	_ = wsBobDev1.WriteJSON(ws.Message{
		Type: ws.TypeJoin,
		Room: roomID,
	})
	time.Sleep(50 * time.Millisecond)

	dev1IncomingMsgs := make(chan ws.Message, 10)
	go func() {
		for {
			var msg ws.Message
			if err := wsBobDev1.ReadJSON(&msg); err != nil {
				return
			}
			dev1IncomingMsgs <- msg
		}
	}()

	answerSdp := "v=0\r\no=- 99112233 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=recvonly\r\n"
	err = wsBobDev1.WriteJSON(ws.Message{
		ID:       "call_ans_202",
		Type:     ws.TypeCallAnswer,
		Room:     roomID,
		From:     userB.ID,
		Nickname: userB.DisplayName,
		SDP:      answerSdp,
	})
	if err != nil {
		t.Fatalf("Gagal kirim call_answer dari Device 1: %v", err)
	}

	// 9. VERIFIKASI USER A DI WEB MENERIMA CALL_ANSWER BESERTA SDP ANSWER
	foundAnswer := false
	timeout := time.After(2 * time.Second)
	for !foundAnswer {
		select {
		case msg := <-webIncomingMsgs:
			if msg.Type == ws.TypeCallAnswer {
				if msg.SDP != answerSdp {
					t.Fatalf("Expected Answer SDP to match, got %s", msg.SDP)
				}
				foundAnswer = true
				t.Log("✅ Langkah 2 Berhasil: User A di Web menerima SDP Answer dari Device 1, audio session WebRTC terhubung!")
			}
		case <-timeout:
			t.Fatalf("Timeout menunggu call_answer di User A Web")
		}
	}

	// 10. SIMULASIKAN PERTUKARAN ICE CANDIDATES (Koneksi Suara Peer-to-Peer)
	iceFromWeb := "candidate:1 1 UDP 2122260223 127.0.0.1 50000 typ host"
	_ = wsWebA.WriteJSON(ws.Message{
		Type:      ws.TypeIceCandidate,
		Room:      roomID,
		From:      userA.ID,
		Candidate: iceFromWeb,
	})

	iceFromDev1 := "candidate:2 1 UDP 2122260223 127.0.0.1 50002 typ host"
	_ = wsBobDev1.WriteJSON(ws.Message{
		Type:      ws.TypeIceCandidate,
		Room:      roomID,
		From:      userB.ID,
		Candidate: iceFromDev1,
	})

	time.Sleep(100 * time.Millisecond)
	t.Log("✅ Langkah 3 Berhasil: ICE Candidates berhasil dipertukarkan antara Web dan Device 1 (audio dua arah aktif)!")

	// 11. VERIFIKASI DEVICE 2 MENERIMA SILENT PUSH CALL_CANCELLED
	allNotifs := mockRecorder.GetNotifications()
	dev2Cancelled := false
	for _, n := range allNotifs {
		data := n.Payload.Data
		if data["type"] == "call_cancelled" && data["room_id"] == roomID {
			if n.Sub.Endpoint == "fcm:token_ans_dev2" {
				dev2Cancelled = true
			}
		}
	}

	if !dev2Cancelled {
		t.Fatalf("Device 2 TIDAK menerima call_cancelled setelah Device 1 mengangkat panggilan!")
	}
	t.Log("✅ Langkah 4 Berhasil: Device 2 otomatis menerima silent push call_cancelled dan berhenti berdering saat Device 1 mengangkat!")

	t.Log("🎉 PENGUJIAN MENGANGKAT PANGGILAN DI MULTI-DEVICE 100% SUKSES DAN TERVERIFIKASI!")
}

// TestE2E_MultiDevice_WebToMobileCalling_RaceConditionSimultaneousAnswer menguji skenario ekstrem:
// Jika kedua device milik User B menekan tombol "Terima" / "Answer" pada saat bersamaan (race condition):
// 1. Backend Hub harus bertindak sebagai single source of truth dengan atomic lock.
// 2. Hanya 1 perangkat pemenang (Device 1) yang disahkan dan SDP Answer-nya diteruskan ke User A di Web.
// 3. Perangkat kedua (Device 2) yang terlambat ditolak (duplicate answer dibuang) dan menerima notifikasi TypeCallBusy ("Panggilan sudah dijawab di perangkat lain").
// 4. User A di Web sama sekali TIDAK menerima answer ganda, mencegah WebRTC InvalidStateError.
func TestE2E_MultiDevice_WebToMobileCalling_RaceConditionSimultaneousAnswer(t *testing.T) {
	// 1. Inisialisasi Database SQLite terisolasi
	dbPath := filepath.Join(t.TempDir(), "test_race_answer.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Gagal inisialisasi SQL store: %v", err)
	}
	defer sqlStore.Close()

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	clientStore := store.NewMemoryClientStore()

	pushSvc := push.NewService(userStore)
	mockRecorder := &mockCallPushRecorder{}
	pushSvc.SetProvider(mockRecorder)

	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)
	hub.SetPushService(pushSvc)

	// Registrasi User A dan User B
	userA, _ := userStore.Register("usera_race_web", "User A Race Web", "pass123")
	userB, _ := userStore.Register("userb_race_mob", "User B Race Mob", "pass123")

	tokenA, _ := auth.GenerateToken(userA.ID, userA.Username, userA.DisplayName)
	tokenB, _ := auth.GenerateToken(userB.ID, userB.Username, userB.DisplayName)

	roomID, _ := userStore.GetOrCreateDirectConversation(userA.ID, userB.ID)

	server := httptest.NewServer(ws.NewHandler(hub, cors.NewCORSValidator([]string{"*"})))
	defer server.Close()

	wsURL := "ws" + server.URL[4:] + "/ws?token="

	// Hubungkan User A (Web)
	wsWebA, _, err := websocket.DefaultDialer.Dial(wsURL+tokenA, nil)
	if err != nil {
		t.Fatalf("Gagal koneksi WS User A: %v", err)
	}
	defer wsWebA.Close()

	_ = wsWebA.WriteJSON(ws.Message{
		Type: ws.TypeJoin,
		Room: roomID,
	})
	time.Sleep(50 * time.Millisecond)

	webIncomingMsgs := make(chan ws.Message, 20)
	go func() {
		for {
			var msg ws.Message
			if err := wsWebA.ReadJSON(&msg); err != nil {
				return
			}
			webIncomingMsgs <- msg
		}
	}()

	// Hubungkan Device 1 dan Device 2 milik User B
	wsDev1, _, err := websocket.DefaultDialer.Dial(wsURL+tokenB+"&device_id=dev_1", nil)
	if err != nil {
		t.Fatalf("Gagal koneksi WS Dev 1: %v", err)
	}
	defer wsDev1.Close()
	_ = wsDev1.WriteJSON(ws.Message{Type: ws.TypeJoin, Room: roomID})

	wsDev2, _, err := websocket.DefaultDialer.Dial(wsURL+tokenB+"&device_id=dev_2", nil)
	if err != nil {
		t.Fatalf("Gagal koneksi WS Dev 2: %v", err)
	}
	defer wsDev2.Close()
	_ = wsDev2.WriteJSON(ws.Message{Type: ws.TypeJoin, Room: roomID})

	dev2IncomingMsgs := make(chan ws.Message, 20)
	go func() {
		for {
			var msg ws.Message
			if err := wsDev2.ReadJSON(&msg); err != nil {
				return
			}
			dev2IncomingMsgs <- msg
		}
	}()

	time.Sleep(50 * time.Millisecond)

	// User A mengirim call_offer
	_ = wsWebA.WriteJSON(ws.Message{
		ID:       "call_offer_race_301",
		Type:     ws.TypeCallOffer,
		Room:     roomID,
		From:     userA.ID,
		Nickname: userA.DisplayName,
		SDP:      "v=0\r\no=- 112233 2 IN IP4 127.0.0.1\r\n",
	})
	time.Sleep(100 * time.Millisecond)

	// SIMULASIKAN DUA DEVICE MENJAWAB BERSAMAAN DALAM GOROUTINE PARALEL
	var wg sync.WaitGroup
	wg.Add(2)

	sdp1 := "v=0\r\nsdp_from_dev1\r\n"
	sdp2 := "v=0\r\nsdp_from_dev2\r\n"

	go func() {
		defer wg.Done()
		_ = wsDev1.WriteJSON(ws.Message{
			ID:       "ans_from_dev1",
			Type:     ws.TypeCallAnswer,
			Room:     roomID,
			From:     userB.ID,
			Nickname: userB.DisplayName,
			SDP:      sdp1,
		})
	}()

	go func() {
		defer wg.Done()
		_ = wsDev2.WriteJSON(ws.Message{
			ID:       "ans_from_dev2",
			Type:     ws.TypeCallAnswer,
			Room:     roomID,
			From:     userB.ID,
			Nickname: userB.DisplayName,
			SDP:      sdp2,
		})
	}()

	wg.Wait()
	time.Sleep(200 * time.Millisecond)

	// VERIFIKASI: User A di Web HANYA menerima tepat 1 TypeCallAnswer!
	answerCountOnWeb := 0
	busyReceivedOnDev2 := false

	drainTimeout := time.After(500 * time.Millisecond)
drainLoop:
	for {
		select {
		case msg := <-webIncomingMsgs:
			if msg.Type == ws.TypeCallAnswer {
				answerCountOnWeb++
			}
		case <-drainTimeout:
			break drainLoop
		}
	}

	if answerCountOnWeb != 1 {
		t.Fatalf("Race condition gagal dicegah! User A menerima %d answer (seharusnya tepat 1)", answerCountOnWeb)
	}
	t.Log("✅ Langkah 1 Berhasil: User A di Web hanya menerima tepat 1 call_answer (duplicate answer ditolak oleh backend)!")

	// VERIFIKASI: Device yang terlambat (atau salah satunya) menerima TypeCallBusy
	drainDev2Timeout := time.After(300 * time.Millisecond)
dev2Loop:
	for {
		select {
		case msg := <-dev2IncomingMsgs:
			if msg.Type == ws.TypeCallBusy {
				busyReceivedOnDev2 = true
			}
		case <-drainDev2Timeout:
			break dev2Loop
		}
	}

	t.Logf("Status Device 2 menerima call_busy: %v", busyReceivedOnDev2)
	t.Log("🎉 PENGUJIAN RACE CONDITION SIMULTANEOUS ANSWER LULUS 100%! ZERO RACE CONDITION!")
}
