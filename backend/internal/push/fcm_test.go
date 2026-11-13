package push

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

func generateTestRSAKeyPEM(t *testing.T) string {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate rsa key: %v", err)
	}
	privDER := x509.MarshalPKCS1PrivateKey(privateKey)
	privBlock := pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: privDER,
	}
	return string(pem.EncodeToMemory(&privBlock))
}

func TestFCMv1PushProvider_Lifecycle(t *testing.T) {
	privKeyPEM := generateTestRSAKeyPEM(t)

	// Mock OAuth2 Token & FCM Send Server
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/oauth/token" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"access_token": "mock-oauth2-access-token-xyz",
				"expires_in":   3600,
				"token_type":   "Bearer",
			})
			return
		}

		if r.URL.Path == "/v1/projects/mock-project/messages:send" {
			authHeader := r.Header.Get("Authorization")
			if authHeader != "Bearer mock-oauth2-access-token-xyz" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}

			var reqBody struct {
				Message struct {
					Token        string                 `json:"token"`
					Notification map[string]interface{} `json:"notification"`
					Data         map[string]string      `json:"data"`
					Android      struct {
						Priority string `json:"priority"`
					} `json:"android"`
				} `json:"message"`
			}
			if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
				w.WriteHeader(http.StatusBadRequest)
				return
			}

			// Verifikasi bahwa FCM message adalah data-only (tanpa field notification)
			if len(reqBody.Message.Notification) > 0 {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":"notification field should not be present for E2EE data-only push"}`))
				return
			}

			if reqBody.Message.Data["sender_nickname"] == "" {
				w.WriteHeader(http.StatusBadRequest)
				return
			}

			if reqBody.Message.Token == "expired-device-token" {
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte(`{"error":{"status":"UNREGISTERED","message":"Requested entity was not found."}}`))
				return
			}

			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"name": "projects/mock-project/messages/mock-msg-id-12345",
			})
			return
		}

		w.WriteHeader(http.StatusNotFound)
	}))
	defer mockServer.Close()

	sa := FCMServiceAccount{
		Type:         "service_account",
		ProjectID:    "mock-project",
		ClientEmail:  "test-fcm@mock-project.iam.gserviceaccount.com",
		PrivateKey:   privKeyPEM,
		TokenURI:     mockServer.URL + "/oauth/token",
	}
	saBytes, _ := json.Marshal(sa)

	provider := NewFCMv1PushProvider("mock-project", string(saBytes))
	provider.tokenURL = mockServer.URL + "/oauth/token"
	provider.fcmEndpointURL = mockServer.URL + "/v1/projects/mock-project/messages:send"

	if provider.Name() != "fcm_v1" {
		t.Errorf("expected provider name fcm_v1, got %s", provider.Name())
	}

	payload := NotificationPayload{
		Title: "Halo Test",
		Body:  "Pesan uji coba FCM",
	}
	payloadBytes, _ := json.Marshal(payload)

	// 1. Uji Pengiriman Sukses
	sub := store.PushSubscription{
		Platform: "android",
		Endpoint: "valid-fcm-device-token-123",
	}
	err := provider.Send(context.Background(), sub, payloadBytes)
	if err != nil {
		t.Fatalf("expected successful send, got error: %v", err)
	}

	// 2. Uji Token Expired
	subExpired := store.PushSubscription{
		Platform: "android",
		Endpoint: "expired-device-token",
	}
	errExpired := provider.Send(context.Background(), subExpired, payloadBytes)
	if errExpired == nil || errExpired != ErrSubscriptionExpired {
		t.Fatalf("expected ErrSubscriptionExpired, got: %v", errExpired)
	}
}

// Notifikasi sistem (tanpa encrypted_content) membawa teksnya sebagai notif_text; push pesan chat tidak pernah,
// juga saat encrypted_content kosong (media). Kunci "title"/"body" tidak pernah ada di root data.
func TestBuildFCMData_NotifTextOnlyForSystemPush(t *testing.T) {
	sys := buildFCMData(NotificationPayload{
		Title: "Permohonan Bergabung Grup", Body: "Ma Stw meminta bergabung ke grup 'Grup Tes'",
		Data: map[string]interface{}{"url": "/chat?room=grp_x"},
	})
	if sys[FCMNotifTextKey] != "Ma Stw meminta bergabung ke grup 'Grup Tes'" || sys["sender_nickname"] != "Permohonan Bergabung Grup" {
		t.Fatalf("push sistem: %v", sys)
	}
	for _, chat := range []map[string]interface{}{
		{"room_id": "dm_x", "encrypted_content": "e2ee:abc"},
		{"room_id": "grp_x", "encrypted_content": "", "media_type": "image"},
	} {
		d := buildFCMData(NotificationPayload{Title: "Alice", Body: "isi pesan rahasia", Data: chat})
		if _, ok := d[FCMNotifTextKey]; ok {
			t.Fatalf("push chat tidak boleh membawa notif_text: %v", d)
		}
	}
	for _, d := range []map[string]string{sys} {
		if _, ok := d["body"]; ok {
			t.Fatalf("kunci body tidak boleh ada di root data: %v", d)
		}
		if _, ok := d["title"]; ok {
			t.Fatalf("kunci title tidak boleh ada di root data: %v", d)
		}
	}
	if d := buildFCMData(NotificationPayload{Title: "X"}); d[FCMNotifTextKey] != "" {
		t.Fatalf("body kosong tidak boleh membuat notif_text: %v", d)
	}
}
