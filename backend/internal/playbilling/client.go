package playbilling

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// DefaultBaseURL adalah akar Google Play Developer API v3.
const DefaultBaseURL = "https://androidpublisher.googleapis.com/androidpublisher/v3"

// Status pembelian dari ProductPurchaseV2.purchaseStateContext.purchaseState.
const (
	StatePurchased = "PURCHASED"
	StatePending   = "PENDING"
	StateCancelled = "CANCELLED"

	ConsumptionConsumed    = "CONSUMPTION_STATE_CONSUMED"
	ConsumptionNotConsumed = "CONSUMPTION_STATE_YET_TO_BE_CONSUMED"
)

// ErrPurchaseNotFound: Google tidak mengenali token untuk paket aplikasi ini (token palsu, salah paket, atau kedaluwarsa).
var ErrPurchaseNotFound = errors.New("pembelian tidak ditemukan di Google Play")

// APIError adalah jawaban galat Play Developer API selain 404/410.
type APIError struct {
	Status int
	Body   string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("Play Developer API HTTP %d: %s", e.Status, truncate(e.Body, 300))
}

// LineItem adalah satu produk dalam pembelian.
type LineItem struct {
	ProductID        string
	Quantity         int
	ConsumptionState string
}

// ProductPurchase adalah bagian ProductPurchaseV2 yang dipakai server.
type ProductPurchase struct {
	State                string
	AcknowledgementState string
	OrderID              string
	ObfuscatedAccountID  string
	IsTest               bool
	PurchaseCompletedAt  time.Time
	LineItems            []LineItem
}

// VoidedPurchase adalah satu pembelian yang dibatalkan, direfund, atau di-chargeback.
type VoidedPurchase struct {
	PurchaseToken string
	OrderID       string
	PurchaseTime  time.Time
	VoidedTime    time.Time
	Source        int // 0 pengguna, 1 developer, 2 Google
	Reason        int // 0 lain, 1 menyesal, ... 7 chargeback, 8 tidak di-acknowledge
}

// API adalah operasi Play yang dipakai Service (diganti tiruan di tes).
type API interface {
	GetProductPurchase(ctx context.Context, token string) (*ProductPurchase, error)
	Consume(ctx context.Context, productID, token string) error
	ListVoided(ctx context.Context, start, end time.Time, pageToken string) ([]VoidedPurchase, string, error)
}

// Client memanggil Google Play Developer API untuk satu paket aplikasi.
type Client struct {
	baseURL     string
	packageName string
	tokens      TokenSource
	http        *http.Client
}

// NewClient membuat klien. baseURL kosong = DefaultBaseURL.
func NewClient(baseURL, packageName string, tokens TokenSource, httpClient *http.Client) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{baseURL: baseURL, packageName: packageName, tokens: tokens, http: httpClient}
}

func (c *Client) do(ctx context.Context, method, path string, query url.Values, out any) error {
	tok, err := c.tokens.Token(ctx)
	if err != nil {
		return err
	}
	u := c.baseURL + "/applications/" + url.PathEscape(c.packageName) + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("permintaan ke Play Developer API gagal: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		return ErrPurchaseNotFound
	case resp.StatusCode < 200 || resp.StatusCode >= 300:
		return &APIError{Status: resp.StatusCode, Body: string(body)}
	}
	if out == nil || len(body) == 0 {
		return nil
	}
	return json.Unmarshal(body, out)
}

// GetProductPurchase memanggil purchases.productsv2.getproductpurchasev2.
func (c *Client) GetProductPurchase(ctx context.Context, token string) (*ProductPurchase, error) {
	var raw struct {
		ProductLineItem []struct {
			ProductID           string `json:"productId"`
			ProductOfferDetails struct {
				Quantity         int    `json:"quantity"`
				ConsumptionState string `json:"consumptionState"`
			} `json:"productOfferDetails"`
		} `json:"productLineItem"`
		PurchaseStateContext struct {
			PurchaseState string `json:"purchaseState"`
		} `json:"purchaseStateContext"`
		TestPurchaseContext *struct {
			FopType string `json:"fopType"`
		} `json:"testPurchaseContext"`
		OrderID                     string `json:"orderId"`
		ObfuscatedExternalAccountID string `json:"obfuscatedExternalAccountId"`
		PurchaseCompletionTime      string `json:"purchaseCompletionTime"`
		AcknowledgementState        string `json:"acknowledgementState"`
	}
	if err := c.do(ctx, http.MethodGet, "/purchases/productsv2/tokens/"+url.PathEscape(token), nil, &raw); err != nil {
		return nil, err
	}
	p := &ProductPurchase{
		State:                raw.PurchaseStateContext.PurchaseState,
		AcknowledgementState: raw.AcknowledgementState,
		OrderID:              raw.OrderID,
		ObfuscatedAccountID:  raw.ObfuscatedExternalAccountID,
		IsTest:               raw.TestPurchaseContext != nil,
	}
	if t, err := time.Parse(time.RFC3339, raw.PurchaseCompletionTime); err == nil {
		p.PurchaseCompletedAt = t
	}
	for _, li := range raw.ProductLineItem {
		q := li.ProductOfferDetails.Quantity
		if q <= 0 {
			q = 1
		}
		p.LineItems = append(p.LineItems, LineItem{ProductID: li.ProductID, Quantity: q, ConsumptionState: li.ProductOfferDetails.ConsumptionState})
	}
	return p, nil
}

// Consume memanggil purchases.products.consume.
func (c *Client) Consume(ctx context.Context, productID, token string) error {
	return c.do(ctx, http.MethodPost, "/purchases/products/"+url.PathEscape(productID)+"/tokens/"+url.PathEscape(token)+":consume", nil, nil)
}

// ListVoided memanggil purchases.voidedpurchases.list untuk produk sekali beli (type=0). pageToken kosong = halaman
// pertama berdasarkan rentang waktu; start tidak boleh lebih tua dari 30 hari (batas Google).
func (c *Client) ListVoided(ctx context.Context, start, end time.Time, pageToken string) ([]VoidedPurchase, string, error) {
	q := url.Values{}
	q.Set("type", "0")
	// Dokumen Google tidak konsisten: tabel parameter memakai "pageSelection.token", contoh URL memakai "token".
	// Dipakai nama dari tabel skema; pastikan saat uji nyata (STARS_PLAY_BILLING.md bagian 2).
	if pageToken != "" {
		q.Set("pageSelection.token", pageToken)
	} else {
		q.Set("startTime", strconv.FormatInt(start.UnixMilli(), 10))
		q.Set("endTime", strconv.FormatInt(end.UnixMilli(), 10))
	}
	var raw struct {
		VoidedPurchases []struct {
			PurchaseToken      string `json:"purchaseToken"`
			OrderID            string `json:"orderId"`
			PurchaseTimeMillis string `json:"purchaseTimeMillis"`
			VoidedTimeMillis   string `json:"voidedTimeMillis"`
			VoidedSource       int    `json:"voidedSource"`
			VoidedReason       int    `json:"voidedReason"`
		} `json:"voidedPurchases"`
		TokenPagination struct {
			NextPageToken string `json:"nextPageToken"`
		} `json:"tokenPagination"`
	}
	if err := c.do(ctx, http.MethodGet, "/purchases/voidedpurchases", q, &raw); err != nil {
		return nil, "", err
	}
	out := make([]VoidedPurchase, 0, len(raw.VoidedPurchases))
	for _, v := range raw.VoidedPurchases {
		out = append(out, VoidedPurchase{PurchaseToken: v.PurchaseToken, OrderID: v.OrderID,
			PurchaseTime: millis(v.PurchaseTimeMillis), VoidedTime: millis(v.VoidedTimeMillis),
			Source: v.VoidedSource, Reason: v.VoidedReason})
	}
	return out, raw.TokenPagination.NextPageToken, nil
}

func millis(s string) time.Time {
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n <= 0 {
		return time.Time{}
	}
	return time.UnixMilli(n).UTC()
}
