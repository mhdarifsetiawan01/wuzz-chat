package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestLinkToken_RoundTrip(t *testing.T) {
	tok, claims, err := GenerateLinkToken("google", "sub-1", "a@example.com")
	if err != nil {
		t.Fatal(err)
	}
	got, err := ParseLinkToken(tok)
	if err != nil {
		t.Fatalf("token valid ditolak: %v", err)
	}
	if got.Provider != "google" || got.Subject != "sub-1" || got.Email != "a@example.com" || got.ID != claims.ID {
		t.Fatalf("klaim salah: %+v", got)
	}
}

func TestLinkToken_NotValidAsSessionToken(t *testing.T) {
	tok, _, err := GenerateLinkToken("google", "sub-1", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ValidateToken(tok); err == nil {
		t.Fatal("token penautan tidak boleh lolos sebagai token sesi")
	}
}

func TestLinkToken_SessionTokenNotValidAsLinkToken(t *testing.T) {
	session, err := GenerateToken("u1", "alice", "Alice")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseLinkToken(session); err == nil {
		t.Fatal("token sesi tidak boleh lolos sebagai token penautan")
	}
}

func TestLinkToken_Rejections(t *testing.T) {
	sign := func(c *LinkClaims, key []byte) string {
		s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	good := func() *LinkClaims {
		return &LinkClaims{
			Provider: "google", Subject: "s", Purpose: linkTokenPurpose,
			RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute))},
		}
	}

	expired := good()
	expired.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute))
	noExp := good()
	noExp.ExpiresAt = nil
	wrongPurpose := good()
	wrongPurpose.Purpose = "lain"
	noSubject := good()
	noSubject.Subject = ""

	cases := map[string]string{
		"kedaluwarsa":   sign(expired, linkTokenKey()),
		"tanpa exp":     sign(noExp, linkTokenKey()),
		"purpose salah": sign(wrongPurpose, linkTokenKey()),
		"tanpa subject": sign(noSubject, linkTokenKey()),
		"kunci salah":   sign(good(), []byte("kunci-lain")),
		"sampah":        "bukan-token",
	}
	for name, tok := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseLinkToken(tok); err == nil {
				t.Fatal("seharusnya ditolak")
			}
		})
	}
}
