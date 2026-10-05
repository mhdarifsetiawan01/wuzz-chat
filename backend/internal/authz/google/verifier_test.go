package google

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testAud = "test-client.apps.googleusercontent.com"

type jwksFixture struct {
	srv     *httptest.Server
	keys    map[string]*rsa.PublicKey
	fetches atomic.Int32
}

func newKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func newFixture(t *testing.T, initial map[string]*rsa.PrivateKey) *jwksFixture {
	t.Helper()
	f := &jwksFixture{keys: map[string]*rsa.PublicKey{}}
	for kid, k := range initial {
		f.keys[kid] = &k.PublicKey
	}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.fetches.Add(1)
		type jwk struct {
			Kid string `json:"kid"`
			Kty string `json:"kty"`
			N   string `json:"n"`
			E   string `json:"e"`
		}
		var doc struct {
			Keys []jwk `json:"keys"`
		}
		for kid, pk := range f.keys {
			doc.Keys = append(doc.Keys, jwk{
				Kid: kid, Kty: "RSA",
				N: base64.RawURLEncoding.EncodeToString(pk.N.Bytes()),
				E: base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pk.E)).Bytes()),
			})
		}
		_ = json.NewEncoder(w).Encode(doc)
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *jwksFixture) verifier(now func() time.Time) *JWKSVerifier {
	return newJWKSVerifier([]string{testAud}, f.srv.URL, f.srv.Client(), now)
}

func signToken(t *testing.T, key *rsa.PrivateKey, kid string, mutate func(m jwt.MapClaims)) string {
	t.Helper()
	now := time.Now()
	m := jwt.MapClaims{
		"iss":            "https://accounts.google.com",
		"aud":            testAud,
		"sub":            "1234567890",
		"email":          "user@example.com",
		"email_verified": true,
		"name":           "Test User",
		"iat":            now.Add(-time.Minute).Unix(),
		"exp":            now.Add(30 * time.Minute).Unix(),
	}
	if mutate != nil {
		mutate(m)
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, m)
	tok.Header["kid"] = kid
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestVerify_Valid(t *testing.T) {
	k := newKey(t)
	f := newFixture(t, map[string]*rsa.PrivateKey{"k1": k})
	v := f.verifier(time.Now)

	id, err := v.Verify(context.Background(), signToken(t, k, "k1", nil))
	if err != nil {
		t.Fatalf("token valid ditolak: %v", err)
	}
	if id.Subject != "1234567890" || id.Email != "user@example.com" || id.Name != "Test User" || id.IssuedAt.IsZero() {
		t.Fatalf("identitas salah: %+v", id)
	}
}

func TestVerify_AlternateIssuerAccepted(t *testing.T) {
	k := newKey(t)
	f := newFixture(t, map[string]*rsa.PrivateKey{"k1": k})
	v := f.verifier(time.Now)
	tok := signToken(t, k, "k1", func(m jwt.MapClaims) { m["iss"] = "accounts.google.com" })
	if _, err := v.Verify(context.Background(), tok); err != nil {
		t.Fatalf("issuer tanpa skema harus diterima: %v", err)
	}
}

func TestVerify_Rejections(t *testing.T) {
	k := newKey(t)
	other := newKey(t)
	f := newFixture(t, map[string]*rsa.PrivateKey{"k1": k})
	v := f.verifier(time.Now)

	cases := map[string]string{
		"audience salah": signToken(t, k, "k1", func(m jwt.MapClaims) { m["aud"] = "client-lain" }),
		"issuer salah":   signToken(t, k, "k1", func(m jwt.MapClaims) { m["iss"] = "https://evil.example.com" }),
		"kedaluwarsa": signToken(t, k, "k1", func(m jwt.MapClaims) {
			m["iat"] = time.Now().Add(-2 * time.Hour).Unix()
			m["exp"] = time.Now().Add(-time.Hour).Unix()
		}),
		"tanpa exp":          signToken(t, k, "k1", func(m jwt.MapClaims) { delete(m, "exp") }),
		"iat di masa depan":  signToken(t, k, "k1", func(m jwt.MapClaims) { m["iat"] = time.Now().Add(time.Hour).Unix() }),
		"email belum verif":  signToken(t, k, "k1", func(m jwt.MapClaims) { m["email_verified"] = false }),
		"sub kosong":         signToken(t, k, "k1", func(m jwt.MapClaims) { m["sub"] = "" }),
		"kid tak dikenal":    signToken(t, k, "k-lain", nil),
		"tanda tangan palsu": signToken(t, other, "k1", nil),
		"bukan jwt":          "bukan-token",
		"kosong":             "",
	}
	for name, tok := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := v.Verify(context.Background(), tok); !errors.Is(err, ErrInvalidIDToken) {
				t.Fatalf("seharusnya ErrInvalidIDToken, dapat: %v", err)
			}
		})
	}
}

func TestVerify_RejectsHS256Confusion(t *testing.T) {
	k := newKey(t)
	f := newFixture(t, map[string]*rsa.PrivateKey{"k1": k})
	v := f.verifier(time.Now)

	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"iss": "https://accounts.google.com", "aud": testAud, "sub": "1", "email_verified": true,
		"iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(),
	})
	tok.Header["kid"] = "k1"
	s, err := tok.SignedString([]byte("secret-apa-saja"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := v.Verify(context.Background(), s); !errors.Is(err, ErrInvalidIDToken) {
		t.Fatalf("token HS256 harus ditolak, dapat: %v", err)
	}
}

func TestVerify_NotConfigured(t *testing.T) {
	v := NewJWKSVerifier(nil)
	if _, err := v.Verify(context.Background(), "x"); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("seharusnya ErrNotConfigured, dapat: %v", err)
	}
	if v.Configured() {
		t.Fatal("Configured() harus false tanpa client ID")
	}
}

func TestVerify_CachesJWKS(t *testing.T) {
	k := newKey(t)
	f := newFixture(t, map[string]*rsa.PrivateKey{"k1": k})
	v := f.verifier(time.Now)

	for range 5 {
		if _, err := v.Verify(context.Background(), signToken(t, k, "k1", nil)); err != nil {
			t.Fatal(err)
		}
	}
	if n := f.fetches.Load(); n != 1 {
		t.Fatalf("JWKS harus diambil sekali (cache), diambil %d kali", n)
	}
}

func TestVerify_KeyRotationRefetch(t *testing.T) {
	k1, k2 := newKey(t), newKey(t)
	f := newFixture(t, map[string]*rsa.PrivateKey{"k1": k1})

	clock := time.Now()
	v := f.verifier(func() time.Time { return clock })

	if _, err := v.Verify(context.Background(), signToken(t, k1, "k1", nil)); err != nil {
		t.Fatal(err)
	}

	// Google merotasi kunci: kid baru muncul. Dalam batas minimum refetch, tetap ditolak (anti-hammering JWKS).
	f.keys["k2"] = &k2.PublicKey
	if _, err := v.Verify(context.Background(), signToken(t, k2, "k2", nil)); !errors.Is(err, ErrInvalidIDToken) {
		t.Fatalf("kid baru sebelum batas refetch harus ditolak, dapat: %v", err)
	}
	if n := f.fetches.Load(); n != 1 {
		t.Fatalf("tidak boleh refetch sebelum batas minimum, fetch=%d", n)
	}

	// Setelah melewati batas minimum, JWKS diambil ulang dan kid baru diterima.
	clock = clock.Add(2 * time.Minute)
	if _, err := v.Verify(context.Background(), signToken(t, k2, "k2", nil)); err != nil {
		t.Fatalf("kid baru setelah refetch harus diterima: %v", err)
	}
	if n := f.fetches.Load(); n != 2 {
		t.Fatalf("seharusnya 2 fetch, dapat %d", n)
	}
}

func TestVerify_JWKSUnavailable(t *testing.T) {
	k := newKey(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusServiceUnavailable)
	}))
	defer srv.Close()
	v := newJWKSVerifier([]string{testAud}, srv.URL, srv.Client(), time.Now)

	if _, err := v.Verify(context.Background(), signToken(t, k, "k1", nil)); !errors.Is(err, ErrInvalidIDToken) {
		t.Fatalf("JWKS mati harus gagal tertutup, dapat: %v", err)
	}
}
