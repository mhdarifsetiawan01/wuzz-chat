// Package memory mengelola domain Memory Engine untuk ekstraksi, tinjauan,
// dan publikasi memori percakapan cerdas (AI) berbasis ContextSource.
package memory

import (
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// ContextType mendefinisikan jenis sumber percakapan yang dianalisis oleh Memory Engine.
type ContextType string

const (
	ContextTypeForum      ContextType = "forum"
	ContextTypeGroup      ContextType = "group"
	ContextTypeDirectChat ContextType = "direct"
)

// Konstanta Status & Tipe Memory AI
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

// MemoryContext adalah representasi metadata sumber konten percakapan tergeneralisasi.
type MemoryContext struct {
	ContextID   string      `json:"context_id"`
	ContextType ContextType `json:"context_type"`
	ParentID    string      `json:"parent_id,omitempty"` // ID konteks induk (misal: group_id untuk forum)
	OwnerIDs    []string    `json:"owner_ids,omitempty"`  // Pengguna dengan hak administratif
	Title       string      `json:"title"`               // Judul percakapan/topik
}

// MemoryJob merepresentasikan antrean pemrosesan AI untuk sebuah percakapan.
type MemoryJob struct {
	ID             string      `json:"id"`
	TenantID       string      `json:"tenant_id"`
	ContextID      string      `json:"context_id"` // Menggantikan/alias forum_id
	ContextType    ContextType `json:"context_type"`
	ParentID       string      `json:"parent_id,omitempty"` // Menggantikan/alias group_id
	Status         string      `json:"status"`              // QUEUED, PROCESSING, COMPLETED, FAILED
	AttemptCount   int         `json:"attempt_count"`
	MaxAttempts    int         `json:"max_attempts"`
	IsTerminalFail bool        `json:"is_terminal_fail"`
	LastError      string      `json:"last_error,omitempty"`
	MessageCount   int         `json:"message_count"`
	CreatedAt      time.Time   `json:"created_at"`
	StartedAt      *time.Time  `json:"started_at,omitempty"`
	CompletedAt    *time.Time  `json:"completed_at,omitempty"`
	NextRetryAt    *time.Time  `json:"next_retry_at,omitempty"`
}

// MemoryDraft merepresentasikan kontainer draf keluaran AI yang menunggu tinjauan admin.
type MemoryDraft struct {
	ID                    string           `json:"id"`
	TenantID              string           `json:"tenant_id"`
	JobID                 string           `json:"job_id"`
	ContextID             string           `json:"context_id"` // forum_id / conversation_id
	ContextType           ContextType      `json:"context_type"`
	ParentID              string           `json:"parent_id,omitempty"` // group_id
	Status                string           `json:"status"`              // DRAFT, APPROVED, REJECTED
	MessageCountProcessed int              `json:"message_count_processed"`
	WasTruncated          bool             `json:"was_truncated"`
	TruncationNote        string           `json:"truncation_note,omitempty"`
	ReviewedAt            *time.Time       `json:"reviewed_at,omitempty"`
	ReviewedBy            string           `json:"reviewed_by,omitempty"`
	RejectionReason       string           `json:"rejection_reason,omitempty"`
	CreatedAt             time.Time        `json:"created_at"`
	Artifacts             []MemoryArtifact `json:"artifacts,omitempty"`
}

// MemoryArtifact merepresentasikan satu butir artefak hasil ekstraksi AI.
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

// ArtifactEvidence merepresentasikan kutipan pesan asli pendukung keputusan.
type ArtifactEvidence struct {
	ID                string    `json:"id"`
	ArtifactID        string    `json:"artifact_id"`
	MessageID         string    `json:"message_id"`
	MessagePreview    string    `json:"message_preview"`
	MessageSenderName string    `json:"message_sender_name"`
	MessageSentAt     time.Time `json:"message_sent_at"`
	CreatedAt         time.Time `json:"created_at"`
}

// ApprovedEvidenceItem adalah serialisasi kutipan di dalam JSON ApprovedDecisionItem.
type ApprovedEvidenceItem struct {
	MessageID  string    `json:"message_id"`
	Preview    string    `json:"preview"`
	SenderName string    `json:"sender_name"`
	SentAt     time.Time `json:"sent_at"`
}

// ApprovedDecisionItem adalah butir keputusan terstruktur di dalam ApprovedMemory.
type ApprovedDecisionItem struct {
	Position      int                    `json:"position"`
	Text          string                 `json:"text"`
	Confidence    string                 `json:"confidence"`
	IsHumanEdited bool                   `json:"is_human_edited"`
	Evidences     []ApprovedEvidenceItem `json:"evidences"`
}

// ApprovedMemory adalah model baca denormalisasi yang siap dikonsumsi langsung oleh anggota.
type ApprovedMemory struct {
	ID                   string                 `json:"id"`
	TenantID             string                 `json:"tenant_id"`
	DraftID              string                 `json:"draft_id"`
	ContextID            string                 `json:"context_id"` // forum_id / conversation_id
	ContextType          ContextType            `json:"context_type"`
	ParentID             string                 `json:"parent_id,omitempty"` // group_id
	ApprovedBy           string                 `json:"approved_by"`
	ApprovedAt           time.Time              `json:"approved_at"`
	HasHumanEdits        bool                   `json:"has_human_edits"`
	SnapshotSummary      string                 `json:"snapshot_summary"`
	SnapshotSummaryConf  string                 `json:"snapshot_summary_conf"`
	SnapshotDecisions    string                 `json:"snapshot_decisions"`
	DecisionsList        []ApprovedDecisionItem `json:"decisions_list,omitempty"`
	SnapshotJourneyLite  string                 `json:"snapshot_journey_lite,omitempty"`
	SnapshotJourneyConf  string                 `json:"snapshot_journey_conf,omitempty"`
	IsJourneyLiteRemoved bool                   `json:"is_journey_lite_removed"`
	CreatedAt            time.Time              `json:"created_at"`
}

// MemoryReviewAction adalah audit log append-only merekam tindakan admin saat review.
type MemoryReviewAction struct {
	ID              string    `json:"id"`
	DraftID         string    `json:"draft_id"`
	AdminID         string    `json:"admin_id"`
	Action          string    `json:"action"` // APPROVED, REJECTED, EDITED_SUMMARY, dll
	ArtifactID      string    `json:"artifact_id,omitempty"`
	OldContent      string    `json:"old_content,omitempty"`
	NewContent      string    `json:"new_content,omitempty"`
	RejectionReason string    `json:"rejection_reason,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// MemoryViewEvent mencatat event pembacaan memori oleh admin dan anggota.
type MemoryViewEvent struct {
	ID               string    `json:"id"`
	ApprovedMemoryID string    `json:"approved_memory_id"`
	ContextID        string    `json:"context_id"`
	ParentID         string    `json:"parent_id,omitempty"`
	ViewerID         string    `json:"viewer_id"`
	ViewerRole       string    `json:"viewer_role"` // ADMIN, MEMBER
	CreatedAt        time.Time `json:"created_at"`
}

// -----------------------------------------------------------------------------
// Mapping Helpers (Domain <-> Legacy Store)
// -----------------------------------------------------------------------------

// ToDomainJob mengonversi store.ForumMemoryJob ke domain MemoryJob.
func ToDomainJob(sj *store.ForumMemoryJob) *MemoryJob {
	if sj == nil {
		return nil
	}
	return &MemoryJob{
		ID:             sj.ID,
		TenantID:       sj.TenantID,
		ContextID:      sj.ForumID,
		ContextType:    ContextTypeForum,
		ParentID:       sj.GroupID,
		Status:         sj.Status,
		AttemptCount:   sj.AttemptCount,
		MaxAttempts:    sj.MaxAttempts,
		IsTerminalFail: sj.IsTerminalFail,
		LastError:      sj.LastError,
		MessageCount:   sj.MessageCount,
		CreatedAt:      sj.CreatedAt,
		StartedAt:      sj.StartedAt,
		CompletedAt:    sj.CompletedAt,
		NextRetryAt:    sj.NextRetryAt,
	}
}

// ToStoreJob mengonversi domain MemoryJob ke store.ForumMemoryJob.
func ToStoreJob(dj *MemoryJob) *store.ForumMemoryJob {
	if dj == nil {
		return nil
	}
	return &store.ForumMemoryJob{
		ID:             dj.ID,
		TenantID:       dj.TenantID,
		ForumID:        dj.ContextID,
		GroupID:        dj.ParentID,
		Status:         dj.Status,
		AttemptCount:   dj.AttemptCount,
		MaxAttempts:    dj.MaxAttempts,
		IsTerminalFail: dj.IsTerminalFail,
		LastError:      dj.LastError,
		MessageCount:   dj.MessageCount,
		CreatedAt:      dj.CreatedAt,
		StartedAt:      dj.StartedAt,
		CompletedAt:    dj.CompletedAt,
		NextRetryAt:    dj.NextRetryAt,
	}
}

// ToDomainArtifact mengonversi store.MemoryArtifact ke domain MemoryArtifact.
func ToDomainArtifact(sa *store.MemoryArtifact) MemoryArtifact {
	if sa == nil {
		return MemoryArtifact{}
	}
	evs := make([]ArtifactEvidence, len(sa.Evidences))
	for i, e := range sa.Evidences {
		evs[i] = ArtifactEvidence{
			ID:                e.ID,
			ArtifactID:        e.ArtifactID,
			MessageID:         e.MessageID,
			MessagePreview:    e.MessagePreview,
			MessageSenderName: e.MessageSenderName,
			MessageSentAt:     e.MessageSentAt,
			CreatedAt:         e.CreatedAt,
		}
	}
	return MemoryArtifact{
		ID:                sa.ID,
		DraftID:           sa.DraftID,
		Type:              sa.Type,
		Content:           sa.Content,
		AIOriginalContent: sa.AIOriginalContent,
		Confidence:        sa.Confidence,
		IsHumanEdited:     sa.IsHumanEdited,
		IsRemoved:         sa.IsRemoved,
		Position:          sa.Position,
		CreatedAt:         sa.CreatedAt,
		UpdatedAt:         sa.UpdatedAt,
		Evidences:         evs,
	}
}

// ToStoreArtifact mengonversi domain MemoryArtifact ke store.MemoryArtifact.
func ToStoreArtifact(da *MemoryArtifact) store.MemoryArtifact {
	if da == nil {
		return store.MemoryArtifact{}
	}
	evs := make([]store.ArtifactEvidence, len(da.Evidences))
	for i, e := range da.Evidences {
		evs[i] = store.ArtifactEvidence{
			ID:                e.ID,
			ArtifactID:        e.ArtifactID,
			MessageID:         e.MessageID,
			MessagePreview:    e.MessagePreview,
			MessageSenderName: e.MessageSenderName,
			MessageSentAt:     e.MessageSentAt,
			CreatedAt:         e.CreatedAt,
		}
	}
	return store.MemoryArtifact{
		ID:                da.ID,
		DraftID:           da.DraftID,
		Type:              da.Type,
		Content:           da.Content,
		AIOriginalContent: da.AIOriginalContent,
		Confidence:        da.Confidence,
		IsHumanEdited:     da.IsHumanEdited,
		IsRemoved:         da.IsRemoved,
		Position:          da.Position,
		CreatedAt:         da.CreatedAt,
		UpdatedAt:         da.UpdatedAt,
		Evidences:         evs,
	}
}

// ToDomainDraft mengonversi store.MemoryDraft ke domain MemoryDraft.
func ToDomainDraft(sd *store.MemoryDraft) *MemoryDraft {
	if sd == nil {
		return nil
	}
	arts := make([]MemoryArtifact, len(sd.Artifacts))
	for i := range sd.Artifacts {
		arts[i] = ToDomainArtifact(&sd.Artifacts[i])
	}
	return &MemoryDraft{
		ID:                    sd.ID,
		TenantID:              sd.TenantID,
		JobID:                 sd.JobID,
		ContextID:             sd.ForumID,
		ContextType:           ContextTypeForum,
		ParentID:              sd.GroupID,
		Status:                sd.Status,
		MessageCountProcessed: sd.MessageCountProcessed,
		WasTruncated:          sd.WasTruncated,
		TruncationNote:        sd.TruncationNote,
		ReviewedAt:            sd.ReviewedAt,
		ReviewedBy:            sd.ReviewedBy,
		RejectionReason:       sd.RejectionReason,
		CreatedAt:             sd.CreatedAt,
		Artifacts:             arts,
	}
}

// ToStoreDraft mengonversi domain MemoryDraft ke store.MemoryDraft.
func ToStoreDraft(dd *MemoryDraft) *store.MemoryDraft {
	if dd == nil {
		return nil
	}
	arts := make([]store.MemoryArtifact, len(dd.Artifacts))
	for i := range dd.Artifacts {
		arts[i] = ToStoreArtifact(&dd.Artifacts[i])
	}
	return &store.MemoryDraft{
		ID:                    dd.ID,
		TenantID:              dd.TenantID,
		JobID:                 dd.JobID,
		ForumID:               dd.ContextID,
		GroupID:               dd.ParentID,
		Status:                dd.Status,
		MessageCountProcessed: dd.MessageCountProcessed,
		WasTruncated:          dd.WasTruncated,
		TruncationNote:        dd.TruncationNote,
		ReviewedAt:            dd.ReviewedAt,
		ReviewedBy:            dd.ReviewedBy,
		RejectionReason:       dd.RejectionReason,
		CreatedAt:             dd.CreatedAt,
		Artifacts:             arts,
	}
}

// ToDomainApprovedMemory mengonversi store.ApprovedMemory ke domain ApprovedMemory.
func ToDomainApprovedMemory(sm *store.ApprovedMemory) *ApprovedMemory {
	if sm == nil {
		return nil
	}
	decList := make([]ApprovedDecisionItem, len(sm.DecisionsList))
	for i, d := range sm.DecisionsList {
		evs := make([]ApprovedEvidenceItem, len(d.Evidences))
		for j, ev := range d.Evidences {
			evs[j] = ApprovedEvidenceItem{
				MessageID:  ev.MessageID,
				Preview:    ev.Preview,
				SenderName: ev.SenderName,
				SentAt:     ev.SentAt,
			}
		}
		decList[i] = ApprovedDecisionItem{
			Position:      d.Position,
			Text:          d.Text,
			Confidence:    d.Confidence,
			IsHumanEdited: d.IsHumanEdited,
			Evidences:     evs,
		}
	}
	return &ApprovedMemory{
		ID:                   sm.ID,
		TenantID:             sm.TenantID,
		DraftID:              sm.DraftID,
		ContextID:            sm.ForumID,
		ContextType:          ContextTypeForum,
		ParentID:             sm.GroupID,
		ApprovedBy:           sm.ApprovedBy,
		ApprovedAt:           sm.ApprovedAt,
		HasHumanEdits:        sm.HasHumanEdits,
		SnapshotSummary:      sm.SnapshotSummary,
		SnapshotSummaryConf:  sm.SnapshotSummaryConf,
		SnapshotDecisions:    sm.SnapshotDecisions,
		DecisionsList:        decList,
		SnapshotJourneyLite:  sm.SnapshotJourneyLite,
		SnapshotJourneyConf:  sm.SnapshotJourneyConf,
		IsJourneyLiteRemoved: sm.IsJourneyLiteRemoved,
		CreatedAt:            sm.CreatedAt,
	}
}

// ToStoreApprovedMemory mengonversi domain ApprovedMemory ke store.ApprovedMemory.
func ToStoreApprovedMemory(dm *ApprovedMemory) *store.ApprovedMemory {
	if dm == nil {
		return nil
	}
	decList := make([]store.ApprovedDecisionItem, len(dm.DecisionsList))
	for i, d := range dm.DecisionsList {
		evs := make([]store.ApprovedEvidenceItem, len(d.Evidences))
		for j, ev := range d.Evidences {
			evs[j] = store.ApprovedEvidenceItem{
				MessageID:  ev.MessageID,
				Preview:    ev.Preview,
				SenderName: ev.SenderName,
				SentAt:     ev.SentAt,
			}
		}
		decList[i] = store.ApprovedDecisionItem{
			Position:      d.Position,
			Text:          d.Text,
			Confidence:    d.Confidence,
			IsHumanEdited: d.IsHumanEdited,
			Evidences:     evs,
		}
	}
	return &store.ApprovedMemory{
		ID:                   dm.ID,
		TenantID:             dm.TenantID,
		DraftID:              dm.DraftID,
		ForumID:              dm.ContextID,
		GroupID:              dm.ParentID,
		ApprovedBy:           dm.ApprovedBy,
		ApprovedAt:           dm.ApprovedAt,
		HasHumanEdits:        dm.HasHumanEdits,
		SnapshotSummary:      dm.SnapshotSummary,
		SnapshotSummaryConf:  dm.SnapshotSummaryConf,
		SnapshotDecisions:    dm.SnapshotDecisions,
		DecisionsList:        decList,
		SnapshotJourneyLite:  dm.SnapshotJourneyLite,
		SnapshotJourneyConf:  dm.SnapshotJourneyConf,
		IsJourneyLiteRemoved: dm.IsJourneyLiteRemoved,
		CreatedAt:            dm.CreatedAt,
	}
}
