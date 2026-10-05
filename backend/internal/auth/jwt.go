package auth

import (
	"errors"
	"log"
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	// TokenLifetime adalah masa berlaku satu JWT sejak diterbitkan (login maupun refresh).
	TokenLifetime = 30 * 24 * time.Hour
	// RefreshWindow: token baru boleh diminta bila sisa masa berlaku kurang dari ini (50% TokenLifetime).
	RefreshWindow = TokenLifetime / 2
	// MaxSessionAge: batas absolut sesi sejak login awal (auth_time); lewat ini wajib login ulang.
	MaxSessionAge = 365 * 24 * time.Hour
)

var (
	ErrInvalidToken = errors.New("token tidak valid atau kadaluarsa")
	jwtWarnOnce     sync.Once
)

// UserClaims adalah struktur data yang disimpan di dalam token JWT.
type UserClaims struct {
	UserID      string `json:"user_id"`
	TenantID    string `json:"tenant_id,omitempty"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	DeviceID    string `json:"device_id,omitempty"`
	SystemRole  string `json:"system_role,omitempty"`
	// AuthTime adalah waktu login awal (unix detik). Disalin saat refresh agar batas MaxSessionAge tidak bisa
	// diperpanjang tanpa batas. Token lama (tanpa klaim ini) memakai iat sebagai gantinya.
	AuthTime int64 `json:"auth_time,omitempty"`
	jwt.RegisteredClaims
}

// getJWTSecret mengembalikan secret key dari environment variable atau default fallback dev.
func getJWTSecret() []byte {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		jwtWarnOnce.Do(func() {
			log.Println("⚠️ [Security Warning] Environment variable JWT_SECRET tidak disetel! Menggunakan secret fallback dev. Harap setel JWT_SECRET untuk lingkungan produksi!")
		})
		secret = "wuzz-chat-super-secret-key-2026"
	}
	return []byte(secret)
}

// GenerateToken membuat token JWT baru dengan masa berlaku auth.TokenLifetime (30 hari) dan JTI unik.
func GenerateToken(userID, username, displayName string) (string, error) {
	tokenStr, _, err := GenerateTokenDetailed(userID, username, displayName)
	return tokenStr, err
}

// GenerateSessionToken membuat token JWT sesi penuh dengan tenant_id dan device_id spesifik (default systemRole: 'user').
func GenerateSessionToken(userID, username, displayName, tenantID, deviceID string) (string, *UserClaims, error) {
	return GenerateSessionTokenWithRole(userID, username, displayName, tenantID, deviceID, "user")
}

// GenerateSessionTokenWithRole membuat token JWT sesi penuh dengan tenant_id, device_id, dan system_role spesifik.
func GenerateSessionTokenWithRole(userID, username, displayName, tenantID, deviceID, systemRole string) (string, *UserClaims, error) {
	if tenantID == "" {
		tenantID = "default"
	}
	if systemRole == "" {
		systemRole = "user"
	}
	claims := &UserClaims{
		UserID:      userID,
		TenantID:    tenantID,
		Username:    username,
		DisplayName: displayName,
		DeviceID:    deviceID,
		SystemRole:  systemRole,
		AuthTime:    time.Now().Unix(),
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.New().String(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(TokenLifetime)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "wuzz-chat",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString(getJWTSecret())
	if err != nil {
		return "", nil, err
	}
	return tokenStr, claims, nil
}

// GenerateTokenDetailedWithTenant membuat token JWT baru dengan tenant_id spesifik.
func GenerateTokenDetailedWithTenant(userID, username, displayName, tenantID string) (string, *UserClaims, error) {
	return GenerateSessionToken(userID, username, displayName, tenantID, "")
}

// GenerateTokenDetailedWithTenantAndRole membuat token JWT baru dengan tenant_id dan system_role spesifik.
func GenerateTokenDetailedWithTenantAndRole(userID, username, displayName, tenantID, systemRole string) (string, *UserClaims, error) {
	return GenerateSessionTokenWithRole(userID, username, displayName, tenantID, "", systemRole)
}

// GenerateTokenDetailed membuat token JWT baru dan mengembalikan string token beserta pointer UserClaims (berisi ID JTI dan ExpiresAt).
func GenerateTokenDetailed(userID, username, displayName string) (string, *UserClaims, error) {
	return GenerateSessionToken(userID, username, displayName, "default", "")
}

// EffectiveAuthTime mengembalikan waktu login awal token (auth_time, fallback ke iat untuk token lama).
func (c *UserClaims) EffectiveAuthTime() time.Time {
	if c.AuthTime > 0 {
		return time.Unix(c.AuthTime, 0)
	}
	if c.IssuedAt != nil {
		return c.IssuedAt.Time
	}
	return time.Time{}
}

// GenerateRefreshedToken menerbitkan token baru (jti baru, masa berlaku penuh) dengan identitas dan auth_time
// yang sama seperti token lama.
func GenerateRefreshedToken(old *UserClaims) (string, *UserClaims, error) {
	authTime := old.EffectiveAuthTime()
	now := time.Now()
	claims := &UserClaims{
		UserID:      old.UserID,
		TenantID:    old.TenantID,
		Username:    old.Username,
		DisplayName: old.DisplayName,
		DeviceID:    old.DeviceID,
		SystemRole:  old.SystemRole,
		AuthTime:    authTime.Unix(),
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.New().String(),
			ExpiresAt: jwt.NewNumericDate(now.Add(TokenLifetime)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "wuzz-chat",
		},
	}
	tokenStr, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(getJWTSecret())
	if err != nil {
		return "", nil, err
	}
	return tokenStr, claims, nil
}

// ValidateToken memvalidasi string JWT token dan mengembalikan UserClaims jika sah.
func ValidateToken(tokenString string) (*UserClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return getJWTSecret(), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*UserClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, ErrInvalidToken
}
