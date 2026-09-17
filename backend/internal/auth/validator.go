package auth

import (
	"errors"
	"regexp"
	"strings"
)

var (
	// UsernameRegex memastikan hanya huruf, angka, titik, strip, dan underscore tanpa spasi.
	UsernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)

	ErrUsernameEmpty       = errors.New("username wajib diisi")
	ErrUsernameTooShort    = errors.New("username minimal 3 karakter")
	ErrUsernameTooLong     = errors.New("username maksimal 30 karakter")
	ErrUsernameInvalidChar = errors.New("username hanya boleh berisi huruf, angka, titik, strip, dan underscore (tanpa spasi)")
	ErrUsernameForbidden   = errors.New("username ini tidak diizinkan atau dicadangkan untuk sistem")
	ErrPasswordEmpty       = errors.New("password wajib diisi")
	ErrPasswordTooShort    = errors.New("password minimal 6 karakter")
	ErrPasswordTooLong     = errors.New("password maksimal 128 karakter")
	ErrDisplayNameTooLong  = errors.New("nama tampilan maksimal 50 karakter")
)

// 1. BlockedSubstrings: Dilarang jika username MENGANDUNG kata ini di posisi manapun (Contains / Substring Match).
var BlockedSubstrings = []string{
	"jancok",
	"puki",
	"pepek",
	"semantic",
}

// 2. SensitiveWords: Kata resmi / brand / privilese sistem.
// Dilarang jika persis sama ATAU sebagai awalan/akhiran dengan pemisah (_, ., -).
// Khusus brand prefix 'wuzz', dilarang sebagai awalan langsung (misal: wuzz123, wuzzbot).
var SensitiveWords = []string{
	"admin", "administrator", "root", "superuser", "sysadmin", "system", "moderator", "staff",
	"wuzz", "wuzzchat", "wuzzhub", "wuzzapp", "wuzzbot", "wuzzteam", "wuzzadmin", "wuzzsupport", "wuzzofficial",
	"official", "verified", "support", "security", "customer", "billing",
}

// 3. ExactOnlyWords: Kata umum / teknis / rute routing.
// HANYA dilarang jika PERSIS SAMA (Exact Match) agar tidak memblokir nama wajar (misal 'robot', 'modern').
var ExactOnlyWords = []string{
	"bot", "mod", "api", "ws", "websocket", "auth", "login", "register", "logout", "chat",
	"transfer", "null", "undefined", "dev", "developer", "test", "help", "info", "contact", "team",
}

// IsForbiddenUsername memeriksa apakah username terlarang sesuai aturan hybrid & substring.
func IsForbiddenUsername(username string) bool {
	u := strings.ToLower(strings.TrimSpace(username))
	if u == "" {
		return false
	}

	// 1. Cek Substring / Contains Match
	for _, word := range BlockedSubstrings {
		if strings.Contains(u, strings.ToLower(word)) {
			return true
		}
	}

	// 2. Cek Exact Match untuk Technical Words
	for _, word := range ExactOnlyWords {
		if u == strings.ToLower(word) {
			return true
		}
	}

	// 3. Cek Sensitive / Brand Words (Exact Match atau Awalan / Akhiran dengan pemisah)
	for _, word := range SensitiveWords {
		w := strings.ToLower(word)
		if u == w {
			return true
		}
		// Awalan dengan pemisah: admin_budi, admin.budi, admin-budi
		if strings.HasPrefix(u, w+"_") || strings.HasPrefix(u, w+".") || strings.HasPrefix(u, w+"-") {
			return true
		}
		// Akhiran dengan pemisah: arif_official, arif.official, arif-official, arif_admin
		if strings.HasSuffix(u, "_"+w) || strings.HasSuffix(u, "."+w) || strings.HasSuffix(u, "-"+w) {
			return true
		}
		// Awalan langsung khusus brand prefix 'wuzz': wuzz123, wuzzcorp, wuzzstore
		if strings.HasPrefix(w, "wuzz") && strings.HasPrefix(u, w) {
			return true
		}
	}

	return false
}

// ValidateRegistration memvalidasi username, displayName, dan password pendaftar baru.
func ValidateRegistration(username, displayName, password string) error {
	username = strings.TrimSpace(username)
	displayName = strings.TrimSpace(displayName)

	if username == "" {
		return ErrUsernameEmpty
	}
	if len(username) < 3 {
		return ErrUsernameTooShort
	}
	if len(username) > 30 {
		return ErrUsernameTooLong
	}
	if !UsernameRegex.MatchString(username) {
		return ErrUsernameInvalidChar
	}
	if IsForbiddenUsername(username) {
		return ErrUsernameForbidden
	}

	if password == "" {
		return ErrPasswordEmpty
	}
	if len(password) < 6 {
		return ErrPasswordTooShort
	}
	if len(password) > 128 {
		return ErrPasswordTooLong
	}

	if len(displayName) > 50 {
		return ErrDisplayNameTooLong
	}

	return nil
}
