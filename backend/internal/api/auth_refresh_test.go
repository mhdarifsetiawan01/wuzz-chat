package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
)

func TestAuthHandler_Refresh(t *testing.T) {
	_, _, _, authHandler, cleanup := setupSessionTestEnv(t)
	defer cleanup()

	regBody, _ := json.Marshal(api.RegisterRequest{
		Username: "refresh_user", DisplayName: "Refresh", Password: "supersecret123", DeviceID: "dev_refresh",
	})
	wReg := httptest.NewRecorder()
	authHandler.Register(wReg, httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(regBody)))
	if wReg.Code != http.StatusCreated {
		t.Fatalf("register: %d %s", wReg.Code, wReg.Body.String())
	}
	var reg api.AuthResponse
	_ = json.NewDecoder(wReg.Body).Decode(&reg)

	handler := auth.RequireJWT()(http.HandlerFunc(authHandler.Refresh))

	// Tanpa token -> 401
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 tanpa token, got %d", w.Code)
	}

	// Method selain POST -> 405
	req := httptest.NewRequest(http.MethodGet, "/api/auth/refresh", nil)
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", w.Code)
	}

	// Token segar -> 200, refreshed=false, tanpa token baru
	req = httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil)
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var res api.RefreshResponse
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res.Refreshed || res.Token != "" || res.ExpiresAt.IsZero() {
		t.Fatalf("token segar tidak boleh diganti: %+v", res)
	}
}
