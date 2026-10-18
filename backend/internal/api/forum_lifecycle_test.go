package api

import (
	"context"
	"encoding/json"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"net/http"
	"testing"
)

func TestMyForumsLifecycleWhitelistAndReviewCompletion(t *testing.T) {
	mh, gh, ms, _, owner, _, outsider, parent, forum := setupTestMemoryAPI(t)
	draftID := seedDraft(t, ms, forum.ID, parent.ID)
	if err := gh.forumSvc.InstantExpireSubGroup(context.Background(), owner.ID, parent.ID, forum.ID); err != nil {
		t.Fatal(err)
	}
	read := func(user string) []store.UserForumItem {
		t.Helper()
		rr := memReq(mh, gh.GetMyForums, http.MethodGet, "/api/forums/mine", user)
		if rr.Code != 200 {
			t.Fatalf("%d %s", rr.Code, rr.Body.String())
		}
		var result struct {
			Forums []store.UserForumItem `json:"forums"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result.Forums
	}
	for _, gate := range []string{"", "grp_other", parent.ID} {
		mh.SetGate(store.ParseMemoryGate(gate))
		rows := read(owner.ID)
		if len(rows) != 1 {
			t.Fatalf("rows: %+v", rows)
		}
		enabled := gate == parent.ID
		if rows[0].MemoryEnabled != enabled || (rows[0].DraftID == draftID) != enabled {
			t.Fatalf("gate %q: %+v", gate, rows)
		}
		if len(read(outsider.ID)) != 0 {
			t.Fatal("outsider leak")
		}
	}
	rr := memReq(mh, mh.RouteMemoryRequest, http.MethodPost, "/api/memory/drafts/"+draftID+"/approve", owner.ID)
	if rr.Code != 200 {
		t.Fatalf("approve %d: %s", rr.Code, rr.Body.String())
	}
	rows := read(owner.ID)
	if rows[0].MemoryState != "published" || rows[0].DraftID != "" || rows[0].MemoryID == "" {
		t.Fatalf("after review: %+v", rows)
	}
}
