package auth

import (
	"crypto/sha256"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// LinkTokenTTL adalah masa berlaku token penautan (bukti verifikasi Google yang dipakai untuk mendaftar/menautkan).
const LinkTokenTTL = 5 * time.Minute

const linkTokenPurpose = "google_link"

// ErrInvalidLinkToken dikembalikan untuk token penautan yang rusak, kedaluwarsa, atau bukan token penautan.
var ErrInvalidLinkToken = errors.New("token penautan tidak valid atau kedaluwarsa")

// LinkClaims adalah isi token penautan: bukti bahwa klien baru saja memverifikasi akun Google tertentu.
type LinkClaims struct {
	Provider string `json:"provider"`
	Subject  string `json:"subject"`
	Email    string `json:"email,omitempty"` // hanya untuk tampilan
	Purpose  string `json:"purpose"`
	jwt.RegisteredClaims
}

// linkTokenKey menurunkan kunci terpisah dari JWT_SECRET sehingga token penautan TIDAK PERNAH valid sebagai token
// sesi (dan sebaliknya), walaupun format dan secret dasarnya sama.
func linkTokenKey() []byte {
	sum := sha256.Sum256(append(getJWTSecret(), []byte("|google-link-v1")...))
	return sum[:]
}

// GenerateLinkToken menerbitkan token penautan untuk identitas pihak ketiga yang sudah diverifikasi server.
func GenerateLinkToken(provider, subject, email string) (string, *LinkClaims, error) {
	now := time.Now()
	claims := &LinkClaims{
		Provider: provider,
		Subject:  subject,
		Email:    email,
		Purpose:  linkTokenPurpose,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.New().String(),
			ExpiresAt: jwt.NewNumericDate(now.Add(LinkTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "wuzz-chat",
		},
	}
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(linkTokenKey())
	if err != nil {
		return "", nil, err
	}
	return s, claims, nil
}

// ParseLinkToken memvalidasi token penautan dan mengembalikan klaimnya.
func ParseLinkToken(tokenString string) (*LinkClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &LinkClaims{}, func(t *jwt.Token) (any, error) {
		return linkTokenKey(), nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())
	if err != nil {
		return nil, ErrInvalidLinkToken
	}
	c, ok := token.Claims.(*LinkClaims)
	if !ok || !token.Valid || c.Purpose != linkTokenPurpose || c.Provider == "" || c.Subject == "" {
		return nil, ErrInvalidLinkToken
	}
	return c, nil
}
