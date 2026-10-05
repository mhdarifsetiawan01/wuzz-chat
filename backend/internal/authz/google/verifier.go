// Package google memverifikasi ID token Google (Sign-In) untuk login/registrasi Wuzz Chat.
//
// Verifikasi dilakukan lokal: tanda tangan RS256 dicek terhadap JWKS Google (di-cache), lalu klaim iss, aud, exp,
// dan email_verified diperiksa. Identitas yang dipercaya adalah klaim `sub`, bukan email.
package google

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// DefaultJWKSURL adalah endpoint kunci publik Google untuk memverifikasi ID token.
	DefaultJWKSURL = "https://www.googleapis.com/oauth2/v3/certs"

	jwksCacheTTL        = time.Hour
	jwksMinRefetchEvery = time.Minute
	jwksMaxBody         = 256 * 1024
	clockLeeway         = 30 * time.Second
)

var (
	// ErrInvalidIDToken dikembalikan untuk semua kegagalan verifikasi token (sengaja tidak spesifik ke klien).
	ErrInvalidIDToken = errors.New("id token Google tidak valid")
	// ErrNotConfigured dikembalikan bila tidak ada client ID Google yang dikonfigurasi.
	ErrNotConfigured = errors.New("login Google belum dikonfigurasi")
)

// Identity adalah identitas Google yang sudah terverifikasi.
type Identity struct {
	Subject       string // klaim sub: pengenal akun Google yang stabil (satu-satunya yang dipakai sebagai kunci)
	Email         string // hanya untuk tampilan, jangan dipakai sebagai kunci
	EmailVerified bool
	Name          string
	IssuedAt      time.Time // dipakai untuk memeriksa kesegaran saat re-auth
	Nonce         string
}

// Verifier memverifikasi ID token Google. Diabstraksi supaya service bisa diuji tanpa jaringan.
type Verifier interface {
	Verify(ctx context.Context, idToken string) (*Identity, error)
}

// JWKSVerifier memverifikasi ID token terhadap JWKS Google.
type JWKSVerifier struct {
	audiences map[string]struct{}
	jwksURL   string
	client    *http.Client
	now       func() time.Time

	mu        sync.Mutex
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time
}

// NewJWKSVerifier membuat verifier. audiences adalah daftar OAuth client ID yang diterima (Android, iOS, Web).
func NewJWKSVerifier(audiences []string) *JWKSVerifier {
	return newJWKSVerifier(audiences, DefaultJWKSURL, &http.Client{Timeout: 8 * time.Second}, time.Now)
}

func newJWKSVerifier(audiences []string, jwksURL string, client *http.Client, now func() time.Time) *JWKSVerifier {
	set := make(map[string]struct{}, len(audiences))
	for _, a := range audiences {
		if a = strings.TrimSpace(a); a != "" {
			set[a] = struct{}{}
		}
	}
	return &JWKSVerifier{audiences: set, jwksURL: jwksURL, client: client, now: now}
}

// Configured memberi tahu apakah setidaknya satu client ID dikonfigurasi.
func (v *JWKSVerifier) Configured() bool { return len(v.audiences) > 0 }

type idTokenClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Nonce         string `json:"nonce"`
	jwt.RegisteredClaims
}

// Verify memeriksa tanda tangan dan klaim token, lalu mengembalikan identitasnya.
func (v *JWKSVerifier) Verify(ctx context.Context, idToken string) (*Identity, error) {
	if !v.Configured() {
		return nil, ErrNotConfigured
	}
	idToken = strings.TrimSpace(idToken)
	if idToken == "" || len(idToken) > 8192 {
		return nil, ErrInvalidIDToken
	}

	claims := &idTokenClaims{}
	_, err := jwt.ParseWithClaims(idToken, claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("kid kosong")
		}
		return v.keyFor(ctx, kid)
	},
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithLeeway(clockLeeway),
		jwt.WithTimeFunc(v.now),
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidIDToken, err)
	}

	if iss := claims.Issuer; iss != "https://accounts.google.com" && iss != "accounts.google.com" {
		return nil, fmt.Errorf("%w: issuer tidak dikenal", ErrInvalidIDToken)
	}
	audOK := false
	for _, a := range claims.Audience {
		if _, ok := v.audiences[a]; ok {
			audOK = true
			break
		}
	}
	if !audOK {
		return nil, fmt.Errorf("%w: audience tidak cocok", ErrInvalidIDToken)
	}
	if strings.TrimSpace(claims.Subject) == "" {
		return nil, fmt.Errorf("%w: sub kosong", ErrInvalidIDToken)
	}
	if !claims.EmailVerified {
		return nil, fmt.Errorf("%w: email Google belum terverifikasi", ErrInvalidIDToken)
	}

	id := &Identity{
		Subject:       claims.Subject,
		Email:         claims.Email,
		EmailVerified: claims.EmailVerified,
		Name:          claims.Name,
		Nonce:         claims.Nonce,
	}
	if claims.IssuedAt != nil {
		id.IssuedAt = claims.IssuedAt.Time
	}
	return id, nil
}

// keyFor mengembalikan kunci publik untuk kid. Bila kid belum dikenal, JWKS diambil ulang (dibatasi sekali per menit).
func (v *JWKSVerifier) keyFor(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	now := v.now()
	fresh := v.keys != nil && now.Sub(v.fetchedAt) < jwksCacheTTL
	if fresh {
		if k, ok := v.keys[kid]; ok {
			return k, nil
		}
	}
	// Cache kosong/kedaluwarsa, atau kid baru (rotasi kunci): ambil ulang, tapi jangan lebih sering dari batas minimum.
	if v.keys != nil && now.Sub(v.fetchedAt) < jwksMinRefetchEvery {
		if k, ok := v.keys[kid]; ok {
			return k, nil
		}
		return nil, errors.New("kid tidak dikenal")
	}

	keys, err := v.fetchKeys(ctx)
	if err != nil {
		// Jaga kunci lama bila pengambilan gagal sementara (jaringan flaky), tapi tetap hormati kid.
		if k, ok := v.keys[kid]; ok {
			return k, nil
		}
		return nil, err
	}
	v.keys = keys
	v.fetchedAt = now
	if k, ok := keys[kid]; ok {
		return k, nil
	}
	return nil, errors.New("kid tidak dikenal")
}

type jwksDoc struct {
	Keys []struct {
		Kid string `json:"kid"`
		Kty string `json:"kty"`
		N   string `json:"n"`
		E   string `json:"e"`
	} `json:"keys"`
}

func (v *JWKSVerifier) fetchKeys(ctx context.Context) (map[string]*rsa.PublicKey, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := v.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil JWKS: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, jwksMaxBody))
	if err != nil {
		return nil, err
	}
	var doc jwksDoc
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("JWKS tidak valid: %w", err)
	}
	out := make(map[string]*rsa.PublicKey, len(doc.Keys))
	for _, k := range doc.Keys {
		if k.Kty != "RSA" || k.Kid == "" {
			continue
		}
		nb, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil {
			continue
		}
		eb, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil || len(eb) == 0 || len(eb) > 4 {
			continue
		}
		e := 0
		for _, b := range eb {
			e = e<<8 | int(b)
		}
		out[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(nb), E: e}
	}
	if len(out) == 0 {
		return nil, errors.New("JWKS tanpa kunci RSA")
	}
	return out, nil
}
