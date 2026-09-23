package memory

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// MockMemoryRepository untuk unit testing MemoryService
type mockMemoryRepo struct {
	drafts           map[string]*MemoryDraft
	artifacts        map[string]*MemoryArtifact
	approvedMemories map[string]*ApprovedMemory
	reviewActions    []*MemoryReviewAction
	viewEvents       []*MemoryViewEvent
}

func newMockMemoryRepo() *mockMemoryRepo {
	return &mockMemoryRepo{
		drafts:           make(map[string]*MemoryDraft),
		artifacts:        make(map[string]*MemoryArtifact),
		approvedMemories: make(map[string]*ApprovedMemory),
		reviewActions:    make([]*MemoryReviewAction, 0),
		viewEvents:       make([]*MemoryViewEvent, 0),
	}
}

func (m *mockMemoryRepo) CreateJob(ctx context.Context, contextID, parentID string) (*MemoryJob, error) {
	return &MemoryJob{ID: "job_1", ContextID: contextID, ParentID: parentID, Status: JobStatusQueued}, nil
}
func (m *mockMemoryRepo) GetJobByID(ctx context.Context, id string) (*MemoryJob, error) {
	return nil, nil
}
func (m *mockMemoryRepo) GetJobByContextID(ctx context.Context, contextID string) (*MemoryJob, error) {
	return nil, nil
}
func (m *mockMemoryRepo) GetPendingJobs(ctx context.Context, limit int) ([]MemoryJob, error) {
	return nil, nil
}
func (m *mockMemoryRepo) ClaimJob(ctx context.Context, jobID string) (*MemoryJob, error) {
	return nil, nil
}
func (m *mockMemoryRepo) CompleteJob(ctx context.Context, jobID string, msgCount int) error {
	return nil
}
func (m *mockMemoryRepo) FailJob(ctx context.Context, jobID, lastError string, isTerminal bool, nextRetry *time.Time) error {
	return nil
}

func (m *mockMemoryRepo) CreateDraftWithArtifacts(ctx context.Context, draft *MemoryDraft, artifacts []MemoryArtifact) error {
	m.drafts[draft.ID] = draft
	for i := range artifacts {
		art := artifacts[i]
		m.artifacts[art.ID] = &art
	}
	return nil
}

func (m *mockMemoryRepo) GetDraftByID(ctx context.Context, id string) (*MemoryDraft, error) {
	d, ok := m.drafts[id]
	if !ok {
		return nil, ErrDraftNotFound
	}
	return d, nil
}

func (m *mockMemoryRepo) GetDraftByContextID(ctx context.Context, contextID string) (*MemoryDraft, error) {
	for _, d := range m.drafts {
		if d.ContextID == contextID {
			return d, nil
		}
	}
	return nil, ErrDraftNotFound
}

func (m *mockMemoryRepo) GetDraftsByParentID(ctx context.Context, parentID string, status string) ([]MemoryDraft, error) {
	var res []MemoryDraft
	for _, d := range m.drafts {
		if d.ParentID == parentID {
			if status == "" || d.Status == status {
				res = append(res, *d)
			}
		}
	}
	return res, nil
}

func (m *mockMemoryRepo) GetArtifactsByDraftID(ctx context.Context, draftID string) ([]MemoryArtifact, error) {
	var res []MemoryArtifact
	for _, a := range m.artifacts {
		if a.DraftID == draftID {
			res = append(res, *a)
		}
	}
	return res, nil
}

func (m *mockMemoryRepo) GetArtifactByID(ctx context.Context, id string) (*MemoryArtifact, error) {
	a, ok := m.artifacts[id]
	if !ok {
		return nil, ErrArtifactNotFound
	}
	return a, nil
}

func (m *mockMemoryRepo) UpdateArtifact(ctx context.Context, artifactID string, content string, isHumanEdited bool) error {
	a, ok := m.artifacts[artifactID]
	if !ok {
		return ErrArtifactNotFound
	}
	a.Content = content
	a.IsHumanEdited = isHumanEdited
	return nil
}

func (m *mockMemoryRepo) RemoveJourneyLite(ctx context.Context, draftID string) error {
	for _, a := range m.artifacts {
		if a.DraftID == draftID && a.Type == ArtifactTypeJourneyLite {
			a.IsRemoved = true
		}
	}
	return nil
}

func (m *mockMemoryRepo) ApproveDraft(ctx context.Context, draftID, adminID string, approvedMemory *ApprovedMemory, reviewAction *MemoryReviewAction) error {
	d, ok := m.drafts[draftID]
	if !ok {
		return ErrDraftNotFound
	}
	if d.Status != DraftStatusDraft {
		return ErrDraftAlreadyReviewed
	}
	d.Status = DraftStatusApproved
	now := time.Now().UTC()
	d.ReviewedAt = &now
	d.ReviewedBy = adminID

	m.approvedMemories[approvedMemory.ID] = approvedMemory
	if reviewAction != nil {
		m.reviewActions = append(m.reviewActions, reviewAction)
	}
	return nil
}

func (m *mockMemoryRepo) RejectDraft(ctx context.Context, draftID, adminID, reason string) error {
	d, ok := m.drafts[draftID]
	if !ok {
		return ErrDraftNotFound
	}
	if d.Status != DraftStatusDraft {
		return ErrDraftAlreadyReviewed
	}
	d.Status = DraftStatusRejected
	now := time.Now().UTC()
	d.ReviewedAt = &now
	d.ReviewedBy = adminID
	d.RejectionReason = reason
	return nil
}

func (m *mockMemoryRepo) RecordReviewAction(ctx context.Context, action *MemoryReviewAction) error {
	m.reviewActions = append(m.reviewActions, action)
	return nil
}

func (m *mockMemoryRepo) GetReviewActions(ctx context.Context, draftID string) ([]MemoryReviewAction, error) {
	var res []MemoryReviewAction
	for _, a := range m.reviewActions {
		if a.DraftID == draftID {
			res = append(res, *a)
		}
	}
	return res, nil
}

func (m *mockMemoryRepo) GetApprovedMemoryByID(ctx context.Context, id string) (*ApprovedMemory, error) {
	mem, ok := m.approvedMemories[id]
	if !ok {
		return nil, ErrApprovedMemoryNotFound
	}
	return mem, nil
}

func (m *mockMemoryRepo) GetApprovedMemoryByContextID(ctx context.Context, contextID string) (*ApprovedMemory, error) {
	for _, mem := range m.approvedMemories {
		if mem.ContextID == contextID {
			return mem, nil
		}
	}
	return nil, ErrApprovedMemoryNotFound
}

func (m *mockMemoryRepo) GetApprovedMemoriesByParentID(ctx context.Context, parentID string, limit, offset int) ([]ApprovedMemory, error) {
	var res []ApprovedMemory
	for _, mem := range m.approvedMemories {
		if mem.ParentID == parentID {
			res = append(res, *mem)
		}
	}
	return res, nil
}

func (m *mockMemoryRepo) RecordViewEvent(ctx context.Context, event *MemoryViewEvent) error {
	m.viewEvents = append(m.viewEvents, event)
	return nil
}

func (m *mockMemoryRepo) HasUserViewedMemory(ctx context.Context, memoryID, userID string) (bool, error) {
	for _, v := range m.viewEvents {
		if v.ApprovedMemoryID == memoryID && v.ViewerID == userID {
			return true, nil
		}
	}
	return false, nil
}

// MockGroupAccessChecker
type mockAccessChecker struct {
	roles   map[string]map[string]string // groupID -> userID -> role
	members map[string][]store.GroupMemberItem
}

func newMockAccessChecker() *mockAccessChecker {
	return &mockAccessChecker{
		roles:   make(map[string]map[string]string),
		members: make(map[string][]store.GroupMemberItem),
	}
}

func (m *mockAccessChecker) GetUserRoleInGroup(conversationID, userID string) (string, error) {
	if grpRoles, ok := m.roles[conversationID]; ok {
		if role, okR := grpRoles[userID]; okR {
			return role, nil
		}
	}
	return "", errors.New("not a member")
}

func (m *mockAccessChecker) GetGroupDetails(conversationID, currentUserID string) (*store.GroupDetails, error) {
	return &store.GroupDetails{ID: conversationID, Title: "Grup Diskusi Alpha"}, nil
}

func (m *mockAccessChecker) GetGroupMembers(conversationID string) ([]store.GroupMemberItem, error) {
	return m.members[conversationID], nil
}

// MockNotifier
type mockNotifier struct {
	events []string
}

func (m *mockNotifier) BroadcastGroupSystemEvent(groupID, eventType, content string) {
	m.events = append(m.events, fmt.Sprintf("%s:%s", groupID, eventType))
}
func (m *mockNotifier) NotifyMemoryEvent(userIDs []string, title, body, tag string, data map[string]interface{}) {
	m.events = append(m.events, tag)
}

// -----------------------------------------------------------------------------
// Test Suite
// -----------------------------------------------------------------------------

func TestMemoryService_DraftLifecycle(t *testing.T) {
	repo := newMockMemoryRepo()
	access := newMockAccessChecker()
	notifier := &mockNotifier{}

	groupID := "grp_1"
	forumID := "forum_1"
	adminID := "user_admin"
	memberID := "user_member"
	outsiderID := "user_outsider"

	access.roles[groupID] = map[string]string{
		adminID:  "admin",
		memberID: "member",
	}

	svc := NewMemoryService(repo, nil, nil, access, notifier)
	ctx := context.Background()

	// Seed draft and artifacts
	draftID := "draft_100"
	draft := &MemoryDraft{
		ID:                    draftID,
		JobID:                 "job_100",
		ContextID:             forumID,
		ContextType:           ContextTypeForum,
		ParentID:              groupID,
		Status:                DraftStatusDraft,
		MessageCountProcessed: 10,
		CreatedAt:             time.Now(),
	}
	pos := 1
	artifacts := []MemoryArtifact{
		{
			ID:                "art_sum_1",
			DraftID:           draftID,
			Type:              ArtifactTypeSummary,
			Content:           "Summary awal diskusi.",
			AIOriginalContent: "Summary awal diskusi.",
			Confidence:        ConfidenceHigh,
		},
		{
			ID:                "art_dec_1",
			DraftID:           draftID,
			Type:              ArtifactTypeDecision,
			Content:           "Keputusan implementasi A.",
			AIOriginalContent: "Keputusan implementasi A.",
			Confidence:        ConfidenceHigh,
			Position:          &pos,
			Evidences: []ArtifactEvidence{
				{MessageID: "msg_1", MessagePreview: "Preview pesan 1", MessageSenderName: "Alice"},
			},
		},
		{
			ID:                "art_jrn_1",
			DraftID:           draftID,
			Type:              ArtifactTypeJourneyLite,
			Content:           "Journey lite flow",
			AIOriginalContent: "Journey lite flow",
			Confidence:        ConfidenceMedium,
		},
	}
	_ = repo.CreateDraftWithArtifacts(ctx, draft, artifacts)

	// 1. Test ListDrafts
	t.Run("ListDrafts Admin OK", func(t *testing.T) {
		items, err := svc.ListDrafts(ctx, groupID, "", adminID)
		if err != nil {
			t.Fatalf("ListDrafts failed: %v", err)
		}
		if len(items) != 1 {
			t.Fatalf("expected 1 draft, got %d", len(items))
		}
		if items[0].DraftID != draftID {
			t.Errorf("expected draft ID %s, got %s", draftID, items[0].DraftID)
		}
	})

	t.Run("ListDrafts Member Unauthorized", func(t *testing.T) {
		_, err := svc.ListDrafts(ctx, groupID, "", memberID)
		if !errors.Is(err, ErrUnauthorizedAccess) {
			t.Errorf("expected ErrUnauthorizedAccess, got %v", err)
		}
	})

	// 2. Test GetDraftDetail
	t.Run("GetDraftDetail Admin OK", func(t *testing.T) {
		detail, role, err := svc.GetDraftDetail(ctx, draftID, adminID)
		if err != nil {
			t.Fatalf("GetDraftDetail failed: %v", err)
		}
		if role != "admin" {
			t.Errorf("expected role admin, got %s", role)
		}
		if len(detail.Artifacts) != 3 {
			t.Errorf("expected 3 artifacts, got %d", len(detail.Artifacts))
		}
	})

	t.Run("GetDraftDetail Outsider Forbidden", func(t *testing.T) {
		_, _, err := svc.GetDraftDetail(ctx, draftID, outsiderID)
		if !errors.Is(err, ErrUnauthorizedAccess) {
			t.Errorf("expected ErrUnauthorizedAccess, got %v", err)
		}
	})

	// 3. Test UpdateArtifactContent
	t.Run("UpdateArtifactContent", func(t *testing.T) {
		updated, err := svc.UpdateArtifactContent(ctx, draftID, "art_sum_1", "Summary revisi oleh admin.", adminID)
		if err != nil {
			t.Fatalf("UpdateArtifactContent failed: %v", err)
		}
		if updated.Content != "Summary revisi oleh admin." {
			t.Errorf("unexpected content: %s", updated.Content)
		}
		if !updated.IsHumanEdited {
			t.Errorf("expected IsHumanEdited=true")
		}
		if len(repo.reviewActions) == 0 {
			t.Errorf("expected review action recorded")
		}
	})

	// 4. Test RemoveJourneyLite
	t.Run("RemoveJourneyLite", func(t *testing.T) {
		err := svc.RemoveJourneyLite(ctx, draftID, adminID)
		if err != nil {
			t.Fatalf("RemoveJourneyLite failed: %v", err)
		}
		art, _ := repo.GetArtifactByID(ctx, "art_jrn_1")
		if !art.IsRemoved {
			t.Errorf("expected journey lite IsRemoved=true")
		}
	})

	// 5. Test ApproveDraft
	var approvedMemID string
	t.Run("ApproveDraft", func(t *testing.T) {
		approvedMem, err := svc.ApproveDraft(ctx, draftID, adminID, false)
		if err != nil {
			t.Fatalf("ApproveDraft failed: %v", err)
		}
		if approvedMem.SnapshotSummary != "Summary revisi oleh admin." {
			t.Errorf("unexpected snapshot summary: %s", approvedMem.SnapshotSummary)
		}
		if !approvedMem.HasHumanEdits {
			t.Errorf("expected HasHumanEdits=true")
		}
		if !approvedMem.IsJourneyLiteRemoved {
			t.Errorf("expected IsJourneyLiteRemoved=true")
		}
		if len(approvedMem.DecisionsList) != 1 {
			t.Fatalf("expected 1 decision in list, got %d", len(approvedMem.DecisionsList))
		}
		approvedMemID = approvedMem.ID

		// Pastikan draft berstatus APPROVED
		d, _ := repo.GetDraftByID(ctx, draftID)
		if d.Status != DraftStatusApproved {
			t.Errorf("expected draft status APPROVED, got %s", d.Status)
		}

		// Re-approve harus error
		_, errReapprove := svc.ApproveDraft(ctx, draftID, adminID, false)
		if !errors.Is(errReapprove, ErrDraftAlreadyReviewed) {
			t.Errorf("expected ErrDraftAlreadyReviewed on duplicate approve, got %v", errReapprove)
		}
	})

	// 6. Test GetGroupMemories (Member Viewer)
	t.Run("GetGroupMemories Member OK", func(t *testing.T) {
		list, err := svc.GetGroupMemories(ctx, groupID, memberID, 10, 0)
		if err != nil {
			t.Fatalf("GetGroupMemories failed: %v", err)
		}
		if len(list) != 1 {
			t.Fatalf("expected 1 memory, got %d", len(list))
		}
		if list[0].ID != approvedMemID {
			t.Errorf("expected memory ID %s, got %s", approvedMemID, list[0].ID)
		}
	})

	// 7. Test GetApprovedMemoryDetail
	t.Run("GetApprovedMemoryDetail Member OK and ViewEvent Recorded", func(t *testing.T) {
		memDetail, err := svc.GetApprovedMemoryDetail(ctx, approvedMemID, memberID)
		if err != nil {
			t.Fatalf("GetApprovedMemoryDetail failed: %v", err)
		}
		if memDetail.ID != approvedMemID {
			t.Errorf("expected memory ID %s, got %s", approvedMemID, memDetail.ID)
		}
		if len(repo.viewEvents) != 1 {
			t.Fatalf("expected 1 view event, got %d", len(repo.viewEvents))
		}
		if repo.viewEvents[0].ViewerID != memberID {
			t.Errorf("expected viewerID %s, got %s", memberID, repo.viewEvents[0].ViewerID)
		}
	})

	t.Run("GetApprovedMemoryDetail Outsider Forbidden", func(t *testing.T) {
		_, err := svc.GetApprovedMemoryDetail(ctx, approvedMemID, outsiderID)
		if !errors.Is(err, ErrUnauthorizedAccess) {
			t.Errorf("expected ErrUnauthorizedAccess, got %v", err)
		}
	})

	// 8. Test RejectDraft on new draft
	t.Run("RejectDraft", func(t *testing.T) {
		draft2 := &MemoryDraft{
			ID:          "draft_200",
			ContextID:   "forum_2",
			ContextType: ContextTypeForum,
			ParentID:    groupID,
			Status:      DraftStatusDraft,
		}
		_ = repo.CreateDraftWithArtifacts(ctx, draft2, nil)

		err := svc.RejectDraft(ctx, "draft_200", adminID, "Diskusi tidak relevan")
		if err != nil {
			t.Fatalf("RejectDraft failed: %v", err)
		}
		d2, _ := repo.GetDraftByID(ctx, "draft_200")
		if d2.Status != DraftStatusRejected {
			t.Errorf("expected status REJECTED, got %s", d2.Status)
		}
		if d2.RejectionReason != "Diskusi tidak relevan" {
			t.Errorf("unexpected reason: %s", d2.RejectionReason)
		}
	})
}
