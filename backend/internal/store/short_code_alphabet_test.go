package store

import (
	"strings"
	"testing"
)

// Regresi: pola validasi pernah menolak huruf 'i' padahal alfabet pembuat kode memuatnya, sehingga ±13% kode pendek
// (dan tes TestShortLinkHandler_CreateAndResolve) gagal diterjemahkan. Setiap huruf alfabet harus lolos kedua pola.
func TestCodePatternsAcceptWholeAlphabet(t *testing.T) {
	for _, c := range shortCodeAlphabet {
		code := strings.Repeat(string(c), shortCodeLength)
		if !IsShortCode(code) {
			t.Errorf("IsShortCode menolak huruf alfabet %q", c)
		}
		if tok := strings.Repeat(string(c), inviteTokenLength); !IsInviteToken(tok) {
			t.Errorf("IsInviteToken menolak huruf alfabet %q", c)
		}
	}
	for _, bad := range []string{"0", "O", "1", "l", "I"} {
		if IsShortCode(strings.Repeat(bad, shortCodeLength)) {
			t.Errorf("IsShortCode menerima huruf yang dikecualikan %q", bad)
		}
	}
	for i := range 200 {
		code, err := generateShortCode()
		if err != nil || !IsShortCode(code) {
			t.Fatalf("percobaan %d: kode buatan %q ditolak polanya (%v)", i, code, err)
		}
		tok, err := generateInviteToken()
		if err != nil || !IsInviteToken(tok) {
			t.Fatalf("percobaan %d: token buatan %q ditolak polanya (%v)", i, tok, err)
		}
	}
}
