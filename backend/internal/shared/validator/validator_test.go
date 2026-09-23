package validator

import (
	"strings"
	"testing"
)

func TestValidateRegistration(t *testing.T) {
	tests := []struct {
		name        string
		username    string
		displayName string
		password    string
		wantErr     error
	}{
		// Valid cases
		{"Valid User", "budi123", "Budi Santoso", "rahasia123", nil},
		{"Valid with dot and underscore", "arif.setiawan_01", "Arif Setiawan", "superpass2026", nil},
		{"Valid with hyphen", "john-doe", "John Doe", "password123", nil},
		{"Valid Exact Word Substring (robot)", "robot", "Mr Robot", "password123", nil},
		{"Valid Exact Word Substring (modern)", "modern_user", "Modern User", "password123", nil},
		{"Valid Exact Word Substring (budi_dev)", "budi_developer", "Budi Dev", "password123", nil},

		// Username length
		{"Empty username", "", "Name", "password123", ErrUsernameEmpty},
		{"Too short username", "ab", "Name", "password123", ErrUsernameTooShort},
		{"Too long username", strings.Repeat("a", 31), "Name", "password123", ErrUsernameTooLong},

		// Username invalid characters
		{"Username with space", "budi santoso", "Name", "password123", ErrUsernameInvalidChar},
		{"Username with slash", "budi/admin", "Name", "password123", ErrUsernameInvalidChar},
		{"Username with @", "budi@gmail", "Name", "password123", ErrUsernameInvalidChar},

		// Substring blocked words (jancok, puki, pepek, semantic)
		{"Contains jancok", "si_jancok_banget", "Name", "password123", ErrUsernameForbidden},
		{"Contains puki uppercase", "Si_PUKI_123", "Name", "password123", ErrUsernameForbidden},
		{"Contains pepek", "toko_pepek", "Name", "password123", ErrUsernameForbidden},
		{"Contains semantic", "semantic_user", "Name", "password123", ErrUsernameForbidden},
		{"Contains semantic inside word", "supersemantic", "Name", "password123", ErrUsernameForbidden},

		// Sensitive / Brand words (exact & prefix/suffix)
		{"Exact admin", "admin", "Admin", "password123", ErrUsernameForbidden},
		{"Prefix admin_", "admin_budi", "Admin Budi", "password123", ErrUsernameForbidden},
		{"Suffix _admin", "budi_admin", "Budi Admin", "password123", ErrUsernameForbidden},
		{"Suffix _official (arif_official)", "arif_official", "Arif Official", "password123", ErrUsernameForbidden},
		{"Prefix official_", "official_arif", "Official Arif", "password123", ErrUsernameForbidden},
		{"Prefix wuzz", "wuzz123", "Wuzz User", "password123", ErrUsernameForbidden},
		{"Prefix wuzz_", "wuzz_cs", "Wuzz CS", "password123", ErrUsernameForbidden},
		{"Exact verified", "verified", "Verified", "password123", ErrUsernameForbidden},
		{"Suffix _verified", "user_verified", "Verified User", "password123", ErrUsernameForbidden},

		// Technical exact match only
		{"Exact bot", "bot", "Bot", "password123", ErrUsernameForbidden},
		{"Exact dev", "dev", "Dev", "password123", ErrUsernameForbidden},
		{"Exact api", "api", "API", "password123", ErrUsernameForbidden},
		{"Exact login", "login", "Login", "password123", ErrUsernameForbidden},

		// Password length
		{"Empty password", "validuser", "Name", "", ErrPasswordEmpty},
		{"Too short password", "validuser", "Name", "12345", ErrPasswordTooShort},
		{"Too long password", "validuser", "Name", strings.Repeat("x", 129), ErrPasswordTooLong},

		// DisplayName length
		{"Too long display name", "validuser", strings.Repeat("n", 51), "password123", ErrDisplayNameTooLong},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateRegistration(tt.username, tt.displayName, tt.password)
			if err != tt.wantErr {
				t.Errorf("ValidateRegistration(%q, %q, ...) = %v, want %v", tt.username, tt.displayName, err, tt.wantErr)
			}
		})
	}
}
