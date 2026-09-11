package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJWTGenerationAndValidation(t *testing.T) {
	token, err := GenerateToken("user-123", "alice", "Alice Wonder")
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	claims, err := ValidateToken(token)
	if err != nil {
		t.Fatalf("failed to validate token: %v", err)
	}

	if claims.UserID != "user-123" || claims.Username != "alice" || claims.DisplayName != "Alice Wonder" {
		t.Errorf("claims mismatch: got %+v", claims)
	}
}

func TestRequireJWTMiddleware(t *testing.T) {
	token, _ := GenerateToken("user-456", "bob", "Bob Builder")

	var extractedUser *UserClaims
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := GetUserFromContext(r.Context())
		if ok {
			extractedUser = claims
		}
		w.WriteHeader(http.StatusOK)
	})

	protectedHandler := RequireJWT()(handler)

	// Test 1: Tanpa token -> 401
	reqNoToken := httptest.NewRequest(http.MethodGet, "/api/protected", nil)
	rr1 := httptest.NewRecorder()
	protectedHandler.ServeHTTP(rr1, reqNoToken)
	if rr1.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401 without token, got %d", rr1.Code)
	}

	// Test 2: Dengan valid Bearer token -> 200 & user extracted
	reqWithToken := httptest.NewRequest(http.MethodGet, "/api/protected", nil)
	reqWithToken.Header.Set("Authorization", "Bearer "+token)
	rr2 := httptest.NewRecorder()
	protectedHandler.ServeHTTP(rr2, reqWithToken)
	if rr2.Code != http.StatusOK {
		t.Errorf("expected status 200 with valid token, got %d", rr2.Code)
	}
	if extractedUser == nil || extractedUser.Username != "bob" {
		t.Errorf("expected extracted user bob, got %+v", extractedUser)
	}
}
