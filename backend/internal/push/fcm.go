package push

import (
	"bytes"
	"context"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/golang-jwt/jwt/v5"
)

// FCMServiceAccount merepresentasikan struktur file JSON Service Account dari Google Cloud / Firebase.
type FCMServiceAccount struct {
	Type                    string `json:"type"`
	ProjectID               string `json:"project_id"`
	PrivateKeyID            string `json:"private_key_id"`
	PrivateKey              string `json:"private_key"`
	ClientEmail             string `json:"client_email"`
	ClientID                string `json:"client_id"`
	AuthURI                 string `json:"auth_uri"`
	TokenURI                string `json:"token_uri"`
	AuthProviderX509CertURL string `json:"auth_provider_x509_cert_url"`
	ClientX509CertURL       string `json:"client_x509_cert_url"`
}

// FCMv1PushProvider mengimplementasikan PushProvider untuk Firebase Cloud Messaging (FCM HTTP v1 API).
// Menggunakan OAuth2 Server-to-Server Assertion token signing dengan RSA-256 tanpa dependensi SDK eksternal yang berat.
type FCMv1PushProvider struct {
	projectID      string
	serviceAccount *FCMServiceAccount
	parsedKey      *rsa.PrivateKey
	accessToken    string
	tokenExpiry    time.Time
	httpClient     *http.Client
	tokenURL       string
	fcmEndpointURL string
	mu             sync.RWMutex
}

// NewFCMv1PushProvider membuat instance baru FCMv1PushProvider dan memuat konfigurasi Service Account.
func NewFCMv1PushProvider(projectID, credentials string) *FCMv1PushProvider {
	provider := &FCMv1PushProvider{
		projectID:  strings.TrimSpace(projectID),
		httpClient: &http.Client{Timeout: 10 * time.Second},
		tokenURL:   "https://oauth2.googleapis.com/token",
	}

	// 1. Coba muat dari parameter credentials atau file service-account.json
	saData := strings.TrimSpace(credentials)
	if saData == "" {
		// Cek environment variables alternatif
		if envFile := os.Getenv("FCM_SERVICE_ACCOUNT_FILE"); envFile != "" {
			if content, err := os.ReadFile(envFile); err == nil {
				saData = string(content)
			}
		} else if envCreds := os.Getenv("FCM_CREDENTIALS"); envCreds != "" {
			saData = strings.TrimSpace(envCreds)
		}
	}

	// Cek lokasi file default jika belum terisi
	if saData == "" {
		candidates := []string{
			"service-account.json",
			"backend/service-account.json",
			"../service-account.json",
		}
		for _, path := range candidates {
			if content, err := os.ReadFile(path); err == nil {
				saData = string(content)
				break
			}
		}
	}

	// 2. Parse service account JSON jika tersedia
	if saData != "" {
		var sa FCMServiceAccount
		// Jika berupa path file, baca filenya
		if !strings.HasPrefix(saData, "{") && (strings.HasSuffix(saData, ".json") || strings.Contains(saData, "/")) {
			if content, err := os.ReadFile(saData); err == nil {
				_ = json.Unmarshal(content, &sa)
			}
		} else {
			_ = json.Unmarshal([]byte(saData), &sa)
		}

		if sa.ClientEmail != "" && sa.PrivateKey != "" {
			parsedKey, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(sa.PrivateKey))
			if err != nil {
				log.Printf("⚠️ [Push:FCM] Gagal parse RSA Private Key dari Service Account: %v", err)
			} else {
				provider.serviceAccount = &sa
				provider.parsedKey = parsedKey
				if sa.ProjectID != "" {
					provider.projectID = sa.ProjectID
				}
				if sa.TokenURI != "" {
					provider.tokenURL = sa.TokenURI
				}
				log.Printf("🔑 [Push:FCM] FCM v1 Service Account berhasil dimuat (Project: %s, Client: %s)", provider.projectID, sa.ClientEmail)
			}
		}
	}

	if provider.projectID != "" {
		provider.fcmEndpointURL = fmt.Sprintf("https://fcm.googleapis.com/v1/projects/%s/messages:send", provider.projectID)
	}

	return provider
}

func (p *FCMv1PushProvider) Name() string {
	return "fcm_v1"
}

// getAccessToken mengembalikan OAuth2 Bearer Token yang valid untuk memanggil endpoint FCM HTTP v1.
func (p *FCMv1PushProvider) getAccessToken(ctx context.Context) (string, error) {
	p.mu.RLock()
	if p.accessToken != "" && time.Now().Add(5*time.Minute).Before(p.tokenExpiry) {
		token := p.accessToken
		p.mu.RUnlock()
		return token, nil
	}
	p.mu.RUnlock()

	p.mu.Lock()
	defer p.mu.Unlock()

	// Double-check setelah lock
	if p.accessToken != "" && time.Now().Add(5*time.Minute).Before(p.tokenExpiry) {
		return p.accessToken, nil
	}

	if p.serviceAccount == nil || p.parsedKey == nil {
		return "", errors.New("fcm service account belum terkonfigurasi")
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"iss":   p.serviceAccount.ClientEmail,
		"sub":   p.serviceAccount.ClientEmail,
		"aud":   p.tokenURL,
		"scope": "https://www.googleapis.com/auth/firebase.messaging",
		"iat":   now.Unix(),
		"exp":   now.Add(1 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signedJWT, err := token.SignedString(p.parsedKey)
	if err != nil {
		return "", fmt.Errorf("gagal menandatangani assertion jwt: %w", err)
	}

	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", signedJWT)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("gagal membuat request oauth2: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("request oauth2 token gagal: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("oauth2 token error (HTTP %d): %s", resp.StatusCode, string(bodyBytes))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		TokenType   string `json:"token_type"`
	}
	if err := json.Unmarshal(bodyBytes, &tokenResp); err != nil {
		return "", fmt.Errorf("gagal decode oauth2 token response: %w", err)
	}

	if tokenResp.AccessToken == "" {
		return "", errors.New("oauth2 response tidak memuat access_token")
	}

	p.accessToken = tokenResp.AccessToken
	expiresIn := tokenResp.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 3600
	}
	p.tokenExpiry = now.Add(time.Duration(expiresIn) * time.Second)

	return p.accessToken, nil
}

// Send mengirimkan push notification via FCM HTTP v1 API.
func (p *FCMv1PushProvider) Send(ctx context.Context, sub store.PushSubscription, payload []byte) error {
	rawEndpoint := strings.TrimSpace(sub.Endpoint)
	if rawEndpoint == "" {
		return errors.New("fcm registration token tidak boleh kosong")
	}

	// Bersihkan prefix jika ada
	deviceToken := strings.TrimPrefix(rawEndpoint, "fcm:")

	// Jika credentials belum diset, jalankan fallback simulasi
	if p.parsedKey == nil || p.projectID == "" {
		log.Printf("ℹ️ [Push:FCM] FCM v1 belum dikonfigurasi (kunci/project_id belum diset). Simulasi push berhasil untuk device %s (token: %s)", sub.Platform, safePrefix(deviceToken, 24))
		return nil
	}

	// Parse incoming notification payload
	var notifPayload NotificationPayload
	if err := json.Unmarshal(payload, &notifPayload); err != nil {
		notifPayload = NotificationPayload{
			Title:     "WuzzChat",
			Body:      string(payload),
			Timestamp: time.Now().Unix(),
		}
	}

	// Susun data attributes (semua value data field pada FCM v1 wajib string)
	fcmData := make(map[string]string)
	for k, v := range notifPayload.Data {
		fcmData[k] = fmt.Sprintf("%v", v)
	}
	fcmData["title"] = notifPayload.Title
	fcmData["body"] = notifPayload.Body
	fcmData["timestamp"] = fmt.Sprintf("%d", notifPayload.Timestamp)

	// Susun FCM HTTP v1 Message Payload (Data-Only Silent Push untuk Background Decryption)
	type fcmAndroidConfig struct {
		Priority string `json:"priority"`
	}

	type fcmMessage struct {
		Token   string            `json:"token"`
		Data    map[string]string `json:"data,omitempty"`
		Android *fcmAndroidConfig `json:"android,omitempty"`
	}

	type fcmPayloadWrapper struct {
		Message fcmMessage `json:"message"`
	}

	reqBody := fcmPayloadWrapper{
		Message: fcmMessage{
			Token: deviceToken,
			Data:  fcmData,
			Android: &fcmAndroidConfig{
				Priority: "HIGH",
			},
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("gagal marshal fcm payload: %w", err)
	}

	// Ambil OAuth2 token
	accessToken, err := p.getAccessToken(ctx)
	if err != nil {
		log.Printf("⚠️ [Push:FCM] Gagal mendapatkan OAuth2 Access Token: %v", err)
		return err
	}

	endpointURL := p.fcmEndpointURL
	if endpointURL == "" {
		endpointURL = fmt.Sprintf("https://fcm.googleapis.com/v1/projects/%s/messages:send", p.projectID)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpointURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("gagal membuat fcm http request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json; UTF-8")
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := p.httpClient.Do(req)
	if err != nil {
		log.Printf("⚠️ [Push:FCM] Gagal kirim notifikasi ke device %s: %v", safePrefix(deviceToken, 24), err)
		return err
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		respStr := string(respBytes)
		log.Printf("⚠️ [Push:FCM] FCM HTTP error (Status %d) for token %s: %s", resp.StatusCode, safePrefix(deviceToken, 24), respStr)

		// Jika token tidak terdaftar / invalid, tandai expired agar dihapus
		if resp.StatusCode == http.StatusNotFound ||
			strings.Contains(respStr, "UNREGISTERED") ||
			strings.Contains(respStr, "registration-token-not-registered") ||
			strings.Contains(respStr, "INVALID_ARGUMENT") {
			return ErrSubscriptionExpired
		}

		return fmt.Errorf("fcm http error %d: %s", resp.StatusCode, respStr)
	}

	log.Printf("🚀 [Push:FCM] FCM v1 push notification sukses terkirim ke device %s (token: %s...)", sub.Platform, safePrefix(deviceToken, 24))
	return nil
}
