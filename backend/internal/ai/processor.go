package ai

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
)

// MemoryProcessor mengimplementasikan worker.MemoryJobProcessor.
// Menghubungkan pengambilan riwayat pesan forum, pemanggilan AIService, resolusi snapshot evidence,
// dan penyimpanan transaksional draft memori ke database.
type MemoryProcessor struct {
	memoryStore  store.MemoryStore
	messageStore store.MessageStore
	groupStore   store.GroupStore
	aiService    AIService
}

// NewMemoryProcessor membuat instance baru MemoryProcessor.
func NewMemoryProcessor(memStore store.MemoryStore, msgStore store.MessageStore, groupStore store.GroupStore, ai AIService) *MemoryProcessor {
	return &MemoryProcessor{
		memoryStore:  memStore,
		messageStore: msgStore,
		groupStore:   groupStore,
		aiService:    ai,
	}
}

// ProcessMemoryJob mengeksekusi pipeline pembuatan draft memori lengkap untuk satu forum kedaluwarsa.
func (p *MemoryProcessor) ProcessMemoryJob(ctx context.Context, job *store.ForumMemoryJob, messageCount int) error {
	log.Printf("🧠 [MemoryProcessor] Memulai pemrosesan AI untuk forum %s (Grup: %s)...", job.ForumID, job.GroupID)

	// 1. Ambil metadata nama Forum dan nama Grup induk
	forumTitle := "Forum Diskusi"
	groupTitle := "Grup Diskusi"
	if p.groupStore != nil {
		if forumDetails, err := p.groupStore.GetGroupDetails(job.ForumID, ""); err == nil && forumDetails != nil && forumDetails.Title != "" {
			forumTitle = forumDetails.Title
		}
		if groupDetails, err := p.groupStore.GetGroupDetails(job.GroupID, ""); err == nil && groupDetails != nil && groupDetails.Title != "" {
			groupTitle = groupDetails.Title
		}
	}

	// 2. Ambil riwayat pesan percakapan dari forum (maksimal 1.000 pesan kronologis terurut)
	var rawMessages []store.StoredMessage
	if p.messageStore != nil {
		history, err := p.messageStore.GetRoomHistory(job.ForumID, 1000)
		if err != nil {
			return fmt.Errorf("gagal mengambil riwayat pesan forum: %w", err)
		}
		rawMessages = history
	}

	// Filter pesan yang belum dihapus
	var validMessages []store.StoredMessage
	for _, m := range rawMessages {
		if !m.IsDeleted {
			validMessages = append(validMessages, m)
		}
	}

	// Batasi maksimal 1.000 pesan (Section 5)
	wasTruncated := false
	truncationNote := ""
	if len(validMessages) > 1000 {
		wasTruncated = true
		truncationNote = fmt.Sprintf("CATATAN: Forum ini memiliki %d pesan. Analisis dibatasi ke 1.000 pesan terakhir.", len(validMessages))
		validMessages = validMessages[len(validMessages)-1000:]
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
				if len(preview) > 200 {
					preview = preview[:197] + "..."
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

	log.Printf("🎉 [MemoryProcessor] Sukses membuat MemoryDraft %s dengan %d artefak untuk forum %s",
		draft.ID, len(artifacts), job.ForumID)
	return nil
}
