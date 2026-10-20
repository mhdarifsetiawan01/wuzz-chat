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
	store store.EntitlementStore
	flags entitlementFlags
}

// entitlementFlags mencerminkan sakelar server supaya klien tahu apakah batas benar-benar ditegakkan.
type entitlementFlags struct {
	forumLimits bool // FORUM_LIMITS_ENABLED
	memoryQuota bool // MEMORY_QUOTA_ENABLED
}

// NewEntitlementHandler membuat handler. forumLimits dan memoryQuota mencerminkan FORUM_LIMITS_ENABLED dan
// MEMORY_QUOTA_ENABLED (false = hanya informasi, belum ada penolakan).
func NewEntitlementHandler(s store.EntitlementStore, forumLimits, memoryQuota bool) *EntitlementHandler {
	return &EntitlementHandler{store: s, flags: entitlementFlags{forumLimits: forumLimits, memoryQuota: memoryQuota}}
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
	AI                  struct {
		Enforced bool      `json:"enforced"`
		Used     int       `json:"used"`
		Limit    int       `json:"limit"`
		ResetAt  time.Time `json:"reset_at"` // awal bulan kalender berikutnya (UTC)
	} `json:"ai"`
}

// buildEntitlementStatus menyusun status paket satu user di tenant tertentu.
func buildEntitlementStatus(r *http.Request, s store.EntitlementStore, tenantID, userID string, flags entitlementFlags) (*entitlementStatus, *store.Entitlement, error) {
	ent, err := s.GetEntitlement(r.Context(), tenantID, userID)
	if err != nil {
		return nil, nil, err
	}
	active, err := s.CountActiveForums(r.Context(), tenantID, userID)
	if err != nil {
		return nil, nil, err
	}
	now := time.Now().UTC()
	aiUsed, err := s.CountMemoryJobs(r.Context(), tenantID, userID, now)
	if err != nil {
		return nil, nil, err
	}
	plan := ent.EffectivePlan(now)
	limits := entitlement.LimitsFor(plan)
	st := &entitlementStatus{
		Plan:                plan,
		LimitsEnforced:      flags.forumLimits && tenantID == entitlement.DefaultTenant,
		AllowedDurationDays: limits.DurationDays,
	}
	st.Forums.Active = active
	st.Forums.Limit = limits.MaxActiveForums
	st.AI.Enforced = flags.memoryQuota && tenantID == entitlement.DefaultTenant
	st.AI.Used = aiUsed
	st.AI.Limit = limits.MonthlyAIJobs
	st.AI.ResetAt = entitlement.PeriodEnd(now)
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
	st, _, err := buildEntitlementStatus(r, h.store, claims.TenantID, claims.UserID, h.flags)
	if err != nil {
		log.Printf("⚠️ [Entitlement] gagal memuat status paket: %v", err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal memuat status paket")
		return
	}
	writeFeedJSON(w, http.StatusOK, st)
}

// SetEntitlements memasang pengelolaan paket manual untuk admin (nil = endpoint admin menjawab 503).
func (h *ModerationHandler) SetEntitlements(s store.EntitlementStore, forumLimits, memoryQuota bool) {
	h.entitlements = s
	h.entFlags = entitlementFlags{forumLimits: forumLimits, memoryQuota: memoryQuota}
}

// HandleEntitlements melayani pengelolaan paket manual (khusus wuzz_admin):
//
//	GET  /api/admin/entitlements?username=...  paket dan pemakaian satu akun
//	POST /api/admin/entitlements               {"user_id","plan":"pro","days":60,"note"} beri paket (days 0 = tanpa batas waktu)
//	POST /api/admin/entitlements               {"user_id","revoke":true,"note"} cabut paket (kembali Free)
//	POST /api/admin/entitlements/grandfather   Pro sementara untuk admin/pembuat grup yang sudah ada (lihat handleGrandfather)
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
	switch strings.Trim(strings.TrimPrefix(r.URL.Path, adminEntitlementsPath), "/") {
	case "":
	case "grandfather":
		h.handleGrandfather(w, r, claims)
		return
	default:
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
	st, ent, err := buildEntitlementStatus(r, h.entitlements, claims.TenantID, m.ID, h.entFlags)
	if err != nil {
		log.Printf("⚠️ [Entitlement] gagal memuat paket %s: %v", m.ID, err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal memuat paket")
		return
	}
	writeFeedJSON(w, http.StatusOK, map[string]any{"user": m, "status": st, "entitlement": ent})
}

const (
	defaultGrandfatherDays = 60
	maxGrandfatherDays     = 365
	grandfatherSampleSize  = 20
)

// handleGrandfather memberi Pro sementara (source "grandfather") kepada admin/pembuat grup yang sudah ada, sekali jalan,
// sebelum batas paket diaktifkan. Aman secara default:
//
//   - tanpa "confirm": hanya pratinjau (tidak menulis apa pun) berisi jumlah akun dan contoh username;
//   - dengan "confirm": true wajib menyertakan "expected_eligible" yang sama dengan jumlah pratinjau, jika tidak 409
//     (daftar berubah sejak pratinjau) dan tidak ada yang ditulis.
//
// Akun yang sudah punya baris entitlement apa pun (diberi manual maupun dicabut) dilewati; menjalankan ulang aman.
// Hanya tenant default, karena batas paket hanya ditegakkan di sana.
func (h *ModerationHandler) handleGrandfather(w http.ResponseWriter, r *http.Request, claims *auth.UserClaims) {
	if r.Method != http.MethodPost {
		writeFeedError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if claims.TenantID != entitlement.DefaultTenant {
		writeFeedError(w, http.StatusBadRequest, "Hanya berlaku untuk tenant default")
		return
	}
	var body struct {
		Days             int    `json:"days"`
		Confirm          bool   `json:"confirm"`
		ExpectedEligible int    `json:"expected_eligible"`
		Note             string `json:"note"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body) != nil ||
		body.Days < 0 || body.Days > maxGrandfatherDays ||
		utf8.RuneCountInString(body.Note) > maxModNoteRunes {
		writeFeedError(w, http.StatusBadRequest, "Permintaan tidak valid")
		return
	}
	days := body.Days
	if days == 0 {
		days = defaultGrandfatherDays
	}
	validUntil := time.Now().UTC().Add(time.Duration(days) * 24 * time.Hour)

	candidates, err := h.entitlements.PreviewGrandfather(r.Context(), claims.TenantID)
	if err != nil {
		log.Printf("⚠️ [Entitlement] pratinjau grandfather gagal: %v", err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal memuat daftar akun")
		return
	}

	if !body.Confirm {
		sample := make([]string, 0, grandfatherSampleSize)
		for i, c := range candidates {
			if i == grandfatherSampleSize {
				break
			}
			sample = append(sample, c.Username)
		}
		writeFeedJSON(w, http.StatusOK, map[string]any{
			"dry_run": true, "days": days, "valid_until": validUntil, "eligible": len(candidates), "sample": sample,
			"hint": "Kirim ulang dengan confirm=true dan expected_eligible sama dengan nilai eligible untuk menerapkan.",
		})
		return
	}

	applied, err := h.entitlements.ApplyGrandfather(r.Context(), claims.TenantID, claims.UserID, validUntil, body.Note, body.ExpectedEligible)
	switch {
	case errors.Is(err, store.ErrGrandfatherCountChanged):
		writeFeedJSON(w, http.StatusConflict, map[string]any{
			"error": "Jumlah akun yang memenuhi syarat berubah sejak pratinjau. Ulangi pratinjau lalu konfirmasi lagi.", "eligible": len(candidates),
		})
		return
	case err != nil:
		log.Printf("⚠️ [Entitlement] grandfather gagal: %v", err)
		writeFeedError(w, http.StatusInternalServerError, "Gagal menerapkan Pro sementara")
		return
	}
	log.Printf("🎟️ [Entitlement] grandfather: admin=%s applied=%d days=%d", claims.UserID, applied, days)
	writeFeedJSON(w, http.StatusOK, map[string]any{"dry_run": false, "days": days, "valid_until": validUntil, "applied": applied})
}
