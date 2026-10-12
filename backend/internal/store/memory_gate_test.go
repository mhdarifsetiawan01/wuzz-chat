package store

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestParseMemoryGate(t *testing.T) {
	cases := []struct {
		raw     string
		allowed map[string]bool
		all     bool
	}{
		{"", map[string]bool{"grp_a": false, "": false}, false},
		{"   ", map[string]bool{"grp_a": false}, false},
		{"*", map[string]bool{"grp_a": true, "grp_zzz": true}, true},
		{"grp_a, grp_b ,,", map[string]bool{"grp_a": true, "grp_b": true, "grp_c": false}, false},
		{"grp_a,*", map[string]bool{"grp_other": true}, true},
	}
	for _, c := range cases {
		g := ParseMemoryGate(c.raw)
		if g.AllowsAll() != c.all {
			t.Errorf("raw %q: AllowsAll = %v, want %v", c.raw, g.AllowsAll(), c.all)
		}
		for id, want := range c.allowed {
			if got := g.Allows(id); got != want {
				t.Errorf("raw %q: Allows(%q) = %v, want %v", c.raw, id, got, want)
			}
		}
	}
	var nilGate *MemoryGate
	if nilGate.Allows("grp_a") {
		t.Errorf("gerbang nil harus menolak (fail-closed)")
	}
	if !AllowAllMemoryGate().Allows("grp_a") {
		t.Errorf("AllowAllMemoryGate harus mengizinkan semua")
	}
}

func TestGatedMemoryStore_BlocksDisabledGroups(t *testing.T) {
	inner, cleanup := setupTestMemoryStore(t)
	defer cleanup()
	ctx := context.Background()
	gated := NewGatedMemoryStore(inner, ParseMemoryGate("grp_ok"))

	// Job dari grup non-whitelist ditolak dan tidak masuk antrean.
	if _, err := gated.CreateJob(ctx, "sub_blocked", "grp_blocked"); !errors.Is(err, ErrMemoryNotEnabled) {
		t.Fatalf("expected ErrMemoryNotEnabled, got %v", err)
	}
	if _, err := inner.GetJobByForumID(ctx, "sub_blocked"); !errors.Is(err, ErrJobNotFound) {
		t.Fatalf("job grup non-whitelist tidak boleh dibuat, got %v", err)
	}

	// Job lama non-whitelist yang sudah ada di antrean (mis. menumpuk saat dijeda) tidak boleh diproses
	// dan tidak boleh membuat job grup whitelist kelaparan.
	for i := 0; i < 8; i++ {
		if _, err := inner.CreateJob(ctx, "sub_old_"+uuid.NewString(), "grp_blocked"); err != nil {
			t.Fatalf("seed job lama gagal: %v", err)
		}
	}
	okJob, err := gated.CreateJob(ctx, "sub_ok", "grp_ok")
	if err != nil {
		t.Fatalf("CreateJob grup whitelist gagal: %v", err)
	}

	pending, err := gated.GetPendingJobs(ctx, 2)
	if err != nil {
		t.Fatalf("GetPendingJobs gagal: %v", err)
	}
	if len(pending) != 1 || pending[0].ID != okJob.ID {
		t.Fatalf("hanya job grup whitelist yang boleh keluar, got %+v", pending)
	}

	// Pengaman berlapis: ClaimJob langsung pada job non-whitelist juga ditolak.
	raw, _ := inner.GetPendingJobs(ctx, 50)
	for _, j := range raw {
		if j.GroupID == "grp_blocked" {
			if _, err := gated.ClaimJob(ctx, j.ID); !errors.Is(err, ErrMemoryNotEnabled) {
				t.Fatalf("ClaimJob non-whitelist harus ditolak, got %v", err)
			}
			break
		}
	}
	if _, err := gated.ClaimJob(ctx, okJob.ID); err != nil {
		t.Fatalf("ClaimJob grup whitelist gagal: %v", err)
	}
}

func TestGatedMemoryStore_EmptyGateBlocksEverything(t *testing.T) {
	inner, cleanup := setupTestMemoryStore(t)
	defer cleanup()
	gated := NewGatedMemoryStore(inner, ParseMemoryGate(""))
	if _, err := gated.CreateJob(context.Background(), "sub_x", "grp_x"); !errors.Is(err, ErrMemoryNotEnabled) {
		t.Fatalf("gerbang kosong harus menolak semua, got %v", err)
	}
}

func TestMemoryStore_DeleteDraftCascade(t *testing.T) {
	raw, cleanup := setupTestMemoryStore(t)
	defer cleanup()
	s := raw.(*SQLMemoryStore)
	ctx := context.Background()
	adminID := "usr_admin_01"
	groupID := "grp_del_01"

	mkDraft := func(forumID string) (*MemoryDraft, *ForumMemoryJob) {
		job, err := s.CreateJob(ctx, forumID, groupID)
		if err != nil {
			t.Fatalf("CreateJob gagal: %v", err)
		}
		d := &MemoryDraft{ID: uuid.NewString(), JobID: job.ID, ForumID: forumID, GroupID: groupID, Status: DraftStatusDraft, MessageCountProcessed: 10}
		err = s.CreateDraftWithArtifacts(ctx, d, []MemoryArtifact{{
			Type: ArtifactTypeSummary, Content: "ringkasan rahasia", AIOriginalContent: "ringkasan rahasia", Confidence: ConfidenceHigh,
			Evidences: []ArtifactEvidence{{MessageID: "msg_1", MessagePreview: "kutipan pesan", MessageSenderName: "Alice", MessageSentAt: time.Now().UTC()}},
		}})
		if err != nil {
			t.Fatalf("CreateDraftWithArtifacts gagal: %v", err)
		}
		return d, job
	}

	// Draf A: disetujui, punya catatan baca dan audit berisi teks. Draf B: tidak boleh tersentuh.
	dA, jobA := mkDraft("sub_del_a")
	dB, _ := mkDraft("sub_del_b")

	err := s.ApproveDraft(ctx, dA.ID, adminID, &ApprovedMemory{
		ForumID: "sub_del_a", GroupID: groupID, SnapshotSummary: "ringkasan rahasia", SnapshotSummaryConf: ConfidenceHigh,
	}, &MemoryReviewAction{Action: ActionApproved, OldContent: "lama", NewContent: "baru"})
	if err != nil {
		t.Fatalf("ApproveDraft gagal: %v", err)
	}
	mem, err := s.GetApprovedMemoryByForumID(ctx, "sub_del_a")
	if err != nil {
		t.Fatalf("memori terbit tidak ditemukan: %v", err)
	}
	if err := s.RecordViewEvent(ctx, &MemoryViewEvent{ApprovedMemoryID: mem.ID, ForumID: "sub_del_a", GroupID: groupID, ViewerID: "usr_x", ViewerRole: ViewerRoleMember}); err != nil {
		t.Fatalf("RecordViewEvent gagal: %v", err)
	}

	if err := s.DeleteDraftCascade(ctx, dA.ID, adminID); err != nil {
		t.Fatalf("DeleteDraftCascade gagal: %v", err)
	}

	// Semua turunan draf A hilang.
	if _, err := s.GetDraftByID(ctx, dA.ID); !errors.Is(err, ErrDraftNotFound) {
		t.Errorf("draf harus hilang, got %v", err)
	}
	if _, err := s.GetApprovedMemoryByID(ctx, mem.ID); err == nil {
		t.Errorf("memori terbit harus hilang")
	}
	if _, err := s.GetJobByID(ctx, jobA.ID); !errors.Is(err, ErrJobNotFound) {
		t.Errorf("job harus hilang, got %v", err)
	}
	if arts, _ := s.GetArtifactsByDraftID(ctx, dA.ID); len(arts) != 0 {
		t.Errorf("artefak harus hilang, got %d", len(arts))
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM artifact_evidences WHERE message_preview = 'kutipan pesan'`).Scan(&n); err != nil {
		t.Fatalf("hitung bukti gagal: %v", err)
	}
	if n != 1 { // hanya milik draf B
		t.Errorf("bukti draf A harus hilang, tersisa %d (harusnya 1 milik draf B)", n)
	}
	if viewed, _ := s.HasUserViewedMemory(ctx, mem.ID, "usr_x"); viewed {
		t.Errorf("catatan baca harus hilang")
	}

	// Audit: jejak tetap ada tetapi isinya dikosongkan, ditambah baris DELETED.
	rows, err := s.db.Query(`SELECT action, old_content, new_content, rejection_reason FROM memory_review_actions WHERE draft_id = ?`, dA.ID)
	if err != nil {
		t.Fatalf("query audit gagal: %v", err)
	}
	defer rows.Close()
	var total int
	var sawDeleted bool
	for rows.Next() {
		var action string
		var oldC, newC, reason sql.NullString
		if err := rows.Scan(&action, &oldC, &newC, &reason); err != nil {
			t.Fatalf("scan audit gagal: %v", err)
		}
		total++
		if oldC.String != "" || newC.String != "" || reason.String != "" {
			t.Errorf("isi audit %s harus dikosongkan", action)
		}
		if action == ReviewActionDeleted {
			sawDeleted = true
		}
	}
	if total != 2 || !sawDeleted {
		t.Errorf("harus ada baris APPROVED dan DELETED, got %d (deleted=%v)", total, sawDeleted)
	}

	// Draf B utuh.
	if _, err := s.GetDraftByID(ctx, dB.ID); err != nil {
		t.Errorf("draf B tidak boleh tersentuh: %v", err)
	}
	if arts, _ := s.GetArtifactsByDraftID(ctx, dB.ID); len(arts) != 1 {
		t.Errorf("artefak draf B harus utuh, got %d", len(arts))
	}

	// Menghapus lagi / ID tidak ada → ErrDraftNotFound.
	if err := s.DeleteDraftCascade(ctx, dA.ID, adminID); !errors.Is(err, ErrDraftNotFound) {
		t.Errorf("hapus ulang harus ErrDraftNotFound, got %v", err)
	}

	// Topik yang sama bisa dibuatkan job baru setelah dihapus (ringkas ulang).
	if _, err := s.CreateJob(ctx, "sub_del_a", groupID); err != nil {
		t.Errorf("job baru untuk topik yang sama harus bisa dibuat: %v", err)
	}
}
