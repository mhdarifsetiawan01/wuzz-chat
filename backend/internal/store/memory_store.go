package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
)

var (
	ErrJobNotFound            = errors.New("memory job tidak ditemukan")
	ErrDraftNotFound          = errors.New("memory draft tidak ditemukan")
	ErrArtifactNotFound       = errors.New("memory artifact tidak ditemukan")
	ErrApprovedMemoryNotFound = errors.New("approved memory tidak ditemukan")
	ErrJobAlreadyExists       = errors.New("forum ini sudah memiliki memory job")
	ErrDraftAlreadyReviewed   = errors.New("draft sudah pernah divalidasi")
)

// Status & Tipe Konstanta Group Memory AI
const (
	JobStatusQueued     = "QUEUED"
	JobStatusProcessing = "PROCESSING"
	JobStatusCompleted  = "COMPLETED"
	JobStatusFailed     = "FAILED"

	DraftStatusDraft    = "DRAFT"
	DraftStatusApproved = "APPROVED"
	DraftStatusRejected = "REJECTED"

	ArtifactTypeSummary     = "SUMMARY"
	ArtifactTypeDecision    = "DECISION"
	ArtifactTypeJourneyLite = "JOURNEY_LITE"

	ConfidenceHigh   = "HIGH"
	ConfidenceMedium = "MEDIUM"
	ConfidenceLow    = "LOW"

	ActionApproved           = "APPROVED"
	ActionRejected           = "REJECTED"
	ActionEditedSummary      = "EDITED_SUMMARY"
	ActionEditedDecision     = "EDITED_DECISION"
	ActionRemovedJourneyLite = "REMOVED_JOURNEY_LITE"
	ActionApprovedWithEdits  = "APPROVED_WITH_EDITS"

	ViewerRoleAdmin  = "ADMIN"
	ViewerRoleMember = "MEMBER"
)

// ForumMemoryJob merepresentasikan antrean pemrosesan AI untuk sebuah forum yang kedaluwarsa.
type ForumMemoryJob struct {
	ID             string     `json:"id"`
	ForumID        string     `json:"forum_id"`
	GroupID        string     `json:"group_id"`
	Status         string     `json:"status"` // QUEUED, PROCESSING, COMPLETED, FAILED
	AttemptCount   int        `json:"attempt_count"`
	MaxAttempts    int        `json:"max_attempts"`
	IsTerminalFail bool       `json:"is_terminal_fail"`
	LastError      string     `json:"last_error,omitempty"`
	MessageCount   int        `json:"message_count"`
	CreatedAt      time.Time  `json:"created_at"`
	StartedAt      *time.Time `json:"started_at,omitempty"`
	CompletedAt    *time.Time `json:"completed_at,omitempty"`
	NextRetryAt    *time.Time `json:"next_retry_at,omitempty"`
}

// MemoryDraft merepresentasikan kontainer draft keluaran AI yang menunggu tinjauan admin.
type MemoryDraft struct {
	ID                    string           `json:"id"`
	JobID                 string           `json:"job_id"`
	ForumID               string           `json:"forum_id"`
	GroupID               string           `json:"group_id"`
	Status                string           `json:"status"` // DRAFT, APPROVED, REJECTED
	MessageCountProcessed int              `json:"message_count_processed"`
	WasTruncated          bool             `json:"was_truncated"`
	TruncationNote        string           `json:"truncation_note,omitempty"`
	ReviewedAt            *time.Time       `json:"reviewed_at,omitempty"`
	ReviewedBy            string           `json:"reviewed_by,omitempty"`
	RejectionReason       string           `json:"rejection_reason,omitempty"`
	CreatedAt             time.Time        `json:"created_at"`
	Artifacts             []MemoryArtifact `json:"artifacts,omitempty"`
}

// MemoryArtifact merepresentasikan satu butir artefak hasil ekstraksi (Summary, Decision, atau Journey Lite).
type MemoryArtifact struct {
	ID                string             `json:"id"`
	DraftID           string             `json:"draft_id"`
	Type              string             `json:"type"` // SUMMARY, DECISION, JOURNEY_LITE
	Content           string             `json:"content"`
	AIOriginalContent string             `json:"ai_original_content"`
	Confidence        string             `json:"confidence"` // HIGH, MEDIUM, LOW
	IsHumanEdited     bool               `json:"is_human_edited"`
	IsRemoved         bool               `json:"is_removed"`
	Position          *int               `json:"position,omitempty"`
	CreatedAt         time.Time          `json:"created_at"`
	UpdatedAt         time.Time          `json:"updated_at"`
	Evidences         []ArtifactEvidence `json:"evidences,omitempty"`
}

// ArtifactEvidence merepresentasikan bukti kutipan pesan asli pendukung keputusan.
type ArtifactEvidence struct {
	ID                string    `json:"id"`
	ArtifactID        string    `json:"artifact_id"`
	MessageID         string    `json:"message_id"`
	MessagePreview    string    `json:"message_preview"`
	MessageSenderName string    `json:"message_sender_name"`
	MessageSentAt     time.Time `json:"message_sent_at"`
	CreatedAt         time.Time `json:"created_at"`
}

// ApprovedEvidenceItem adalah format serialisasi evidence di dalam JSONB ApprovedDecisionItem.
type ApprovedEvidenceItem struct {
	MessageID  string    `json:"message_id"`
	Preview    string    `json:"preview"`
	SenderName string    `json:"sender_name"`
	SentAt     time.Time `json:"sent_at"`
}

// ApprovedDecisionItem adalah butir keputusan terstruktur di dalam JSONB ApprovedMemory.
type ApprovedDecisionItem struct {
	Position      int                    `json:"position"`
	Text          string                 `json:"text"`
	Confidence    string                 `json:"confidence"`
	IsHumanEdited bool                   `json:"is_human_edited"`
	Evidences     []ApprovedEvidenceItem `json:"evidences"`
}

// ApprovedMemory adalah read-model terdenormalisasi yang siap dikonsumsi langsung oleh anggota grup.
type ApprovedMemory struct {
	ID                   string                 `json:"id"`
	DraftID              string                 `json:"draft_id"`
	ForumID              string                 `json:"forum_id"`
	GroupID              string                 `json:"group_id"`
	ApprovedBy           string                 `json:"approved_by"`
	ApprovedAt           time.Time              `json:"approved_at"`
	HasHumanEdits        bool                   `json:"has_human_edits"`
	SnapshotSummary      string                 `json:"snapshot_summary"`
	SnapshotSummaryConf  string                 `json:"snapshot_summary_conf"`
	SnapshotDecisions    string                 `json:"snapshot_decisions"` // Raw JSON string
	DecisionsList        []ApprovedDecisionItem `json:"decisions_list,omitempty"`
	SnapshotJourneyLite  string                 `json:"snapshot_journey_lite,omitempty"`
	SnapshotJourneyConf  string                 `json:"snapshot_journey_conf,omitempty"`
	IsJourneyLiteRemoved bool                   `json:"is_journey_lite_removed"`
	CreatedAt            time.Time              `json:"created_at"`
}

// MemoryReviewAction adalah audit log append-only merekam tindakan admin saat validasi draft.
type MemoryReviewAction struct {
	ID              string    `json:"id"`
	DraftID         string    `json:"draft_id"`
	AdminID         string    `json:"admin_id"`
	Action          string    `json:"action"` // APPROVED, REJECTED, EDITED_SUMMARY, EDITED_DECISION, REMOVED_JOURNEY_LITE, APPROVED_WITH_EDITS
	ArtifactID      string    `json:"artifact_id,omitempty"`
	OldContent      string    `json:"old_content,omitempty"`
	NewContent      string    `json:"new_content,omitempty"`
	RejectionReason string    `json:"rejection_reason,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// MemoryViewEvent mencatat event pembacaan memori grup oleh admin dan anggota.
type MemoryViewEvent struct {
	ID               string    `json:"id"`
	ApprovedMemoryID string    `json:"approved_memory_id"`
	ForumID          string    `json:"forum_id"`
	GroupID          string    `json:"group_id"`
	ViewerID         string    `json:"viewer_id"`
	ViewerRole       string    `json:"viewer_role"` // ADMIN, MEMBER
	CreatedAt        time.Time `json:"created_at"`
}

// MemoryStore mendefinisikan operasi penyimpanan & kueri untuk modul Group Memory AI.
type MemoryStore interface {
	// Job Management (M2 Queue & Worker)
	CreateJob(ctx context.Context, forumID, groupID string) (*ForumMemoryJob, error)
	GetJobByID(ctx context.Context, id string) (*ForumMemoryJob, error)
	GetJobByForumID(ctx context.Context, forumID string) (*ForumMemoryJob, error)
	GetPendingJobs(ctx context.Context, limit int) ([]ForumMemoryJob, error)
	ClaimJob(ctx context.Context, jobID string) (*ForumMemoryJob, error)
	CompleteJob(ctx context.Context, jobID string, msgCount int) error
	FailJob(ctx context.Context, jobID, lastError string, isTerminal bool, nextRetry *time.Time) error

	// Draft & Artifact Management (M3 AI & M4 Review)
	CreateDraftWithArtifacts(ctx context.Context, draft *MemoryDraft, artifacts []MemoryArtifact) error
	GetDraftByID(ctx context.Context, id string) (*MemoryDraft, error)
	GetDraftByForumID(ctx context.Context, forumID string) (*MemoryDraft, error)
	GetDraftsByGroupID(ctx context.Context, groupID string, status string) ([]MemoryDraft, error)
	GetArtifactsByDraftID(ctx context.Context, draftID string) ([]MemoryArtifact, error)
	GetArtifactByID(ctx context.Context, id string) (*MemoryArtifact, error)
	UpdateArtifact(ctx context.Context, artifactID string, content string, isHumanEdited bool) error
	RemoveJourneyLite(ctx context.Context, draftID string) error

	// Review & Publication Actions (M4 & M7)
	ApproveDraft(ctx context.Context, draftID, adminID string, approvedMemory *ApprovedMemory, reviewAction *MemoryReviewAction) error
	RejectDraft(ctx context.Context, draftID, adminID, reason string) error
	RecordReviewAction(ctx context.Context, action *MemoryReviewAction) error
	GetReviewActions(ctx context.Context, draftID string) ([]MemoryReviewAction, error)

	// Approved Memory & Analytics (M6 Member Viewer)
	GetApprovedMemoryByID(ctx context.Context, id string) (*ApprovedMemory, error)
	GetApprovedMemoryByForumID(ctx context.Context, forumID string) (*ApprovedMemory, error)
	GetApprovedMemoriesByGroupID(ctx context.Context, groupID string, limit, offset int) ([]ApprovedMemory, error)
	RecordViewEvent(ctx context.Context, event *MemoryViewEvent) error
	HasUserViewedMemory(ctx context.Context, memoryID, userID string) (bool, error)
}

// SQLMemoryStore mengimplementasikan MemoryStore untuk PostgreSQL dan SQLite.
type SQLMemoryStore struct {
	db         *sql.DB
	driverName string
}

// NewSQLMemoryStore membuat instansiasi SQLMemoryStore baru.
func NewSQLMemoryStore(db *sql.DB, driverName string) *SQLMemoryStore {
	return &SQLMemoryStore{
		db:         db,
		driverName: driverName,
	}
}

// -----------------------------------------------------------------------------
// Job Queue Methods
// -----------------------------------------------------------------------------

func (s *SQLMemoryStore) CreateJob(ctx context.Context, forumID, groupID string) (*ForumMemoryJob, error) {
	maxAttempts := 3
	if envMax := strings.TrimSpace(os.Getenv("MEMORY_JOB_MAX_ATTEMPTS")); envMax != "" {
		if val, err := strconv.Atoi(envMax); err == nil && val > 0 {
			maxAttempts = val
		}
	}

	job := &ForumMemoryJob{
		ID:             uuid.New().String(),
		ForumID:        forumID,
		GroupID:        groupID,
		Status:         JobStatusQueued,
		AttemptCount:   0,
		MaxAttempts:    maxAttempts,
		IsTerminalFail: false,
		LastError:      "",
		MessageCount:   0,
		CreatedAt:      time.Now().UTC(),
	}

	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	if tenantID == "default" && forumID != "" {
		var convTenant string
		var checkConvQuery string
		if s.driverName == "postgres" {
			checkConvQuery = `SELECT COALESCE(tenant_id, 'default') FROM conversations WHERE id = $1`
		} else {
			checkConvQuery = `SELECT COALESCE(tenant_id, 'default') FROM conversations WHERE id = ?`
		}
		if err := s.db.QueryRowContext(ctx, checkConvQuery, forumID).Scan(&convTenant); err == nil && convTenant != "" {
			tenantID = convTenant
		}
	}

	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO forum_memory_jobs (
			id, forum_id, group_id, status, attempt_count, max_attempts,
			is_terminal_fail, last_error, message_count, created_at, tenant_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`
	} else {
		query = `INSERT INTO forum_memory_jobs (
			id, forum_id, group_id, status, attempt_count, max_attempts,
			is_terminal_fail, last_error, message_count, created_at, tenant_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	}

	_, err := s.db.ExecContext(ctx, query,
		job.ID, job.ForumID, job.GroupID, job.Status, job.AttemptCount, job.MaxAttempts,
		job.IsTerminalFail, job.LastError, job.MessageCount, job.CreatedAt, tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("gagal membuat memory job: %w", err)
	}

	return job, nil
}

func (s *SQLMemoryStore) GetJobByID(ctx context.Context, id string) (*ForumMemoryJob, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, forum_id, group_id, status, attempt_count, max_attempts,
			is_terminal_fail, last_error, message_count, created_at, started_at, completed_at, next_retry_at
			FROM forum_memory_jobs WHERE id = $1`
	} else {
		query = `SELECT id, forum_id, group_id, status, attempt_count, max_attempts,
			is_terminal_fail, last_error, message_count, created_at, started_at, completed_at, next_retry_at
			FROM forum_memory_jobs WHERE id = ?`
	}

	job := &ForumMemoryJob{}
	var lastErr sql.NullString
	var startedAt, completedAt, nextRetryAt sql.NullTime

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&job.ID, &job.ForumID, &job.GroupID, &job.Status, &job.AttemptCount, &job.MaxAttempts,
		&job.IsTerminalFail, &lastErr, &job.MessageCount, &job.CreatedAt,
		&startedAt, &completedAt, &nextRetryAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrJobNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil memory job by id: %w", err)
	}

	if lastErr.Valid {
		job.LastError = lastErr.String
	}
	if startedAt.Valid {
		t := startedAt.Time
		job.StartedAt = &t
	}
	if completedAt.Valid {
		t := completedAt.Time
		job.CompletedAt = &t
	}
	if nextRetryAt.Valid {
		t := nextRetryAt.Time
		job.NextRetryAt = &t
	}

	return job, nil
}

func (s *SQLMemoryStore) GetJobByForumID(ctx context.Context, forumID string) (*ForumMemoryJob, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, forum_id, group_id, status, attempt_count, max_attempts,
			is_terminal_fail, last_error, message_count, created_at, started_at, completed_at, next_retry_at
			FROM forum_memory_jobs WHERE forum_id = $1`
	} else {
		query = `SELECT id, forum_id, group_id, status, attempt_count, max_attempts,
			is_terminal_fail, last_error, message_count, created_at, started_at, completed_at, next_retry_at
			FROM forum_memory_jobs WHERE forum_id = ?`
	}

	job := &ForumMemoryJob{}
	var lastErr sql.NullString
	var startedAt, completedAt, nextRetryAt sql.NullTime

	err := s.db.QueryRowContext(ctx, query, forumID).Scan(
		&job.ID, &job.ForumID, &job.GroupID, &job.Status, &job.AttemptCount, &job.MaxAttempts,
		&job.IsTerminalFail, &lastErr, &job.MessageCount, &job.CreatedAt,
		&startedAt, &completedAt, &nextRetryAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrJobNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil memory job by forum_id: %w", err)
	}

	if lastErr.Valid {
		job.LastError = lastErr.String
	}
	if startedAt.Valid {
		t := startedAt.Time
		job.StartedAt = &t
	}
	if completedAt.Valid {
		t := completedAt.Time
		job.CompletedAt = &t
	}
	if nextRetryAt.Valid {
		t := nextRetryAt.Time
		job.NextRetryAt = &t
	}

	return job, nil
}

func (s *SQLMemoryStore) GetPendingJobs(ctx context.Context, limit int) ([]ForumMemoryJob, error) {
	if limit <= 0 {
		limit = 10
	}

	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, forum_id, group_id, status, attempt_count, max_attempts,
			is_terminal_fail, last_error, message_count, created_at, started_at, completed_at, next_retry_at
			FROM forum_memory_jobs
			WHERE status = 'QUEUED' AND (next_retry_at IS NULL OR next_retry_at <= $1)
			ORDER BY created_at ASC
			LIMIT $2`
	} else {
		query = `SELECT id, forum_id, group_id, status, attempt_count, max_attempts,
			is_terminal_fail, last_error, message_count, created_at, started_at, completed_at, next_retry_at
			FROM forum_memory_jobs
			WHERE status = 'QUEUED' AND (next_retry_at IS NULL OR next_retry_at <= ?)
			ORDER BY created_at ASC
			LIMIT ?`
	}

	rows, err := s.db.QueryContext(ctx, query, now, limit)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil pending memory jobs: %w", err)
	}
	defer rows.Close()

	var jobs []ForumMemoryJob
	for rows.Next() {
		var job ForumMemoryJob
		var lastErr sql.NullString
		var startedAt, completedAt, nextRetryAt sql.NullTime

		if err := rows.Scan(
			&job.ID, &job.ForumID, &job.GroupID, &job.Status, &job.AttemptCount, &job.MaxAttempts,
			&job.IsTerminalFail, &lastErr, &job.MessageCount, &job.CreatedAt,
			&startedAt, &completedAt, &nextRetryAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan pending memory job: %w", err)
		}

		if lastErr.Valid {
			job.LastError = lastErr.String
		}
		if startedAt.Valid {
			t := startedAt.Time
			job.StartedAt = &t
		}
		if completedAt.Valid {
			t := completedAt.Time
			job.CompletedAt = &t
		}
		if nextRetryAt.Valid {
			t := nextRetryAt.Time
			job.NextRetryAt = &t
		}

		jobs = append(jobs, job)
	}

	return jobs, nil
}

func (s *SQLMemoryStore) ClaimJob(ctx context.Context, jobID string) (*ForumMemoryJob, error) {
	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE forum_memory_jobs
			SET status = 'PROCESSING', started_at = $1, attempt_count = attempt_count + 1
			WHERE id = $2 AND status = 'QUEUED'
			RETURNING id, forum_id, group_id, status, attempt_count, max_attempts,
				is_terminal_fail, last_error, message_count, created_at, started_at, completed_at, next_retry_at`
		job := &ForumMemoryJob{}
		var lastErr sql.NullString
		var startedAt, completedAt, nextRetryAt sql.NullTime

		err := s.db.QueryRowContext(ctx, query, now, jobID).Scan(
			&job.ID, &job.ForumID, &job.GroupID, &job.Status, &job.AttemptCount, &job.MaxAttempts,
			&job.IsTerminalFail, &lastErr, &job.MessageCount, &job.CreatedAt,
			&startedAt, &completedAt, &nextRetryAt,
		)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrJobNotFound
		}
		if err != nil {
			return nil, fmt.Errorf("gagal klaim job: %w", err)
		}
		if lastErr.Valid {
			job.LastError = lastErr.String
		}
		if startedAt.Valid {
			t := startedAt.Time
			job.StartedAt = &t
		}
		return job, nil
	}

	// SQLite fallback update + get
	query = `UPDATE forum_memory_jobs
		SET status = 'PROCESSING', started_at = ?, attempt_count = attempt_count + 1
		WHERE id = ? AND status = 'QUEUED'`
	res, err := s.db.ExecContext(ctx, query, now, jobID)
	if err != nil {
		return nil, fmt.Errorf("gagal klaim job sqlite: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return nil, ErrJobNotFound
	}
	return s.GetJobByID(ctx, jobID)
}

func (s *SQLMemoryStore) CompleteJob(ctx context.Context, jobID string, msgCount int) error {
	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE forum_memory_jobs
			SET status = 'COMPLETED', completed_at = $1, message_count = $2, last_error = ''
			WHERE id = $3`
	} else {
		query = `UPDATE forum_memory_jobs
			SET status = 'COMPLETED', completed_at = ?, message_count = ?, last_error = ''
			WHERE id = ?`
	}

	_, err := s.db.ExecContext(ctx, query, now, msgCount, jobID)
	if err != nil {
		return fmt.Errorf("gagal update complete job: %w", err)
	}
	return nil
}

func (s *SQLMemoryStore) FailJob(ctx context.Context, jobID, lastError string, isTerminal bool, nextRetry *time.Time) error {
	status := JobStatusFailed
	if !isTerminal {
		// Jika masih bisa di-retry, kembalikan ke antrean dengan jadwal next_retry_at
		status = JobStatusQueued
	}

	var query string
	if s.driverName == "postgres" {
		query = `UPDATE forum_memory_jobs
			SET status = $1, last_error = $2, is_terminal_fail = $3, next_retry_at = $4
			WHERE id = $5`
	} else {
		query = `UPDATE forum_memory_jobs
			SET status = ?, last_error = ?, is_terminal_fail = ?, next_retry_at = ?
			WHERE id = ?`
	}

	_, err := s.db.ExecContext(ctx, query, status, lastError, isTerminal, nextRetry, jobID)
	if err != nil {
		return fmt.Errorf("gagal update fail job: %w", err)
	}
	return nil
}

// -----------------------------------------------------------------------------
// Draft & Artifact Methods
// -----------------------------------------------------------------------------

func (s *SQLMemoryStore) CreateDraftWithArtifacts(ctx context.Context, draft *MemoryDraft, artifacts []MemoryArtifact) error {
	if draft.ID == "" {
		draft.ID = uuid.New().String()
	}
	if draft.CreatedAt.IsZero() {
		draft.CreatedAt = time.Now().UTC()
	}
	if draft.Status == "" {
		draft.Status = DraftStatusDraft
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("gagal memulai transaksi draft: %w", err)
	}
	defer tx.Rollback()

	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	if tenantID == "default" && draft.ForumID != "" {
		var convTenant string
		var checkConvQuery string
		if s.driverName == "postgres" {
			checkConvQuery = `SELECT COALESCE(tenant_id, 'default') FROM conversations WHERE id = $1`
		} else {
			checkConvQuery = `SELECT COALESCE(tenant_id, 'default') FROM conversations WHERE id = ?`
		}
		if err := s.db.QueryRowContext(ctx, checkConvQuery, draft.ForumID).Scan(&convTenant); err == nil && convTenant != "" {
			tenantID = convTenant
		}
	}

	// 1. Insert memory_drafts
	var draftQuery string
	if s.driverName == "postgres" {
		draftQuery = `INSERT INTO memory_drafts (
			id, job_id, forum_id, group_id, status, message_count_processed,
			was_truncated, truncation_note, created_at, tenant_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`
	} else {
		draftQuery = `INSERT INTO memory_drafts (
			id, job_id, forum_id, group_id, status, message_count_processed,
			was_truncated, truncation_note, created_at, tenant_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	}

	_, err = tx.ExecContext(ctx, draftQuery,
		draft.ID, draft.JobID, draft.ForumID, draft.GroupID, draft.Status,
		draft.MessageCountProcessed, draft.WasTruncated, draft.TruncationNote, draft.CreatedAt, tenantID,
	)
	if err != nil {
		return fmt.Errorf("gagal insert memory_drafts: %w", err)
	}

	// 2. Insert memory_artifacts & artifact_evidences
	for i := range artifacts {
		art := &artifacts[i]
		if art.ID == "" {
			art.ID = uuid.New().String()
		}
		art.DraftID = draft.ID
		if art.CreatedAt.IsZero() {
			art.CreatedAt = time.Now().UTC()
		}
		art.UpdatedAt = art.CreatedAt
		if art.Confidence == "" {
			art.Confidence = ConfidenceMedium
		}

		var artQuery string
		if s.driverName == "postgres" {
			artQuery = `INSERT INTO memory_artifacts (
				id, draft_id, type, content, ai_original_content, confidence,
				is_human_edited, is_removed, position, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`
		} else {
			artQuery = `INSERT INTO memory_artifacts (
				id, draft_id, type, content, ai_original_content, confidence,
				is_human_edited, is_removed, position, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		}

		_, err = tx.ExecContext(ctx, artQuery,
			art.ID, art.DraftID, art.Type, art.Content, art.AIOriginalContent, art.Confidence,
			art.IsHumanEdited, art.IsRemoved, art.Position, art.CreatedAt, art.UpdatedAt,
		)
		if err != nil {
			return fmt.Errorf("gagal insert memory_artifact: %w", err)
		}

		// Insert Evidences if any
		for j := range art.Evidences {
			ev := &art.Evidences[j]
			if ev.ID == "" {
				ev.ID = uuid.New().String()
			}
			ev.ArtifactID = art.ID
			if ev.CreatedAt.IsZero() {
				ev.CreatedAt = time.Now().UTC()
			}

			var evQuery string
			if s.driverName == "postgres" {
				evQuery = `INSERT INTO artifact_evidences (
					id, artifact_id, message_id, message_preview, message_sender_name,
					message_sent_at, created_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7)`
			} else {
				evQuery = `INSERT INTO artifact_evidences (
					id, artifact_id, message_id, message_preview, message_sender_name,
					message_sent_at, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?)`
			}

			_, err = tx.ExecContext(ctx, evQuery,
				ev.ID, ev.ArtifactID, ev.MessageID, ev.MessagePreview, ev.MessageSenderName,
				ev.MessageSentAt, ev.CreatedAt,
			)
			if err != nil {
				return fmt.Errorf("gagal insert artifact_evidence: %w", err)
			}
		}
	}

	return tx.Commit()
}

func (s *SQLMemoryStore) GetDraftByID(ctx context.Context, id string) (*MemoryDraft, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, job_id, forum_id, group_id, status, message_count_processed,
			was_truncated, truncation_note, reviewed_at, reviewed_by, rejection_reason, created_at
			FROM memory_drafts WHERE id = $1`
	} else {
		query = `SELECT id, job_id, forum_id, group_id, status, message_count_processed,
			was_truncated, truncation_note, reviewed_at, reviewed_by, rejection_reason, created_at
			FROM memory_drafts WHERE id = ?`
	}

	draft := &MemoryDraft{}
	var truncNote, reviewedBy, rejReason sql.NullString
	var reviewedAt sql.NullTime

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&draft.ID, &draft.JobID, &draft.ForumID, &draft.GroupID, &draft.Status,
		&draft.MessageCountProcessed, &draft.WasTruncated, &truncNote,
		&reviewedAt, &reviewedBy, &rejReason, &draft.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrDraftNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gagal query memory draft by id: %w", err)
	}

	if truncNote.Valid {
		draft.TruncationNote = truncNote.String
	}
	if reviewedBy.Valid {
		draft.ReviewedBy = reviewedBy.String
	}
	if rejReason.Valid {
		draft.RejectionReason = rejReason.String
	}
	if reviewedAt.Valid {
		t := reviewedAt.Time
		draft.ReviewedAt = &t
	}

	// Fetch artifacts
	artifacts, err := s.GetArtifactsByDraftID(ctx, draft.ID)
	if err != nil {
		return nil, err
	}
	draft.Artifacts = artifacts

	return draft, nil
}

func (s *SQLMemoryStore) GetDraftByForumID(ctx context.Context, forumID string) (*MemoryDraft, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, job_id, forum_id, group_id, status, message_count_processed,
			was_truncated, truncation_note, reviewed_at, reviewed_by, rejection_reason, created_at
			FROM memory_drafts WHERE forum_id = $1`
	} else {
		query = `SELECT id, job_id, forum_id, group_id, status, message_count_processed,
			was_truncated, truncation_note, reviewed_at, reviewed_by, rejection_reason, created_at
			FROM memory_drafts WHERE forum_id = ?`
	}

	draft := &MemoryDraft{}
	var truncNote, reviewedBy, rejReason sql.NullString
	var reviewedAt sql.NullTime

	err := s.db.QueryRowContext(ctx, query, forumID).Scan(
		&draft.ID, &draft.JobID, &draft.ForumID, &draft.GroupID, &draft.Status,
		&draft.MessageCountProcessed, &draft.WasTruncated, &truncNote,
		&reviewedAt, &reviewedBy, &rejReason, &draft.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrDraftNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gagal query memory draft by forum id: %w", err)
	}

	if truncNote.Valid {
		draft.TruncationNote = truncNote.String
	}
	if reviewedBy.Valid {
		draft.ReviewedBy = reviewedBy.String
	}
	if rejReason.Valid {
		draft.RejectionReason = rejReason.String
	}
	if reviewedAt.Valid {
		t := reviewedAt.Time
		draft.ReviewedAt = &t
	}

	artifacts, err := s.GetArtifactsByDraftID(ctx, draft.ID)
	if err != nil {
		return nil, err
	}
	draft.Artifacts = artifacts

	return draft, nil
}

func (s *SQLMemoryStore) GetDraftsByGroupID(ctx context.Context, groupID string, status string) ([]MemoryDraft, error) {
	var query string
	var rows *sql.Rows
	var err error

	if status != "" {
		if s.driverName == "postgres" {
			query = `SELECT id, job_id, forum_id, group_id, status, message_count_processed,
				was_truncated, truncation_note, reviewed_at, reviewed_by, rejection_reason, created_at
				FROM memory_drafts WHERE group_id = $1 AND status = $2 ORDER BY created_at DESC`
		} else {
			query = `SELECT id, job_id, forum_id, group_id, status, message_count_processed,
				was_truncated, truncation_note, reviewed_at, reviewed_by, rejection_reason, created_at
				FROM memory_drafts WHERE group_id = ? AND status = ? ORDER BY created_at DESC`
		}
		rows, err = s.db.QueryContext(ctx, query, groupID, status)
	} else {
		if s.driverName == "postgres" {
			query = `SELECT id, job_id, forum_id, group_id, status, message_count_processed,
				was_truncated, truncation_note, reviewed_at, reviewed_by, rejection_reason, created_at
				FROM memory_drafts WHERE group_id = $1 ORDER BY created_at DESC`
		} else {
			query = `SELECT id, job_id, forum_id, group_id, status, message_count_processed,
				was_truncated, truncation_note, reviewed_at, reviewed_by, rejection_reason, created_at
				FROM memory_drafts WHERE group_id = ? ORDER BY created_at DESC`
		}
		rows, err = s.db.QueryContext(ctx, query, groupID)
	}

	if err != nil {
		return nil, fmt.Errorf("gagal query drafts by group id: %w", err)
	}
	defer rows.Close()

	var drafts []MemoryDraft
	for rows.Next() {
		var draft MemoryDraft
		var truncNote, reviewedBy, rejReason sql.NullString
		var reviewedAt sql.NullTime

		if err := rows.Scan(
			&draft.ID, &draft.JobID, &draft.ForumID, &draft.GroupID, &draft.Status,
			&draft.MessageCountProcessed, &draft.WasTruncated, &truncNote,
			&reviewedAt, &reviewedBy, &rejReason, &draft.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan memory draft: %w", err)
		}

		if truncNote.Valid {
			draft.TruncationNote = truncNote.String
		}
		if reviewedBy.Valid {
			draft.ReviewedBy = reviewedBy.String
		}
		if rejReason.Valid {
			draft.RejectionReason = rejReason.String
		}
		if reviewedAt.Valid {
			t := reviewedAt.Time
			draft.ReviewedAt = &t
		}

		drafts = append(drafts, draft)
	}

	return drafts, nil
}

func (s *SQLMemoryStore) GetArtifactsByDraftID(ctx context.Context, draftID string) ([]MemoryArtifact, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, draft_id, type, content, ai_original_content, confidence,
			is_human_edited, is_removed, position, created_at, updated_at
			FROM memory_artifacts WHERE draft_id = $1 ORDER BY type ASC, position ASC NULLS LAST, created_at ASC`
	} else {
		query = `SELECT id, draft_id, type, content, ai_original_content, confidence,
			is_human_edited, is_removed, position, created_at, updated_at
			FROM memory_artifacts WHERE draft_id = ? ORDER BY type ASC, position ASC, created_at ASC`
	}

	rows, err := s.db.QueryContext(ctx, query, draftID)
	if err != nil {
		return nil, fmt.Errorf("gagal query artifacts by draft id: %w", err)
	}
	defer rows.Close()

	var artifacts []MemoryArtifact
	for rows.Next() {
		var art MemoryArtifact
		var pos sql.NullInt64

		if err := rows.Scan(
			&art.ID, &art.DraftID, &art.Type, &art.Content, &art.AIOriginalContent, &art.Confidence,
			&art.IsHumanEdited, &art.IsRemoved, &pos, &art.CreatedAt, &art.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan artifact: %w", err)
		}

		if pos.Valid {
			p := int(pos.Int64)
			art.Position = &p
		}

		// Fetch evidences for DECISION type
		if art.Type == ArtifactTypeDecision {
			evidences, err := s.getEvidencesByArtifactID(ctx, art.ID)
			if err != nil {
				return nil, err
			}
			art.Evidences = evidences
		}

		artifacts = append(artifacts, art)
	}

	return artifacts, nil
}

func (s *SQLMemoryStore) GetArtifactByID(ctx context.Context, id string) (*MemoryArtifact, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, draft_id, type, content, ai_original_content, confidence,
			is_human_edited, is_removed, position, created_at, updated_at
			FROM memory_artifacts WHERE id = $1`
	} else {
		query = `SELECT id, draft_id, type, content, ai_original_content, confidence,
			is_human_edited, is_removed, position, created_at, updated_at
			FROM memory_artifacts WHERE id = ?`
	}

	art := &MemoryArtifact{}
	var pos sql.NullInt64

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&art.ID, &art.DraftID, &art.Type, &art.Content, &art.AIOriginalContent, &art.Confidence,
		&art.IsHumanEdited, &art.IsRemoved, &pos, &art.CreatedAt, &art.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrArtifactNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gagal query artifact by id: %w", err)
	}

	if pos.Valid {
		p := int(pos.Int64)
		art.Position = &p
	}

	if art.Type == ArtifactTypeDecision {
		evidences, err := s.getEvidencesByArtifactID(ctx, art.ID)
		if err != nil {
			return nil, err
		}
		art.Evidences = evidences
	}

	return art, nil
}

func (s *SQLMemoryStore) getEvidencesByArtifactID(ctx context.Context, artifactID string) ([]ArtifactEvidence, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, artifact_id, message_id, message_preview, message_sender_name, message_sent_at, created_at
			FROM artifact_evidences WHERE artifact_id = $1 ORDER BY message_sent_at ASC`
	} else {
		query = `SELECT id, artifact_id, message_id, message_preview, message_sender_name, message_sent_at, created_at
			FROM artifact_evidences WHERE artifact_id = ? ORDER BY message_sent_at ASC`
	}

	rows, err := s.db.QueryContext(ctx, query, artifactID)
	if err != nil {
		return nil, fmt.Errorf("gagal query evidences: %w", err)
	}
	defer rows.Close()

	var evidences []ArtifactEvidence
	for rows.Next() {
		var ev ArtifactEvidence
		if err := rows.Scan(
			&ev.ID, &ev.ArtifactID, &ev.MessageID, &ev.MessagePreview, &ev.MessageSenderName,
			&ev.MessageSentAt, &ev.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan evidence: %w", err)
		}
		evidences = append(evidences, ev)
	}

	return evidences, nil
}

func (s *SQLMemoryStore) UpdateArtifact(ctx context.Context, artifactID string, content string, isHumanEdited bool) error {
	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE memory_artifacts
			SET content = $1, is_human_edited = $2, updated_at = $3
			WHERE id = $4`
	} else {
		query = `UPDATE memory_artifacts
			SET content = ?, is_human_edited = ?, updated_at = ?
			WHERE id = ?`
	}

	res, err := s.db.ExecContext(ctx, query, content, isHumanEdited, now, artifactID)
	if err != nil {
		return fmt.Errorf("gagal update artifact: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return ErrArtifactNotFound
	}
	return nil
}

func (s *SQLMemoryStore) RemoveJourneyLite(ctx context.Context, draftID string) error {
	now := time.Now().UTC()
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE memory_artifacts
			SET is_removed = true, updated_at = $1
			WHERE draft_id = $2 AND type = 'JOURNEY_LITE'`
	} else {
		query = `UPDATE memory_artifacts
			SET is_removed = true, updated_at = ?
			WHERE draft_id = ? AND type = 'JOURNEY_LITE'`
	}

	_, err := s.db.ExecContext(ctx, query, now, draftID)
	if err != nil {
		return fmt.Errorf("gagal remove journey lite: %w", err)
	}
	return nil
}

// -----------------------------------------------------------------------------
// Review, Approval & Publication
// -----------------------------------------------------------------------------

func (s *SQLMemoryStore) ApproveDraft(ctx context.Context, draftID, adminID string, approvedMemory *ApprovedMemory, reviewAction *MemoryReviewAction) error {
	now := time.Now().UTC()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("gagal memulai transaksi approval: %w", err)
	}
	defer tx.Rollback()

	// 1. Update memory_drafts status to APPROVED
	var updateDraftQuery string
	if s.driverName == "postgres" {
		updateDraftQuery = `UPDATE memory_drafts
			SET status = 'APPROVED', reviewed_at = $1, reviewed_by = $2
			WHERE id = $3 AND status = 'DRAFT'`
	} else {
		updateDraftQuery = `UPDATE memory_drafts
			SET status = 'APPROVED', reviewed_at = ?, reviewed_by = ?
			WHERE id = ? AND status = 'DRAFT'`
	}

	res, err := tx.ExecContext(ctx, updateDraftQuery, now, adminID, draftID)
	if err != nil {
		return fmt.Errorf("gagal update status draft: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return ErrDraftAlreadyReviewed
	}

	// 2. Insert approved_memories
	if approvedMemory.ID == "" {
		approvedMemory.ID = uuid.New().String()
	}
	approvedMemory.DraftID = draftID
	approvedMemory.ApprovedBy = adminID
	approvedMemory.ApprovedAt = now
	approvedMemory.CreatedAt = now

	// Ensure snapshot_decisions JSON valid
	if approvedMemory.SnapshotDecisions == "" && len(approvedMemory.DecisionsList) > 0 {
		bytes, _ := json.Marshal(approvedMemory.DecisionsList)
		approvedMemory.SnapshotDecisions = string(bytes)
	}
	if approvedMemory.SnapshotDecisions == "" {
		approvedMemory.SnapshotDecisions = "[]"
	}

	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	if tenantID == "default" && approvedMemory.ForumID != "" {
		var convTenant string
		var checkConvQuery string
		if s.driverName == "postgres" {
			checkConvQuery = `SELECT COALESCE(tenant_id, 'default') FROM conversations WHERE id = $1`
		} else {
			checkConvQuery = `SELECT COALESCE(tenant_id, 'default') FROM conversations WHERE id = ?`
		}
		if err := s.db.QueryRowContext(ctx, checkConvQuery, approvedMemory.ForumID).Scan(&convTenant); err == nil && convTenant != "" {
			tenantID = convTenant
		}
	}

	var insertMemoryQuery string
	if s.driverName == "postgres" {
		insertMemoryQuery = `INSERT INTO approved_memories (
			id, draft_id, forum_id, group_id, approved_by, approved_at,
			has_human_edits, snapshot_summary, snapshot_summary_conf,
			snapshot_decisions, snapshot_journey_lite, snapshot_journey_conf,
			is_journey_lite_removed, created_at, tenant_id
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`
	} else {
		insertMemoryQuery = `INSERT INTO approved_memories (
			id, draft_id, forum_id, group_id, approved_by, approved_at,
			has_human_edits, snapshot_summary, snapshot_summary_conf,
			snapshot_decisions, snapshot_journey_lite, snapshot_journey_conf,
			is_journey_lite_removed, created_at, tenant_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	}

	_, err = tx.ExecContext(ctx, insertMemoryQuery,
		approvedMemory.ID, approvedMemory.DraftID, approvedMemory.ForumID, approvedMemory.GroupID,
		approvedMemory.ApprovedBy, approvedMemory.ApprovedAt, approvedMemory.HasHumanEdits,
		approvedMemory.SnapshotSummary, approvedMemory.SnapshotSummaryConf,
		approvedMemory.SnapshotDecisions, approvedMemory.SnapshotJourneyLite,
		approvedMemory.SnapshotJourneyConf, approvedMemory.IsJourneyLiteRemoved, approvedMemory.CreatedAt, tenantID,
	)
	if err != nil {
		return fmt.Errorf("gagal insert approved_memories: %w", err)
	}

	// 3. Record Audit Action
	if reviewAction != nil {
		if reviewAction.ID == "" {
			reviewAction.ID = uuid.New().String()
		}
		reviewAction.DraftID = draftID
		reviewAction.AdminID = adminID
		reviewAction.CreatedAt = now

		var actionQuery string
		if s.driverName == "postgres" {
			actionQuery = `INSERT INTO memory_review_actions (
				id, draft_id, admin_id, action, artifact_id, old_content, new_content, rejection_reason, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
		} else {
			actionQuery = `INSERT INTO memory_review_actions (
				id, draft_id, admin_id, action, artifact_id, old_content, new_content, rejection_reason, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		}

		_, err = tx.ExecContext(ctx, actionQuery,
			reviewAction.ID, reviewAction.DraftID, reviewAction.AdminID, reviewAction.Action,
			reviewAction.ArtifactID, reviewAction.OldContent, reviewAction.NewContent,
			reviewAction.RejectionReason, reviewAction.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("gagal record review action: %w", err)
		}
	}

	return tx.Commit()
}

func (s *SQLMemoryStore) RejectDraft(ctx context.Context, draftID, adminID, reason string) error {
	now := time.Now().UTC()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("gagal memulai transaksi rejection: %w", err)
	}
	defer tx.Rollback()

	var query string
	if s.driverName == "postgres" {
		query = `UPDATE memory_drafts
			SET status = 'REJECTED', reviewed_at = $1, reviewed_by = $2, rejection_reason = $3
			WHERE id = $4 AND status = 'DRAFT'`
	} else {
		query = `UPDATE memory_drafts
			SET status = 'REJECTED', reviewed_at = ?, reviewed_by = ?, rejection_reason = ?
			WHERE id = ? AND status = 'DRAFT'`
	}

	res, err := tx.ExecContext(ctx, query, now, adminID, reason, draftID)
	if err != nil {
		return fmt.Errorf("gagal reject draft: %w", err)
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return ErrDraftAlreadyReviewed
	}

	// Record audit action
	actionID := uuid.New().String()
	var actQuery string
	if s.driverName == "postgres" {
		actQuery = `INSERT INTO memory_review_actions (
			id, draft_id, admin_id, action, rejection_reason, created_at
		) VALUES ($1, $2, $3, 'REJECTED', $4, $5)`
	} else {
		actQuery = `INSERT INTO memory_review_actions (
			id, draft_id, admin_id, action, rejection_reason, created_at
		) VALUES (?, ?, ?, 'REJECTED', ?, ?)`
	}

	_, err = tx.ExecContext(ctx, actQuery, actionID, draftID, adminID, reason, now)
	if err != nil {
		return fmt.Errorf("gagal record reject review action: %w", err)
	}

	return tx.Commit()
}

func (s *SQLMemoryStore) RecordReviewAction(ctx context.Context, action *MemoryReviewAction) error {
	if action.ID == "" {
		action.ID = uuid.New().String()
	}
	if action.CreatedAt.IsZero() {
		action.CreatedAt = time.Now().UTC()
	}

	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO memory_review_actions (
			id, draft_id, admin_id, action, artifact_id, old_content, new_content, rejection_reason, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`
	} else {
		query = `INSERT INTO memory_review_actions (
			id, draft_id, admin_id, action, artifact_id, old_content, new_content, rejection_reason, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	}

	_, err := s.db.ExecContext(ctx, query,
		action.ID, action.DraftID, action.AdminID, action.Action,
		action.ArtifactID, action.OldContent, action.NewContent, action.RejectionReason, action.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("gagal insert review action: %w", err)
	}
	return nil
}

func (s *SQLMemoryStore) GetReviewActions(ctx context.Context, draftID string) ([]MemoryReviewAction, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, draft_id, admin_id, action, artifact_id, old_content, new_content, rejection_reason, created_at
			FROM memory_review_actions WHERE draft_id = $1 ORDER BY created_at ASC`
	} else {
		query = `SELECT id, draft_id, admin_id, action, artifact_id, old_content, new_content, rejection_reason, created_at
			FROM memory_review_actions WHERE draft_id = ? ORDER BY created_at ASC`
	}

	rows, err := s.db.QueryContext(ctx, query, draftID)
	if err != nil {
		return nil, fmt.Errorf("gagal query review actions: %w", err)
	}
	defer rows.Close()

	var actions []MemoryReviewAction
	for rows.Next() {
		var act MemoryReviewAction
		var artID, oldC, newC, rejR sql.NullString

		if err := rows.Scan(
			&act.ID, &act.DraftID, &act.AdminID, &act.Action,
			&artID, &oldC, &newC, &rejR, &act.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan review action: %w", err)
		}

		if artID.Valid {
			act.ArtifactID = artID.String
		}
		if oldC.Valid {
			act.OldContent = oldC.String
		}
		if newC.Valid {
			act.NewContent = newC.String
		}
		if rejR.Valid {
			act.RejectionReason = rejR.String
		}

		actions = append(actions, act)
	}

	return actions, nil
}

// -----------------------------------------------------------------------------
// Approved Memory Read-Model & Analytics
// -----------------------------------------------------------------------------

func (s *SQLMemoryStore) GetApprovedMemoryByID(ctx context.Context, id string) (*ApprovedMemory, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, draft_id, forum_id, group_id, approved_by, approved_at,
			has_human_edits, snapshot_summary, snapshot_summary_conf, snapshot_decisions,
			snapshot_journey_lite, snapshot_journey_conf, is_journey_lite_removed, created_at
			FROM approved_memories WHERE id = $1`
	} else {
		query = `SELECT id, draft_id, forum_id, group_id, approved_by, approved_at,
			has_human_edits, snapshot_summary, snapshot_summary_conf, snapshot_decisions,
			snapshot_journey_lite, snapshot_journey_conf, is_journey_lite_removed, created_at
			FROM approved_memories WHERE id = ?`
	}

	mem := &ApprovedMemory{}
	var jLite, jConf sql.NullString

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&mem.ID, &mem.DraftID, &mem.ForumID, &mem.GroupID, &mem.ApprovedBy, &mem.ApprovedAt,
		&mem.HasHumanEdits, &mem.SnapshotSummary, &mem.SnapshotSummaryConf, &mem.SnapshotDecisions,
		&jLite, &jConf, &mem.IsJourneyLiteRemoved, &mem.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrApprovedMemoryNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gagal query approved memory by id: %w", err)
	}

	if jLite.Valid {
		mem.SnapshotJourneyLite = jLite.String
	}
	if jConf.Valid {
		mem.SnapshotJourneyConf = jConf.String
	}

	if mem.SnapshotDecisions != "" {
		_ = json.Unmarshal([]byte(mem.SnapshotDecisions), &mem.DecisionsList)
	}

	return mem, nil
}

func (s *SQLMemoryStore) GetApprovedMemoryByForumID(ctx context.Context, forumID string) (*ApprovedMemory, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, draft_id, forum_id, group_id, approved_by, approved_at,
			has_human_edits, snapshot_summary, snapshot_summary_conf, snapshot_decisions,
			snapshot_journey_lite, snapshot_journey_conf, is_journey_lite_removed, created_at
			FROM approved_memories WHERE forum_id = $1`
	} else {
		query = `SELECT id, draft_id, forum_id, group_id, approved_by, approved_at,
			has_human_edits, snapshot_summary, snapshot_summary_conf, snapshot_decisions,
			snapshot_journey_lite, snapshot_journey_conf, is_journey_lite_removed, created_at
			FROM approved_memories WHERE forum_id = ?`
	}

	mem := &ApprovedMemory{}
	var jLite, jConf sql.NullString

	err := s.db.QueryRowContext(ctx, query, forumID).Scan(
		&mem.ID, &mem.DraftID, &mem.ForumID, &mem.GroupID, &mem.ApprovedBy, &mem.ApprovedAt,
		&mem.HasHumanEdits, &mem.SnapshotSummary, &mem.SnapshotSummaryConf, &mem.SnapshotDecisions,
		&jLite, &jConf, &mem.IsJourneyLiteRemoved, &mem.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrApprovedMemoryNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gagal query approved memory: %w", err)
	}

	if jLite.Valid {
		mem.SnapshotJourneyLite = jLite.String
	}
	if jConf.Valid {
		mem.SnapshotJourneyConf = jConf.String
	}

	// Parse decisions list
	if mem.SnapshotDecisions != "" {
		_ = json.Unmarshal([]byte(mem.SnapshotDecisions), &mem.DecisionsList)
	}

	return mem, nil
}

func (s *SQLMemoryStore) GetApprovedMemoriesByGroupID(ctx context.Context, groupID string, limit, offset int) ([]ApprovedMemory, error) {
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	var query string
	if s.driverName == "postgres" {
		query = `SELECT id, draft_id, forum_id, group_id, approved_by, approved_at,
			has_human_edits, snapshot_summary, snapshot_summary_conf, snapshot_decisions,
			snapshot_journey_lite, snapshot_journey_conf, is_journey_lite_removed, created_at
			FROM approved_memories WHERE group_id = $1
			ORDER BY approved_at DESC
			LIMIT $2 OFFSET $3`
	} else {
		query = `SELECT id, draft_id, forum_id, group_id, approved_by, approved_at,
			has_human_edits, snapshot_summary, snapshot_summary_conf, snapshot_decisions,
			snapshot_journey_lite, snapshot_journey_conf, is_journey_lite_removed, created_at
			FROM approved_memories WHERE group_id = ?
			ORDER BY approved_at DESC
			LIMIT ? OFFSET ?`
	}

	rows, err := s.db.QueryContext(ctx, query, groupID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("gagal query approved memories by group: %w", err)
	}
	defer rows.Close()

	var list []ApprovedMemory
	for rows.Next() {
		var mem ApprovedMemory
		var jLite, jConf sql.NullString

		if err := rows.Scan(
			&mem.ID, &mem.DraftID, &mem.ForumID, &mem.GroupID, &mem.ApprovedBy, &mem.ApprovedAt,
			&mem.HasHumanEdits, &mem.SnapshotSummary, &mem.SnapshotSummaryConf, &mem.SnapshotDecisions,
			&jLite, &jConf, &mem.IsJourneyLiteRemoved, &mem.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan approved memory: %w", err)
		}

		if jLite.Valid {
			mem.SnapshotJourneyLite = jLite.String
		}
		if jConf.Valid {
			mem.SnapshotJourneyConf = jConf.String
		}
		if mem.SnapshotDecisions != "" {
			_ = json.Unmarshal([]byte(mem.SnapshotDecisions), &mem.DecisionsList)
		}

		list = append(list, mem)
	}

	return list, nil
}

func (s *SQLMemoryStore) RecordViewEvent(ctx context.Context, event *MemoryViewEvent) error {
	if event.ID == "" {
		event.ID = uuid.New().String()
	}
	if event.CreatedAt.IsZero() {
		event.CreatedAt = time.Now().UTC()
	}
	if event.ViewerRole == "" {
		event.ViewerRole = ViewerRoleMember
	}

	var query string
	if s.driverName == "postgres" {
		query = `INSERT INTO memory_view_events (
			id, approved_memory_id, forum_id, group_id, viewer_id, viewer_role, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7)`
	} else {
		query = `INSERT INTO memory_view_events (
			id, approved_memory_id, forum_id, group_id, viewer_id, viewer_role, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?)`
	}

	_, err := s.db.ExecContext(ctx, query,
		event.ID, event.ApprovedMemoryID, event.ForumID, event.GroupID,
		event.ViewerID, event.ViewerRole, event.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("gagal insert memory_view_event: %w", err)
	}
	return nil
}

func (s *SQLMemoryStore) HasUserViewedMemory(ctx context.Context, memoryID, userID string) (bool, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT 1 FROM memory_view_events WHERE approved_memory_id = $1 AND viewer_id = $2 LIMIT 1`
	} else {
		query = `SELECT 1 FROM memory_view_events WHERE approved_memory_id = ? AND viewer_id = ? LIMIT 1`
	}

	var exists int
	err := s.db.QueryRowContext(ctx, query, memoryID, userID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("gagal cek user viewed memory: %w", err)
	}
	return true, nil
}
