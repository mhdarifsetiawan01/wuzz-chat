package auth

import (
	"context"
	"net/http"
	"strings"
)

type contextKey string

const (
	UserContextKey contextKey = "user_claims"
)

// RequireJWT adalah middleware yang memvalidasi header Authorization: Bearer <token>
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
