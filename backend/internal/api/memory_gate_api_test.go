package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func memReq(h *MemoryHandler, route func(http.ResponseWriter, *http.Request), method, path, userID string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: userID}))
	rr := httptest.NewRecorder()
	route(rr, req)
	return rr
}

func seedDraft(t *testing.T, ms *store.SQLMemoryStore, forumID, groupID string) string {
	t.Helper()
	ctx := context.Background()
	job, err := ms.CreateJob(ctx, forumID, groupID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}
	id := uuid.NewString()
	d := &store.MemoryDraft{ID: id, JobID: job.ID, ForumID: forumID, GroupID: groupID, Status: store.DraftStatusDraft, MessageCountProcessed: 5}
	if err := ms.CreateDraftWithArtifacts(ctx, d, []store.MemoryArtifact{{
		Type: store.ArtifactTypeSummary, Content: "ringkasan", AIOriginalContent: "ringkasan", Confidence: store.ConfidenceHigh,
	}}); err != nil {
		t.Fatalf("CreateDraftWithArtifacts gagal: %v", err)
	}
	return id
}

func TestMemoryHandler_GateBlocksDraftReviewButNotRead(t *testing.T) {
	h, _, ms, _, alice, _, _, group, forum := setupTestMemoryAPI(t)
	draftID := seedDraft(t, ms, forum.ID, group.ID)

	// Gerbang kosong: tinjau draf ditolak 403 dan draf tidak berubah.
	h.SetGate(store.ParseMemoryGate(""))
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodGet, "/api/memory/drafts?group_id="+group.ID, alice.ID); rr.Code != http.StatusForbidden {
		t.Fatalf("list draf: expected 403, got %d", rr.Code)
	}
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodGet, "/api/memory/drafts/"+draftID, alice.ID); rr.Code != http.StatusForbidden {
		t.Fatalf("detail draf: expected 403, got %d", rr.Code)
	}
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodPost, "/api/memory/drafts/"+draftID+"/reject", alice.ID); rr.Code != http.StatusForbidden {
		t.Fatalf("reject: expected 403, got %d", rr.Code)
	}
	if d, _ := ms.GetDraftByID(context.Background(), draftID); d == nil || d.Status != store.DraftStatusDraft {
		t.Fatalf("draf tidak boleh berubah saat gerbang menutup")
	}

	// Arsip yang sudah disetujui tetap bisa dibaca anggota walau grup di luar whitelist.
	h.SetGate(store.ParseMemoryGate("grp_lain"))
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodGet, "/api/memory/drafts?group_id="+group.ID, alice.ID); rr.Code != http.StatusForbidden {
		t.Fatalf("grup tidak di whitelist: expected 403, got %d", rr.Code)
	}

	// Grup di whitelist: normal.
	h.SetGate(store.ParseMemoryGate(group.ID))
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodGet, "/api/memory/drafts?group_id="+group.ID, alice.ID); rr.Code != http.StatusOK {
		t.Fatalf("grup whitelist: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if !h.IsEnabledForGroup(group.ID) || h.IsEnabledForGroup("grp_lain_lagi") {
		t.Fatalf("IsEnabledForGroup tidak sesuai gerbang")
	}
}

func TestMemoryHandler_DeleteDraftAndApprovedMemory(t *testing.T) {
	h, _, ms, _, alice, bob, _, group, forum := setupTestMemoryAPI(t)
	ctx := context.Background()
	// Hapus tidak boleh ikut terkunci gerbang (hak hapus data).
	h.SetGate(store.ParseMemoryGate(""))

	draftID := seedDraft(t, ms, forum.ID, group.ID)
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodDelete, "/api/memory/drafts/"+draftID, bob.ID); rr.Code != http.StatusForbidden {
		t.Fatalf("Bob (anggota) hapus draf: expected 403, got %d", rr.Code)
	}
	if _, err := ms.GetDraftByID(ctx, draftID); err != nil {
		t.Fatalf("draf harus tetap ada setelah ditolak: %v", err)
	}
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodDelete, "/api/memory/drafts/"+draftID, alice.ID); rr.Code != http.StatusOK {
		t.Fatalf("Alice hapus draf: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if _, err := ms.GetDraftByID(ctx, draftID); err == nil {
		t.Fatalf("draf harus hilang")
	}
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodDelete, "/api/memory/drafts/"+draftID, alice.ID); rr.Code != http.StatusNotFound {
		t.Fatalf("hapus ulang: expected 404, got %d", rr.Code)
	}

	// Memori yang sudah disetujui.
	d2 := seedDraft(t, ms, forum.ID+"_b", group.ID)
	if err := ms.ApproveDraft(ctx, d2, alice.ID, &store.ApprovedMemory{
		ForumID: forum.ID + "_b", GroupID: group.ID, SnapshotSummary: "x", SnapshotSummaryConf: store.ConfidenceHigh,
	}, &store.MemoryReviewAction{Action: store.ActionApproved}); err != nil {
		t.Fatalf("ApproveDraft gagal: %v", err)
	}
	mem, err := ms.GetApprovedMemoryByForumID(ctx, forum.ID+"_b")
	if err != nil {
		t.Fatalf("memori terbit tidak ditemukan: %v", err)
	}

	if rr := memReq(h, h.RouteApprovedMemoryRequest, http.MethodDelete, "/api/memories/"+mem.ID, bob.ID); rr.Code != http.StatusForbidden {
		t.Fatalf("Bob hapus memori: expected 403, got %d", rr.Code)
	}
	if rr := memReq(h, h.RouteApprovedMemoryRequest, http.MethodGet, "/api/memories/"+mem.ID, bob.ID); rr.Code != http.StatusOK {
		t.Fatalf("anggota tetap bisa membaca arsip walau gerbang menutup: got %d", rr.Code)
	}
	if rr := memReq(h, h.RouteApprovedMemoryRequest, http.MethodDelete, "/api/memories/"+mem.ID, alice.ID); rr.Code != http.StatusOK {
		t.Fatalf("Alice hapus memori: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if rr := memReq(h, h.RouteApprovedMemoryRequest, http.MethodGet, "/api/memories/"+mem.ID, alice.ID); rr.Code != http.StatusNotFound {
		t.Fatalf("memori terhapus: expected 404, got %d", rr.Code)
	}
}

func TestGroupHandler_MemoryEnabledFlag(t *testing.T) {
	h, gh, _, _, alice, _, _, group, _ := setupTestMemoryAPI(t)

	get := func() map[string]any {
		rr := memReq(h, gh.RouteGroupRequest, http.MethodGet, "/api/groups/"+group.ID, alice.ID)
		if rr.Code != http.StatusOK {
			t.Fatalf("detail grup: expected 200, got %d: %s", rr.Code, rr.Body.String())
		}
		var out map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
			t.Fatalf("JSON detail grup tidak valid: %v", err)
		}
		return out
	}

	h.SetGate(store.ParseMemoryGate(""))
	out := get()
	if out["memory_enabled"] != false {
		t.Fatalf("memory_enabled harus false saat gerbang kosong, got %v", out["memory_enabled"])
	}
	if out["id"] != group.ID {
		t.Fatalf("field detail grup asli harus tetap ada (id), got %v", out["id"])
	}

	h.SetGate(store.ParseMemoryGate(group.ID))
	if get()["memory_enabled"] != true {
		t.Fatalf("memory_enabled harus true untuk grup di whitelist")
	}
}

// Judul memori di daftar arsip dan detail harus nama topik forum yang dibuat pengguna, bukan cadangan "Forum Diskusi".
func TestMemoryHandler_ForumTitleAndApproverName(t *testing.T) {
	h, _, ms, _, alice, bob, _, group, forum := setupTestMemoryAPI(t)
	ctx := context.Background()

	draftID := seedDraft(t, ms, forum.ID, group.ID)
	if err := ms.ApproveDraft(ctx, draftID, alice.ID, &store.ApprovedMemory{
		ForumID: forum.ID, GroupID: group.ID, SnapshotSummary: "Ringkasan uji", SnapshotSummaryConf: store.ConfidenceHigh,
	}, &store.MemoryReviewAction{Action: store.ActionApproved}); err != nil {
		t.Fatalf("ApproveDraft gagal: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/groups/"+group.ID+"/memories", nil)
	req = req.WithContext(auth.SetUserContext(req.Context(), &auth.UserClaims{UserID: bob.ID}))
	rr := httptest.NewRecorder()
	h.HandleGetGroupMemories(rr, req, bob.ID, group.ID)
	if rr.Code != http.StatusOK {
		t.Fatalf("daftar memori: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var list []map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &list); err != nil || len(list) != 1 {
		t.Fatalf("daftar memori tidak valid: %v %s", err, rr.Body.String())
	}
	if list[0]["forum_title"] != forum.Title {
		t.Errorf("forum_title = %v, want %q (nama topik asli)", list[0]["forum_title"], forum.Title)
	}
	if list[0]["approved_by_name"] != "Alice Admin" {
		t.Errorf("approved_by_name = %v, want %q", list[0]["approved_by_name"], "Alice Admin")
	}
	if _, ok := list[0]["decisions_count"]; !ok {
		t.Errorf("field decisions_count harus ada di daftar memori")
	}

	mem, _ := ms.GetApprovedMemoryByForumID(ctx, forum.ID)
	rr2 := memReq(h, h.RouteApprovedMemoryRequest, http.MethodGet, "/api/memories/"+mem.ID, bob.ID)
	var detail map[string]any
	_ = json.Unmarshal(rr2.Body.Bytes(), &detail)
	if detail["forum_title"] != forum.Title || detail["approved_by_name"] != "Alice Admin" {
		t.Errorf("detail: forum_title=%v approved_by_name=%v", detail["forum_title"], detail["approved_by_name"])
	}
}

// seedDraftWithJourney membuat draf berisi ringkasan dan Journey Lite; mengembalikan ID draf.
func seedDraftWithJourney(t *testing.T, ms *store.SQLMemoryStore, forumID, groupID string) string {
	t.Helper()
	ctx := context.Background()
	job, err := ms.CreateJob(ctx, forumID, groupID)
	if err != nil {
		t.Fatalf("CreateJob gagal: %v", err)
	}
	id := uuid.NewString()
	d := &store.MemoryDraft{ID: id, JobID: job.ID, ForumID: forumID, GroupID: groupID, Status: store.DraftStatusDraft, MessageCountProcessed: 5}
	if err := ms.CreateDraftWithArtifacts(ctx, d, []store.MemoryArtifact{
		{Type: store.ArtifactTypeSummary, Content: "ringkasan", AIOriginalContent: "ringkasan", Confidence: store.ConfidenceHigh},
		{Type: store.ArtifactTypeJourneyLite, Content: "awalnya, lalu, akhirnya", AIOriginalContent: "awalnya, lalu, akhirnya", Confidence: store.ConfidenceMedium},
	}); err != nil {
		t.Fatalf("CreateDraftWithArtifacts gagal: %v", err)
	}
	return id
}

func journeyRemoved(t *testing.T, ms *store.SQLMemoryStore, draftID string) bool {
	t.Helper()
	arts, err := ms.GetArtifactsByDraftID(context.Background(), draftID)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range arts {
		if a.Type == store.ArtifactTypeJourneyLite {
			return a.IsRemoved
		}
	}
	t.Fatal("Journey Lite tidak ditemukan pada draf")
	return false
}

// Membuang Journey Lite adalah menyunting draf, jadi harus ikut digerbang (sejajar PATCH artefak). Hanya penghapusan draf
// utuh yang bebas gerbang. Sebelumnya DELETE .../journey lolos karena pengecualian gerbang dikunci pada metode DELETE.
func TestMemoryHandler_GateCoversJourneyRemovalButNotDraftErase(t *testing.T) {
	h, _, ms, _, alice, _, _, group, forum := setupTestMemoryAPI(t)
	draftID := seedDraftWithJourney(t, ms, forum.ID, group.ID)
	arts, _ := ms.GetArtifactsByDraftID(context.Background(), draftID)
	var summaryID string
	for _, a := range arts {
		if a.Type == store.ArtifactTypeSummary {
			summaryID = a.ID
		}
	}
	base := "/api/memory/drafts/" + draftID

	for name, gate := range map[string]string{"whitelist kosong": "", "grup di luar whitelist": "grp_lain"} {
		h.SetGate(store.ParseMemoryGate(gate))
		for _, c := range []struct{ label, method, path string }{
			{"DELETE journey", http.MethodDelete, base + "/journey"},
			{"DELETE journey (garis miring akhir)", http.MethodDelete, base + "/journey/"},
			{"PATCH artefak (kontrol)", http.MethodPatch, base + "/artifacts/" + summaryID},
		} {
			if rr := memReq(h, h.RouteMemoryRequest, c.method, c.path, alice.ID); rr.Code != http.StatusForbidden {
				t.Fatalf("%s | %s: expected 403, got %d: %s", name, c.label, rr.Code, rr.Body.String())
			}
		}
		if journeyRemoved(t, ms, draftID) {
			t.Fatalf("%s: Journey Lite tidak boleh terhapus saat gerbang menutup", name)
		}
	}

	// Penghapusan draf utuh tetap bebas gerbang (hak hapus data), juga saat gerbang tertutup.
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodDelete, base, alice.ID); rr.Code != http.StatusOK {
		t.Fatalf("hapus draf utuh saat gerbang tertutup: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if _, err := ms.GetDraftByID(context.Background(), draftID); err == nil {
		t.Fatal("draf harus hilang setelah dihapus")
	}
}

// Saat gerbang terbuka, perilaku lama tidak berubah: admin boleh, bukan admin tidak, dan draf yang sudah ditinjau terkunci.
func TestMemoryHandler_JourneyRemovalUnchangedWhenGateOpen(t *testing.T) {
	h, _, ms, _, alice, bob, carol, group, forum := setupTestMemoryAPI(t)
	h.SetGate(store.ParseMemoryGate(group.ID))

	d1 := seedDraftWithJourney(t, ms, forum.ID, group.ID)
	for label, uid := range map[string]string{"anggota biasa": bob.ID, "bukan anggota": carol.ID} {
		if rr := memReq(h, h.RouteMemoryRequest, http.MethodDelete, "/api/memory/drafts/"+d1+"/journey", uid); rr.Code != http.StatusForbidden {
			t.Fatalf("%s: expected 403, got %d: %s", label, rr.Code, rr.Body.String())
		}
		if journeyRemoved(t, ms, d1) {
			t.Fatalf("%s: Journey Lite tidak boleh terhapus oleh pemanggil tanpa hak", label)
		}
	}
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodDelete, "/api/memory/drafts/"+d1+"/journey", alice.ID); rr.Code != http.StatusOK {
		t.Fatalf("admin dengan gerbang terbuka: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if !journeyRemoved(t, ms, d1) {
		t.Fatal("Journey Lite harus ditandai terhapus oleh admin")
	}

	// Draf yang sudah ditinjau tidak dapat disunting lagi (409), gerbang terbuka.
	d2 := seedDraftWithJourney(t, ms, forum.ID+"_b", group.ID)
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodPost, "/api/memory/drafts/"+d2+"/reject", alice.ID); rr.Code != http.StatusOK {
		t.Fatalf("reject: expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if rr := memReq(h, h.RouteMemoryRequest, http.MethodDelete, "/api/memory/drafts/"+d2+"/journey", alice.ID); rr.Code != http.StatusConflict {
		t.Fatalf("draf yang sudah ditolak: expected 409, got %d: %s", rr.Code, rr.Body.String())
	}
}
