package playbilling

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type staticToken string

func (s staticToken) Token(context.Context) (string, error) { return string(s), nil }

func testServiceAccount(t *testing.T, tokenURI string) *ServiceAccount {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	pemKey := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})
	return &ServiceAccount{ClientEmail: "play@wuzz.iam.gserviceaccount.com", PrivateKey: string(pemKey), TokenURI: tokenURI}
}

func TestServiceAccountTokenSource_ExchangesAndCaches(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if err := r.ParseForm(); err != nil || r.Form.Get("grant_type") != "urn:ietf:params:oauth:grant-type:jwt-bearer" || r.Form.Get("assertion") == "" {
			http.Error(w, "bad", http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "akses-1", "expires_in": 3600})
	}))
	defer srv.Close()
	ts, err := NewServiceAccountTokenSource(testServiceAccount(t, srv.URL), AndroidPublisherScope, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	ts.now = func() time.Time { return now }
	for range 3 {
		tok, err := ts.Token(t.Context())
		if err != nil || tok != "akses-1" {
			t.Fatalf("token: %q %v", tok, err)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("token diambil %d kali, want 1 (cache)", calls.Load())
	}
	now = now.Add(56 * time.Minute) // dalam 5 menit terakhir masa berlaku: diperbarui
	if _, err := ts.Token(t.Context()); err != nil || calls.Load() != 2 {
		t.Fatalf("perbarui token: calls=%d err=%v", calls.Load(), err)
	}
}

func TestServiceAccountTokenSource_Rejected(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
	}))
	defer srv.Close()
	ts, err := NewServiceAccountTokenSource(testServiceAccount(t, srv.URL), AndroidPublisherScope, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ts.Token(t.Context()); err == nil || !strings.Contains(err.Error(), "400") {
		t.Fatalf("galat token: %v", err)
	}
}

func TestClient_GetProductPurchase(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok-akses" {
			http.Error(w, "unauth", http.StatusUnauthorized)
			return
		}
		switch r.URL.EscapedPath() {
		case "/applications/com.wuzzchat.mobile/purchases/productsv2/tokens/abc%2F1":
			_, _ = w.Write([]byte(`{
				"productLineItem": [{"productId": "star_100", "productOfferDetails": {"quantity": 2, "consumptionState": "CONSUMPTION_STATE_YET_TO_BE_CONSUMED"}}],
				"purchaseStateContext": {"purchaseState": "PURCHASED"},
				"testPurchaseContext": {"fopType": "TEST"},
				"orderId": "GPA.1234",
				"obfuscatedExternalAccountId": "hash-akun",
				"purchaseCompletionTime": "2026-11-14T10:00:00Z",
				"acknowledgementState": "ACKNOWLEDGEMENT_STATE_PENDING"}`))
		case "/applications/com.wuzzchat.mobile/purchases/productsv2/tokens/hilang":
			http.Error(w, "{}", http.StatusNotFound)
		default:
			http.Error(w, `{"error":"boom"}`, http.StatusInternalServerError)
		}
	}))
	defer srv.Close()
	c := NewClient(srv.URL, "com.wuzzchat.mobile", staticToken("tok-akses"), srv.Client())

	p, err := c.GetProductPurchase(t.Context(), "abc/1")
	if err != nil {
		t.Fatal(err)
	}
	if p.State != StatePurchased || p.OrderID != "GPA.1234" || p.ObfuscatedAccountID != "hash-akun" || !p.IsTest ||
		len(p.LineItems) != 1 || p.LineItems[0].ProductID != "star_100" || p.LineItems[0].Quantity != 2 ||
		p.LineItems[0].ConsumptionState != ConsumptionNotConsumed || p.PurchaseCompletedAt.IsZero() {
		t.Fatalf("hasil parsing: %+v", p)
	}
	if _, err := c.GetProductPurchase(t.Context(), "hilang"); !errors.Is(err, ErrPurchaseNotFound) {
		t.Fatalf("404: %v", err)
	}
	var apiErr *APIError
	if _, err := c.GetProductPurchase(t.Context(), "lain"); !errors.As(err, &apiErr) || apiErr.Status != 500 {
		t.Fatalf("500: %v", err)
	}
}

func TestClient_ConsumeAndListVoided(t *testing.T) {
	var consumed atomic.Bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.EscapedPath() == "/applications/com.wuzzchat.mobile/purchases/products/star_50/tokens/t1:consume":
			consumed.Store(true)
		case r.Method == http.MethodGet && r.URL.Path == "/applications/com.wuzzchat.mobile/purchases/voidedpurchases":
			q := r.URL.Query()
			if q.Get("type") != "0" {
				http.Error(w, "type", http.StatusBadRequest)
				return
			}
			if q.Get("pageSelection.token") == "hal2" {
				_, _ = w.Write([]byte(`{"voidedPurchases":[{"purchaseToken":"v2","orderId":"GPA.2","voidedTimeMillis":"1763100000000","voidedReason":7}]}`))
				return
			}
			if q.Get("startTime") != "1763000000000" || q.Get("endTime") != "1763100000000" {
				http.Error(w, "range "+q.Encode(), http.StatusBadRequest)
				return
			}
			_, _ = w.Write([]byte(`{"voidedPurchases":[{"purchaseToken":"v1","orderId":"GPA.1","purchaseTimeMillis":"1762000000000","voidedTimeMillis":"1763050000000","voidedSource":0,"voidedReason":1}],
				"tokenPagination":{"nextPageToken":"hal2"}}`))
		default:
			http.Error(w, r.Method+" "+r.URL.EscapedPath(), http.StatusNotFound)
		}
	}))
	defer srv.Close()
	c := NewClient(srv.URL, "com.wuzzchat.mobile", staticToken("x"), srv.Client())
	if err := c.Consume(t.Context(), "star_50", "t1"); err != nil || !consumed.Load() {
		t.Fatalf("consume: %v %v", err, consumed.Load())
	}
	items, next, err := c.ListVoided(t.Context(), time.UnixMilli(1763000000000), time.UnixMilli(1763100000000), "")
	if err != nil || next != "hal2" || len(items) != 1 || items[0].PurchaseToken != "v1" || items[0].Reason != 1 || items[0].PurchaseTime.IsZero() {
		t.Fatalf("halaman 1: %+v %q %v", items, next, err)
	}
	items, next, err = c.ListVoided(t.Context(), time.Time{}, time.Time{}, "hal2")
	if err != nil || next != "" || len(items) != 1 || items[0].Reason != 7 {
		t.Fatalf("halaman 2: %+v %q %v", items, next, err)
	}
}
