package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// setupHeadlessE2EEnv menginisialisasi environment pengujian E2E HTTP tanpa browser.
func setupHeadlessE2EEnv(t *testing.T) (
	http.Handler, // full router with auth & tenant middleware
	*store.SQLMemoryStore,
	*store.SQLGroupStore,
	*store.SQLUserStore,
	func(),
) {
	t.Helper()
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "e2e_headless_test.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Gagal inisialisasi SQL store: %v", err)
	}

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	groupStore := store.NewSQLGroupStore(sqlStore.DB(), sqlStore.DriverName())
	memoryStore := store.NewSQLMemoryStore(sqlStore.DB(), sqlStore.DriverName())

	clientStore := store.NewMemoryClientStore()
	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)

	groupHandler := api.NewGroupHandler(groupStore, userStore)
	groupHandler.SetHub(hub)

	memoryHandler := api.NewMemoryHandler(memoryStore, groupStore, userStore)
	memoryHandler.SetHub(hub)
	groupHandler.SetMemoryHandler(memoryHandler)

	// Buat mux router untuk endpoint yang diakses frontend
	mux := http.NewServeMux()

	// 1. Group & sub-resource endpoints (/api/groups/...)
	mux.HandleFunc("/api/groups/", func(w http.ResponseWriter, r *http.Request) {
		groupHandler.RouteGroupRequest(w, r)
	})

	// 2. Memory Review endpoints (/api/memory/...)
	mux.HandleFunc("/api/memory/", func(w http.ResponseWriter, r *http.Request) {
		memoryHandler.RouteMemoryRequest(w, r)
	})

	// 3. Approved Memory Read endpoints (/api/memories/...)
	mux.HandleFunc("/api/memories/", func(w http.ResponseWriter, r *http.Request) {
		memoryHandler.RouteApprovedMemoryRequest(w, r)
	})

	// Wrap router dengan TenantMiddleware dan RequireJWT agar mengekstrak JWT token dan menyematkan TenantContext & UserClaims
	jwtMw := auth.RequireJWT()
	tenantMw := api.NewTenantMiddleware(nil)
	securedHandler := tenantMw.Handler(jwtMw(mux))

	return securedHandler, memoryStore, groupStore, userStore, func() {
		_ = sqlStore.Close()
	}
}

// TestHeadlessE2E_AIMemoryTenantScoping melakukan pengujian end-to-end lengkap dari sisi klien HTTP (Frontend Simulation).
func TestHeadlessE2E_AIMemoryTenantScoping(t *testing.T) {
	handler, memStore, grpStore, usrStore, cleanup := setupHeadlessE2EEnv(t)
	defer cleanup()

	// -------------------------------------------------------------------------
	// 1. Setup Data: 2 Tenant, 2 Admin, 2 Anggota
	// -------------------------------------------------------------------------
	aliceAlpha, _ := usrStore.Register("alice_alpha", "Alice Alpha Admin", "password123")
	bobAlpha, _ := usrStore.Register("bob_alpha", "Bob Alpha Member", "password123")
	charlieBeta, _ := usrStore.Register("charlie_beta", "Charlie Beta Admin", "password123")
	daveBeta, _ := usrStore.Register("dave_beta", "Dave Beta Member", "password123")

	// Generate Real Session JWT Token dengan spesifik tenant_id
	tokenAlphaAdmin, _, _ := auth.GenerateTokenDetailedWithTenant(aliceAlpha.ID, aliceAlpha.Username, aliceAlpha.DisplayName, "tenant_alpha")
	tokenAlphaMember, _, _ := auth.GenerateTokenDetailedWithTenant(bobAlpha.ID, bobAlpha.Username, bobAlpha.DisplayName, "tenant_alpha")
	tokenBetaAdmin, _, _ := auth.GenerateTokenDetailedWithTenant(charlieBeta.ID, charlieBeta.Username, charlieBeta.DisplayName, "tenant_beta")
	tokenBetaMember, _, _ := auth.GenerateTokenDetailedWithTenant(daveBeta.ID, daveBeta.Username, daveBeta.DisplayName, "tenant_beta")

	// Alice (Tenant Alpha) membuat grup di Tenant Alpha
	ctxAlpha := tenantshared.WithTenant(context.Background(), "tenant_alpha")
	grpAlpha, err := grpStore.CreateGroupWithContext(
		ctxAlpha,
		"Engineering Divisi Alpha",
		"Grup R&D Rahasia Tenant Alpha",
		"",
		aliceAlpha.ID,
		"alpha_rnd",
		false,
		[]string{bobAlpha.ID},
	)
	if err != nil {
		t.Fatalf("Gagal membuat grup alpha: %v", err)
	}

	// Alice membuat subgrup forum
	forumAlpha, err := grpStore.CreateSubGroupWithContext(
		ctxAlpha,
		grpAlpha.ID,
		"Diskusi Desain Database",
		"Forum evaluasi arsitektur",
		aliceAlpha.ID,
		"1_week",
		false,
	)
	if err != nil {
		t.Fatalf("Gagal membuat forum alpha: %v", err)
	}

	// Charlie (Tenant Beta) membuat grup di Tenant Beta
	ctxBeta := tenantshared.WithTenant(context.Background(), "tenant_beta")
	grpBeta, err := grpStore.CreateGroupWithContext(
		ctxBeta,
		"Finance Divisi Beta",
		"Grup Keuangan Tenant Beta",
		"",
		charlieBeta.ID,
		"beta_finance",
		false,
		[]string{daveBeta.ID},
	)
	if err != nil {
		t.Fatalf("Gagal membuat grup beta: %v", err)
	}

	// -------------------------------------------------------------------------
	// 2. Seed Draft Memori di Tenant Alpha
	// -------------------------------------------------------------------------
	draftAlphaID := "draft_" + uuid.New().String()
	artSumID := "art_sum_" + uuid.New().String()
	artDecID := "art_dec_" + uuid.New().String()
	artJLID := "art_jl_" + uuid.New().String()

	pos := 1
	draftAlpha := &store.MemoryDraft{
		ID:                    draftAlphaID,
		JobID:                 "job_alpha_001",
		ForumID:               forumAlpha.ID,
		GroupID:               grpAlpha.ID,
		TenantID:              "tenant_alpha",
		Status:                store.DraftStatusDraft,
		MessageCountProcessed: 15,
		CreatedAt:             time.Now().UTC(),
	}
	artifactsAlpha := []store.MemoryArtifact{
		{
			ID:                artSumID,
			DraftID:           draftAlphaID,
			Type:              store.ArtifactTypeSummary,
			Content:           "Ringkasan: Sepakat gunakan PostgreSQL untuk arsitektur multi-tenant.",
			AIOriginalContent: "Ringkasan: Sepakat gunakan PostgreSQL untuk arsitektur multi-tenant.",
			Confidence:        store.ConfidenceHigh,
		},
		{
			ID:                artDecID,
			DraftID:           draftAlphaID,
			Type:              store.ArtifactTypeDecision,
			Content:           "Keputusan 1: Terapkan row-level locking FOR UPDATE SKIP LOCKED.",
			Position:          &pos,
			Confidence:        store.ConfidenceHigh,
		},
		{
			ID:                artJLID,
			DraftID:           draftAlphaID,
			Type:              store.ArtifactTypeJourneyLite,
			Content:           `{"step1":"Analisis opsi","step2":"Benchmarking","conclusion":"PostgreSQL"}`,
			Confidence:        store.ConfidenceMedium,
		},
	}

	if err := memStore.CreateDraftWithArtifacts(ctxAlpha, draftAlpha, artifactsAlpha); err != nil {
		t.Fatalf("Gagal seed draft alpha: %v", err)
	}

	// Helper function untuk eksekusi HTTP Request
	executeReq := func(method, url, token string, body []byte) *httptest.ResponseRecorder {
		var req *http.Request
		if len(body) > 0 {
			req = httptest.NewRequest(method, url, bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
		} else {
			req = httptest.NewRequest(method, url, nil)
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		return rr
	}

	// =========================================================================
	// SKENARIO 1: Happy Path Tenant Alpha (Admin & Member Sah)
	// =========================================================================
	t.Run("1.1 List Drafts - Admin Alpha Sah", func(t *testing.T) {
		url := fmt.Sprintf("/api/memory/drafts?group_id=%s", grpAlpha.ID)
		resp := executeReq(http.MethodGet, url, tokenAlphaAdmin, nil)

		if resp.Code != http.StatusOK {
			t.Fatalf("Ekspektasi HTTP 200 OK, dapat: %d (Body: %s)", resp.Code, resp.Body.String())
		}

		var drafts []map[string]interface{}
		if err := json.Unmarshal(resp.Body.Bytes(), &drafts); err != nil {
			t.Fatalf("Gagal unmarshal response JSON: %v", err)
		}
		if len(drafts) != 1 {
			t.Fatalf("Ekspektasi 1 draft, dapat: %d", len(drafts))
		}
		if drafts[0]["draft_id"] != draftAlphaID {
			t.Errorf("Draft ID tidak cocok: %v", drafts[0]["draft_id"])
		}
	})

	t.Run("1.2 Get Draft Detail - Admin Alpha Sah", func(t *testing.T) {
		url := fmt.Sprintf("/api/memory/drafts/%s", draftAlphaID)
		resp := executeReq(http.MethodGet, url, tokenAlphaAdmin, nil)

		if resp.Code != http.StatusOK {
			t.Fatalf("Ekspektasi HTTP 200 OK, dapat: %d (Body: %s)", resp.Code, resp.Body.String())
		}

		var detailResp map[string]interface{}
		_ = json.Unmarshal(resp.Body.Bytes(), &detailResp)
		draftMap, ok := detailResp["draft"].(map[string]interface{})
		if !ok || draftMap["id"] != draftAlphaID {
			t.Fatalf("Struktur respons draft tidak valid: %v", detailResp)
		}
	})

	t.Run("1.3 Edit Artifact - Admin Alpha Sah", func(t *testing.T) {
		url := fmt.Sprintf("/api/memory/drafts/%s/artifacts/%s", draftAlphaID, artSumID)
		payload := []byte(`{"content":"Ringkasan Direvisi: Sepakat gunakan PostgreSQL + Citus."}`)
		resp := executeReq(http.MethodPatch, url, tokenAlphaAdmin, payload)

		if resp.Code != http.StatusOK {
			t.Fatalf("Ekspektasi HTTP 200 OK, dapat: %d (Body: %s)", resp.Code, resp.Body.String())
		}
	})

	t.Run("1.4 Remove Journey Lite - Admin Alpha Sah", func(t *testing.T) {
		url := fmt.Sprintf("/api/memory/drafts/%s/journey", draftAlphaID)
		resp := executeReq(http.MethodDelete, url, tokenAlphaAdmin, nil)

		if resp.Code != http.StatusOK {
			t.Fatalf("Ekspektasi HTTP 200 OK, dapat: %d (Body: %s)", resp.Code, resp.Body.String())
		}
	})

	var approvedMemoryID string
	t.Run("1.5 Approve Draft - Admin Alpha Sah", func(t *testing.T) {
		url := fmt.Sprintf("/api/memory/drafts/%s/approve", draftAlphaID)
		resp := executeReq(http.MethodPost, url, tokenAlphaAdmin, nil)

		if resp.Code != http.StatusOK {
			t.Fatalf("Ekspektasi HTTP 200 OK, dapat: %d (Body: %s)", resp.Code, resp.Body.String())
		}

		var approveResp map[string]interface{}
		_ = json.Unmarshal(resp.Body.Bytes(), &approveResp)
		appMem, ok := approveResp["approved_memory"].(map[string]interface{})
		if !ok || appMem["id"] == nil {
			t.Fatalf("Respon approve memory tidak valid: %v", approveResp)
		}
		approvedMemoryID = appMem["id"].(string)
	})

	t.Run("1.6 Get Group Memories - Member Alpha Sah", func(t *testing.T) {
		url := fmt.Sprintf("/api/groups/%s/memories", grpAlpha.ID)
		resp := executeReq(http.MethodGet, url, tokenAlphaMember, nil)

		if resp.Code != http.StatusOK {
			t.Fatalf("Ekspektasi HTTP 200 OK, dapat: %d (Body: %s)", resp.Code, resp.Body.String())
		}

		var memories []map[string]interface{}
		_ = json.Unmarshal(resp.Body.Bytes(), &memories)
		if len(memories) != 1 {
			t.Fatalf("Ekspektasi 1 memory terpublikasi di Grup Alpha, dapat: %d", len(memories))
		}
	})

	t.Run("1.7 Get Approved Memory Detail - Member Alpha Sah", func(t *testing.T) {
		url := fmt.Sprintf("/api/memories/%s", approvedMemoryID)
		resp := executeReq(http.MethodGet, url, tokenAlphaMember, nil)

		if resp.Code != http.StatusOK {
			t.Fatalf("Ekspektasi HTTP 200 OK, dapat: %d (Body: %s)", resp.Code, resp.Body.String())
		}
	})

	// =========================================================================
	// SKENARIO 2: Cross-Tenant Penetration Attacks (Tenant Beta Mencoba Membobol Data Alpha)
	// =========================================================================
	t.Run("2.1 Cross-Tenant: Admin Beta Mencoba List Drafts Grup Alpha", func(t *testing.T) {
		url := fmt.Sprintf("/api/memory/drafts?group_id=%s", grpAlpha.ID)
		resp := executeReq(http.MethodGet, url, tokenBetaAdmin, nil)

		// Wajib HTTP 403 Forbidden
		if resp.Code != http.StatusForbidden {
			t.Fatalf("PELANGGARAN KEAMANAN! Admin Beta berhasil mengakses drafts Grup Alpha! Status: %d, Body: %s", resp.Code, resp.Body.String())
		}
	})

	t.Run("2.2 Cross-Tenant: Admin Beta Mencoba Melihat Detail Draft Alpha", func(t *testing.T) {
		url := fmt.Sprintf("/api/memory/drafts/%s", draftAlphaID)
		resp := executeReq(http.MethodGet, url, tokenBetaAdmin, nil)

		// Wajib HTTP 403 Forbidden atau HTTP 404 Not Found (karena query difilter tenant_id)
		if resp.Code != http.StatusForbidden && resp.Code != http.StatusNotFound {
			t.Fatalf("PELANGGARAN KEAMANAN! Admin Beta berhasil melihat detail draft Alpha! Status: %d, Body: %s", resp.Code, resp.Body.String())
		}
	})

	t.Run("2.3 Cross-Tenant: Admin Beta Mencoba Menyunting Artefak Draft Alpha", func(t *testing.T) {
		url := fmt.Sprintf("/api/memory/drafts/%s/artifacts/%s", draftAlphaID, artSumID)
		payload := []byte(`{"content":"Dibajak oleh Tenant Beta"}`)
		resp := executeReq(http.MethodPatch, url, tokenBetaAdmin, payload)

		if resp.Code != http.StatusForbidden && resp.Code != http.StatusNotFound {
			t.Fatalf("PELANGGARAN KEAMANAN! Admin Beta berhasil menyunting artefak Draft Alpha! Status: %d, Body: %s", resp.Code, resp.Body.String())
		}
	})

	t.Run("2.4 Cross-Tenant: Admin Beta Mencoba Approve Draft Alpha", func(t *testing.T) {
		url := fmt.Sprintf("/api/memory/drafts/%s/approve", draftAlphaID)
		resp := executeReq(http.MethodPost, url, tokenBetaAdmin, nil)

		if resp.Code != http.StatusForbidden && resp.Code != http.StatusNotFound {
			t.Fatalf("PELANGGARAN KEAMANAN! Admin Beta berhasil meng-approve Draft Alpha! Status: %d, Body: %s", resp.Code, resp.Body.String())
		}
	})

	t.Run("2.5 Cross-Tenant: Member Beta Mencoba Membaca Arsip Memori Grup Alpha", func(t *testing.T) {
		url := fmt.Sprintf("/api/groups/%s/memories", grpAlpha.ID)
		resp := executeReq(http.MethodGet, url, tokenBetaMember, nil)

		// Wajib HTTP 403 Forbidden
		if resp.Code != http.StatusForbidden {
			t.Fatalf("PELANGGARAN KEAMANAN! Member Beta berhasil membaca daftar memori Grup Alpha! Status: %d, Body: %s", resp.Code, resp.Body.String())
		}
	})

	t.Run("2.6 Cross-Tenant: Member Beta Mencoba Membaca Detail Approved Memory Alpha", func(t *testing.T) {
		url := fmt.Sprintf("/api/memories/%s", approvedMemoryID)
		resp := executeReq(http.MethodGet, url, tokenBetaMember, nil)

		// Wajib HTTP 403 Forbidden atau HTTP 404 Not Found
		if resp.Code != http.StatusForbidden && resp.Code != http.StatusNotFound {
			t.Fatalf("PELANGGARAN KEAMANAN! Member Beta berhasil membaca detail approved memory Alpha! Status: %d, Body: %s", resp.Code, resp.Body.String())
		}
	})

	t.Run("2.7 Skenario User Beta Mengklaim Sebagai Admin Grup Beta", func(t *testing.T) {
		// Charlie (Admin Beta) mencoba mengakses list drafts di grup miliknya sendiri (grpBeta) -> harus 200 OK
		url := fmt.Sprintf("/api/memory/drafts?group_id=%s", grpBeta.ID)
		resp := executeReq(http.MethodGet, url, tokenBetaAdmin, nil)

		if resp.Code != http.StatusOK {
			t.Fatalf("Charlie harusnya bisa melihat list draft grupnya sendiri, dapat: %d", resp.Code)
		}
	})
}
