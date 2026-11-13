package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// StarsHandler melayani Star & grup privat berbayar (V2 Tahap 2a, docs/plans/backlog/STARS_PAID_GROUPS.md).
//
//	GET  /api/me/stars                          saldo + riwayat (STARS_ENABLED)
//	GET  /api/me/stars/received                 Star diterima kreator per grup
//	GET|PUT /api/groups/{grp_id}/paid           pengaturan grup berbayar (PAID_GROUPS_ENABLED; lewat GroupHandler)
//	POST /api/invites/{token}/purchase          bayar akses grup berbayar (lewat GroupHandler)
//	/api/admin/stars/...                        alat staf (wuzz_admin)
//
// Sakelar mati = 404 seragam (fitur tidak terlihat). Istilah UI netral: tidak memakai "pendapatan"/"cairkan".
type StarsHandler struct {
	store      *store.StarStore
	stars      bool
	paid       bool
	testGrants bool
	// onJoined (opsional): menyiarkan anggota baru setelah pembayaran akses (pesan sistem + daftar anggota).
	onJoined func(groupID, userID string)
}

func NewStarsHandler(s *store.StarStore, starsEnabled, paidEnabled, testGrants bool) *StarsHandler {
	return &StarsHandler{store: s, stars: starsEnabled, paid: starsEnabled && paidEnabled, testGrants: starsEnabled && testGrants}
}

// SetOnJoined memasang penyiar anggota baru.
func (h *StarsHandler) SetOnJoined(fn func(groupID, userID string)) { h.onJoined = fn }

// PaidGroupsEnabled dipakai GroupHandler untuk merutekan /paid dan /purchase.
func (h *StarsHandler) PaidGroupsEnabled() bool { return h != nil && h.paid }

func writeStarError(w http.ResponseWriter, err error) {
	type e = map[string]string
	switch {
	case errors.Is(err, store.ErrInsufficientStars):
		writeInviteJSON(w, http.StatusPaymentRequired, e{"error": "Saldo Star tidak cukup", "code": "insufficient_stars"})
	case errors.Is(err, store.ErrPriceChanged):
		writeInviteJSON(w, http.StatusConflict, e{"error": "Harga grup berubah. Muat ulang lalu coba lagi.", "code": "price_changed"})
	case errors.Is(err, store.ErrIdempotencyKeyMissing):
		writeInviteJSON(w, http.StatusBadRequest, e{"error": "Header Idempotency-Key wajib diisi", "code": "idempotency_key_required"})
	case errors.Is(err, store.ErrNotPaidCreator):
		writeInviteJSON(w, http.StatusForbidden, e{"error": "Akun Anda belum terdaftar sebagai mitra kreator", "code": "not_paid_creator"})
	case errors.Is(err, store.ErrNotGroupCreator):
		writeInviteJSON(w, http.StatusForbidden, e{"error": "Hanya pembuat grup yang dapat mengatur harga", "code": "not_group_creator"})
	case errors.Is(err, store.ErrPaidGroupNotPrivate):
		writeInviteJSON(w, http.StatusConflict, e{"error": "Grup berbayar harus privat", "code": "not_private"})
	case errors.Is(err, store.ErrPaidPriceOutOfRange):
		writeInviteJSON(w, http.StatusBadRequest, e{"error": "Harga di luar rentang yang diizinkan", "code": "price_out_of_range"})
	case errors.Is(err, store.ErrStarsTenant):
		writeInviteJSON(w, http.StatusNotFound, e{"error": "Fitur tidak tersedia", "code": "not_available"})
	case errors.Is(err, store.ErrStarLedgerNotFound):
		writeInviteJSON(w, http.StatusNotFound, e{"error": "Entri Star tidak ditemukan", "code": "ledger_not_found"})
	case errors.Is(err, store.ErrStarAlreadyRefunded):
		writeInviteJSON(w, http.StatusConflict, e{"error": "Pembayaran ini sudah dikembalikan", "code": "already_refunded"})
	case errors.Is(err, store.ErrEarningAlreadyPaid):
		writeInviteJSON(w, http.StatusConflict, e{"error": err.Error(), "code": "earning_already_paid"})
	case errors.Is(err, store.ErrStarInvalidAmount):
		writeInviteJSON(w, http.StatusBadRequest, e{"error": "Jumlah Star tidak valid (1-10.000)", "code": "invalid_amount"})
	case errors.Is(err, store.ErrStarReasonRequired):
		writeInviteJSON(w, http.StatusBadRequest, e{"error": "Alasan wajib diisi", "code": "reason_required"})
	case errors.Is(err, store.ErrStarSettingsInvalid):
		writeInviteJSON(w, http.StatusBadRequest, e{"error": "Pengaturan Star tidak valid", "code": "settings_invalid"})
	case errors.Is(err, store.ErrUserNotFound):
		writeInviteJSON(w, http.StatusNotFound, e{"error": "Pengguna tidak ditemukan", "code": "user_not_found"})
	default:
		writeInviteError(w, err) // galat undangan/grup (invite_not_found, group_not_found, ...) atau 500
	}
}

func (h *StarsHandler) claims(w http.ResponseWriter, r *http.Request) (*auth.UserClaims, bool) {
	c, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"Unauthorized"}`, http.StatusUnauthorized)
		return nil, false
	}
	return c, true
}

// HandleMe melayani /api/me/stars dan /api/me/stars/received.
func (h *StarsHandler) HandleMe(w http.ResponseWriter, r *http.Request) {
	if h == nil || !h.stars {
		http.NotFound(w, r)
		return
	}
	c, ok := h.claims(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	switch strings.TrimSuffix(r.URL.Path, "/") {
	case "/api/me/stars":
		wallet, err := h.store.Wallet(r.Context(), c.TenantID, c.UserID)
		if err != nil {
			writeStarError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, wallet)
	case "/api/me/stars/received":
		isCreator, err := h.store.IsCreator(r.Context(), c.TenantID, c.UserID)
		if err != nil {
			writeStarError(w, err)
			return
		}
		groups, err := h.store.StarsReceived(r.Context(), c.TenantID, c.UserID)
		if err != nil {
			writeStarError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"is_creator": isCreator, "groups": groups})
	default:
		http.NotFound(w, r)
	}
}

// HandleGroupPaid melayani GET|PUT /api/groups/{grp_id}/paid (dipanggil GroupHandler).
func (h *StarsHandler) HandleGroupPaid(w http.ResponseWriter, r *http.Request, c *auth.UserClaims, groupID string) {
	switch r.Method {
	case http.MethodGet:
		info, err := h.store.PaidGroup(r.Context(), groupID)
		if err != nil {
			writeStarError(w, err)
			return
		}
		isCreator, err := h.store.IsCreator(r.Context(), c.TenantID, c.UserID)
		if err != nil {
			writeStarError(w, err)
			return
		}
		st, err := h.store.GetSettings(r.Context())
		if err != nil {
			writeStarError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{
			"paid": info, "is_creator": isCreator, "price_min": st.GroupPriceMin, "price_max": st.GroupPriceMax,
		})
	case http.MethodPut:
		var req struct {
			PriceStars int  `json:"price_stars"`
			Enabled    bool `json:"enabled"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
			writeInviteJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload tidak valid"})
			return
		}
		info, err := h.store.SetGroupPaid(r.Context(), c.TenantID, c.UserID, groupID, req.PriceStars, req.Enabled)
		if err != nil {
			writeStarError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"paid": info})
	default:
		http.Error(w, `{"error":"Method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

// HandlePurchase melayani POST /api/invites/{token}/purchase (dipanggil GroupHandler).
func (h *StarsHandler) HandlePurchase(w http.ResponseWriter, r *http.Request, c *auth.UserClaims, token string) {
	var req struct {
		ExpectedPrice int `json:"expected_price"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<10)).Decode(&req); err != nil {
		writeInviteJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload tidak valid"})
		return
	}
	res, err := h.store.PurchaseAccess(r.Context(), token, c.UserID, req.ExpectedPrice, r.Header.Get("Idempotency-Key"))
	if err != nil {
		writeStarError(w, err)
		return
	}
	if !res.AlreadyPaid && h.onJoined != nil {
		h.onJoined(res.GroupID, c.UserID)
	}
	writeInviteJSON(w, http.StatusOK, res)
}

// ── Admin ─────────────────────────────────────────────────────────────────────

// HandleAdmin melayani /api/admin/stars/... (hanya wuzz_admin; tenant default):
//
//	GET|PUT  /api/admin/stars/settings
//	GET      /api/admin/stars/creators            POST {user, active, note}
//	GET      /api/admin/stars/users/{ref}          saldo + riwayat (ref = ID atau username)
//	POST     /api/admin/stars/users/{ref}/test-grant {stars, reason}  header Idempotency-Key (STARS_TEST_GRANTS)
//	POST     /api/admin/stars/refund               {spend_id, reason}
func (h *StarsHandler) HandleAdmin(w http.ResponseWriter, r *http.Request) {
	if h == nil || !h.stars {
		http.NotFound(w, r)
		return
	}
	c, ok := h.claims(w, r)
	if !ok {
		return
	}
	if !store.IsAdmin(c.SystemRole) {
		writeInviteJSON(w, http.StatusForbidden, map[string]string{"error": "Khusus admin Wuzz", "code": "admin_only"})
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/stars"), "/"), "/")
	ctx := r.Context()
	decode := func(v any) bool {
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(v); err != nil {
			writeInviteJSON(w, http.StatusBadRequest, map[string]string{"error": "Payload tidak valid"})
			return false
		}
		return true
	}
	switch {
	case len(parts) == 1 && parts[0] == "settings" && r.Method == http.MethodGet:
		st, err := h.store.GetSettings(ctx)
		if err != nil {
			writeStarError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"settings": st, "flags": map[string]bool{
			"stars_enabled": h.stars, "paid_groups_enabled": h.paid, "test_grants": h.testGrants}})
	case len(parts) == 1 && parts[0] == "settings" && r.Method == http.MethodPut:
		var st store.StarSettings
		if !decode(&st) {
			return
		}
		if err := h.store.UpdateSettings(ctx, c.UserID, st); err != nil {
			writeStarError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"settings": st})
	case len(parts) == 1 && parts[0] == "creators" && r.Method == http.MethodGet:
		list, err := h.store.ListCreators(ctx, c.TenantID)
		if err != nil {
			writeStarError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"creators": list})
	case len(parts) == 1 && parts[0] == "creators" && r.Method == http.MethodPost:
		var req struct {
			User   string `json:"user"`
			Active bool   `json:"active"`
			Note   string `json:"note"`
		}
		if !decode(&req) {
			return
		}
		uid, err := h.store.ResolveUserRef(ctx, req.User)
		if err == nil {
			err = h.store.SetCreator(ctx, c.TenantID, c.UserID, uid, req.Active, req.Note)
		}
		if err != nil {
			writeStarError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"user_id": uid, "active": req.Active})
	case len(parts) == 2 && parts[0] == "users" && r.Method == http.MethodGet:
		uid, err := h.store.ResolveUserRef(ctx, parts[1])
		if err != nil {
			writeStarError(w, err)
			return
		}
		wallet, err := h.store.Wallet(ctx, c.TenantID, uid)
		if err != nil {
			writeStarError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"user_id": uid, "wallet": wallet})
	case len(parts) == 3 && parts[0] == "users" && parts[2] == "test-grant" && r.Method == http.MethodPost:
		if !h.testGrants {
			writeInviteJSON(w, http.StatusForbidden, map[string]string{"error": "Kredit uji dimatikan (STARS_TEST_GRANTS)", "code": "test_grants_disabled"})
			return
		}
		var req struct {
			Stars  int    `json:"stars"`
			Reason string `json:"reason"`
		}
		if !decode(&req) {
			return
		}
		uid, err := h.store.ResolveUserRef(ctx, parts[1])
		if err != nil {
			writeStarError(w, err)
			return
		}
		bal, err := h.store.TestGrant(ctx, c.TenantID, c.UserID, uid, req.Stars, req.Reason, r.Header.Get("Idempotency-Key"))
		if err != nil {
			writeStarError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"user_id": uid, "balance": bal})
	case len(parts) == 1 && parts[0] == "refund" && r.Method == http.MethodPost:
		var req struct {
			SpendID string `json:"spend_id"`
			Reason  string `json:"reason"`
		}
		if !decode(&req) {
			return
		}
		bal, err := h.store.RefundSpend(ctx, c.TenantID, c.UserID, req.SpendID, req.Reason)
		if err != nil {
			writeStarError(w, err)
			return
		}
		writeInviteJSON(w, http.StatusOK, map[string]any{"balance": bal})
	default:
		writeInviteJSON(w, http.StatusNotFound, map[string]string{"error": "Rute tidak dikenal"})
	}
}
