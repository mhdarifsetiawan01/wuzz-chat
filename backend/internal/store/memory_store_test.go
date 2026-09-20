package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
)

func setupTestMemoryStore(t *testing.T) (MemoryStore, func()) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_memory.db")
	msgStore, err := NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("NewSQLMessageStore gagal: %v", err)
	}
	memStore := NewSQLMemoryStore(msgStore.DB(), "sqlite")
	return memStore, func() {
		msgStore.Close()
	}
}

func TestMemoryStore_JobLifecycle(t *testing.T) {
	s, cleanup := setupTestMemoryStore(t)
	defer cleanup()
	ctx := context.Background()

	forumID := "sub_" + uuid.New().String()
	groupID := "grp_" + uuid.New().String()

	// 1. Create Job
	job, err := s.CreateJob(ctx, forumID, groupID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}
	if job.Status != JobStatusQueued {
		t.Errorf("expected status QUEUED, got %s", job.Status)
	}
	if job.AttemptCount != 0 {
		t.Errorf("expected attempt 0, got %d", job.AttemptCount)
	}
	if job.MaxAttempts != 3 {
		t.Errorf("expected max attempts 3, got %d", job.MaxAttempts)
	}

	// 2. Get Job by ID & ForumID
	jobByID, err := s.GetJobByID(ctx, job.ID)
	if err != nil {
		t.Fatalf("GetJobByID gagal: %v", err)
	}
	if jobByID.ForumID != forumID || jobByID.GroupID != groupID {
		t.Errorf("job by ID mismatch: %+v", jobByID)
	}

	jobByForum, err := s.GetJobByForumID(ctx, forumID)
	if err != nil {
		t.Fatalf("GetJobByForumID gagal: %v", err)
	}
	if jobByForum.ID != job.ID {
		t.Errorf("job by forum ID mismatch: %+v", jobByForum)
	}

	// 3. GetPendingJobs
	pending, err := s.GetPendingJobs(ctx, 10)
	if err != nil {
		t.Fatalf("GetPendingJobs gagal: %v", err)
	}
	if len(pending) == 0 {
		t.Fatalf("expected at least 1 pending job, got 0")
	}

	// 4. Claim Job (QUEUED -> PROCESSING)
	claimed, err := s.ClaimJob(ctx, job.ID)
	if err != nil {
		t.Fatalf("ClaimJob gagal: %v", err)
	}
	if claimed.Status != JobStatusProcessing {
		t.Errorf("expected status PROCESSING, got %s", claimed.Status)
	}
	if claimed.AttemptCount != 1 {
		t.Errorf("expected attempt 1, got %d", claimed.AttemptCount)
	}
	if claimed.StartedAt == nil {
		t.Errorf("expected started_at populated")
	}

	// 5. Fail Job non-terminal (retryable -> back to QUEUED)
	nextRetry := time.Now().UTC().Add(30 * time.Second)
	err = s.FailJob(ctx, job.ID, "rate limit 429", false, &nextRetry)
	if err != nil {
		t.Fatalf("FailJob retryable gagal: %v", err)
	}

	jobAfterFail, err := s.GetJobByID(ctx, job.ID)
	if err != nil {
		t.Fatalf("GetJobByID after fail gagal: %v", err)
	}
	if jobAfterFail.Status != JobStatusQueued {
		t.Errorf("expected status QUEUED after retryable fail, got %s", jobAfterFail.Status)
	}
	if jobAfterFail.LastError != "rate limit 429" {
		t.Errorf("expected error recorded, got %s", jobAfterFail.LastError)
	}

	// 6. Complete Job
	err = s.CompleteJob(ctx, job.ID, 450)
	if err != nil {
		t.Fatalf("CompleteJob gagal: %v", err)
	}

	jobCompleted, err := s.GetJobByID(ctx, job.ID)
	if err != nil {
		t.Fatalf("GetJobByID after complete gagal: %v", err)
	}
	if jobCompleted.Status != JobStatusCompleted {
		t.Errorf("expected status COMPLETED, got %s", jobCompleted.Status)
	}
	if jobCompleted.MessageCount != 450 {
		t.Errorf("expected message count 450, got %d", jobCompleted.MessageCount)
	}
	if jobCompleted.CompletedAt == nil {
		t.Errorf("expected completed_at populated")
	}
}

func TestMemoryStore_DraftAndArtifacts(t *testing.T) {
	s, cleanup := setupTestMemoryStore(t)
	defer cleanup()
	ctx := context.Background()

	forumID := "sub_" + uuid.New().String()
	groupID := "grp_" + uuid.New().String()

	job, err := s.CreateJob(ctx, forumID, groupID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}

	pos1 := 1
	pos2 := 2
	draft := &MemoryDraft{
		ID:                    uuid.New().String(),
		JobID:                 job.ID,
		ForumID:               forumID,
		GroupID:               groupID,
		Status:                DraftStatusDraft,
		MessageCountProcessed: 120,
		WasTruncated:          false,
	}

	artifacts := []MemoryArtifact{
		{
			Type:              ArtifactTypeSummary,
			Content:           "Diskusi mengenai migrasi arsitektur microservices.",
			AIOriginalContent: "Diskusi mengenai migrasi arsitektur microservices.",
			Confidence:        ConfidenceHigh,
		},
		{
			Type:              ArtifactTypeDecision,
			Content:           "Menyetujui penggunaan PostgreSQL SKIP LOCKED untuk job queue.",
			AIOriginalContent: "Menyetujui penggunaan PostgreSQL SKIP LOCKED untuk job queue.",
			Confidence:        ConfidenceHigh,
			Position:          &pos1,
			Evidences: []ArtifactEvidence{
				{
					MessageID:         "msg_001",
					MessagePreview:    "Saya setuju pakai SKIP LOCKED daripada Redis dulu.",
					MessageSenderName: "Alice",
					MessageSentAt:     time.Now().UTC().Add(-10 * time.Minute),
				},
			},
		},
		{
			Type:              ArtifactTypeDecision,
			Content:           "Batas pesan dipatok 1.000 pesan untuk MVP.",
			AIOriginalContent: "Batas pesan dipatok 1.000 pesan untuk MVP.",
			Confidence:        ConfidenceMedium,
			Position:          &pos2,
			Evidences: []ArtifactEvidence{
				{
					MessageID:         "msg_002",
					MessagePreview:    "1000 pesan cukup untuk 99% forum.",
					MessageSenderName: "Bob",
					MessageSentAt:     time.Now().UTC().Add(-5 * time.Minute),
				},
			},
		},
		{
			Type:              ArtifactTypeJourneyLite,
			Content:           "Awalnya mengusulkan Redis. Kemudian mempertimbangkan kompleksitas operasional. Akhirnya sepakat PostgreSQL.",
			AIOriginalContent: "Awalnya mengusulkan Redis. Kemudian mempertimbangkan kompleksitas operasional. Akhirnya sepakat PostgreSQL.",
			Confidence:        ConfidenceHigh,
		},
	}

	// 1. CreateDraftWithArtifacts
	err = s.CreateDraftWithArtifacts(ctx, draft, artifacts)
	if err != nil {
		t.Fatalf("CreateDraftWithArtifacts gagal: %v", err)
	}

	// 2. GetDraftByID
	fetchedDraft, err := s.GetDraftByID(ctx, draft.ID)
	if err != nil {
		t.Fatalf("GetDraftByID gagal: %v", err)
	}
	if fetchedDraft.ForumID != forumID || len(fetchedDraft.Artifacts) != 4 {
		t.Fatalf("expected 4 artifacts, got %d", len(fetchedDraft.Artifacts))
	}

	// Verify evidence nested on decision
	var decArtifact *MemoryArtifact
	for i := range fetchedDraft.Artifacts {
		if fetchedDraft.Artifacts[i].Type == ArtifactTypeDecision && *fetchedDraft.Artifacts[i].Position == 1 {
			decArtifact = &fetchedDraft.Artifacts[i]
			break
		}
	}
	if decArtifact == nil {
		t.Fatalf("decision artifact position 1 not found")
	}
	if len(decArtifact.Evidences) != 1 {
		t.Fatalf("expected 1 evidence, got %d", len(decArtifact.Evidences))
	}
	if decArtifact.Evidences[0].MessageSenderName != "Alice" {
		t.Errorf("expected sender Alice, got %s", decArtifact.Evidences[0].MessageSenderName)
	}

	// 3. UpdateArtifact
	newContent := "Menyetujui penggunaan PostgreSQL SKIP LOCKED dengan max 3 retry."
	err = s.UpdateArtifact(ctx, decArtifact.ID, newContent, true)
	if err != nil {
		t.Fatalf("UpdateArtifact gagal: %v", err)
	}

	updatedDraft, err := s.GetDraftByID(ctx, draft.ID)
	if err != nil {
		t.Fatalf("GetDraftByID after update gagal: %v", err)
	}
	for _, a := range updatedDraft.Artifacts {
		if a.ID == decArtifact.ID {
			if a.Content != newContent {
				t.Errorf("content not updated: %s", a.Content)
			}
			if !a.IsHumanEdited {
				t.Errorf("expected is_human_edited = true")
			}
		}
	}

	// 4. RemoveJourneyLite
	err = s.RemoveJourneyLite(ctx, draft.ID)
	if err != nil {
		t.Fatalf("RemoveJourneyLite gagal: %v", err)
	}

	draftAfterRemoval, err := s.GetDraftByID(ctx, draft.ID)
	if err != nil {
		t.Fatalf("GetDraftByID after removal gagal: %v", err)
	}
	for _, a := range draftAfterRemoval.Artifacts {
		if a.Type == ArtifactTypeJourneyLite && !a.IsRemoved {
			t.Errorf("expected journey lite is_removed = true")
		}
	}

	// 5. GetDraftsByGroupID
	draftsInGroup, err := s.GetDraftsByGroupID(ctx, groupID, DraftStatusDraft)
	if err != nil {
		t.Fatalf("GetDraftsByGroupID gagal: %v", err)
	}
	if len(draftsInGroup) != 1 {
		t.Errorf("expected 1 draft in group, got %d", len(draftsInGroup))
	}
}

func TestMemoryStore_ApprovalAndRejection(t *testing.T) {
	s, cleanup := setupTestMemoryStore(t)
	defer cleanup()
	ctx := context.Background()

	adminID := "usr_admin_01"
	forumID1 := "sub_forum_01"
	groupID := "grp_main_01"

	// --- Skenario 1: Reject Draft ---
	job1, _ := s.CreateJob(ctx, forumID1, groupID)
	draft1 := &MemoryDraft{
		ID:                    uuid.New().String(),
		JobID:                 job1.ID,
		ForumID:               forumID1,
		GroupID:               groupID,
		Status:                DraftStatusDraft,
		MessageCountProcessed: 50,
	}
	_ = s.CreateDraftWithArtifacts(ctx, draft1, []MemoryArtifact{
		{
			Type:              ArtifactTypeSummary,
			Content:           "Rapat singkat tidak menghasilkan kesepakatan.",
			AIOriginalContent: "Rapat singkat tidak menghasilkan kesepakatan.",
			Confidence:        ConfidenceLow,
		},
	})

	err := s.RejectDraft(ctx, draft1.ID, adminID, "Diskusi tidak memenuhi syarat materi")
	if err != nil {
		t.Fatalf("RejectDraft gagal: %v", err)
	}

	rejDraft, err := s.GetDraftByID(ctx, draft1.ID)
	if err != nil {
		t.Fatalf("GetDraftByID gagal: %v", err)
	}
	if rejDraft.Status != DraftStatusRejected {
		t.Errorf("expected status REJECTED, got %s", rejDraft.Status)
	}
	if rejDraft.RejectionReason != "Diskusi tidak memenuhi syarat materi" {
		t.Errorf("unexpected rejection reason: %s", rejDraft.RejectionReason)
	}

	// Draft yang sudah ditolak tidak bisa ditolak lagi
	err = s.RejectDraft(ctx, draft1.ID, adminID, "coba lagi")
	if !errors.Is(err, ErrDraftAlreadyReviewed) {
		t.Errorf("expected ErrDraftAlreadyReviewed, got %v", err)
	}

	// --- Skenario 2: Approve Draft ---
	forumID2 := "sub_forum_02"
	job2, _ := s.CreateJob(ctx, forumID2, groupID)
	draft2 := &MemoryDraft{
		ID:                    uuid.New().String(),
		JobID:                 job2.ID,
		ForumID:               forumID2,
		GroupID:               groupID,
		Status:                DraftStatusDraft,
		MessageCountProcessed: 80,
	}
	_ = s.CreateDraftWithArtifacts(ctx, draft2, []MemoryArtifact{
		{
			Type:              ArtifactTypeSummary,
			Content:           "Kesepakatan jadwal peluncuran aplikasi.",
			AIOriginalContent: "Kesepakatan jadwal peluncuran aplikasi.",
			Confidence:        ConfidenceHigh,
		},
	})

	approvedMem := &ApprovedMemory{
		ForumID:             forumID2,
		GroupID:             groupID,
		SnapshotSummary:     "Kesepakatan jadwal peluncuran aplikasi.",
		SnapshotSummaryConf: ConfidenceHigh,
		DecisionsList: []ApprovedDecisionItem{
			{
				Position:      1,
				Text:          "Peluncuran dijadwalkan 1 Oktober 2026.",
				Confidence:    ConfidenceHigh,
				IsHumanEdited: false,
				Evidences: []ApprovedEvidenceItem{
					{
						MessageID:  "msg_launch",
						Preview:    "Kita luncurkan 1 Oktober.",
						SenderName: "Alice",
						SentAt:     time.Now().UTC(),
					},
				},
			},
		},
		SnapshotJourneyLite: "Awalnya 15 September, ditunda 1 Oktober demi QA.",
		SnapshotJourneyConf: ConfidenceHigh,
	}

	reviewAction := &MemoryReviewAction{
		Action: ActionApproved,
	}

	err = s.ApproveDraft(ctx, draft2.ID, adminID, approvedMem, reviewAction)
	if err != nil {
		t.Fatalf("ApproveDraft gagal: %v", err)
	}

	// Verify draft status APPROVED
	appDraft, err := s.GetDraftByID(ctx, draft2.ID)
	if err != nil {
		t.Fatalf("GetDraftByID draft2 gagal: %v", err)
	}
	if appDraft.Status != DraftStatusApproved {
		t.Errorf("expected status APPROVED, got %s", appDraft.Status)
	}

	// Verify Approved Memory
	mem, err := s.GetApprovedMemoryByForumID(ctx, forumID2)
	if err != nil {
		t.Fatalf("GetApprovedMemoryByForumID gagal: %v", err)
	}
	if mem.SnapshotSummary != approvedMem.SnapshotSummary {
		t.Errorf("summary mismatch: %s", mem.SnapshotSummary)
	}
	if len(mem.DecisionsList) != 1 {
		t.Fatalf("expected 1 decision in list, got %d", len(mem.DecisionsList))
	}
	if mem.DecisionsList[0].Text != "Peluncuran dijadwalkan 1 Oktober 2026." {
		t.Errorf("decision text mismatch: %s", mem.DecisionsList[0].Text)
	}

	// Verify Group Memories List
	groupMemories, err := s.GetApprovedMemoriesByGroupID(ctx, groupID, 10, 0)
	if err != nil {
		t.Fatalf("GetApprovedMemoriesByGroupID gagal: %v", err)
	}
	if len(groupMemories) != 1 {
		t.Fatalf("expected 1 approved memory for group, got %d", len(groupMemories))
	}

	// Verify Review Audit Actions
	actions, err := s.GetReviewActions(ctx, draft2.ID)
	if err != nil {
		t.Fatalf("GetReviewActions gagal: %v", err)
	}
	if len(actions) != 1 {
		t.Fatalf("expected 1 review action, got %d", len(actions))
	}
	if actions[0].Action != ActionApproved {
		t.Errorf("action mismatch: %s", actions[0].Action)
	}
}

func TestMemoryStore_ViewEvents(t *testing.T) {
	s, cleanup := setupTestMemoryStore(t)
	defer cleanup()
	ctx := context.Background()

	memID := uuid.New().String()
	userA := "usr_alice"
	userB := "usr_bob"

	// Belum ada view
	viewedA, err := s.HasUserViewedMemory(ctx, memID, userA)
	if err != nil {
		t.Fatalf("HasUserViewedMemory gagal: %v", err)
	}
	if viewedA {
		t.Errorf("expected viewed = false initially")
	}

	// Record View Event userA
	err = s.RecordViewEvent(ctx, &MemoryViewEvent{
		ApprovedMemoryID: memID,
		ForumID:          "sub_forum_01",
		GroupID:          "grp_01",
		ViewerID:         userA,
		ViewerRole:       ViewerRoleMember,
	})
	if err != nil {
		t.Fatalf("RecordViewEvent gagal: %v", err)
	}

	// Sekarang userA sudah view, tapi userB belum
	viewedAAfter, err := s.HasUserViewedMemory(ctx, memID, userA)
	if err != nil || !viewedAAfter {
		t.Errorf("expected userA viewed = true")
	}

	viewedB, err := s.HasUserViewedMemory(ctx, memID, userB)
	if err != nil || viewedB {
		t.Errorf("expected userB viewed = false")
	}
}
