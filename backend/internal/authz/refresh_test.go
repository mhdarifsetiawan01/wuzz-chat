package authz_test

import (
	"errors"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	"github.com/golang-jwt/jwt/v5"
)

// loginClaims mendaftarkan user, login di satu perangkat, dan mengembalikan klaim token yang valid.
func loginClaims(t *testing.T, svc *authz.AuthService, username, deviceID string) *auth.UserClaims {
	t.Helper()
	if _, err := svc.Register(authz.RegisterInput{Username: username, DisplayName: username, Password: "password123", DeviceID: deviceID}); err != nil {
		t.Fatalf("register: %v", err)
	}
	res, _, err := svc.Login(authz.LoginInput{Username: username, Password: "password123", DeviceID: deviceID})
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	claims, err := auth.ValidateToken(res.Token)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	return claims
}

func TestRefreshToken_FreshTokenIsNoOp(t *testing.T) {
	svc, cleanup := setupTestAuthService(t)
	defer cleanup()
	claims := loginClaims(t, svc, "fresh_user", "dev-1")

	res, err := svc.RefreshToken(authz.RefreshInput{Claims: claims})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Refreshed || res.Token != "" {
		t.Fatalf("token segar tidak boleh diperbarui: %+v", res)
	}
}

func TestRefreshToken_NearExpiryIssuesNewTokenKeepingAuthTime(t *testing.T) {
	svc, cleanup := setupTestAuthService(t)
	defer cleanup()
	claims := loginClaims(t, svc, "near_user", "dev-1")
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(2 * 24 * time.Hour)) // < 15 hari

	res, err := svc.RefreshToken(authz.RefreshInput{Claims: claims})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !res.Refreshed || res.Token == "" {
		t.Fatalf("token seharusnya diperbarui: %+v", res)
	}
	newClaims, err := auth.ValidateToken(res.Token)
	if err != nil {
		t.Fatalf("token baru tidak valid: %v", err)
	}
	if newClaims.ID == claims.ID {
		t.Fatalf("jti harus baru")
	}
	if newClaims.UserID != claims.UserID || newClaims.TenantID != claims.TenantID || newClaims.SystemRole != claims.SystemRole {
		t.Fatalf("identitas harus sama: %+v vs %+v", newClaims, claims)
	}
	if newClaims.AuthTime != claims.AuthTime {
		t.Fatalf("auth_time harus disalin: %d vs %d", newClaims.AuthTime, claims.AuthTime)
	}
	if time.Until(newClaims.ExpiresAt.Time) < auth.TokenLifetime-time.Minute {
		t.Fatalf("masa berlaku harus penuh: %v", newClaims.ExpiresAt)
	}

	// Sesi baru tercatat di perangkat yang sama, sesi lama dicabut, perangkat tidak bertambah.
	sessions, err := svc.GetActiveSessions(claims.UserID, newClaims.ID)
	if err != nil {
		t.Fatalf("GetActiveSessions: %v", err)
	}
	var foundNew bool
	for _, sess := range sessions {
		if sess.ID == claims.ID {
			t.Fatalf("sesi lama harus dicabut: %+v", sessions)
		}
		if sess.ID == newClaims.ID {
			foundNew = true
			if sess.DeviceID != "dev-1" {
				t.Fatalf("sesi baru harus di dev-1, got %s", sess.DeviceID)
			}
		}
	}
	if !foundNew {
		t.Fatalf("sesi baru harus tercatat: %+v", sessions)
	}
}

func TestRefreshToken_AbsoluteSessionAgeExceeded(t *testing.T) {
	svc, cleanup := setupTestAuthService(t)
	defer cleanup()
	claims := loginClaims(t, svc, "old_user", "dev-1")
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(1 * time.Hour))
	claims.AuthTime = time.Now().Add(-auth.MaxSessionAge - time.Hour).Unix()

	if _, err := svc.RefreshToken(authz.RefreshInput{Claims: claims}); !errors.Is(err, authz.ErrSessionExpired) {
		t.Fatalf("expected ErrSessionExpired, got %v", err)
	}
}

func TestRefreshToken_LegacyTokenWithoutAuthTimeUsesIssuedAt(t *testing.T) {
	svc, cleanup := setupTestAuthService(t)
	defer cleanup()
	claims := loginClaims(t, svc, "legacy_user", "dev-1")
	claims.AuthTime = 0
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(1 * time.Hour))

	res, err := svc.RefreshToken(authz.RefreshInput{Claims: claims})
	if err != nil || !res.Refreshed {
		t.Fatalf("token lama tanpa auth_time harus bisa di-refresh: %+v, %v", res, err)
	}
	newClaims, _ := auth.ValidateToken(res.Token)
	if newClaims.AuthTime != claims.IssuedAt.Unix() {
		t.Fatalf("auth_time harus berasal dari iat: %d vs %d", newClaims.AuthTime, claims.IssuedAt.Unix())
	}
}

func TestRefreshToken_RejectsRevokedSessionAndKickedDevice(t *testing.T) {
	svc, cleanup := setupTestAuthService(t)
	defer cleanup()

	// Sesi dicabut (remote logout) -> ditolak.
	claims := loginClaims(t, svc, "revoked_user", "dev-1")
	claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(1 * time.Hour))
	if err := svc.RevokeSession(claims.ID, claims.UserID); err != nil {
		t.Fatalf("RevokeSession: %v", err)
	}
	if _, err := svc.RefreshToken(authz.RefreshInput{Claims: claims}); !errors.Is(err, authz.ErrSessionExpired) {
		t.Fatalf("sesi dicabut harus ditolak, got %v", err)
	}

	// Refresh kedua dengan token lama setelah berhasil refresh -> ditolak (sesi lama sudah dicabut).
	claims2 := loginClaims(t, svc, "twice_user", "dev-2")
	claims2.ExpiresAt = jwt.NewNumericDate(time.Now().Add(1 * time.Hour))
	if res, err := svc.RefreshToken(authz.RefreshInput{Claims: claims2}); err != nil || !res.Refreshed {
		t.Fatalf("refresh pertama harus sukses: %+v, %v", res, err)
	}
	if _, err := svc.RefreshToken(authz.RefreshInput{Claims: claims2}); !errors.Is(err, authz.ErrSessionExpired) {
		t.Fatalf("refresh ulang dengan token lama harus ditolak, got %v", err)
	}
}

func TestRefreshToken_NilClaims(t *testing.T) {
	svc, cleanup := setupTestAuthService(t)
	defer cleanup()
	if _, err := svc.RefreshToken(authz.RefreshInput{}); !errors.Is(err, authz.ErrSessionExpired) {
		t.Fatalf("expected ErrSessionExpired, got %v", err)
	}
}
