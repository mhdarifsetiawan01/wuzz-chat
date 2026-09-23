package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

func setupTestMemoryAPI(t *testing.T) (*MemoryHandler, *GroupHandler, *store.SQLMemoryStore, *store.SQLUserStore, *store.User, *store.User, *store.User, *store.GroupDetails, *store.GroupDetails) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_memory_api.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Gagal init SQLMessageStore: %v", err)
	}

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	groupStore := store.NewSQLGroupStore(sqlStore.DB(), sqlStore.DriverName())
	memoryStore := store.NewSQLMemoryStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, _ := userStore.Register("alice_mem", "Alice Admin", "pass12345")
	userBob, _ := userStore.Register("bob_mem", "Bob Member", "pass12345")
	userCharlie, _ := userStore.Register("charlie_mem", "Charlie Outsider", "pass12345")

	clientStore := store.NewMemoryClientStore()
	hub := ws.NewHub(clientStore, sqlStore)
	hub.SetUserStore(userStore)

	groupHandler := NewGroupHandler(groupStore, userStore)
	groupHandler.SetHub(hub)

	memoryHandler := NewMemoryHandler(memoryStore, groupStore, userStore)
	memoryHandler.SetHub(hub)
	groupHandler.SetMemoryHandler(memoryHandler)

	// Alice membuat grup dengan Bob sebagai anggota
	parentGroup, err := groupStore.CreateGroup(
		"Tech Division", "Diskusi divisi teknologi", "",
		userAlice.ID, "tech_div", false, []string{userBob.ID},
	)
	if err != nil {
		t.Fatalf("Gagal membuat parent group: %v", err)
	}

	// Alice membuat subgrup / forum
	subGroup, err := groupStore.CreateSubGroup(
		parentGroup.ID, "Arsitektur Database", "Diskusi skema DB",
		userAlice.ID, "1_week", false,
	)
	if err != nil {
		t.Fatalf("Gagal membuat subgrup: %v", err)
	}

	return memoryHandler, groupHandler, memoryStore, userStore, userAlice, userBob, userCharlie, parentGroup, subGroup
}

func TestMemoryHandler_AdminReviewLifecycle(t *testing.T) {
	memoryHandler, groupHandler, memoryStore, _, alice, bob, charlie, group, forum := setupTestMemoryAPI(t)
	ctx := context.Background()

	// Buat draft memori dengan 3 artefak
	draftID := uuid.New().String()
	summaryID := uuid.New().String()
	decisionID := uuid.New().String()
	journeyID := uuid.New().String()

	draft := &store.MemoryDraft{
		ID:                     draftID,
		JobID:                  uuid.New().String(),
		ForumID:                forum.ID,
		GroupID:                group.ID,
		Status:                 store.DraftStatusDraft,
		MessageCountProcessed: 25,
		WasTruncated:           false,
	}

	pos := 1
	artifacts := []store.MemoryArtifact{
		{
			ID:                summaryID,
			Type:              store.ArtifactTypeSummary,
			Content:           "Diskusi memutuskan migrasi PostgreSQL ke CockroachDB.",
			Confidence:        store.ConfidenceHigh,
			IsHumanEdited:     false,
			IsRemoved:         false,
		},
		{
			ID:                decisionID,
			Type:              store.ArtifactTypeDecision,
			Content:           "Database utama akan menggunakan CockroachDB di region ap-southeast-1.",
			Confidence:        store.ConfidenceHigh,
			Position:          &pos,
			IsHumanEdited:     false,
			IsRemoved:         false,
			Evidences: []store.ArtifactEvidence{
				{
					MessageID:         uuid.New().String(),
					MessagePreview:    "Saya setuju migrasi ke CockroachDB",
					MessageSenderName: "Alice Admin",
					MessageSentAt:     time.Now().UTC(),
				},
			},
		},
		{
			ID:                journeyID,
			Type:              store.ArtifactTypeJourneyLite,
			Content:           `{"initially":"Awalnya MySQL","then":"Lalu PostgreSQL","finally_":"Akhirnya CockroachDB"}`,
			Confidence:        store.ConfidenceMedium,
			IsHumanEdited:     false,
			IsRemoved:         false,
		},
	}

	if err := memoryStore.CreateDraftWithArtifacts(ctx, draft, artifacts); err != nil {
		t.Fatalf("Gagal membuat draft pengujian: %v", err)
	}

	// 1. GET /api/memory/drafts?group_id={id}
	t.Run("List Drafts - Admin Access vs Member Forbidden", func(t *testing.T) {
		// Alice (Admin) -> 200 OK
		reqAlice := httptest.NewRequest(http.MethodGet, "/api/memory/drafts?group_id="+group.ID, nil)
		ctxAlice := auth.SetUserContext(reqAlice.Context(), &auth.UserClaims{UserID: alice.ID, Username: alice.Username})
		rrAlice := httptest.NewRecorder()
		memoryHandler.RouteMemoryRequest(rrAlice, reqAlice.WithContext(ctxAlice))

		if rrAlice.Code != http.StatusOK {
			t.Fatalf("Alice (Admin) expected 200 OK, got %d: %s", rrAlice.Code, rrAlice.Body.String())
		}

		var draftsResp []map[string]interface{}
		_ = json.NewDecoder(rrAlice.Body).Decode(&draftsResp)
		if len(draftsResp) != 1 {
			t.Fatalf("Expected 1 draft, got %d", len(draftsResp))
		}
		if draftsResp[0]["draft_id"] != draftID {
			t.Errorf("Expected draft_id %s, got %v", draftID, draftsResp[0]["draft_id"])
		}

		// Bob (Member) -> 403 Forbidden
		reqBob := httptest.NewRequest(http.MethodGet, "/api/memory/drafts?group_id="+group.ID, nil)
		ctxBob := auth.SetUserContext(reqBob.Context(), &auth.UserClaims{UserID: bob.ID, Username: bob.Username})
		rrBob := httptest.NewRecorder()
		memoryHandler.RouteMemoryRequest(rrBob, reqBob.WithContext(ctxBob))

		if rrBob.Code != http.StatusForbidden {
			t.Fatalf("Bob (Member) expected 403 Forbidden, got %d", rrBob.Code)
		}

		// Charlie (Outsider) -> 403 Forbidden
		reqCharlie := httptest.NewRequest(http.MethodGet, "/api/memory/drafts?group_id="+group.ID, nil)
		ctxCharlie := auth.SetUserContext(reqCharlie.Context(), &auth.UserClaims{UserID: charlie.ID, Username: charlie.Username})
		rrCharlie := httptest.NewRecorder()
		memoryHandler.RouteMemoryRequest(rrCharlie, reqCharlie.WithContext(ctxCharlie))

		if rrCharlie.Code != http.StatusForbidden {
			t.Fatalf("Charlie (Outsider) expected 403 Forbidden, got %d", rrCharlie.Code)
		}
	})

	// 2. GET /api/memory/drafts/{draft_id}
	t.Run("Get Draft Detail - Admin Success", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/memory/drafts/"+draftID, nil)
		reqCtx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: alice.ID, Username: alice.Username})
		rr := httptest.NewRecorder()
		memoryHandler.RouteMemoryRequest(rr, req.WithContext(reqCtx))

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp struct {
			Draft struct {
				ID        string                 `json:"id"`
				Artifacts []store.MemoryArtifact `json:"artifacts"`
			} `json:"draft"`
		}
		_ = json.NewDecoder(rr.Body).Decode(&resp)
		if resp.Draft.ID != draftID {
			t.Errorf("Expected draft ID %s, got %s", draftID, resp.Draft.ID)
		}
		if len(resp.Draft.Artifacts) != 3 {
			t.Errorf("Expected 3 artifacts, got %d", len(resp.Draft.Artifacts))
		}
	})

	// 3. PATCH /api/memory/drafts/{draft_id}/artifacts/{artifact_id}
	t.Run("Edit Summary Artifact", func(t *testing.T) {
		newContent := "Keputusan revisi: Menggunakan CockroachDB Dedicated Cluster."
		body, _ := json.Marshal(map[string]string{"content": newContent})

		req := httptest.NewRequest(http.MethodPatch, "/api/memory/drafts/"+draftID+"/artifacts/"+summaryID, bytes.NewReader(body))
		reqCtx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: alice.ID, Username: alice.Username})
		rr := httptest.NewRecorder()
		memoryHandler.RouteMemoryRequest(rr, req.WithContext(reqCtx))

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verifikasi perubahan di DB
		updatedArt, err := memoryStore.GetArtifactByID(ctx, summaryID)
		if err != nil {
			t.Fatalf("Gagal mengambil artefak setelah update: %v", err)
		}
		if updatedArt.Content != newContent {
			t.Errorf("Expected updated content '%s', got '%s'", newContent, updatedArt.Content)
		}
		if !updatedArt.IsHumanEdited {
			t.Errorf("Expected is_human_edited = true")
		}

		// Verifikasi MemoryReviewAction tercatat
		actions, err := memoryStore.GetReviewActions(ctx, draftID)
		if err != nil || len(actions) == 0 {
			t.Fatalf("Expected review action recorded, got %v (err: %v)", actions, err)
		}
		if actions[0].Action != store.ActionEditedSummary {
			t.Errorf("Expected action EDITED_SUMMARY, got %s", actions[0].Action)
		}
	})

	// 4. DELETE /api/memory/drafts/{draft_id}/journey
	t.Run("Remove Journey Lite", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodDelete, "/api/memory/drafts/"+draftID+"/journey", nil)
		reqCtx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: alice.ID, Username: alice.Username})
		rr := httptest.NewRecorder()
		memoryHandler.RouteMemoryRequest(rr, req.WithContext(reqCtx))

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verifikasi artefak is_removed = true
		updatedJourney, err := memoryStore.GetArtifactByID(ctx, journeyID)
		if err != nil {
			t.Fatalf("Gagal mengambil journey art: %v", err)
		}
		if !updatedJourney.IsRemoved {
			t.Errorf("Expected is_removed = true untuk journey")
		}
	})

	var approvedMemID string

	// 5. POST /api/memory/drafts/{draft_id}/approve
	t.Run("Approve Draft With Changes", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/memory/drafts/"+draftID+"/approve", nil)
		reqCtx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: alice.ID, Username: alice.Username})
		rr := httptest.NewRecorder()
		memoryHandler.RouteMemoryRequest(rr, req.WithContext(reqCtx))

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp struct {
			Success        bool                 `json:"success"`
			ApprovedMemory store.ApprovedMemory `json:"approved_memory"`
		}
		_ = json.NewDecoder(rr.Body).Decode(&resp)
		if !resp.Success {
			t.Fatalf("Expected success true")
		}
		approvedMemID = resp.ApprovedMemory.ID
		if approvedMemID == "" {
			t.Fatalf("Approved memory ID empty")
		}
		if !resp.ApprovedMemory.HasHumanEdits {
			t.Errorf("Expected HasHumanEdits = true karena summary diedit dan journey dihapus")
		}
		if !resp.ApprovedMemory.IsJourneyLiteRemoved {
			t.Errorf("Expected IsJourneyLiteRemoved = true")
		}

		// Verifikasi status draft di DB sudah APPROVED
		d, _ := memoryStore.GetDraftByID(ctx, draftID)
		if d.Status != store.DraftStatusApproved {
			t.Errorf("Expected draft status APPROVED, got %s", d.Status)
		}
	})

	// 6. Member Knowledge Endpoints
	t.Run("Member Read Approved Memory - Bob Success vs Charlie Forbidden", func(t *testing.T) {
		// Bob (Member) memanggil GET /api/groups/{id}/memories via groupHandler
		reqBob := httptest.NewRequest(http.MethodGet, "/api/groups/"+group.ID+"/memories", nil)
		ctxBob := auth.SetUserContext(reqBob.Context(), &auth.UserClaims{UserID: bob.ID, Username: bob.Username})
		rrBob := httptest.NewRecorder()
		groupHandler.RouteGroupRequest(rrBob, reqBob.WithContext(ctxBob))

		if rrBob.Code != http.StatusOK {
			t.Fatalf("Bob expected 200 OK, got %d: %s", rrBob.Code, rrBob.Body.String())
		}

		var memoriesList []map[string]interface{}
		_ = json.NewDecoder(rrBob.Body).Decode(&memoriesList)
		if len(memoriesList) != 1 {
			t.Fatalf("Expected 1 approved memory, got %d", len(memoriesList))
		}
		if memoriesList[0]["id"] != approvedMemID {
			t.Errorf("Expected memory ID %s, got %v", approvedMemID, memoriesList[0]["id"])
		}

		// Charlie (Outsider) memanggil GET /api/groups/{id}/memories -> 403 Forbidden
		reqCharlie := httptest.NewRequest(http.MethodGet, "/api/groups/"+group.ID+"/memories", nil)
		ctxCharlie := auth.SetUserContext(reqCharlie.Context(), &auth.UserClaims{UserID: charlie.ID, Username: charlie.Username})
		rrCharlie := httptest.NewRecorder()
		groupHandler.RouteGroupRequest(rrCharlie, reqCharlie.WithContext(ctxCharlie))

		if rrCharlie.Code != http.StatusForbidden {
			t.Fatalf("Charlie expected 403 Forbidden, got %d", rrCharlie.Code)
		}
	})

	// 7. GET /api/memories/{memory_id} (Detail & View Event)
	t.Run("Get Memory Detail & Record View Event", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/memories/"+approvedMemID, nil)
		reqCtx := auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: bob.ID, Username: bob.Username})
		rr := httptest.NewRecorder()
		memoryHandler.RouteApprovedMemoryRequest(rr, req.WithContext(reqCtx))

		if rr.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		var memDetail map[string]interface{}
		_ = json.NewDecoder(rr.Body).Decode(&memDetail)
		if memDetail["id"] != approvedMemID {
			t.Errorf("Expected memory ID %s, got %v", approvedMemID, memDetail["id"])
		}

		// Berikan sedikit jeda untuk goroutine ViewEvent async
		time.Sleep(50 * time.Millisecond)

		// Verifikasi view event tercatat
		viewed, err := memoryStore.HasUserViewedMemory(ctx, approvedMemID, bob.ID)
		if err != nil || !viewed {
			t.Errorf("Expected HasUserViewedMemory = true for Bob, got %v (err: %v)", viewed, err)
		}
	})
}

func TestMemoryHandler_RejectDraft(t *testing.T) {
	memoryHandler, _, memoryStore, _, alice, bob, _, group, forum := setupTestMemoryAPI(t)
	ctx := context.Background()

	draftID := uuid.New().String()
	draft := &store.MemoryDraft{
		ID:                     draftID,
		JobID:                  uuid.New().String(),
		ForumID:                forum.ID,
		GroupID:                group.ID,
		Status:                 store.DraftStatusDraft,
		MessageCountProcessed: 10,
	}

	if err := memoryStore.CreateDraftWithArtifacts(ctx, draft, []store.MemoryArtifact{
		{
			ID:         uuid.New().String(),
			Type:       store.ArtifactTypeSummary,
			Content:    "Diskusi tidak mencapai konsensus.",
			Confidence: store.ConfidenceLow,
		},
	}); err != nil {
		t.Fatalf("Gagal membuat draft: %v", err)
	}

	// 1. Bob (bukan admin) mencoba reject -> 403 Forbidden
	reqBob := httptest.NewRequest(http.MethodPost, "/api/memory/drafts/"+draftID+"/reject", bytes.NewReader([]byte(`{"reason":"Tolak"}`)))
	ctxBob := auth.SetUserContext(reqBob.Context(), &auth.UserClaims{UserID: bob.ID, Username: bob.Username})
	rrBob := httptest.NewRecorder()
	memoryHandler.RouteMemoryRequest(rrBob, reqBob.WithContext(ctxBob))

	if rrBob.Code != http.StatusForbidden {
		t.Fatalf("Bob expected 403 Forbidden, got %d", rrBob.Code)
	}

	// 2. Alice (Admin) reject draft -> 200 OK
	reqAlice := httptest.NewRequest(http.MethodPost, "/api/memory/drafts/"+draftID+"/reject", bytes.NewReader([]byte(`{"reason":"Diskusi tidak konklusif"}`)))
	ctxAlice := auth.SetUserContext(reqAlice.Context(), &auth.UserClaims{UserID: alice.ID, Username: alice.Username})
	rrAlice := httptest.NewRecorder()
	memoryHandler.RouteMemoryRequest(rrAlice, reqAlice.WithContext(ctxAlice))

	if rrAlice.Code != http.StatusOK {
		t.Fatalf("Alice expected 200 OK, got %d: %s", rrAlice.Code, rrAlice.Body.String())
	}

	// Verifikasi di DB
	d, err := memoryStore.GetDraftByID(ctx, draftID)
	if err != nil {
		t.Fatalf("Gagal get draft: %v", err)
	}
	if d.Status != store.DraftStatusRejected {
		t.Errorf("Expected draft status REJECTED, got %s", d.Status)
	}
	if d.RejectionReason != "Diskusi tidak konklusif" {
		t.Errorf("Expected rejection reason 'Diskusi tidak konklusif', got '%s'", d.RejectionReason)
	}
}
