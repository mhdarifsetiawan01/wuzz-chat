package api_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
)

func TestOpenAPIHandler_ServeOpenAPISpec(t *testing.T) {
	handler := api.NewOpenAPIHandler()
	if handler == nil {
		t.Fatal("expected non-nil OpenAPIHandler")
	}

	spec := handler.GetSpec()
	if len(spec) == 0 {
		t.Fatal("expected non-empty OpenAPI specification")
	}

	specStr := string(spec)
	if !strings.Contains(specStr, "openapi: 3.1.0") {
		t.Errorf("expected spec to contain 'openapi: 3.1.0'")
	}
	if !strings.Contains(specStr, "/api/v1/auth/provision-token:") {
		t.Errorf("expected spec to contain '/api/v1/auth/provision-token:'")
	}
	if !strings.Contains(specStr, "/api/v1/auth/exchange:") {
		t.Errorf("expected spec to contain '/api/v1/auth/exchange:'")
	}
	if !strings.Contains(specStr, "/api/memory/drafts:") {
		t.Errorf("expected spec to contain '/api/memory/drafts:'")
	}

	// 1. Test GET /api/openapi.yaml
	req := httptest.NewRequest(http.MethodGet, "/api/openapi.yaml", nil)
	rr := httptest.NewRecorder()
	handler.ServeOpenAPISpec(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200 OK, got %d", rr.Code)
	}

	ct := rr.Header().Get("Content-Type")
	if !strings.Contains(ct, "application/yaml") {
		t.Errorf("expected Content-Type to contain application/yaml, got %s", ct)
	}

	body := rr.Body.String()
	if !strings.Contains(body, "title: WuzzChat Engine API") {
		t.Errorf("expected body to contain 'title: WuzzChat Engine API'")
	}

	// 2. Test HEAD /api/openapi.yaml
	headReq := httptest.NewRequest(http.MethodHead, "/api/openapi.yaml", nil)
	headRr := httptest.NewRecorder()
	handler.ServeOpenAPISpec(headRr, headReq)

	if headRr.Code != http.StatusOK {
		t.Errorf("expected status 200 OK on HEAD, got %d", headRr.Code)
	}
	if headRr.Body.Len() != 0 {
		t.Errorf("expected empty body on HEAD request, got %d bytes", headRr.Body.Len())
	}

	// 3. Test POST method not allowed
	postReq := httptest.NewRequest(http.MethodPost, "/api/openapi.yaml", nil)
	postRr := httptest.NewRecorder()
	handler.ServeOpenAPISpec(postRr, postReq)

	if postRr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405 Method Not Allowed, got %d", postRr.Code)
	}
}

func TestOpenAPIHandler_ServeDocsUI(t *testing.T) {
	handler := api.NewOpenAPIHandler()

	// 1. Test GET /api/docs
	req := httptest.NewRequest(http.MethodGet, "/api/docs", nil)
	rr := httptest.NewRecorder()
	handler.ServeDocsUI(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200 OK, got %d", rr.Code)
	}

	ct := rr.Header().Get("Content-Type")
	if !strings.Contains(ct, "text/html") {
		t.Errorf("expected Content-Type to contain text/html, got %s", ct)
	}

	body := rr.Body.String()
	if !strings.Contains(body, "WuzzChat Engine — API Reference") {
		t.Errorf("expected HTML body to contain 'WuzzChat Engine — API Reference'")
	}
	if !strings.Contains(body, "/api/openapi.yaml") {
		t.Errorf("expected HTML body to reference '/api/openapi.yaml'")
	}

	// 2. Test HEAD /api/docs
	headReq := httptest.NewRequest(http.MethodHead, "/api/docs", nil)
	headRr := httptest.NewRecorder()
	handler.ServeDocsUI(headRr, headReq)

	if headRr.Code != http.StatusOK {
		t.Errorf("expected status 200 OK on HEAD, got %d", headRr.Code)
	}
	if headRr.Body.Len() != 0 {
		t.Errorf("expected empty body on HEAD request, got %d bytes", headRr.Body.Len())
	}

	// 3. Test DELETE method not allowed
	delReq := httptest.NewRequest(http.MethodDelete, "/api/docs", nil)
	delRr := httptest.NewRecorder()
	handler.ServeDocsUI(delRr, delReq)

	if delRr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405 Method Not Allowed, got %d", delRr.Code)
	}
}
