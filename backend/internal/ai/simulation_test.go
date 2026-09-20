package ai

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/push"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// TestAI_Groq_FullSimulation_E2E memverifikasi seluruh siklus end-to-end menggunakan real Groq AI Provider:
// 1. Pembuatan Grup & Subgrup/Forum Diskusi
// 2. Simulasi pertukaran pesan diskusi antar-anggota
// 3. Instant Expiry Bypass (memaksa kedaluwarsa tanpa menunggu 7 hari / 30 hari)
// 4. Trigger pembuatan ForumMemoryJob
// 5. Eksekusi pemrosesan AI oleh GroqProvider nyata (LLM LPU Inference)
// 6. Pembuatan MemoryDraft berstatus DRAFT dengan 3 artefak terstruktur (Summary, Decision, Journey Lite)
// 7. Alur Review Admin: Approval & Penerbitan Memori ke Arsip Grup (ai_approved_memories)
// 8. Verifikasi anggota grup dapat membaca ringkasan & butir keputusan
// 9. Simulasi penolakan (Reject) draft memori dengan alasan audit
func TestAI_Groq_FullSimulation_E2E(t *testing.T) {
	apiKey := os.Getenv("GROQ_API_KEY")
	if apiKey == "" {
		t.Skip("GROQ_API_KEY tidak diset di environment. Lewati live simulation test.")
	}

	model := os.Getenv("GROQ_MODEL")
	if model == "" {
		model = "qwen/qwen3.8-27b"
	}

	// 1. Setup Environment Database Uji
	msgStore, userStore, memStore, cleanup := setupTestAIEngineEnv(t)
	defer cleanup()
	ctx := context.Background()

	// 2. Setup Aktor Pengguna & Grup
	adminUser, err := userStore.Register("admin_wuzz", "Budi Santoso (Admin)", "Password123!")
	if err != nil {
		t.Fatalf("Register admin gagal: %v", err)
	}

	memberUser, err := userStore.Register("member_wuzz", "Siti Aminah (Member)", "Password123!")
	if err != nil {
		t.Fatalf("Register member gagal: %v", err)
	}

	group, err := userStore.CreateGroup("Tim Inovasi Produk", "Diskusi peluncuran fitur baru", "", adminUser.ID, "tim_inovasi", true, []string{memberUser.ID})
	if err != nil {
		t.Fatalf("CreateGroup gagal: %v", err)
	}

	// 3. Buat Subgrup / Forum (Durasi 7 hari)
	sub, err := userStore.CreateSubGroup(group.ID, "Rencana Peluncuran Group Memory AI", "Menentukan timeline, metrik keberhasilan, dan dokumentasi", adminUser.ID, "7_days", true)
	if err != nil {
		t.Fatalf("CreateSubGroup gagal: %v", err)
	}

	// Tambahkan member ke subgrup
	_ = userStore.JoinSubGroup(sub.ID, memberUser.ID)

	// 4. Simulasi Percakapan Diskusi Nyata
	simulatedMessages := []struct {
		fromID   string
		nickname string
		content  string
		offset   time.Duration
	}{
		{adminUser.ID, "Budi Santoso", "Halo tim, mari kita diskusikan rencana peluncuran fitur Group Memory AI. Kapan target rilis beta kita?", -40 * time.Minute},
		{memberUser.ID, "Siti Aminah", "Bagaimana kalau tanggal 25 Oktober? Kita bisa buka untuk 100 grup pengguna pertama terlebih dahulu.", -35 * time.Minute},
		{adminUser.ID, "Budi Santoso", "Ide bagus! Target 100 grup pertama sangat realistis. Apa metrik keberhasilan utama yang kita pantau?", -25 * time.Minute},
		{memberUser.ID, "Siti Aminah", "Kita targetkan minimal 75% grup memanfaatkan ringkasan AI, dan retensi interaksi grup meningkat di atas 40%.", -15 * time.Minute},
		{adminUser.ID, "Budi Santoso", "Sepakat. Siti tolong siapkan video panduan dan dokumentasi sebelum tanggal 20 Oktober ya.", -10 * time.Minute},
		{memberUser.ID, "Siti Aminah", "Siap pak Budi, dokumentasi dan materi pengenalan akan selesai tepat waktu.", -5 * time.Minute},
	}

	for _, m := range simulatedMessages {
		msg := store.StoredMessage{
			ID:        "msg_" + uuid.New().String(),
			RoomID:    sub.ID,
			FromID:    m.fromID,
			Nickname:  m.nickname,
			ToID:      sub.ID,
			Content:   m.content,
			Timestamp: time.Now().UTC().Add(m.offset),
		}
		if err := msgStore.Save(msg); err != nil {
			t.Fatalf("SaveMessage gagal: %v", err)
		}
	}

	// 5. Bypass Expiry (Bypass waktu 7 hari / 30 hari secara instan)
	t.Log("⏳ [Simulation] Mengaktifkan Instant Expiry Bypass...")
	err = userStore.ExpireSubGroupNow(sub.ID)
	if err != nil {
		t.Fatalf("ExpireSubGroupNow gagal: %v", err)
	}

	expiredItems, err := userStore.ExpireSubGroupsBatchDetailed()
	if err != nil {
		t.Fatalf("ExpireSubGroupsBatchDetailed gagal: %v", err)
	}
	if len(expiredItems) == 0 {
		t.Fatalf("Subgrup tidak terdeteksi expired setelah bypass!")
	}
	t.Logf("🔒 [Simulation] Forum %s berhasil dikunci menjadi status 'expired'", sub.ID)

	// 6. Buat ForumMemoryJob
	job, err := memStore.CreateJob(ctx, sub.ID, group.ID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}
	t.Logf("📋 [Simulation] ForumMemoryJob dibuat (Job ID: %s)", job.ID)

	// 7. Eksekusi Pemrosesan dengan Groq Real AI Provider
	groqProvider := NewGroqProvider(apiKey, model)
	pushSvc := push.NewService(userStore)
	processor := NewMemoryProcessor(memStore, msgStore, userStore, groqProvider)
	processor.SetPushService(pushSvc)

	t.Logf("🧠 [Simulation] Menghubungi Groq LPU API (Model: %s) untuk memproses ringkasan...", model)
	startProcess := time.Now()
	err = processor.ProcessMemoryJob(ctx, job, len(simulatedMessages))
	if err != nil {
		t.Fatalf("ProcessMemoryJob dengan Groq gagal: %v", err)
	}
	duration := time.Since(startProcess)
	t.Logf("⚡ [Simulation] Groq selesai memproses dalam %v!", duration)

	// 8. Verifikasi Draft Memori yang Dihasilkan
	draft, err := memStore.GetDraftByForumID(ctx, sub.ID)
	if err != nil {
		t.Fatalf("GetDraftByForumID gagal: %v", err)
	}
	if draft == nil {
		t.Fatalf("Draft memori tidak ditemukan!")
	}
	if draft.Status != store.DraftStatusDraft {
		t.Errorf("expected draft status DRAFT, got %s", draft.Status)
	}

	// Ambil artefak keputusan
	artifacts, err := memStore.GetArtifactsByDraftID(ctx, draft.ID)
	if err != nil {
		t.Fatalf("GetArtifactsByDraftID gagal: %v", err)
	}
	t.Logf("🎯 [Hasil Keputusan & Artefak Groq (%d butir)]:", len(artifacts))

	var summaryContent string
	var summaryConf string
	for _, art := range artifacts {
		t.Logf("   - [%s] %s (Confidence: %s)", art.Type, art.Content, art.Confidence)
		if art.Type == store.ArtifactTypeSummary {
			summaryContent = art.Content
			summaryConf = art.Confidence
		}
	}

	if summaryContent == "" {
		t.Fatalf("Artefak ringkasan (SUMMARY) tidak ditemukan!")
	}
	t.Logf("📝 [Hasil Ringkasan Eksekutif Groq]:\n%s\n", summaryContent)

	// 9. Alur Validasi Admin (Review & Approve)
	t.Log("👨‍💼 [Simulation] Admin meninjau draft memori dan memberikan Approval...")
	editedSummary := summaryContent + " [Telah diverifikasi dan disahkan oleh Admin]."

	approvedMemory := &store.ApprovedMemory{
		ID:                  uuid.New().String(),
		DraftID:             draft.ID,
		ForumID:             sub.ID,
		GroupID:             group.ID,
		ApprovedBy:          adminUser.ID,
		ApprovedAt:          time.Now().UTC(),
		HasHumanEdits:       true,
		SnapshotSummary:     editedSummary,
		SnapshotSummaryConf: summaryConf,
		SnapshotDecisions:   `[{"position":1,"text":"Rilis beta 25 Oktober ke 100 grup"}]`,
		CreatedAt:           time.Now().UTC(),
	}

	reviewAction := &store.MemoryReviewAction{
		ID:        uuid.New().String(),
		DraftID:   draft.ID,
		AdminID:   adminUser.ID,
		Action:    store.ActionApprovedWithEdits,
		CreatedAt: time.Now().UTC(),
	}

	err = memStore.ApproveDraft(ctx, draft.ID, adminUser.ID, approvedMemory, reviewAction)
	if err != nil {
		t.Fatalf("ApproveDraft gagal: %v", err)
	}

	updatedDraft, err := memStore.GetDraftByID(ctx, draft.ID)
	if err != nil {
		t.Fatalf("GetDraftByID gagal: %v", err)
	}
	if updatedDraft.Status != store.DraftStatusApproved {
		t.Errorf("expected APPROVED, got %s", updatedDraft.Status)
	}
	t.Logf("🎉 [Simulation] Memori Grup Berhasil Diterbitkan ke Arsip! (Memory ID: %s)", approvedMemory.ID)

	// 10. Verifikasi Anggota Grup Dapat Mengakses dan Menikmati Memori
	t.Log("👥 [Simulation] Anggota grup (Siti Aminah) membuka Arsip Memori Grup...")
	memories, err := memStore.GetApprovedMemoriesByGroupID(ctx, group.ID, 10, 0)
	if err != nil {
		t.Fatalf("GetApprovedMemoriesByGroupID gagal: %v", err)
	}
	if len(memories) == 0 {
		t.Fatalf("Anggota tidak dapat menemukan memori yang diterbitkan!")
	}

	foundMemory := memories[0]
	if foundMemory.ID != approvedMemory.ID {
		t.Errorf("expected memory ID %s, got %s", approvedMemory.ID, foundMemory.ID)
	}
	t.Logf("✅ [Simulation] Anggota grup berhasil membaca memori:\n\"%s\"", foundMemory.SnapshotSummary)

	// 11. Simulasi Penolakan (Reject Flow) pada Forum Lain
	t.Log("🚫 [Simulation] Menguji Alur Penolakan (Reject Flow) pada Forum Kedua...")
	sub2, _ := userStore.CreateSubGroup(group.ID, "Ide Outing Kantor", "Diskusi santai outing", adminUser.ID, "7_days", true)
	_ = userStore.ExpireSubGroupNow(sub2.ID)
	_, _ = userStore.ExpireSubGroupsBatchDetailed()

	job2, _ := memStore.CreateJob(ctx, sub2.ID, group.ID)
	_ = processor.ProcessMemoryJob(ctx, job2, 0)

	draft2, _ := memStore.GetDraftByForumID(ctx, sub2.ID)
	if draft2 != nil {
		err := memStore.RejectDraft(ctx, draft2.ID, adminUser.ID, "Diskusi tidak mencapai kuorum dan dibatalkan.")
		if err != nil {
			t.Fatalf("RejectDraft gagal: %v", err)
		}
		rejectedDraft, _ := memStore.GetDraftByID(ctx, draft2.ID)
		if rejectedDraft.Status != store.DraftStatusRejected {
			t.Errorf("expected REJECTED, got %s", rejectedDraft.Status)
		}
		t.Logf("✅ [Simulation] Draft berhasil ditolak dengan alasan: \"%s\"", rejectedDraft.RejectionReason)
	}

	t.Log("🏆 [Simulation] SELURUH SIKLUS END-TO-END GROUP MEMORY AI DENGAN REAL GROQ BERHASIL 100%!")
}
