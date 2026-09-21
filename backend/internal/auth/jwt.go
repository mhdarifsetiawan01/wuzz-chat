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

var (
	ErrInvalidToken = errors.New("token tidak valid atau kadaluarsa")
	jwtWarnOnce     sync.Once
)

// UserClaims adalah struktur data yang disimpan di dalam token JWT.
type UserClaims struct {
	UserID      string `json:"user_id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
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

// GenerateToken membuat token JWT baru dengan masa berlaku 7 hari dan JTI unik.
func GenerateToken(userID, username, displayName string) (string, error) {
	claims := UserClaims{
		UserID:      userID,
		Username:    username,
		DisplayName: displayName,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.New().String(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "wuzz-chat",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(getJWTSecret())
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
