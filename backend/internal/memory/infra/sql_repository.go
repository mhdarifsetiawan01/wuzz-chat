// Package infra menyediakan implementasi infrastruktur data untuk domain memory.
// Menggunakan Strangler Fig Adapter membungkus store.MemoryStore.
package infra

import (
	"context"
	"errors"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/memory"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// SQLMemoryRepository mengimplementasikan memory.MemoryRepository.
type SQLMemoryRepository struct {
	store store.MemoryStore
}

// NewSQLMemoryRepository membuat instance baru SQLMemoryRepository.
func NewSQLMemoryRepository(ms store.MemoryStore) *SQLMemoryRepository {
	return &SQLMemoryRepository{store: ms}
}

// Ensure interface compliance at compile time.
var _ memory.MemoryRepository = (*SQLMemoryRepository)(nil)

func (r *SQLMemoryRepository) CreateJob(ctx context.Context, contextID, parentID string) (*memory.MemoryJob, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	sj, err := r.store.CreateJob(ctx, contextID, parentID)
	if err != nil {
		return nil, err
	}
	return memory.ToDomainJob(sj), nil
}

func (r *SQLMemoryRepository) GetJobByID(ctx context.Context, id string) (*memory.MemoryJob, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	sj, err := r.store.GetJobByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return memory.ToDomainJob(sj), nil
}

func (r *SQLMemoryRepository) GetJobByContextID(ctx context.Context, contextID string) (*memory.MemoryJob, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	sj, err := r.store.GetJobByForumID(ctx, contextID)
	if err != nil {
		return nil, err
	}
	return memory.ToDomainJob(sj), nil
}

func (r *SQLMemoryRepository) GetPendingJobs(ctx context.Context, limit int) ([]memory.MemoryJob, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	jobs, err := r.store.GetPendingJobs(ctx, limit)
	if err != nil {
		return nil, err
	}
	result := make([]memory.MemoryJob, len(jobs))
	for i := range jobs {
		result[i] = *memory.ToDomainJob(&jobs[i])
	}
	return result, nil
}

func (r *SQLMemoryRepository) ClaimJob(ctx context.Context, jobID string) (*memory.MemoryJob, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	sj, err := r.store.ClaimJob(ctx, jobID)
	if err != nil {
		return nil, err
	}
	return memory.ToDomainJob(sj), nil
}

func (r *SQLMemoryRepository) CompleteJob(ctx context.Context, jobID string, msgCount int) error {
	if r.store == nil {
		return errors.New("memory store belum diinisialisasi")
	}
	return r.store.CompleteJob(ctx, jobID, msgCount)
}

func (r *SQLMemoryRepository) FailJob(ctx context.Context, jobID, lastError string, isTerminal bool, nextRetry *time.Time) error {
	if r.store == nil {
		return errors.New("memory store belum diinisialisasi")
	}
	return r.store.FailJob(ctx, jobID, lastError, isTerminal, nextRetry)
}

func (r *SQLMemoryRepository) CreateDraftWithArtifacts(ctx context.Context, draft *memory.MemoryDraft, artifacts []memory.MemoryArtifact) error {
	if r.store == nil {
		return errors.New("memory store belum diinisialisasi")
	}
	sDraft := memory.ToStoreDraft(draft)
	sArts := make([]store.MemoryArtifact, len(artifacts))
	for i := range artifacts {
		sArts[i] = memory.ToStoreArtifact(&artifacts[i])
	}
	return r.store.CreateDraftWithArtifacts(ctx, sDraft, sArts)
}

func (r *SQLMemoryRepository) GetDraftByID(ctx context.Context, id string) (*memory.MemoryDraft, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	sd, err := r.store.GetDraftByID(ctx, id)
	if err != nil {
		if errors.Is(err, store.ErrDraftNotFound) {
			return nil, memory.ErrDraftNotFound
		}
		return nil, err
	}
	return memory.ToDomainDraft(sd), nil
}

func (r *SQLMemoryRepository) GetDraftByContextID(ctx context.Context, contextID string) (*memory.MemoryDraft, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	sd, err := r.store.GetDraftByForumID(ctx, contextID)
	if err != nil {
		return nil, err
	}
	return memory.ToDomainDraft(sd), nil
}

func (r *SQLMemoryRepository) GetDraftsByParentID(ctx context.Context, parentID string, status string) ([]memory.MemoryDraft, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	drafts, err := r.store.GetDraftsByGroupID(ctx, parentID, status)
	if err != nil {
		return nil, err
	}
	result := make([]memory.MemoryDraft, len(drafts))
	for i := range drafts {
		result[i] = *memory.ToDomainDraft(&drafts[i])
	}
	return result, nil
}

func (r *SQLMemoryRepository) GetArtifactsByDraftID(ctx context.Context, draftID string) ([]memory.MemoryArtifact, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	arts, err := r.store.GetArtifactsByDraftID(ctx, draftID)
	if err != nil {
		return nil, err
	}
	result := make([]memory.MemoryArtifact, len(arts))
	for i := range arts {
		result[i] = memory.ToDomainArtifact(&arts[i])
	}
	return result, nil
}

func (r *SQLMemoryRepository) GetArtifactByID(ctx context.Context, id string) (*memory.MemoryArtifact, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	sa, err := r.store.GetArtifactByID(ctx, id)
	if err != nil {
		if errors.Is(err, store.ErrArtifactNotFound) {
			return nil, memory.ErrArtifactNotFound
		}
		return nil, err
	}
	art := memory.ToDomainArtifact(sa)
	return &art, nil
}

func (r *SQLMemoryRepository) UpdateArtifact(ctx context.Context, artifactID string, content string, isHumanEdited bool) error {
	if r.store == nil {
		return errors.New("memory store belum diinisialisasi")
	}
	return r.store.UpdateArtifact(ctx, artifactID, content, isHumanEdited)
}

func (r *SQLMemoryRepository) RemoveJourneyLite(ctx context.Context, draftID string) error {
	if r.store == nil {
		return errors.New("memory store belum diinisialisasi")
	}
	return r.store.RemoveJourneyLite(ctx, draftID)
}

func (r *SQLMemoryRepository) ApproveDraft(ctx context.Context, draftID, adminID string, approvedMemory *memory.ApprovedMemory, reviewAction *memory.MemoryReviewAction) error {
	if r.store == nil {
		return errors.New("memory store belum diinisialisasi")
	}
	sApproved := memory.ToStoreApprovedMemory(approvedMemory)
	var sAction *store.MemoryReviewAction
	if reviewAction != nil {
		sAction = &store.MemoryReviewAction{
			ID:              reviewAction.ID,
			DraftID:         reviewAction.DraftID,
			AdminID:         reviewAction.AdminID,
			Action:          reviewAction.Action,
			ArtifactID:      reviewAction.ArtifactID,
			OldContent:      reviewAction.OldContent,
			NewContent:      reviewAction.NewContent,
			RejectionReason: reviewAction.RejectionReason,
			CreatedAt:       reviewAction.CreatedAt,
		}
	}
	return r.store.ApproveDraft(ctx, draftID, adminID, sApproved, sAction)
}

func (r *SQLMemoryRepository) RejectDraft(ctx context.Context, draftID, adminID, reason string) error {
	if r.store == nil {
		return errors.New("memory store belum diinisialisasi")
	}
	return r.store.RejectDraft(ctx, draftID, adminID, reason)
}

func (r *SQLMemoryRepository) RecordReviewAction(ctx context.Context, action *memory.MemoryReviewAction) error {
	if r.store == nil {
		return errors.New("memory store belum diinisialisasi")
	}
	if action == nil {
		return nil
	}
	sAction := &store.MemoryReviewAction{
		ID:              action.ID,
		DraftID:         action.DraftID,
		AdminID:         action.AdminID,
		Action:          action.Action,
		ArtifactID:      action.ArtifactID,
		OldContent:      action.OldContent,
		NewContent:      action.NewContent,
		RejectionReason: action.RejectionReason,
		CreatedAt:       action.CreatedAt,
	}
	return r.store.RecordReviewAction(ctx, sAction)
}

func (r *SQLMemoryRepository) GetReviewActions(ctx context.Context, draftID string) ([]memory.MemoryReviewAction, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	actions, err := r.store.GetReviewActions(ctx, draftID)
	if err != nil {
		return nil, err
	}
	result := make([]memory.MemoryReviewAction, len(actions))
	for i, a := range actions {
		result[i] = memory.MemoryReviewAction{
			ID:              a.ID,
			DraftID:         a.DraftID,
			AdminID:         a.AdminID,
			Action:          a.Action,
			ArtifactID:      a.ArtifactID,
			OldContent:      a.OldContent,
			NewContent:      a.NewContent,
			RejectionReason: a.RejectionReason,
			CreatedAt:       a.CreatedAt,
		}
	}
	return result, nil
}

func (r *SQLMemoryRepository) GetApprovedMemoryByID(ctx context.Context, id string) (*memory.ApprovedMemory, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	sm, err := r.store.GetApprovedMemoryByID(ctx, id)
	if err != nil {
		if errors.Is(err, store.ErrApprovedMemoryNotFound) {
			return nil, memory.ErrApprovedMemoryNotFound
		}
		return nil, err
	}
	return memory.ToDomainApprovedMemory(sm), nil
}

func (r *SQLMemoryRepository) GetApprovedMemoryByContextID(ctx context.Context, contextID string) (*memory.ApprovedMemory, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	sm, err := r.store.GetApprovedMemoryByForumID(ctx, contextID)
	if err != nil {
		return nil, err
	}
	return memory.ToDomainApprovedMemory(sm), nil
}

func (r *SQLMemoryRepository) GetApprovedMemoriesByParentID(ctx context.Context, parentID string, limit, offset int) ([]memory.ApprovedMemory, error) {
	if r.store == nil {
		return nil, errors.New("memory store belum diinisialisasi")
	}
	memories, err := r.store.GetApprovedMemoriesByGroupID(ctx, parentID, limit, offset)
	if err != nil {
		return nil, err
	}
	result := make([]memory.ApprovedMemory, len(memories))
	for i := range memories {
		result[i] = *memory.ToDomainApprovedMemory(&memories[i])
	}
	return result, nil
}

func (r *SQLMemoryRepository) RecordViewEvent(ctx context.Context, event *memory.MemoryViewEvent) error {
	if r.store == nil {
		return errors.New("memory store belum diinisialisasi")
	}
	if event == nil {
		return nil
	}
	sEvent := &store.MemoryViewEvent{
		ID:               event.ID,
		ApprovedMemoryID: event.ApprovedMemoryID,
		ForumID:          event.ContextID,
		GroupID:          event.ParentID,
		ViewerID:         event.ViewerID,
		ViewerRole:       event.ViewerRole,
		CreatedAt:        event.CreatedAt,
	}
	return r.store.RecordViewEvent(ctx, sEvent)
}

func (r *SQLMemoryRepository) HasUserViewedMemory(ctx context.Context, memoryID, userID string) (bool, error) {
	if r.store == nil {
		return false, errors.New("memory store belum diinisialisasi")
	}
	return r.store.HasUserViewedMemory(ctx, memoryID, userID)
}
