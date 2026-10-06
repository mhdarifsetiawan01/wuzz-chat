package auth

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"
)

type contextKey string

const (
	UserContextKey contextKey = "user_claims"
)

// TokenRevocationChecker mendefinisikan antarmuka untuk memvalidasi apakah token atau sesi pengguna telah dicabut.
type TokenRevocationChecker interface {
	IsTokenRevoked(jti string) (bool, error)
	IsUserRevokedBefore(userID string, issuedAt time.Time) (bool, error)
}

// RevocationReason menjelaskan mengapa sebuah token ditolak oleh pemeriksaan pencabutan.
type RevocationReason int

const (
	NotRevoked         RevocationReason = iota
	TokenRevoked                        // token (jti) atau sesinya dicabut individual (logout, perangkat dikeluarkan)
	AllSessionsRevoked                  // semua token akun dicabut massal (ganti password, dll)
)

// CombinedRevocationChecker adalah kemampuan OPSIONAL untuk memeriksa pencabutan token, sesi, dan pencabutan massal akun
// dalam SATU putaran ke database (alih-alih tiga query berurutan di setiap permintaan). Semantiknya harus identik dengan
// IsTokenRevoked + IsUserRevokedBefore: pencabutan individual didahulukan, issuedAt nol berarti pemeriksaan massal dilewati.
type CombinedRevocationChecker interface {
	CheckRevocation(jti, userID string, issuedAt time.Time) (RevocationReason, error)
}

var (
	tokenCheckerMu sync.RWMutex
	tokenChecker   TokenRevocationChecker
)

// SetTokenChecker menyuntikkan implementasi pengecekan token revocation (misal TokenStore).
func SetTokenChecker(checker TokenRevocationChecker) {
	tokenCheckerMu.Lock()
	defer tokenCheckerMu.Unlock()
	tokenChecker = checker
}

// GetTokenChecker mengembalikan checker token revocation aktif jika ada.
func GetTokenChecker() TokenRevocationChecker {
	tokenCheckerMu.RLock()
	defer tokenCheckerMu.RUnlock()
	return tokenChecker
}

// RequireJWT adalah middleware yang memvalidasi header Authorization: Bearer <token> dan revocation list.
func RequireJWT() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			tokenStr := ""

			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
			} else {
				// Cek query parameter token untuk koneksi WebSocket: /ws?token=...
				tokenStr = r.URL.Query().Get("token")
			}

			if tokenStr == "" {
				http.Error(w, `{"error":"Akses ditolak: token tidak ditemukan"}`, http.StatusUnauthorized)
				return
			}

			claims, err := ValidateToken(tokenStr)
			if err != nil {
				http.Error(w, `{"error":"Token tidak valid atau kadaluarsa"}`, http.StatusUnauthorized)
				return
			}

			// Cek apakah token masuk dalam daftar revocation
			checker := GetTokenChecker()
			if checker != nil {
				var issuedAt time.Time
				if claims.UserID != "" && claims.IssuedAt != nil {
					issuedAt = claims.IssuedAt.Time
				}
				reason := NotRevoked
				if combined, ok := checker.(CombinedRevocationChecker); ok {
					// Satu putaran ke database. Galat diabaikan (gagal terbuka), sama seperti pemeriksaan terpisah di bawah.
					if rr, err := combined.CheckRevocation(claims.ID, claims.UserID, issuedAt); err == nil {
						reason = rr
					}
				} else {
					// 1. Cek JTI spesifik (pencabutan individual via logout)
					if claims.ID != "" {
						if revoked, err := checker.IsTokenRevoked(claims.ID); err == nil && revoked {
							reason = TokenRevoked
						}
					}
					// 2. Cek pencabutan global user (misal saat ganti password)
					if reason == NotRevoked && !issuedAt.IsZero() {
						if userRevoked, err := checker.IsUserRevokedBefore(claims.UserID, issuedAt); err == nil && userRevoked {
							reason = AllSessionsRevoked
						}
					}
				}
				switch reason {
				case TokenRevoked:
					http.Error(w, `{"error":"Token telah dicabut atau kadaluarsa"}`, http.StatusUnauthorized)
					return
				case AllSessionsRevoked:
					http.Error(w, `{"error":"Sesi telah berakhir karena perubahan kredensial akun. Silakan login ulang."}`, http.StatusUnauthorized)
					return
				}
			}

			// Peran istimewa dari token diverifikasi ke database (pencabutan peran berlaku tanpa menunggu token habis).
			if rr := getRoleResolver(); rr != nil {
				claims.SystemRole = rr.EffectiveSystemRole(r.Context(), claims.UserID, claims.SystemRole)
			}

			// Masukkan claims user ke context request
			ctx := context.WithValue(r.Context(), UserContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SetUserContext memasukkan UserClaims ke context HTTP request (berguna untuk testing dan middleware internal).
func SetUserContext(ctx context.Context, claims *UserClaims) context.Context {
	return context.WithValue(ctx, UserContextKey, claims)
}

// GetUserFromContext mengekstrak UserClaims dari context HTTP request.
func GetUserFromContext(ctx context.Context) (*UserClaims, bool) {
	claims, ok := ctx.Value(UserContextKey).(*UserClaims)
	return claims, ok
}
