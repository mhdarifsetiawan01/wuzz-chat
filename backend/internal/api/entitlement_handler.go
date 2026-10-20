package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/entitlement"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

const (
	adminEntitlementsPath = "/api/admin/entitlements"
	maxEntitlementDays    = 3650
)

// EntitlementHandler melayani status paket milik pemanggil (GET /api/me/entitlement).
type EntitlementHandler struct {
	store          store.EntitlementStore
	limitsEnforced bool
}

// NewEntitlementHandler membuat handler. limitsEnforced mencerminkan FORUM_LIMITS_ENABLED supaya klien tahu
// apakah batas benar-benar ditegakkan (false = hanya informasi, belum ada penolakan).
func NewEntitlementHandler(s store.EntitlementStore, limitsEnforced bool) *EntitlementHandler {
	return &EntitlementHandler{store: s, limitsEnforced: limitsEnforced}
}

type entitlementStatus struct {
	Plan           string     `json:"plan"`
	Source         string     `json:"source,omitempty"`
	ValidUntil     *time.Time `json:"valid_until,omitempty"`
	LimitsEnforced bool       `json:"limits_enforced"`
	Forums         struct {
		Active int `json:"active"`
		Limit  int `json:"limit"`
	} `json:"forums"`
	AllowedDurationDays []int `json:"allowed_duration_days"`
}

// buildEntitlementStatus menyusun status paket satu user di tenant tertentu.
func buildEntitlementStatus(r *http.Request, s store.EntitlementStore, tenantID, userID string, enforced bool) (*entitlementStatus, *store.Entitlement, error) {
	ent, err := s.GetEntitlement(r.Context(), tenantID, userID)
	if err != nil {
		return nil, nil, err
	}
	active, err := s.CountActiveForums(r.Context(), tenantID, userID)
	if err != nil {
		return nil, nil, err
	}
	now := time.Now().UTC()
	plan := ent.EffectivePlan(now)
	limits := entitlement.LimitsFor(plan)
	st := &entitlementStatus{
		Plan:                plan,
		LimitsEnforced:      enforced && tenantID == entitlement.DefaultTenant,
		AllowedDurationDays: limits.DurationDays,
	}
	st.Forums.Active = active
	st.Forums.Limit = limits.MaxActiveForums
	if ent != nil && plan != entitlement.PlanFree {
		st.Source = ent.Source
		st.ValidUntil = ent.ValidUntil
	}
	return st, ent, nil
}

// HandleMine melayani GET /api/me/entitlement. Hanya data milik pemanggil; tenant dari klaim JWT.
func (h *EntitlementHandler) HandleMine(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeFeedError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		writeFeedError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	st, _, err := buildEntitlementStatus(r, h.store, claims.TenantID, claims.UserID, h.limitsEnforced)
	if err != nil {
		log.Printf("⚠️ [Entitlement] gagal memuat status paket: %v", err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal memuat status paket")
		return
	}
	writeFeedJSON(w, http.StatusOK, st)
}

// SetEntitlements memasang pengelolaan paket manual untuk admin (nil = endpoint admin menjawab 503).
func (h *ModerationHandler) SetEntitlements(s store.EntitlementStore, limitsEnforced bool) {
	h.entitlements = s
	h.limitsEnforced = limitsEnforced
}

// HandleEntitlements melayani pengelolaan paket manual (khusus wuzz_admin):
//
//	GET  /api/admin/entitlements?username=...  paket dan pemakaian satu akun
//	POST /api/admin/entitlements               {"user_id","plan":"pro","days":60,"note"} beri paket (days 0 = tanpa batas waktu)
//	POST /api/admin/entitlements               {"user_id","revoke":true,"note"} cabut paket (kembali Free)
//
// Perubahan paket tidak menghapus forum atau memori; hanya memengaruhi pembuatan berikutnya.
func (h *ModerationHandler) HandleEntitlements(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.admin(w, r)
	if !ok {
		return
	}
	if h.entitlements == nil {
		writeFeedError(w, http.StatusServiceUnavailable, "Pengelolaan paket tidak aktif")
		return
	}
	if strings.Trim(strings.TrimPrefix(r.URL.Path, adminEntitlementsPath), "/") != "" {
		writeFeedError(w, http.StatusNotFound, "Tidak ditemukan")
		return
	}

	switch r.Method {
	case http.MethodGet:
		username := strings.TrimSpace(r.URL.Query().Get("username"))
		if username == "" || utf8.RuneCountInString(username) > 64 {
			writeFeedError(w, http.StatusBadRequest, "Username tidak valid")
			return
		}
		m, err := h.store.LookupUser(r.Context(), claims.TenantID, username)
		if errors.Is(err, store.ErrModerationUserNotFound) {
			writeFeedError(w, http.StatusNotFound, "Pengguna tidak ditemukan")
			return
		}
		if err != nil {
			log.Printf("⚠️ [Entitlement] lookup user gagal: %v", err)
			writeFeedError(w, http.StatusInternalServerError, "Gagal mencari pengguna")
			return
		}
		h.writeEntitlementResult(w, r, claims, m)

	case http.MethodPost:
		var body struct {
			UserID string `json:"user_id"`
			Plan   string `json:"plan"`
			Days   int    `json:"days"`
			Revoke bool   `json:"revoke"`
			Note   string `json:"note"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body) != nil ||
			strings.TrimSpace(body.UserID) == "" || len(body.UserID) > 64 ||
			utf8.RuneCountInString(body.Note) > maxModNoteRunes ||
			body.Days < 0 || body.Days > maxEntitlementDays {
			writeFeedError(w, http.StatusBadRequest, "Permintaan tidak valid")
			return
		}
		var err error
		if body.Revoke {
			err = h.entitlements.RevokeEntitlement(r.Context(), claims.TenantID, claims.UserID, body.UserID, body.Note)
		} else {
			in := store.SetEntitlementInput{
				TenantID: claims.TenantID, ActorID: claims.UserID, UserID: body.UserID,
				Plan: body.Plan, Source: entitlement.SourceManual, Note: body.Note,
			}
			if body.Days > 0 {
				t := time.Now().UTC().Add(time.Duration(body.Days) * 24 * time.Hour)
				in.ValidUntil = &t
			}
			_, err = h.entitlements.SetEntitlement(r.Context(), in)
		}
		switch {
		case errors.Is(err, store.ErrEntitlementUserNotFound):
			writeFeedError(w, http.StatusNotFound, "Pengguna tidak ditemukan")
			return
		case errors.Is(err, store.ErrEntitlementInvalid):
			writeFeedError(w, http.StatusBadRequest, "Paket atau masa berlaku tidak valid")
			return
		case err != nil:
			log.Printf("⚠️ [Entitlement] ubah paket %s gagal: %v", body.UserID, err)
			writeFeedError(w, http.StatusInternalServerError, "Gagal mengubah paket")
			return
		}
		log.Printf("🎟️ [Entitlement] admin=%s user=%s plan=%s revoke=%v days=%d", claims.UserID, body.UserID, body.Plan, body.Revoke, body.Days)
		m := &store.StaffMember{ID: body.UserID}
		h.writeEntitlementResult(w, r, claims, m)

	default:
		writeFeedError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (h *ModerationHandler) writeEntitlementResult(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims, m *store.StaffMember) {
	st, ent, err := buildEntitlementStatus(r, h.entitlements, claims.TenantID, m.ID, h.limitsEnforced)
	if err != nil {
		log.Printf("⚠️ [Entitlement] gagal memuat paket %s: %v", m.ID, err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal memuat paket")
		return
	}
	writeFeedJSON(w, http.StatusOK, map[string]any{"user": m, "status": st, "entitlement": ent})
}
