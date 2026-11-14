// Package playbilling memverifikasi dan memproses pembelian Star lewat Google Play Billing (V2 Tahap 2b,
// docs/plans/backlog/STARS_PLAY_BILLING.md): klien Play Developer API, verifikasi + kredit, konsumsi, dan pembalikan
// pembelian yang dibatalkan Google (voided).
package playbilling

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Scope OAuth untuk Google Play Developer API.
const AndroidPublisherScope = "https://www.googleapis.com/auth/androidpublisher"

const defaultTokenURI = "https://oauth2.googleapis.com/token"

// ServiceAccount adalah bagian berkas JSON kunci service account Google Cloud yang dipakai.
type ServiceAccount struct {
	Type        string `json:"type"`
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	TokenURI    string `json:"token_uri"`
}

// TokenSource memberi token akses OAuth.
type TokenSource interface {
	Token(ctx context.Context) (string, error)
}

// ServiceAccountTokenSource menukar JWT bertanda tangan service account dengan token akses (grant jwt-bearer) dan
// menyimpannya sampai sekitar 5 menit sebelum kedaluwarsa. Aman dipakai bersamaan.
type ServiceAccountTokenSource struct {
	email    string
	key      *rsa.PrivateKey
	tokenURI string
	scope    string
	http     *http.Client
	now      func() time.Time

	mu      sync.Mutex
	token   string
	expires time.Time
}

// LoadServiceAccountFile membaca berkas JSON service account.
func LoadServiceAccountFile(path string) (*ServiceAccount, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("gagal membaca berkas service account: %w", err)
	}
	var sa ServiceAccount
	if err := json.Unmarshal(b, &sa); err != nil {
		return nil, fmt.Errorf("berkas service account bukan JSON yang valid: %w", err)
	}
	if sa.ClientEmail == "" || sa.PrivateKey == "" {
		return nil, errors.New("berkas service account tidak memuat client_email/private_key")
	}
	return &sa, nil
}

// NewServiceAccountTokenSource membuat sumber token untuk scope tertentu.
func NewServiceAccountTokenSource(sa *ServiceAccount, scope string, httpClient *http.Client) (*ServiceAccountTokenSource, error) {
	key, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(sa.PrivateKey))
	if err != nil {
		return nil, fmt.Errorf("private_key service account tidak valid: %w", err)
	}
	uri := sa.TokenURI
	if uri == "" {
		uri = defaultTokenURI
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &ServiceAccountTokenSource{email: sa.ClientEmail, key: key, tokenURI: uri, scope: scope, http: httpClient, now: time.Now}, nil
}

// Token mengembalikan token akses yang masih berlaku, memperbaruinya bila perlu.
func (s *ServiceAccountTokenSource) Token(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	if s.token != "" && now.Before(s.expires.Add(-5*time.Minute)) {
		return s.token, nil
	}
	claims := jwt.MapClaims{
		"iss":   s.email,
		"scope": s.scope,
		"aud":   s.tokenURI,
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(s.key)
	if err != nil {
		return "", fmt.Errorf("gagal menandatangani assertion: %w", err)
	}
	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", signed)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.tokenURI, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("permintaan token OAuth gagal: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token OAuth ditolak (HTTP %d): %s", resp.StatusCode, truncate(string(body), 300))
	}
	var tr struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tr); err != nil || tr.AccessToken == "" {
		return "", errors.New("jawaban token OAuth tidak valid")
	}
	if tr.ExpiresIn <= 0 {
		tr.ExpiresIn = 3600
	}
	s.token = tr.AccessToken
	s.expires = now.Add(time.Duration(tr.ExpiresIn) * time.Second)
	return s.token, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
