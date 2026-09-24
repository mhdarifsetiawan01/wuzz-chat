package tenant_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	authzinfra "github.com/bms-del112/wuzz-chat/internal/authz/infra"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/tenant"
	tenantinfra "github.com/bms-del112/wuzz-chat/internal/tenant/infra"
	"github.com/bms-del112/wuzz-chat/internal/ws"
	"github.com/gorilla/websocket"
)

func setupProvisioningEnv(t *testing.T) (tenant.TenantService, store.UserStore, authz.AuthRepository, *api.ProvisioningHandler, *ws.Hub, *ws.Handler, tenant.TenantRepository) {
	t.Helper()
	sqlStore, db := setupTestDB(t)

	userStore := store.NewSQLUserStore(db, "sqlite")
	sessionStore := store.NewSQLSessionStore(db, "sqlite")
	deviceStore := store.NewSQLDeviceStore(db, "sqlite")
	tokenStore := store.NewSQLTokenStore(db, "sqlite")
	credentialStore := store.NewSQLCredentialStore(db, "sqlite")
	userStore.SetCredentialStore(credentialStore)

	tenantRepo := tenantinfra.NewSQLTenantRepository(db, "sqlite")
	tenantSvc := tenant.NewTenantService(tenantRepo)

	authRepo := authzinfra.NewSQLAuthRepository(userStore, sessionStore, deviceStore, tokenStore, nil)
	tenantSvc.SetUserStore(userStore)
	tenantSvc.SetAuthzRepo(authRepo)

	provHandler := api.NewProvisioningHandler(tenantSvc)

	clientStore := store.NewMemoryClientStore()
	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)

	wsHandler := ws.NewHandler(hub, nil)
	wsHandler.SetUserStore(userStore)
	wsHandler.SetDeviceStore(deviceStore)

	return tenantSvc, userStore, authRepo, provHandler, hub, wsHandler, tenantRepo
}

// 1. Uji validasi B2B API Key Guard
func TestB2BAuthGuard(t *testing.T) {
	tenantSvc, _, _, provHandler, _, _, _ := setupProvisioningEnv(t)
	ctx := context.Background()

	// Buat tenant baru dan API Key
	custTenant, err := tenantSvc.CreateTenant(ctx, "Mitra Teknologi", "mitra-tek")
	if err != nil {
		t.Fatalf("gagal buat tenant: %v", err)
	}

	apiKey, rawSecret, err := tenantSvc.CreateAPIKey(ctx, custTenant.ID, "B2B Production Key")
	if err != nil {
		t.Fatalf("gagal buat api key: %v", err)
	}

	protectedHandler := api.B2BAuthGuard(tenantSvc)(http.HandlerFunc(provHandler.ProvisionToken))

	t.Run("Missing headers -> 401 Unauthorized", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/provision-token", strings.NewReader(`{}`))
		rec := httptest.NewRecorder()
		protectedHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("status diharapkan 401, didapat %d", rec.Code)
		}
	})

	t.Run("Invalid secret -> 401 Unauthorized", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/provision-token", strings.NewReader(`{}`))
		req.Header.Set("X-App-ID", apiKey.AppID)
		req.Header.Set("X-App-Secret", "sec_wrong_password_123")
		rec := httptest.NewRecorder()
		protectedHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("status diharapkan 401, didapat %d", rec.Code)
		}
	})

	t.Run("Valid credentials -> Lolos guard", func(t *testing.T) {
		body := `{"external_user_id":"user_test_guard","display_name":"Testing Guard"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/provision-token", strings.NewReader(body))
		req.Header.Set("X-App-ID", apiKey.AppID)
		req.Header.Set("X-App-Secret", rawSecret)
		rec := httptest.NewRecorder()
		protectedHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("status diharapkan 200, didapat %d. Body: %s", rec.Code, rec.Body.String())
		}
	})
}

// 2. Uji JIT User Provisioning (creation & idempotent update)
func TestJITUserProvisioning(t *testing.T) {
	tenantSvc, userStore, _, provHandler, _, _, _ := setupProvisioningEnv(t)
	ctx := context.Background()

	tnt, err := tenantSvc.CreateTenant(ctx, "Logistik Express", "logistik-exp")
	if err != nil {
		t.Fatalf("gagal buat tenant: %v", err)
	}
	key, secret, err := tenantSvc.CreateAPIKey(ctx, tnt.ID, "Server Key")
	if err != nil {
		t.Fatalf("gagal buat key: %v", err)
	}

	protectedHandler := api.B2BAuthGuard(tenantSvc)(http.HandlerFunc(provHandler.ProvisionToken))

	var firstUserID string
	var firstToken string

	t.Run("Provision user baru (JIT Creation)", func(t *testing.T) {
		payload := api.ProvisionTokenRequest{
			ExternalUserID: "driver_8899",
			DisplayName:    "Budi Santoso",
			AvatarURL:      "https://example.com/avatar1.jpg",
		}
		b, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/provision-token", bytes.NewReader(b))
		req.Header.Set("X-App-ID", key.AppID)
		req.Header.Set("X-App-Secret", secret)
		rec := httptest.NewRecorder()

		protectedHandler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("harus 200 OK, got: %d (%s)", rec.Code, rec.Body.String())
		}

		var resp api.ProvisionTokenResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("gagal decode response: %v", err)
		}

		if resp.UserID == "" {
			t.Errorf("user_id tidak boleh kosong")
		}
		if !strings.HasPrefix(resp.ExchangeToken, "ext_") {
			t.Errorf("format exchange token harus berawalan ext_, got: %s", resp.ExchangeToken)
		}
		if resp.ExpiresIn != 60 {
			t.Errorf("expires_in harus 60, got: %d", resp.ExpiresIn)
		}

		firstUserID = resp.UserID
		firstToken = resp.ExchangeToken

		// Verifikasi user tersimpan di userStore
		u, err := userStore.GetUserByID(firstUserID)
		if err != nil {
			t.Fatalf("user gagal ditemukan di database: %v", err)
		}
		if u.ExternalUserID != "driver_8899" {
			t.Errorf("external_user_id salah: got %s", u.ExternalUserID)
		}
		if u.DisplayName != "Budi Santoso" {
			t.Errorf("display_name salah: got %s", u.DisplayName)
		}
		if u.TenantID != tnt.ID {
			t.Errorf("tenant_id salah: got %s, ingin %s", u.TenantID, tnt.ID)
		}
	})

	t.Run("Idempotent update user eksisting", func(t *testing.T) {
		payload := api.ProvisionTokenRequest{
			ExternalUserID: "driver_8899",
			DisplayName:    "Budi Santoso S.Kom",
			AvatarURL:      "https://example.com/avatar_new.jpg",
		}
		b, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/provision-token", bytes.NewReader(b))
		req.Header.Set("X-App-ID", key.AppID)
		req.Header.Set("X-App-Secret", secret)
		rec := httptest.NewRecorder()

		protectedHandler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("harus 200 OK, got: %d", rec.Code)
		}

		var resp api.ProvisionTokenResponse
		_ = json.NewDecoder(rec.Body).Decode(&resp)

		// User ID harus SAMA (tidak menduplikasi record user)
		if resp.UserID != firstUserID {
			t.Errorf("user_id harus sama untuk external_user_id yang sama: got %s, want %s", resp.UserID, firstUserID)
		}
		// Exchange token baru harus berbeda dari token pertama
		if resp.ExchangeToken == firstToken {
			t.Errorf("exchange token baru harus unik, tidak boleh sama")
		}

		// Verifikasi data ter-update
		u, _ := userStore.GetUserByID(firstUserID)
		if u.DisplayName != "Budi Santoso S.Kom" {
			t.Errorf("display_name harus ter-update: got %s", u.DisplayName)
		}
		if u.AvatarURL != "https://example.com/avatar_new.jpg" {
			t.Errorf("avatar_url harus ter-update: got %s", u.AvatarURL)
		}
	})
}

// 3. Uji Client Token Exchange (sukses, expired, dan double-spend prevention)
func TestClientTokenExchange(t *testing.T) {
	tenantSvc, userStore, authRepo, provHandler, _, _, tenantRepo := setupProvisioningEnv(t)
	ctx := context.Background()

	tnt, _ := tenantSvc.CreateTenant(ctx, "Fintech Aman", "fintech-aman")
	key, secret, _ := tenantSvc.CreateAPIKey(ctx, tnt.ID, "Fintech Key")

	// Helper generate exchange token
	generateToken := func(extID string) (token string, uid string) {
		body := fmt.Sprintf(`{"external_user_id":"%s","display_name":"User %s"}`, extID, extID)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/provision-token", strings.NewReader(body))
		req.Header.Set("X-App-ID", key.AppID)
		req.Header.Set("X-App-Secret", secret)
		rec := httptest.NewRecorder()
		api.B2BAuthGuard(tenantSvc)(http.HandlerFunc(provHandler.ProvisionToken)).ServeHTTP(rec, req)
		var resp api.ProvisionTokenResponse
		_ = json.NewDecoder(rec.Body).Decode(&resp)
		return resp.ExchangeToken, resp.UserID
	}

	t.Run("Penukaran token sukses dan daftarkan device", func(t *testing.T) {
		tok, uid := generateToken("cust_001")

		exchangePayload := api.ExchangeTokenRequest{
			ExchangeToken: tok,
			DeviceID:      "device_android_999",
			Platform:      "android",
		}
		b, _ := json.Marshal(exchangePayload)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/exchange", bytes.NewReader(b))
		req.Header.Set("User-Agent", "Mozilla/5.0 (Android; Mobile)")
		rec := httptest.NewRecorder()

		provHandler.ExchangeToken(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("penukaran gagal: %d (%s)", rec.Code, rec.Body.String())
		}

		var exResp api.ExchangeTokenResponse
		if err := json.NewDecoder(rec.Body).Decode(&exResp); err != nil {
			t.Fatalf("gagal parse exchange response: %v", err)
		}

		if exResp.Token == "" {
			t.Fatalf("JWT token kosong")
		}
		if exResp.User.ID != uid {
			t.Errorf("user ID tidak cocok: got %s, want %s", exResp.User.ID, uid)
		}

		// Validasi isi JWT Claims
		claims, err := auth.ValidateToken(exResp.Token)
		if err != nil {
			t.Fatalf("token JWT tidak valid: %v", err)
		}
		if claims.UserID != uid {
			t.Errorf("claims.UserID salah: got %s, want %s", claims.UserID, uid)
		}
		if claims.TenantID != tnt.ID {
			t.Errorf("claims.TenantID salah: got %s, want %s", claims.TenantID, tnt.ID)
		}
		if claims.DeviceID != "device_android_999" {
			t.Errorf("claims.DeviceID salah: got %s, want %s", claims.DeviceID, "device_android_999")
		}
		if claims.ID == "" {
			t.Errorf("claims.ID (jti) tidak boleh kosong")
		}

		// Verifikasi Level 2 Device tercatat di authRepo
		devs, err := authRepo.GetUserDevices(uid)
		if err != nil {
			t.Fatalf("gagal ambil user devices: %v", err)
		}
		if len(devs) == 0 {
			t.Fatalf("device tidak terdaftar di Multi-Device registry")
		}
		foundDev := false
		for _, d := range devs {
			if d.ID == "device_android_999" && d.Platform == "android" {
				foundDev = true
				break
			}
		}
		if !foundDev {
			t.Errorf("device device_android_999 tidak ditemukan di daftar device user")
		}

		// Verifikasi sesi tercatat di authRepo
		sessions, err := authRepo.GetActiveSessions(uid)
		if err != nil {
			t.Fatalf("gagal ambil sesi aktif: %v", err)
		}
		if len(sessions) == 0 {
			t.Errorf("sesi tidak tercatat di Multi-Device session registry")
		}
	})

	t.Run("Pencegahan Double-Spend (Token hanya bisa dipakai 1x)", func(t *testing.T) {
		tok, _ := generateToken("cust_002")

		exchangePayload := api.ExchangeTokenRequest{
			ExchangeToken: tok,
			DeviceID:      "device_pc_1",
			Platform:      "web",
		}
		b, _ := json.Marshal(exchangePayload)

		// Penukaran ke-1: Harus Sukses
		req1 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/exchange", bytes.NewReader(b))
		rec1 := httptest.NewRecorder()
		provHandler.ExchangeToken(rec1, req1)
		if rec1.Code != http.StatusOK {
			t.Fatalf("penukaran 1 harus sukses, got: %d", rec1.Code)
		}

		// Penukaran ke-2 dengan token yang sama: Wajib Ditolak 401
		req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/exchange", bytes.NewReader(b))
		rec2 := httptest.NewRecorder()
		provHandler.ExchangeToken(rec2, req2)
		if rec2.Code != http.StatusUnauthorized {
			t.Fatalf("penukaran 2 harus ditolak 401, got: %d (%s)", rec2.Code, rec2.Body.String())
		}
		if !strings.Contains(rec2.Body.String(), "sudah pernah digunakan") {
			t.Errorf("pesan error harus menyebutkan sudah digunakan: %s", rec2.Body.String())
		}
	})

	t.Run("Expired token ditolak", func(t *testing.T) {
		// Buat user langsung di userStore
		u, err := userStore.UpsertExternalUserWithContext(ctx, "cust_expired", "Expired User", "")
		if err != nil {
			t.Fatalf("gagal buat user: %v", err)
		}

		// Simpan exchange token yang sudah kadaluarsa langsung di tenantRepo
		expiredTok := &tenant.ExchangeToken{
			Token:     "ext_expired_token_999",
			TenantID:  tnt.ID,
			UserID:    u.ID,
			ExpiresAt: time.Now().UTC().Add(-10 * time.Minute), // masa lalu
			CreatedAt: time.Now().UTC().Add(-15 * time.Minute),
		}
		_ = tenantRepo.CreateExchangeToken(ctx, expiredTok)

		body := `{"exchange_token":"ext_expired_token_999","device_id":"dev_x","platform":"web"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/exchange", strings.NewReader(body))
		rec := httptest.NewRecorder()
		provHandler.ExchangeToken(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("token expired harus 401, got: %d (%s)", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "telah kadaluarsa") {
			t.Errorf("pesan error harus menyebutkan telah kadaluarsa: %s", rec.Body.String())
		}
	})
}

// 4. Uji integrasi penuh: Third-Party Backend ➔ Provision Token ➔ Client Exchange ➔ WebSocket Handshake
func TestFullE2E_ProvisionToWebSocketHandshake(t *testing.T) {
	tenantSvc, _, _, provHandler, _, wsHandler, _ := setupProvisioningEnv(t)
	ctx := context.Background()

	// 1. Inisialisasi Tenant & Kredensial B2B
	b2bTenant, err := tenantSvc.CreateTenant(ctx, "Enterprise Healthcare", "health-enterprise")
	if err != nil {
		t.Fatalf("gagal inisialisasi tenant: %v", err)
	}
	apiKey, rawSecret, err := tenantSvc.CreateAPIKey(ctx, b2bTenant.ID, "Hospital API Key")
	if err != nil {
		t.Fatalf("gagal buat api key: %v", err)
	}

	// 2. Setup HTTP Mux menyerupai konfigurasi router aplikasi
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/auth/provision-token", func(w http.ResponseWriter, r *http.Request) {
		api.B2BAuthGuard(tenantSvc)(http.HandlerFunc(provHandler.ProvisionToken)).ServeHTTP(w, r)
	})
	mux.HandleFunc("/api/v1/auth/exchange", func(w http.ResponseWriter, r *http.Request) {
		provHandler.ExchangeToken(w, r)
	})
	mux.Handle("/ws", wsHandler)

	server := httptest.NewServer(mux)
	defer server.Close()

	// 3. Third-Party Backend memanggil Provision Token
	provPayload := `{"external_user_id":"pasien_12345","display_name":"Dokter Amanda","avatar_url":"https://example.com/dr_amanda.png"}`
	provReq, _ := http.NewRequest(http.MethodPost, server.URL+"/api/v1/auth/provision-token", strings.NewReader(provPayload))
	provReq.Header.Set("Content-Type", "application/json")
	provReq.Header.Set("X-App-ID", apiKey.AppID)
	provReq.Header.Set("X-App-Secret", rawSecret)

	provResp, err := http.DefaultClient.Do(provReq)
	if err != nil {
		t.Fatalf("request provision gagal: %v", err)
	}
	defer provResp.Body.Close()

	if provResp.StatusCode != http.StatusOK {
		t.Fatalf("provision-token gagal: status %d", provResp.StatusCode)
	}

	var provData api.ProvisionTokenResponse
	_ = json.NewDecoder(provResp.Body).Decode(&provData)

	if provData.ExchangeToken == "" {
		t.Fatalf("exchange token tidak boleh kosong")
	}

	// 4. Client SDK / Mobile App menukarkan exchange_token menjadi Session JWT
	exchangePayload := fmt.Sprintf(`{"exchange_token":"%s","device_id":"ipad_clinic_01","platform":"ios"}`, provData.ExchangeToken)
	exReq, _ := http.NewRequest(http.MethodPost, server.URL+"/api/v1/auth/exchange", strings.NewReader(exchangePayload))
	exReq.Header.Set("Content-Type", "application/json")

	exResp, err := http.DefaultClient.Do(exReq)
	if err != nil {
		t.Fatalf("request exchange gagal: %v", err)
	}
	defer exResp.Body.Close()

	if exResp.StatusCode != http.StatusOK {
		t.Fatalf("exchange gagal: status %d", exResp.StatusCode)
	}

	var exData api.ExchangeTokenResponse
	_ = json.NewDecoder(exResp.Body).Decode(&exData)

	if exData.Token == "" {
		t.Fatalf("token JWT hasil exchange kosong")
	}

	// 5. Client App membuka koneksi WebSocket menggunakan JWT token dan device_id
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?token=" + exData.Token + "&device_id=ipad_clinic_01"
	dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}
	conn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("koneksi websocket gagal dial: %v (status: %v)", err, resp)
	}
	defer conn.Close()

	// Pastikan status HTTP 101 Switching Protocols
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("status websocket handshake bukan 101, got: %d", resp.StatusCode)
	}

	// Membaca pesan pembuka / init frame dari server jika ada
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn.ReadMessage()
	if err != nil {
		t.Logf("koneksi websocket terhubung normal (read timeout/ping: %v)", err)
	} else {
		t.Logf("pesan pembuka diterima dari websocket: %s", string(msg))
	}
}
