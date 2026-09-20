package ai

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

func TestAI_BuildUserPrompt(t *testing.T) {
	now := time.Now().UTC()
	msgs := []store.StoredMessage{
		{
			ID:        "msg_1",
			Nickname:  "Alice",
			Content:   "Halo, mari kita diskusikan arsitektur sistem.",
			Timestamp: now.Add(-10 * time.Minute),
			IsDeleted: false,
		},
		{
			ID:        "msg_2_deleted",
			Nickname:  "Bob",
			Content:   "Pesan ini sudah dihapus",
			Timestamp: now.Add(-8 * time.Minute),
			IsDeleted: true,
		},
		{
			ID:        "msg_3",
			Nickname:  "Charlie",
			Content:   "Saya usulkan pakai PostgreSQL SKIP LOCKED.",
			Timestamp: now.Add(-5 * time.Minute),
			IsDeleted: false,
		},
	}

	input := MemoryGenerationInput{
		ForumTitle:        "Arsitektur Queue",
		GroupTitle:        "Wuzz Core Team",
		DurationDays:      7,
		TotalMessageCount: 3,
		WasTruncated:      true,
		TruncationNote:    "CATATAN: Analisis mencakup 1.000 pesan terakhir.",
		Messages:          msgs,
	}

	prompt := BuildUserPrompt(input)

	// Verifikasi sections
	if !strings.Contains(prompt, "[INFORMASI FORUM]") {
		t.Errorf("expected [INFORMASI FORUM] in prompt")
	}
	if !strings.Contains(prompt, "Nama Forum: Arsitektur Queue") {
		t.Errorf("expected forum name in prompt")
	}
	if !strings.Contains(prompt, "[DATA DISKUSI]") {
		t.Errorf("expected [DATA DISKUSI] in prompt")
	}
	if !strings.Contains(prompt, "[MSG_ID:msg_1]") {
		t.Errorf("expected msg_1 in prompt")
	}
	if strings.Contains(prompt, "[MSG_ID:msg_2_deleted]") {
		t.Errorf("deleted message should NOT be in prompt")
	}
	if !strings.Contains(prompt, "CATATAN: Analisis mencakup 1.000 pesan terakhir.") {
		t.Errorf("expected truncation note in prompt")
	}
	if !strings.Contains(prompt, "[PERMINTAAN OUTPUT]") {
		t.Errorf("expected [PERMINTAAN OUTPUT] in prompt")
	}
}

func TestAI_ParseStructuredOutput(t *testing.T) {
	// 1. Valid JSON wrapped in markdown code fence
	rawMarkdown := "```json\n" + `{
  "summary": {
    "content": "Diskusi berfokus pada arsitektur antrean job memory.",
    "confidence": "HIGH"
  },
  "decisions": [
    {
      "position": 1,
      "text": "Menggunakan PostgreSQL SKIP LOCKED.",
      "confidence": "HIGH",
      "evidence_message_ids": ["msg_1", "msg_3"]
    }
  ],
  "journey_lite": {
    "skipped": false,
    "content": {
      "initially": "Awalnya bingung memilih antrean.",
      "then": "Kemudian menimbang kompleksitas.",
      "finally_": "Akhirnya sepakat menggunakan PostgreSQL."
    },
    "confidence": "HIGH"
  }
}` + "\n```"

	output, err := ParseStructuredOutput(rawMarkdown)
	if err != nil {
		t.Fatalf("ParseStructuredOutput markdown gagal: %v", err)
	}

	if output.Summary.Content != "Diskusi berfokus pada arsitektur antrean job memory." {
		t.Errorf("summary content mismatch: %s", output.Summary.Content)
	}
	if output.Summary.Confidence != store.ConfidenceHigh {
		t.Errorf("summary confidence mismatch: %s", output.Summary.Confidence)
	}
	if len(output.Decisions) != 1 {
		t.Fatalf("expected 1 decision, got %d", len(output.Decisions))
	}
	if len(output.Decisions[0].EvidenceMessageIDs) != 2 {
		t.Errorf("expected 2 evidence IDs, got %d", len(output.Decisions[0].EvidenceMessageIDs))
	}
	if output.JourneyLite.Skipped {
		t.Errorf("expected journey lite not skipped")
	}
	if output.JourneyLite.Content.Finally != "Akhirnya sepakat menggunakan PostgreSQL." {
		t.Errorf("journey finally mismatch: %s", output.JourneyLite.Content.Finally)
	}

	// 2. Journey Lite Skipped
	rawSkipped := `{
  "summary": { "content": "Rapat singkat konfirmasi.", "confidence": "MEDIUM" },
  "decisions": [],
  "journey_lite": { "skipped": true, "skip_reason": "instant_consensus", "confidence": "LOW" }
}`
	outSkipped, err := ParseStructuredOutput(rawSkipped)
	if err != nil {
		t.Fatalf("ParseStructuredOutput skipped gagal: %v", err)
	}
	if !outSkipped.JourneyLite.Skipped {
		t.Errorf("expected journey lite skipped = true")
	}
	if outSkipped.JourneyLite.Content != nil {
		t.Errorf("expected journey lite content = nil when skipped")
	}

	// 3. Error case: empty summary
	rawEmptySummary := `{ "summary": { "content": "" }, "decisions": [] }`
	_, err = ParseStructuredOutput(rawEmptySummary)
	if err == nil {
		t.Errorf("expected error for empty summary")
	}
}

func setupTestAIEngineEnv(t *testing.T) (*store.SQLMessageStore, *store.SQLUserStore, store.MemoryStore, func()) {
	tmpDB := filepath.Join(t.TempDir(), "test_ai_engine.db")
	sqlStore, err := store.NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("Gagal inisialisasi sqlStore: %v", err)
	}
	userStore := store.NewSQLUserStore(sqlStore.DB(), "sqlite")
	memStore := store.NewSQLMemoryStore(sqlStore.DB(), "sqlite")

	return sqlStore, userStore, memStore, func() {
		sqlStore.Close()
	}
}

func TestAI_MemoryProcessor_FullPipeline(t *testing.T) {
	msgStore, userStore, memStore, cleanup := setupTestAIEngineEnv(t)
	defer cleanup()
	ctx := context.Background()

	// 1. Buat grup dan forum
	creator, _ := userStore.Register("ai_creator", "Creator", "Pass123!")
	group, _ := userStore.CreateGroup("Product Engineering", "Desc", "", creator.ID, "prod_eng", true, nil)
	sub, _ := userStore.CreateSubGroup(group.ID, "Topik Forum Memori", "Desc", creator.ID, "7_days", true)

	// 2. Simpan pesan-pesan ke forum
	msg1ID := "msg_" + uuid.New().String()
	msg2ID := "msg_" + uuid.New().String()
	_ = msgStore.Save(store.StoredMessage{
		ID:        msg1ID,
		RoomID:    sub.ID,
		FromID:    creator.ID,
		Nickname:  "Creator",
		ToID:      sub.ID,
		Content:   "Apakah kita siap meluncurkan MVP Group Memory AI?",
		Timestamp: time.Now().UTC().Add(-15 * time.Minute),
	})
	_ = msgStore.Save(store.StoredMessage{
		ID:        msg2ID,
		RoomID:    sub.ID,
		FromID:    "usr_engineer",
		Nickname:  "Lead Engineer",
		ToID:      sub.ID,
		Content:   "Siap, seluruh test lulus 100% dan arsitektur sudah solid.",
		Timestamp: time.Now().UTC().Add(-5 * time.Minute),
	})

	// 3. Buat ForumMemoryJob
	job, err := memStore.CreateJob(ctx, sub.ID, group.ID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}

	// 4. Inisialisasi Processor dengan MockAIService
	mockAI := &MockAIService{
		CustomOutput: &MemoryGenerationOutput{
			Summary: AISummaryOutput{
				Content:    "Forum menyepakati kesiapan peluncuran MVP Group Memory AI.",
				Confidence: store.ConfidenceHigh,
			},
			Decisions: []AIDecisionOutput{
				{
					Position:           1,
					Text:               "Meluncurkan MVP Group Memory AI ke production.",
					Confidence:         store.ConfidenceHigh,
					EvidenceMessageIDs: []string{msg2ID},
				},
			},
			JourneyLite: AIJourneyLiteOutput{
				Skipped: false,
				Content: &AIJourneyLiteContent{
					Initially: "Awalnya terdapat pertanyaan mengenai kesiapan peluncuran.",
					Then:      "Kemudian lead engineer mengonfirmasi bahwa seluruh test lulus.",
					Finally:   "Akhirnya disepakati peluncuran MVP.",
				},
				Confidence: store.ConfidenceHigh,
			},
		},
	}

	processor := NewMemoryProcessor(memStore, msgStore, userStore, mockAI)

	// 5. Eksekusi ProcessMemoryJob
	err = processor.ProcessMemoryJob(ctx, job, 2)
	if err != nil {
		t.Fatalf("ProcessMemoryJob gagal: %v", err)
	}

	// 6. Verifikasi Status Job -> COMPLETED
	completedJob, err := memStore.GetJobByID(ctx, job.ID)
	if err != nil {
		t.Fatalf("GetJobByID gagal: %v", err)
	}
	if completedJob.Status != store.JobStatusCompleted {
		t.Errorf("expected job status COMPLETED, got %s", completedJob.Status)
	}

	// 7. Verifikasi MemoryDraft otomatis terbuat
	draft, err := memStore.GetDraftByForumID(ctx, sub.ID)
	if err != nil {
		t.Fatalf("GetDraftByForumID gagal: %v", err)
	}
	if draft.Status != store.DraftStatusDraft {
		t.Errorf("expected draft status DRAFT, got %s", draft.Status)
	}
	if draft.MessageCountProcessed != 2 {
		t.Errorf("expected 2 messages processed, got %d", draft.MessageCountProcessed)
	}
	if len(draft.Artifacts) != 3 { // Summary, Decision, Journey Lite
		t.Fatalf("expected 3 artifacts, got %d", len(draft.Artifacts))
	}

	// 8. Verifikasi Resolusi Evidence Snapshot pada Decision
	var decisionArt *store.MemoryArtifact
	for i := range draft.Artifacts {
		if draft.Artifacts[i].Type == store.ArtifactTypeDecision {
			decisionArt = &draft.Artifacts[i]
			break
		}
	}
	if decisionArt == nil {
		t.Fatalf("decision artifact not found")
	}
	if len(decisionArt.Evidences) != 1 {
		t.Fatalf("expected 1 evidence attached, got %d", len(decisionArt.Evidences))
	}

	evidence := decisionArt.Evidences[0]
	if evidence.MessageID != msg2ID {
		t.Errorf("evidence message ID mismatch: expected %s, got %s", msg2ID, evidence.MessageID)
	}
	if evidence.MessageSenderName != "Lead Engineer" {
		t.Errorf("evidence sender mismatch: expected 'Lead Engineer', got '%s'", evidence.MessageSenderName)
	}
	if !strings.Contains(evidence.MessagePreview, "seluruh test lulus") {
		t.Errorf("evidence preview mismatch: %s", evidence.MessagePreview)
	}
}

func TestAI_MemoryProcessor_EmptyForum(t *testing.T) {
	msgStore, userStore, memStore, cleanup := setupTestAIEngineEnv(t)
	defer cleanup()
	ctx := context.Background()

	creator, _ := userStore.Register("empty_creator", "Creator", "Pass123!")
	group, _ := userStore.CreateGroup("Empty Group", "Desc", "", creator.ID, "empty_grp", true, nil)
	sub, _ := userStore.CreateSubGroup(group.ID, "Topik Kosong", "Desc", creator.ID, "7_days", true)

	job, err := memStore.CreateJob(ctx, sub.ID, group.ID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}

	processor := NewMemoryProcessor(memStore, msgStore, userStore, &MockAIService{})

	// Proses forum kosong
	err = processor.ProcessMemoryJob(ctx, job, 0)
	if err != nil {
		t.Fatalf("ProcessMemoryJob forum kosong gagal: %v", err)
	}

	completedJob, _ := memStore.GetJobByID(ctx, job.ID)
	if completedJob.Status != store.JobStatusCompleted {
		t.Errorf("expected completed job, got %s", completedJob.Status)
	}

	draft, err := memStore.GetDraftByForumID(ctx, sub.ID)
	if err != nil {
		t.Fatalf("GetDraftByForumID gagal: %v", err)
	}
	if draft.MessageCountProcessed != 0 {
		t.Errorf("expected 0 messages processed, got %d", draft.MessageCountProcessed)
	}
}

func TestAI_ProviderFactoryAndErrors(t *testing.T) {
	// Test error helpers
	if !IsRetryableAIError(ErrAIRateLimited) {
		t.Errorf("expected ErrAIRateLimited to be retryable")
	}
	if !IsRetryableAIError(ErrAITimeout) {
		t.Errorf("expected ErrAITimeout to be retryable")
	}
	if !IsRetryableAIError(ErrInvalidJSONOutput) {
		t.Errorf("expected ErrInvalidJSONOutput to be retryable")
	}
	if IsRetryableAIError(ErrAIBadAuth) {
		t.Errorf("expected ErrAIBadAuth to NOT be retryable")
	}

	// Test factory fallback
	t.Setenv("AI_PROVIDER", "mock")
	svc := NewAIServiceFromEnv()
	if _, ok := svc.(*MockAIService); !ok {
		t.Errorf("expected MockAIService from env")
	}

	// Test Groq provider factory
	t.Setenv("AI_PROVIDER", "groq")
	t.Setenv("GROQ_API_KEY", "test-groq-key")
	t.Setenv("GROQ_MODEL", "qwen/qwen3.8-27b")
	groqSvc := NewAIServiceFromEnv()
	if _, ok := groqSvc.(*GroqProvider); !ok {
		t.Errorf("expected GroqProvider from env when AI_PROVIDER=groq")
	}
}

func TestAI_MemoryProcessorWithPushNotification(t *testing.T) {
	msgStore, userStore, memStore, cleanup := setupTestAIEngineEnv(t)
	defer cleanup()
	ctx := context.Background()

	creator, _ := userStore.Register("notif_creator", "Creator", "Pass123!")
	group, _ := userStore.CreateGroup("Push Group", "Desc", "", creator.ID, "push_grp", true, nil)
	sub, _ := userStore.CreateSubGroup(group.ID, "Topik Notif", "Desc", creator.ID, "7_days", true)

	job, err := memStore.CreateJob(ctx, sub.ID, group.ID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}

	pushSvc := push.NewService(userStore)
	processor := NewMemoryProcessor(memStore, msgStore, userStore, &MockAIService{})
	processor.SetPushService(pushSvc)

	err = processor.ProcessMemoryJob(ctx, job, 0)
	if err != nil {
		t.Fatalf("ProcessMemoryJob with push gagal: %v", err)
	}

	completedJob, _ := memStore.GetJobByID(ctx, job.ID)
	if completedJob.Status != store.JobStatusCompleted {
		t.Errorf("expected completed job, got %s", completedJob.Status)
	}
}

func TestAI_GroqProvider_Live(t *testing.T) {
	apiKey := os.Getenv("GROQ_API_KEY")
	if apiKey == "" {
		t.Skip("GROQ_API_KEY tidak diset, lewati live test")
	}

	model := os.Getenv("GROQ_MODEL")
	if model == "" {
		model = "qwen/qwen3.8-27b"
	}

	provider := NewGroqProvider(apiKey, model)
	input := MemoryGenerationInput{
		ForumTitle:        "Rencana Liburan Bareng",
		GroupTitle:        "Keluarga Besar",
		DurationDays:      7,
		TotalMessageCount: 4,
		Messages: []store.StoredMessage{
			{ID: "msg_1", Nickname: "Alice", Content: "Halo semua, bagaimana kalau kita liburan akhir tahun ke Yogyakarta?", Timestamp: time.Now().Add(-4 * time.Hour)},
			{ID: "msg_2", Nickname: "Bob", Content: "Ide bagus! Kita bisa kunjungi Candi Borobudur dan Malioboro.", Timestamp: time.Now().Add(-3 * time.Hour)},
			{ID: "msg_3", Nickname: "Charlie", Content: "Saya setuju ke Yogyakarta. Anggaran per orang kira-kira 1.5 juta ya.", Timestamp: time.Now().Add(-2 * time.Hour)},
			{ID: "msg_4", Nickname: "Alice", Content: "Oke sepakat ya, tanggal 25-28 Desember kita ke Yogyakarta.", Timestamp: time.Now().Add(-1 * time.Hour)},
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	output, err := provider.GenerateMemory(ctx, input)
	if err != nil {
		t.Fatalf("Groq GenerateMemory gagal: %v", err)
	}

	if output.Summary.Content == "" {
		t.Errorf("Summary.Content kosong")
	}
	t.Logf("✅ [Live Groq Test] Summary: %s (Confidence: %s)", output.Summary.Content, output.Summary.Confidence)
	t.Logf("✅ [Live Groq Test] Decisions (%d): %+v", len(output.Decisions), output.Decisions)
	if !output.JourneyLite.Skipped && output.JourneyLite.Content != nil {
		t.Logf("✅ [Live Groq Test] Journey Lite: Initially='%s', Then='%s', Finally='%s'",
			output.JourneyLite.Content.Initially, output.JourneyLite.Content.Then, output.JourneyLite.Content.Finally)
	}
}

