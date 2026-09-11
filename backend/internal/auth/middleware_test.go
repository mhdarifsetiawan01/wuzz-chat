package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestChainAndNoOp(t *testing.T) {
	called := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	chained := Chain(handler, NoOp())
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	rr := httptest.NewRecorder()

	chained.ServeHTTP(rr, req)

	if !called {
		t.Errorf("expected handler to be called through middleware chain")
	}
	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rr.Code)
	}
}
