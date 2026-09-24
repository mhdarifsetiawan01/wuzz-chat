package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/tenant"
)

// ProvisioningHandler menangani endpoint B2B JIT Provisioning dan Client Token Exchange.
type ProvisioningHandler struct {
	tenantSvc tenant.TenantService
}

// NewProvisioningHandler membuat instance baru ProvisioningHandler.
func NewProvisioningHandler(tenantSvc tenant.TenantService) *ProvisioningHandler {
	return &ProvisioningHandler{
		tenantSvc: tenantSvc,
	}
}

// ProvisionTokenRequest adalah payload request untuk endpoint JIT provisioning.
type ProvisionTokenRequest struct {
	ExternalUserID string `json:"external_user_id"`
	DisplayName    string `json:"display_name"`
	AvatarURL      string `json:"avatar_url"`
}

// ProvisionTokenResponse adalah payload response untuk endpoint JIT provisioning.
type ProvisionTokenResponse struct {
	ExchangeToken string `json:"exchange_token"`
	ExpiresIn     int    `json:"expires_in"`
	UserID        string `json:"user_id"`
}

// ProvisionToken menangani POST /api/v1/auth/provision-token (dilindungi B2BAuthGuard).
func (h *ProvisioningHandler) ProvisionToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if h.tenantSvc == nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "tenant service tidak tersedia"})
		return
	}

	var req ProvisionTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "format JSON tidak valid"})
		return
	}

	req.ExternalUserID = strings.TrimSpace(req.ExternalUserID)
	if req.ExternalUserID == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "external_user_id wajib diisi"})
		return
	}

	tokenStr, expiresIn, user, err := h.tenantSvc.ProvisionUserAndToken(r.Context(), req.ExternalUserID, req.DisplayName, req.AvatarURL)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(ProvisionTokenResponse{
		ExchangeToken: tokenStr,
		ExpiresIn:     expiresIn,
		UserID:        user.ID,
	})
}

// ExchangeTokenRequest adalah payload request untuk endpoint client token exchange.
type ExchangeTokenRequest struct {
	ExchangeToken string `json:"exchange_token"`
	DeviceID      string `json:"device_id"`
	Platform      string `json:"platform"`
}

// UserBasicProfile merepresentasikan ringkasan profil user pada response token exchange.
type UserBasicProfile struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

// ExchangeTokenResponse adalah payload response untuk endpoint client token exchange.
type ExchangeTokenResponse struct {
	Token string           `json:"token"`
	User  UserBasicProfile `json:"user"`
}

// ExchangeToken menangani POST /api/v1/auth/exchange.
func (h *ProvisioningHandler) ExchangeToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if h.tenantSvc == nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "tenant service tidak tersedia"})
		return
	}

	var req ExchangeTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "format JSON tidak valid"})
		return
	}

	req.ExchangeToken = strings.TrimSpace(req.ExchangeToken)
	if req.ExchangeToken == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "exchange_token wajib diisi"})
		return
	}

	req.DeviceID = strings.TrimSpace(req.DeviceID)
	if req.DeviceID == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "device_id wajib diisi"})
		return
	}

	ip := r.RemoteAddr
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		ip = strings.TrimSpace(parts[0])
	}

	jwtToken, user, _, err := h.tenantSvc.ExchangeToken(r.Context(), req.ExchangeToken, req.DeviceID, req.Platform, r.UserAgent(), ip)
	if err != nil {
		if errors.Is(err, tenant.ErrExchangeTokenNotFound) ||
			errors.Is(err, tenant.ErrExchangeTokenExpired) ||
			errors.Is(err, tenant.ErrExchangeTokenAlreadyUsed) {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(ExchangeTokenResponse{
		Token: jwtToken,
		User: UserBasicProfile{
			ID:          user.ID,
			Username:    user.Username,
			DisplayName: user.DisplayName,
		},
	})
}
