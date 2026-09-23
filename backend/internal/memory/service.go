package memory

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
)

// GroupAccessChecker mendefinisikan interface minimal untuk pemeriksaan peran dan metadata grup.
type GroupAccessChecker interface {
	GetUserRoleInGroup(conversationID, userID string) (string, error)
	GetGroupDetails(conversationID, currentUserID string) (*store.GroupDetails, error)
	GetGroupMembers(conversationID string) ([]store.GroupMemberItem, error)
}

// MemoryNotifier mendefinisikan abstraksi pengiriman notifikasi realtime dan push.
type MemoryNotifier interface {
	BroadcastGroupSystemEvent(groupID, eventType, content string)
	NotifyMemoryEvent(userIDs []string, title, body, tag string, data map[string]interface{})
}

// -----------------------------------------------------------------------------
// DTOs (Data Transfer Objects)
// -----------------------------------------------------------------------------

// MemoryDraftListItem adalah butir daftar draft untuk konsumsi antarmuka admin.
type MemoryDraftListItem struct {
	DraftID               string     `json:"draft_id"`
	JobID                 string     `json:"job_id"`
	ForumID               string     `json:"forum_id"`
	ForumTitle            string     `json:"forum_title"`
	GroupID               string     `json:"group_id"`
	Status                string     `json:"status"`
	MessageCountProcessed int        `json:"message_count_processed"`
	WasTruncated          bool       `json:"was_truncated"`
	TruncationNote        string     `json:"truncation_note,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
	ReviewedAt            *time.Time `json:"reviewed_at,omitempty"`
	ReviewedBy            string     `json:"reviewed_by,omitempty"`
}

// MemoryDraftDetail memuat detail utuh draft memori beserta seluruh artefaknya.
type MemoryDraftDetail struct {
	ID                    string           `json:"id"`
	JobID                 string           `json:"job_id"`
	ForumID               string           `json:"forum_id"`
	ForumTitle            string           `json:"forum_title"`
	GroupID               string           `json:"group_id"`
	Status                string           `json:"status"`
	MessageCountProcessed int              `json:"message_count_processed"`
	WasTruncated          bool             `json:"was_truncated"`
	TruncationNote        string           `json:"truncation_note,omitempty"`
	ReviewedAt            *time.Time       `json:"reviewed_at,omitempty"`
	ReviewedBy            string           `json:"reviewed_by,omitempty"`
	RejectionReason       string           `json:"rejection_reason,omitempty"`
	CreatedAt             time.Time        `json:"created_at"`
	Artifacts             []MemoryArtifact `json:"artifacts"`
}

// GroupMemoryListItem memuat ringkasan memori yang telah disetujui dalam sebuah grup.
type GroupMemoryListItem struct {
	ID                  string    `json:"id"`
	DraftID             string    `json:"draft_id"`
	ForumID             string    `json:"forum_id"`
	ForumTitle          string    `json:"forum_title"`
	GroupID             string    `json:"group_id"`
	ApprovedBy          string    `json:"approved_by"`
	ApprovedAt          time.Time `json:"approved_at"`
	HasHumanEdits       bool      `json:"has_human_edits"`
	SnapshotSummary     string    `json:"snapshot_summary"`
	SnapshotSummaryConf string    `json:"snapshot_summary_conf"`
	DecisionsCount      int       `json:"decisions_count"`
	HasJourneyLite      bool      `json:"has_journey_lite"`
	HasViewed           bool      `json:"has_viewed"`
}

// ApprovedMemoryDetail adalah respons lengkap pembacaan memori terpublikasi.
type ApprovedMemoryDetail struct {
	ID                   string                 `json:"id"`
	DraftID              string                 `json:"draft_id"`
	ForumID              string                 `json:"forum_id"`
	ForumTitle           string                 `json:"forum_title"`
	GroupID              string                 `json:"group_id"`
	ApprovedBy           string                 `json:"approved_by"`
	ApprovedByName       string                 `json:"approved_by_name,omitempty"`
	ApprovedAt           time.Time              `json:"approved_at"`
	HasHumanEdits        bool                   `json:"has_human_edits"`
	SnapshotSummary      string                 `json:"snapshot_summary"`
	SnapshotSummaryConf  string                 `json:"snapshot_summary_conf"`
	Decisions            []ApprovedDecisionItem `json:"snapshot_decisions"`
	SnapshotJourneyLite  string                 `json:"snapshot_journey_lite,omitempty"`
	SnapshotJourneyConf  string                 `json:"snapshot_journey_conf,omitempty"`
	IsJourneyLiteRemoved bool                   `json:"is_journey_lite_removed"`
	CreatedAt            time.Time              `json:"created_at"`
}

// -----------------------------------------------------------------------------
// Application Service: MemoryService
// -----------------------------------------------------------------------------

// MemoryService mengorkestrasikan seluruh use case domain Memory Engine.
type MemoryService struct {
	repo        MemoryRepository
	contextSrc  ContextSource
	registry    ContextSourceRegistry
	accessCheck GroupAccessChecker
	notifier    MemoryNotifier
}

// NewMemoryService membuat instansiasi baru MemoryService.
func NewMemoryService(
	repo MemoryRepository,
	cSrc ContextSource,
	registry ContextSourceRegistry,
	accessCheck GroupAccessChecker,
	notifier MemoryNotifier,
) *MemoryService {
	return &MemoryService{
		repo:        repo,
		contextSrc:  cSrc,
		registry:    registry,
		accessCheck: accessCheck,
		notifier:    notifier,
	}
}

// checkAdminRole memverifikasi apakah userID adalah admin/creator di grup tertentu.
func (s *MemoryService) checkAdminRole(groupID, userID string) (bool, error) {
	if s.accessCheck == nil {
		return false, errors.New("access checker belum diinisialisasi")
	}
	role, err := s.accessCheck.GetUserRoleInGroup(groupID, userID)
	if err != nil {
		return false, nil
	}
	return role == "admin" || role == "creator", nil
}

// resolveContextSource mengambil ContextSource yang aktif.
func (s *MemoryService) resolveContextSource(cType ContextType) ContextSource {
	if s.registry != nil {
		if src, ok := s.registry.Get(cType); ok && src != nil {
			return src
		}
	}
	return s.contextSrc
}

// ListDrafts mengambil daftar draft memori yang menunggu validasi di grup tertentu.
func (s *MemoryService) ListDrafts(ctx context.Context, groupID, status, currentUserID string) ([]MemoryDraftListItem, error) {
	if groupID == "" {
		return nil, errors.New("group_id wajib disertakan")
	}

	isAdmin, err := s.checkAdminRole(groupID, currentUserID)
	if err != nil {
		return nil, fmt.Errorf("gagal verifikasi peran: %w", err)
	}
	if !isAdmin {
		return nil, ErrUnauthorizedAccess
	}

	drafts, err := s.repo.GetDraftsByParentID(ctx, groupID, status)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil daftar draft: %w", err)
	}

	cSource := s.resolveContextSource(ContextTypeForum)
	items := make([]MemoryDraftListItem, 0, len(drafts))
	for _, d := range drafts {
		forumTitle := "Forum Diskusi"
		if cSource != nil {
			if meta, errM := cSource.GetContextMeta(ctx, d.ContextID); errM == nil && meta != nil && meta.Title != "" {
				forumTitle = meta.Title
			}
		} else if s.accessCheck != nil {
			if dtl, errD := s.accessCheck.GetGroupDetails(d.ContextID, ""); errD == nil && dtl != nil && dtl.Title != "" {
				forumTitle = dtl.Title
			}
		}

		items = append(items, MemoryDraftListItem{
			DraftID:               d.ID,
			JobID:                 d.JobID,
			ForumID:               d.ContextID,
			ForumTitle:            forumTitle,
			GroupID:               d.ParentID,
			Status:                d.Status,
			MessageCountProcessed: d.MessageCountProcessed,
			WasTruncated:          d.WasTruncated,
			TruncationNote:        d.TruncationNote,
			CreatedAt:             d.CreatedAt,
			ReviewedAt:            d.ReviewedAt,
			ReviewedBy:            d.ReviewedBy,
		})
	}

	return items, nil
}

// GetDraftDetail mengambil detail utuh sebuah draft memori beserta seluruh artefaknya.
func (s *MemoryService) GetDraftDetail(ctx context.Context, draftID, currentUserID string) (*MemoryDraftDetail, string, error) {
	if draftID == "" {
		return nil, "", errors.New("draft_id wajib disertakan")
	}

	draft, err := s.repo.GetDraftByID(ctx, draftID)
	if err != nil {
		return nil, "", err
	}

	isAdmin, err := s.checkAdminRole(draft.ParentID, currentUserID)
	if err != nil {
		return nil, "", fmt.Errorf("gagal verifikasi peran: %w", err)
	}
	if !isAdmin {
		return nil, "", ErrUnauthorizedAccess
	}

	artifacts, err := s.repo.GetArtifactsByDraftID(ctx, draftID)
	if err != nil {
		return nil, "", fmt.Errorf("gagal mengambil artefak draft: %w", err)
	}

	forumTitle := "Forum Diskusi"
	cSource := s.resolveContextSource(ContextTypeForum)
	if cSource != nil {
		if meta, errM := cSource.GetContextMeta(ctx, draft.ContextID); errM == nil && meta != nil && meta.Title != "" {
			forumTitle = meta.Title
		}
	} else if s.accessCheck != nil {
		if dtl, errD := s.accessCheck.GetGroupDetails(draft.ContextID, ""); errD == nil && dtl != nil && dtl.Title != "" {
			forumTitle = dtl.Title
		}
	}

	role, _ := s.accessCheck.GetUserRoleInGroup(draft.ParentID, currentUserID)

	detail := &MemoryDraftDetail{
		ID:                    draft.ID,
		JobID:                 draft.JobID,
		ForumID:               draft.ContextID,
		ForumTitle:            forumTitle,
		GroupID:               draft.ParentID,
		Status:                draft.Status,
		MessageCountProcessed: draft.MessageCountProcessed,
		WasTruncated:          draft.WasTruncated,
		TruncationNote:        draft.TruncationNote,
		ReviewedAt:            draft.ReviewedAt,
		ReviewedBy:            draft.ReviewedBy,
		RejectionReason:       draft.RejectionReason,
		CreatedAt:             draft.CreatedAt,
		Artifacts:             artifacts,
	}

	return detail, role, nil
}

// UpdateArtifactContent menyunting isi artefak dan mencatat log audit review action.
func (s *MemoryService) UpdateArtifactContent(ctx context.Context, draftID, artifactID, content, currentUserID string) (*MemoryArtifact, error) {
	draft, err := s.repo.GetDraftByID(ctx, draftID)
	if err != nil {
		return nil, err
	}

	if draft.Status != DraftStatusDraft {
		return nil, ErrDraftAlreadyReviewed
	}

	isAdmin, err := s.checkAdminRole(draft.ParentID, currentUserID)
	if err != nil {
		return nil, fmt.Errorf("gagal verifikasi peran: %w", err)
	}
	if !isAdmin {
		return nil, ErrUnauthorizedAccess
	}

	existingArt, err := s.repo.GetArtifactByID(ctx, artifactID)
	if err != nil {
		return nil, err
	}
	if existingArt.DraftID != draftID {
		return nil, errors.New("artefak tidak sesuai dengan draft yang dituju")
	}

	trimmedContent := strings.TrimSpace(content)
	if trimmedContent == "" {
		return nil, errors.New("content tidak boleh kosong")
	}

	isHumanEdited := trimmedContent != existingArt.AIOriginalContent

	if err := s.repo.UpdateArtifact(ctx, artifactID, trimmedContent, isHumanEdited); err != nil {
		return nil, fmt.Errorf("gagal memperbarui artefak: %w", err)
	}

	actionType := ActionEditedSummary
	if existingArt.Type == ArtifactTypeDecision {
		actionType = ActionEditedDecision
	}

	reviewAction := &MemoryReviewAction{
		ID:         uuid.New().String(),
		DraftID:    draftID,
		AdminID:    currentUserID,
		Action:     actionType,
		ArtifactID: artifactID,
		OldContent: existingArt.Content,
		NewContent: trimmedContent,
		CreatedAt:  time.Now().UTC(),
	}
	_ = s.repo.RecordReviewAction(ctx, reviewAction)

	updatedArt, err := s.repo.GetArtifactByID(ctx, artifactID)
	if err != nil {
		return nil, err
	}
	return updatedArt, nil
}

// RemoveJourneyLite menandai Journey Lite di-remove dan mencatat audit action.
func (s *MemoryService) RemoveJourneyLite(ctx context.Context, draftID, currentUserID string) error {
	draft, err := s.repo.GetDraftByID(ctx, draftID)
	if err != nil {
		return err
	}

	if draft.Status != DraftStatusDraft {
		return ErrDraftAlreadyReviewed
	}

	isAdmin, err := s.checkAdminRole(draft.ParentID, currentUserID)
	if err != nil {
		return fmt.Errorf("gagal verifikasi peran: %w", err)
	}
	if !isAdmin {
		return ErrUnauthorizedAccess
	}

	if err := s.repo.RemoveJourneyLite(ctx, draftID); err != nil {
		return fmt.Errorf("gagal menghapus journey lite: %w", err)
	}

	reviewAction := &MemoryReviewAction{
		ID:        uuid.New().String(),
		DraftID:   draftID,
		AdminID:   currentUserID,
		Action:    ActionRemovedJourneyLite,
		CreatedAt: time.Now().UTC(),
	}
	_ = s.repo.RecordReviewAction(ctx, reviewAction)

	return nil
}

// ApproveDraft menyetujui draft memori, membuat snapshot ApprovedMemory, dan memicu notifikasi.
func (s *MemoryService) ApproveDraft(ctx context.Context, draftID, adminID string, forceChangesFlag bool) (*ApprovedMemory, error) {
	draft, err := s.repo.GetDraftByID(ctx, draftID)
	if err != nil {
		return nil, err
	}

	if draft.Status != DraftStatusDraft {
		return nil, ErrDraftAlreadyReviewed
	}

	isAdmin, err := s.checkAdminRole(draft.ParentID, adminID)
	if err != nil {
		return nil, fmt.Errorf("gagal verifikasi peran: %w", err)
	}
	if !isAdmin {
		return nil, ErrUnauthorizedAccess
	}

	artifacts, err := s.repo.GetArtifactsByDraftID(ctx, draftID)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil artefak draft: %w", err)
	}

	hasHumanEdits := forceChangesFlag
	approvedMem := &ApprovedMemory{
		ID:                   uuid.New().String(),
		DraftID:              draft.ID,
		ContextID:            draft.ContextID,
		ContextType:          draft.ContextType,
		ParentID:             draft.ParentID,
		ApprovedBy:           adminID,
		ApprovedAt:           time.Now().UTC(),
		CreatedAt:            time.Now().UTC(),
		SnapshotSummaryConf:  ConfidenceMedium,
		SnapshotJourneyConf:  ConfidenceMedium,
		IsJourneyLiteRemoved: false,
	}

	decisions := make([]ApprovedDecisionItem, 0)
	for _, art := range artifacts {
		if art.IsHumanEdited {
			hasHumanEdits = true
		}

		switch art.Type {
		case ArtifactTypeSummary:
			if !art.IsRemoved {
				approvedMem.SnapshotSummary = art.Content
				approvedMem.SnapshotSummaryConf = art.Confidence
			}
		case ArtifactTypeDecision:
			if !art.IsRemoved {
				pos := 1
				if art.Position != nil {
					pos = *art.Position
				}
				evList := make([]ApprovedEvidenceItem, 0, len(art.Evidences))
				for _, ev := range art.Evidences {
					evList = append(evList, ApprovedEvidenceItem{
						MessageID:  ev.MessageID,
						Preview:    ev.MessagePreview,
						SenderName: ev.MessageSenderName,
						SentAt:     ev.MessageSentAt,
					})
				}
				decisions = append(decisions, ApprovedDecisionItem{
					Position:      pos,
					Text:          art.Content,
					Confidence:    art.Confidence,
					IsHumanEdited: art.IsHumanEdited,
					Evidences:     evList,
				})
			}
		case ArtifactTypeJourneyLite:
			if art.IsRemoved {
				approvedMem.IsJourneyLiteRemoved = true
				hasHumanEdits = true
			} else {
				approvedMem.SnapshotJourneyLite = art.Content
				approvedMem.SnapshotJourneyConf = art.Confidence
				approvedMem.IsJourneyLiteRemoved = false
			}
		}
	}

	approvedMem.HasHumanEdits = hasHumanEdits
	approvedMem.DecisionsList = decisions

	decBytes, err := json.Marshal(decisions)
	if err == nil {
		approvedMem.SnapshotDecisions = string(decBytes)
	} else {
		approvedMem.SnapshotDecisions = "[]"
	}

	actionType := ActionApproved
	if hasHumanEdits {
		actionType = ActionApprovedWithEdits
	}

	reviewAction := &MemoryReviewAction{
		ID:        uuid.New().String(),
		DraftID:   draft.ID,
		AdminID:   adminID,
		Action:    actionType,
		CreatedAt: time.Now().UTC(),
	}

	if err := s.repo.ApproveDraft(ctx, draft.ID, adminID, approvedMem, reviewAction); err != nil {
		return nil, err
	}

	// Trigger real-time system event & push notifications
	if s.notifier != nil {
		s.notifier.BroadcastGroupSystemEvent(draft.ParentID, "memory_approved", "🧠 Memori grup baru telah divalidasi dan ditambahkan ke arsip!")

		if s.accessCheck != nil {
			go func(parentID, contextID, memoryID, approvedAdminID string) {
				members, errM := s.accessCheck.GetGroupMembers(parentID)
				if errM != nil || len(members) == 0 {
					return
				}
				recipientIDs := make([]string, 0, len(members))
				for _, m := range members {
					if m.UserID != approvedAdminID && m.UserID != "" {
						recipientIDs = append(recipientIDs, m.UserID)
					}
				}
				if len(recipientIDs) == 0 {
					return
				}

				forumTitle := "Forum Diskusi"
				cSource := s.resolveContextSource(ContextTypeForum)
				if cSource != nil {
					if meta, errC := cSource.GetContextMeta(context.Background(), contextID); errC == nil && meta != nil && meta.Title != "" {
						forumTitle = meta.Title
					}
				}

				s.notifier.NotifyMemoryEvent(
					recipientIDs,
					"✅ Memory Grup Tersedia",
					fmt.Sprintf("Memory dari forum '%s' kini tersedia. Baca ringkasan, keputusan, dan perjalanan diskusinya.", forumTitle),
					"memory_published_"+memoryID,
					map[string]interface{}{
						"type":               "memory_published",
						"group_id":           parentID,
						"forum_id":           contextID,
						"approved_memory_id": memoryID,
						"deep_link":          fmt.Sprintf("/chat?roomId=%s&openMemory=%s", parentID, memoryID),
					},
				)
			}(draft.ParentID, draft.ContextID, approvedMem.ID, adminID)
		}
	}

	return approvedMem, nil
}

// RejectDraft membatalkan draft memori dan mencatat audit action.
func (s *MemoryService) RejectDraft(ctx context.Context, draftID, adminID, reason string) error {
	draft, err := s.repo.GetDraftByID(ctx, draftID)
	if err != nil {
		return err
	}

	if draft.Status != DraftStatusDraft {
		return ErrDraftAlreadyReviewed
	}

	isAdmin, err := s.checkAdminRole(draft.ParentID, adminID)
	if err != nil {
		return fmt.Errorf("gagal verifikasi peran: %w", err)
	}
	if !isAdmin {
		return ErrUnauthorizedAccess
	}

	return s.repo.RejectDraft(ctx, draftID, adminID, reason)
}

// GetGroupMemories mengambil seluruh memori yang sudah di-publish untuk anggota grup tertentu.
func (s *MemoryService) GetGroupMemories(ctx context.Context, groupID, currentUserID string, limit, offset int) ([]GroupMemoryListItem, error) {
	if groupID == "" {
		return nil, errors.New("group_id wajib disertakan")
	}

	if s.accessCheck != nil {
		role, err := s.accessCheck.GetUserRoleInGroup(groupID, currentUserID)
		if err != nil || role == "" {
			return nil, ErrUnauthorizedAccess
		}
	}

	if limit <= 0 || limit > 50 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	memories, err := s.repo.GetApprovedMemoriesByParentID(ctx, groupID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil approved memories: %w", err)
	}

	cSource := s.resolveContextSource(ContextTypeForum)
	items := make([]GroupMemoryListItem, 0, len(memories))
	for _, m := range memories {
		forumTitle := "Forum Diskusi"
		if cSource != nil {
			if meta, errM := cSource.GetContextMeta(ctx, m.ContextID); errM == nil && meta != nil && meta.Title != "" {
				forumTitle = meta.Title
			}
		} else if s.accessCheck != nil {
			if dtl, errD := s.accessCheck.GetGroupDetails(m.ContextID, ""); errD == nil && dtl != nil && dtl.Title != "" {
				forumTitle = dtl.Title
			}
		}

		hasViewed, _ := s.repo.HasUserViewedMemory(ctx, m.ID, currentUserID)

		items = append(items, GroupMemoryListItem{
			ID:                  m.ID,
			DraftID:             m.DraftID,
			ForumID:             m.ContextID,
			ForumTitle:          forumTitle,
			GroupID:             m.ParentID,
			ApprovedBy:          m.ApprovedBy,
			ApprovedAt:          m.ApprovedAt,
			HasHumanEdits:       m.HasHumanEdits,
			SnapshotSummary:     m.SnapshotSummary,
			SnapshotSummaryConf: m.SnapshotSummaryConf,
			DecisionsCount:      len(m.DecisionsList),
			HasJourneyLite:      !m.IsJourneyLiteRemoved && m.SnapshotJourneyLite != "",
			HasViewed:           hasViewed,
		})
	}

	return items, nil
}

// GetApprovedMemoryDetail mengambil detail memori terpublikasi dan mencatat MemoryViewEvent jika diotorisasi.
func (s *MemoryService) GetApprovedMemoryDetail(ctx context.Context, memoryID, currentUserID string) (*ApprovedMemoryDetail, error) {
	if memoryID == "" {
		return nil, errors.New("memory_id wajib disertakan")
	}

	mem, err := s.repo.GetApprovedMemoryByID(ctx, memoryID)
	if err != nil {
		return nil, err
	}

	// Verifikasi hak akses via ContextSource atau parent group access
	authorized := false
	cSource := s.resolveContextSource(mem.ContextType)
	if cSource != nil {
		auth, errA := cSource.GetAuthorizedViewers(ctx, mem.ContextID, currentUserID)
		if errA == nil && auth {
			authorized = true
		}
	}

	var viewerRole = ViewerRoleMember
	if !authorized && s.accessCheck != nil {
		role, errR := s.accessCheck.GetUserRoleInGroup(mem.ParentID, currentUserID)
		if errR == nil && role != "" {
			authorized = true
			if role == "admin" || role == "creator" {
				viewerRole = ViewerRoleAdmin
			}
		}
	}

	if !authorized {
		return nil, ErrUnauthorizedAccess
	}

	// Catat view event secara atomik/append-only
	_ = s.repo.RecordViewEvent(ctx, &MemoryViewEvent{
		ID:               uuid.New().String(),
		ApprovedMemoryID: mem.ID,
		ContextID:        mem.ContextID,
		ParentID:         mem.ParentID,
		ViewerID:         currentUserID,
		ViewerRole:       viewerRole,
		CreatedAt:        time.Now().UTC(),
	})

	forumTitle := "Forum Diskusi"
	if cSource != nil {
		if meta, errM := cSource.GetContextMeta(ctx, mem.ContextID); errM == nil && meta != nil && meta.Title != "" {
			forumTitle = meta.Title
		}
	}

	detail := &ApprovedMemoryDetail{
		ID:                   mem.ID,
		DraftID:              mem.DraftID,
		ForumID:              mem.ContextID,
		ForumTitle:           forumTitle,
		GroupID:              mem.ParentID,
		ApprovedBy:           mem.ApprovedBy,
		ApprovedAt:           mem.ApprovedAt,
		HasHumanEdits:        mem.HasHumanEdits,
		SnapshotSummary:      mem.SnapshotSummary,
		SnapshotSummaryConf:  mem.SnapshotSummaryConf,
		Decisions:            mem.DecisionsList,
		SnapshotJourneyLite:  mem.SnapshotJourneyLite,
		SnapshotJourneyConf:  mem.SnapshotJourneyConf,
		IsJourneyLiteRemoved: mem.IsJourneyLiteRemoved,
		CreatedAt:            mem.CreatedAt,
	}

	return detail, nil
}
