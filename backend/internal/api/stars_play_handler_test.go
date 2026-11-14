package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/playbilling"
)

// playAPIStub meniru Google Play Developer API untuk tes handler.
type playAPIStub struct {
	purchases map[string]*playbilling.ProductPurchase
	getErr    error
}

func (p *playAPIStub) GetProductPurchase(_ context.Context, token string) (*playbilling.ProductPurchase, error) {
	if p.getErr != nil {
		return nil, p.getErr
	}
	if pp, ok := p.purchases[token]; ok {
		return pp, nil
	}
	return nil, playbilling.ErrPurchaseNotFound
}
func (p *playAPIStub) Consume(context.Context, string, string) error { return nil }
func (p *playAPIStub) ListVoided(context.Context, time.Time, time.Time, string) ([]playbilling.VoidedPurchase, string, error) {
	return nil, "", nil
}

func TestStarsPlayHTTP_SwitchOffIs404(t *testing.T) {
	x, _, u, _ := setupStarsHTTP(t, true, true, false)
	for _, rr := range []*httptest.ResponseRecorder{
		x.do(http.MethodGet, "/api/me/stars/packages", u["tamu_sh"], nil, nil),
		x.do(http.MethodPost, "/api/me/stars/purchases", u["tamu_sh"], map[string]string{"product_id": "star_50", "purchase_token": "x"}, nil),
	} {
		if rr.Code != http.StatusNotFound {
			t.Fatalf("STARS_PLAY_BILLING mati: want 404, got %d %s", rr.Code, rr.Body.String())
		}
	}
}

func TestStarsPlayHTTP_PackagesAndPurchase(t *testing.T) {
	x, _, u, _ := setupStarsHTTP(t, true, true, false)
	guest := u["tamu_sh"]
	stub := &playAPIStub{purchases: map[string]*playbilling.ProductPurchase{
		"tok-ok": {State: playbilling.StatePurchased, OrderID: "GPA.1", ObfuscatedAccountID: playbilling.AccountHash(guest.UserID),
			LineItems: []playbilling.LineItem{{ProductID: "star_100", Quantity: 1}}},
		"tok-tunda": {State: playbilling.StatePending, ObfuscatedAccountID: playbilling.AccountHash(guest.UserID),
			LineItems: []playbilling.LineItem{{ProductID: "star_50", Quantity: 1}}},
	}}
	x.stars.SetPlayBilling(playbilling.NewService(stub, x.stars.store))

	rr := x.do(http.MethodGet, "/api/me/stars/packages", guest, nil, nil)
	var pk struct {
		Packages  []playbilling.Package `json:"packages"`
		AccountID string                `json:"account_id"`
	}
	if rr.Code != http.StatusOK || json.Unmarshal(rr.Body.Bytes(), &pk) != nil || len(pk.Packages) != 3 ||
		pk.AccountID != playbilling.AccountHash(guest.UserID) {
		t.Fatalf("paket: %d %s", rr.Code, rr.Body.String())
	}

	buy := func(product, token string) (int, map[string]any) {
		rr := x.do(http.MethodPost, "/api/me/stars/purchases", guest, map[string]string{"product_id": product, "purchase_token": token}, nil)
		var body map[string]any
		_ = json.Unmarshal(rr.Body.Bytes(), &body)
		return rr.Code, body
	}
	if code, body := buy("star_100", "tok-ok"); code != http.StatusOK || body["state"] != "credited" || body["balance"].(float64) != 100 {
		t.Fatalf("beli: %d %v", code, body)
	}
	if code, body := buy("star_100", "tok-ok"); code != http.StatusOK || body["stars_added"].(float64) != 0 || body["balance"].(float64) != 100 {
		t.Fatalf("beli ulang: %d %v", code, body)
	}
	if code, body := buy("star_50", "tok-tunda"); code != http.StatusAccepted || body["state"] != "pending" {
		t.Fatalf("tertunda: %d %v", code, body)
	}
	for _, c := range []struct {
		product, token, code string
		status               int
	}{
		{"star_77", "x", "unknown_product", http.StatusBadRequest},
		{"star_50", "palsu", "invalid_purchase_token", http.StatusBadRequest},
		{"star_50", "tok-ok", "product_mismatch", http.StatusBadRequest},
	} {
		if code, body := buy(c.product, c.token); code != c.status || body["code"] != c.code {
			t.Fatalf("%s/%s: %d %v, want %d %s", c.product, c.token, code, body, c.status, c.code)
		}
	}
	// Token milik akun lain.
	rr = x.do(http.MethodPost, "/api/me/stars/purchases", u["kreator_sh"], map[string]string{"product_id": "star_100", "purchase_token": "tok-ok"}, nil)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("akun lain: %d %s", rr.Code, rr.Body.String())
	}
	// Google tidak bisa dihubungi.
	stub.getErr = &playbilling.APIError{Status: 503, Body: "down"}
	if code, body := buy("star_50", "baru"); code != http.StatusBadGateway || body["code"] != "play_unavailable" {
		t.Fatalf("Google mati: %d %v", code, body)
	}
	// GET ke endpoint pembelian ditolak.
	if rr := x.do(http.MethodGet, "/api/me/stars/purchases", guest, nil, nil); rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET purchases: %d", rr.Code)
	}

	// Admin melihat pembelian Play dan bendera sakelar.
	rr = x.do(http.MethodGet, "/api/admin/stars/users/"+guest.UserID, u["staf_sh"], nil, nil)
	var adm struct {
		PlayPurchases []map[string]any `json:"play_purchases"`
	}
	if rr.Code != http.StatusOK || json.Unmarshal(rr.Body.Bytes(), &adm) != nil || len(adm.PlayPurchases) != 1 ||
		adm.PlayPurchases[0]["product_id"] != "star_100" || adm.PlayPurchases[0]["purchase_token"] != nil {
		t.Fatalf("admin pembelian (token tidak boleh bocor): %d %s", rr.Code, rr.Body.String())
	}
	rr = x.do(http.MethodGet, "/api/admin/stars/settings", u["staf_sh"], nil, nil)
	if rr.Code != http.StatusOK || !json.Valid(rr.Body.Bytes()) || !strings.Contains(rr.Body.String(), `"play_billing":true`) {
		t.Fatalf("bendera: %s", rr.Body.String())
	}
	if rr := x.do(http.MethodGet, "/api/admin/stars/debtors", u["staf_sh"], nil, nil); rr.Code != http.StatusOK {
		t.Fatalf("debtors: %d %s", rr.Code, rr.Body.String())
	}
}
