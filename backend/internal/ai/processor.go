package ai

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/memory"
	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
)

// legacyForumSource adalah fallback ContextSource menggunakan store lama.
type legacyForumSource struct {
	groupStore store.GroupStore
	msgStore   store.MessageStore
}

func (s *legacyForumSource) GetMessages(ctx context.Context, contextID string, limit int) ([]store.StoredMessage, error) {
	if s.msgStore == nil {
		return nil, nil
	}
	raw, err := s.msgStore.GetRoomHistory(contextID, limit)
	if err != nil {
		return nil, err
	}
	valid := make([]store.StoredMessage, 0, len(raw))
	for _, m := range raw {
		if !m.IsDeleted {
			valid = append(valid, m)
		}
	}
	return valid, nil
}

func (s *legacyForumSource) GetContextMeta(ctx context.Context, contextID string) (*memory.MemoryContext, error) {
	title := "Forum Diskusi"
	parentID := ""
	if s.groupStore != nil {
		if d, err := s.groupStore.GetGroupDetails(contextID, ""); err == nil && d != nil {
			if d.Title != "" {
				title = d.Title
			}
			parentID = d.ParentID
		}
	}
	return &memory.MemoryContext{
		ContextID:   contextID,
		ContextType: memory.ContextTypeForum,
		ParentID:    parentID,
		Title:       title,
	}, nil
}

func (s *legacyForumSource) GetAuthorizedViewers(ctx context.Context, contextID, viewerID string) (bool, error) {
	return true, nil
}

// MemoryProcessor mengimplementasikan worker.MemoryJobProcessor dengan abstraksi ContextSource.
type MemoryProcessor struct {
	memoryStore   store.MemoryStore
	contextSource memory.ContextSource
	registry      memory.ContextSourceRegistry
	groupStore    store.GroupStore
	aiService     AIService
	pushService   *push.Service
}

// NewMemoryProcessor membuat instance baru MemoryProcessor (backward-compatible).
func NewMemoryProcessor(memStore store.MemoryStore, msgStore store.MessageStore, groupStore store.GroupStore, ai AIService) *MemoryProcessor {
	p := &MemoryProcessor{
		memoryStore: memStore,
		groupStore:  groupStore,
		aiService:   ai,
	}
	if groupStore != nil || msgStore != nil {
		p.contextSource = &legacyForumSource{
			groupStore: groupStore,
			msgStore:   msgStore,
		}
	}
	return p
}

// NewMemoryProcessorWithContextSource membuat instance MemoryProcessor dengan ContextSource eksplisit.
func NewMemoryProcessorWithContextSource(memStore store.MemoryStore, cs memory.ContextSource, ai AIService) *MemoryProcessor {
	return &MemoryProcessor{
		memoryStore:   memStore,
		contextSource: cs,
		aiService:     ai,
	}
}

// SetContextSource menyetel ContextSource secara langsung.
func (p *MemoryProcessor) SetContextSource(cs memory.ContextSource) {
	p.contextSource = cs
}

// SetRegistry menyetel ContextSourceRegistry dinamis.
func (p *MemoryProcessor) SetRegistry(reg memory.ContextSourceRegistry) {
	p.registry = reg
}

// SetPushService menyetel push service untuk pengiriman Web Push ke admin & member.
func (p *MemoryProcessor) SetPushService(ps *push.Service) {
	p.pushService = ps
}

func getMaxMessagesAnalysis() int {
	if v := os.Getenv("MEMORY_MAX_MESSAGES_ANALYSIS"); v != "" {
		if val, err := strconv.Atoi(v); err == nil && val > 0 {
			return val
		}
	}
	return 1000
}

func getEvidenceMaxPreviewLen() int {
	if v := os.Getenv("MEMORY_EVIDENCE_MAX_PREVIEW_LEN"); v != "" {
		if val, err := strconv.Atoi(v); err == nil && val > 0 {
			return val
		}
	}
	return 200
}

// ProcessMemoryJob mengeksekusi pipeline pembuatan draft memori lengkap untuk satu percakapan.
func (p *MemoryProcessor) ProcessMemoryJob(ctx context.Context, job *store.ForumMemoryJob, messageCount int) error {
	log.Printf("🧠 [MemoryProcessor] Memulai pemrosesan AI untuk forum %s (Grup: %s)...", job.ForumID, job.GroupID)

	// Tentukan ContextSource (dari registry atau instance langsung)
	cSource := p.contextSource
	if p.registry != nil {
		if src, ok := p.registry.Get(memory.ContextTypeForum); ok && src != nil {
			cSource = src
		}
	}

	// 1. Ambil metadata konteks (judul, parent grup)
	forumTitle := "Forum Diskusi"
	groupTitle := "Grup Diskusi"

	if cSource != nil {
		if meta, err := cSource.GetContextMeta(ctx, job.ForumID); err == nil && meta != nil {
			if meta.Title != "" {
				forumTitle = meta.Title
			}
			if meta.ParentID != "" && p.groupStore != nil {
				if gDetails, errG := p.groupStore.GetGroupDetails(meta.ParentID, ""); errG == nil && gDetails != nil && gDetails.Title != "" {
					groupTitle = gDetails.Title
				}
			}
		}
	} else if p.groupStore != nil {
		if forumDetails, err := p.groupStore.GetGroupDetails(job.ForumID, ""); err == nil && forumDetails != nil && forumDetails.Title != "" {
			forumTitle = forumDetails.Title
		}
		if groupDetails, err := p.groupStore.GetGroupDetails(job.GroupID, ""); err == nil && groupDetails != nil && groupDetails.Title != "" {
			groupTitle = groupDetails.Title
		}
	}

	maxMessages := getMaxMessagesAnalysis()

	// 2. Ambil riwayat pesan percakapan via ContextSource
	var validMessages []store.StoredMessage
	if cSource != nil {
		msgs, err := cSource.GetMessages(ctx, job.ForumID, maxMessages)
		if err != nil {
			return fmt.Errorf("gagal mengambil riwayat pesan forum via ContextSource: %w", err)
		}
		for _, m := range msgs {
			if !m.IsDeleted {
				validMessages = append(validMessages, m)
			}
		}
	}

	// Batasi maksimal pesan (Section 5)
	wasTruncated := false
	truncationNote := ""
	if len(validMessages) > maxMessages {
		wasTruncated = true
		truncationNote = fmt.Sprintf("CATATAN: Forum ini memiliki %d pesan. Analisis dibatasi ke %d pesan terakhir.", len(validMessages), maxMessages)
		validMessages = validMessages[len(validMessages)-maxMessages:]
	}

	// 3. Penanganan khusus jika forum kosong (< 1 pesan valid)
	if len(validMessages) == 0 {
		log.Printf("ℹ️ [MemoryProcessor] Forum %s tidak memiliki pesan aktif. Membuat draft fallback kosong.", job.ForumID)
		draft := &store.MemoryDraft{
			ID:                    uuid.New().String(),
			JobID:                 job.ID,
			ForumID:               job.ForumID,
			GroupID:               job.GroupID,
			Status:                store.DraftStatusDraft,
			MessageCountProcessed: 0,
			WasTruncated:          false,
			TruncationNote:        "Forum kedaluwarsa tanpa pesan diskusi.",
		}
		artifacts := []store.MemoryArtifact{
			{
				Type:              store.ArtifactTypeSummary,
				Content:           "Forum ini kedaluwarsa tanpa adanya aktivitas percakapan atau diskusi dari anggota.",
				AIOriginalContent: "Forum ini kedaluwarsa tanpa adanya aktivitas percakapan atau diskusi dari anggota.",
				Confidence:        store.ConfidenceLow,
			},
		}
		if err := p.memoryStore.CreateDraftWithArtifacts(ctx, draft, artifacts); err != nil {
			return fmt.Errorf("gagal simpan draft fallback kosong: %w", err)
		}
		return p.memoryStore.CompleteJob(ctx, job.ID, 0)
	}

	// Hitung perkiraan rentang hari diskusi
	durationDays := 1
	if len(validMessages) >= 2 {
		firstTime := validMessages[0].Timestamp
		lastTime := validMessages[len(validMessages)-1].Timestamp
		diff := lastTime.Sub(firstTime)
		if int(diff.Hours()/24) > 1 {
			durationDays = int(diff.Hours() / 24)
		}
	}

	// 4. Panggil Engine AI
	input := MemoryGenerationInput{
		ForumTitle:        forumTitle,
		GroupTitle:        groupTitle,
		DurationDays:      durationDays,
		TotalMessageCount: len(validMessages),
		WasTruncated:      wasTruncated,
		TruncationNote:    truncationNote,
		Messages:          validMessages,
	}

	aiOutput, err := p.aiService.GenerateMemory(ctx, input)
	if err != nil {
		return fmt.Errorf("gagal generate memory dari AIService: %w", err)
	}

	// 5. Evidence Resolution Engine (Section 7)
	// Buat index pencarian pesan cepat by ID
	msgMap := make(map[string]store.StoredMessage, len(validMessages))
	for _, m := range validMessages {
		msgMap[m.ID] = m
	}

	var artifacts []store.MemoryArtifact

	// 5.1 Artefak Summary
	artifacts = append(artifacts, store.MemoryArtifact{
		Type:              store.ArtifactTypeSummary,
		Content:           aiOutput.Summary.Content,
		AIOriginalContent: aiOutput.Summary.Content,
		Confidence:        aiOutput.Summary.Confidence,
	})

	// 5.2 Artefak Decisions & Snapshot Evidences
	for _, dec := range aiOutput.Decisions {
		pos := dec.Position
		art := store.MemoryArtifact{
			Type:              store.ArtifactTypeDecision,
			Content:           dec.Text,
			AIOriginalContent: dec.Text,
			Confidence:        dec.Confidence,
			Position:          &pos,
		}

		// Resolusi evidence snapshot
		for _, evMsgID := range dec.EvidenceMessageIDs {
			cleanID := strings.TrimSpace(evMsgID)
			// Hapus prefix MSG_ID: jika terbawa model
			cleanID = strings.TrimPrefix(cleanID, "MSG_ID:")
			cleanID = strings.TrimSpace(cleanID)

			if origMsg, exists := msgMap[cleanID]; exists {
				preview := strings.TrimSpace(origMsg.Content)
				maxPreview := getEvidenceMaxPreviewLen()
				if len(preview) > maxPreview && maxPreview > 3 {
					preview = preview[:maxPreview-3] + "..."
				} else if len(preview) > maxPreview {
					preview = preview[:maxPreview]
				}
				if preview == "" && origMsg.MediaType != "" {
					preview = fmt.Sprintf("[Lampiran: %s]", origMsg.MediaType)
				}

				senderName := origMsg.Nickname
				if senderName == "" {
					senderName = origMsg.FromID
				}

				art.Evidences = append(art.Evidences, store.ArtifactEvidence{
					MessageID:         origMsg.ID,
					MessagePreview:    preview,
					MessageSenderName: senderName,
					MessageSentAt:     origMsg.Timestamp.UTC(),
				})
			}
		}

		artifacts = append(artifacts, art)
	}

	// 5.3 Artefak Journey Lite (Awalnya... Kemudian... Akhirnya...)
	if !aiOutput.JourneyLite.Skipped && aiOutput.JourneyLite.Content != nil {
		jContent := aiOutput.JourneyLite.Content
		journeyFormatted := fmt.Sprintf("Awalnya: %s\nKemudian: %s\nAkhirnya: %s",
			jContent.Initially, jContent.Then, jContent.Finally)

		artifacts = append(artifacts, store.MemoryArtifact{
			Type:              store.ArtifactTypeJourneyLite,
			Content:           journeyFormatted,
			AIOriginalContent: journeyFormatted,
			Confidence:        aiOutput.JourneyLite.Confidence,
			IsRemoved:         false,
		})
	}

	// 6. Simpan Draft & Artefak ke Database secara Atomik
	draft := &store.MemoryDraft{
		ID:                    uuid.New().String(),
		JobID:                 job.ID,
		ForumID:               job.ForumID,
		GroupID:               job.GroupID,
		Status:                store.DraftStatusDraft,
		MessageCountProcessed: len(validMessages),
		WasTruncated:          wasTruncated,
		TruncationNote:        truncationNote,
		CreatedAt:             time.Now().UTC(),
	}

	if err := p.memoryStore.CreateDraftWithArtifacts(ctx, draft, artifacts); err != nil {
		return fmt.Errorf("gagal menyimpan memory draft ke database: %w", err)
	}

	// 7. Tandai Job Selesai (COMPLETED)
	if err := p.memoryStore.CompleteJob(ctx, job.ID, len(validMessages)); err != nil {
		return fmt.Errorf("gagal update complete job state: %w", err)
	}

	// 8. Kirim Web Push Notification ke Admin & Creator Grup (Section 11 Spec)
	if p.pushService != nil && p.groupStore != nil {
		go func(groupID, forumID, draftID, title string) {
			members, err := p.groupStore.GetGroupMembers(groupID)
			if err != nil || len(members) == 0 {
				return
			}
			adminIDs := make([]string, 0, len(members))
			for _, m := range members {
				if m.Role == "admin" || m.Role == "creator" {
					adminIDs = append(adminIDs, m.UserID)
				}
			}
			if len(adminIDs) == 0 {
				return
			}

			p.pushService.NotifyMemoryEvent(
				adminIDs,
				"📝 Draft Memory Siap Direview",
				fmt.Sprintf("Forum '%s' telah selesai. AI telah menyusun ringkasan dan keputusan. Tinjau sebelum dipublikasikan ke anggota grup.", title),
				"memory_draft_ready_"+draftID,
				map[string]interface{}{
					"type":      "memory_draft_ready",
					"group_id":  groupID,
					"forum_id":  forumID,
					"draft_id":  draftID,
					"deep_link": fmt.Sprintf("/chat?roomId=%s&openDraft=%s", groupID, draftID),
				},
			)
		}(job.GroupID, job.ForumID, draft.ID, forumTitle)
	}

	log.Printf("🎉 [MemoryProcessor] Sukses membuat MemoryDraft %s dengan %d artefak untuk forum %s",
		draft.ID, len(artifacts), job.ForumID)
	return nil
}
