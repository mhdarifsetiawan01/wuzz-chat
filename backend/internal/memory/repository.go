package memory

import (
	"context"
	"errors"
	"time"
)

var (
	ErrJobNotFound            = errors.New("memory job tidak ditemukan")
	ErrDraftNotFound          = errors.New("memory draft tidak ditemukan")
	ErrArtifactNotFound       = errors.New("memory artifact tidak ditemukan")
	ErrApprovedMemoryNotFound = errors.New("approved memory tidak ditemukan")
	ErrJobAlreadyExists       = errors.New("konteks ini sudah memiliki memory job")
	ErrDraftAlreadyReviewed   = errors.New("draft sudah pernah divalidasi")
	ErrUnauthorizedAccess     = errors.New("tidak memiliki hak akses ke memori ini")
)

// MemoryRepository mendefinisikan kontrak persistensi domain untuk seluruh operasi Memory Engine.
type MemoryRepository interface {
	// Job Management (Antrean & Worker)
	CreateJob(ctx context.Context, contextID, parentID string) (*MemoryJob, error)
	GetJobByID(ctx context.Context, id string) (*MemoryJob, error)
	GetJobByContextID(ctx context.Context, contextID string) (*MemoryJob, error)
	GetPendingJobs(ctx context.Context, limit int) ([]MemoryJob, error)
	ClaimJob(ctx context.Context, jobID string) (*MemoryJob, error)
	CompleteJob(ctx context.Context, jobID string, msgCount int) error
	FailJob(ctx context.Context, jobID, lastError string, isTerminal bool, nextRetry *time.Time) error

	// Draft & Artifact Management
	CreateDraftWithArtifacts(ctx context.Context, draft *MemoryDraft, artifacts []MemoryArtifact) error
	GetDraftByID(ctx context.Context, id string) (*MemoryDraft, error)
	GetDraftByContextID(ctx context.Context, contextID string) (*MemoryDraft, error)
	GetDraftsByParentID(ctx context.Context, parentID string, status string) ([]MemoryDraft, error)
	GetArtifactsByDraftID(ctx context.Context, draftID string) ([]MemoryArtifact, error)
	GetArtifactByID(ctx context.Context, id string) (*MemoryArtifact, error)
	UpdateArtifact(ctx context.Context, artifactID string, content string, isHumanEdited bool) error
	RemoveJourneyLite(ctx context.Context, draftID string) error

	// Review & Validation Actions
	ApproveDraft(ctx context.Context, draftID, adminID string, approvedMemory *ApprovedMemory, reviewAction *MemoryReviewAction) error
	RejectDraft(ctx context.Context, draftID, adminID, reason string) error
	RecordReviewAction(ctx context.Context, action *MemoryReviewAction) error
	GetReviewActions(ctx context.Context, draftID string) ([]MemoryReviewAction, error)

	// Approved Memory & Analytics
	GetApprovedMemoryByID(ctx context.Context, id string) (*ApprovedMemory, error)
	GetApprovedMemoryByContextID(ctx context.Context, contextID string) (*ApprovedMemory, error)
	GetApprovedMemoriesByParentID(ctx context.Context, parentID string, limit, offset int) ([]ApprovedMemory, error)
	RecordViewEvent(ctx context.Context, event *MemoryViewEvent) error
	HasUserViewedMemory(ctx context.Context, memoryID, userID string) (bool, error)
}
