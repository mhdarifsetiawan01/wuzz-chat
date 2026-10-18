package store_test

import (
	"encoding/json"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"strings"
	"testing"
)

func TestForumLifecycleVisibility(t *testing.T) {
	for _, role := range []string{"member", "admin", "creator"} {
		for _, enabled := range []bool{false, true} {
			for _, state := range []string{"", "QUEUED", "PROCESSING", "FAILED", "DRAFT", "REJECTED", "published", "active"} {
				t.Run(role+state+map[bool]string{true: "on", false: "off"}[enabled], func(t *testing.T) {
					f := store.UserForumItem{ParentRole: role, MyRole: "creator", PendingDraftID: "secret-draft", JobStatus: state}
					if state == "DRAFT" || state == "REJECTED" {
						f.DraftStatus = state
					}
					if state == "published" {
						f.MemoryID = "memory"
					}
					f.IsActive = state == "active"
					f.ApplyMemoryVisibility(enabled)
					want := "ended"
					if state == "active" {
						want = "active"
					} else if enabled {
						switch state {
						case "QUEUED", "PROCESSING":
							want = "processing"
						case "FAILED":
							want = "failed"
						case "DRAFT":
							want = "under_review"
							if role != "member" {
								want = "review_required"
							}
						case "REJECTED":
							if role != "member" {
								want = "rejected"
							}
						case "published":
							want = "published"
						}
					}
					if f.MemoryState != want {
						t.Fatalf("got %s want %s", f.MemoryState, want)
					}
					data, _ := json.Marshal(f)
					allowed := enabled && role != "member" && state == "DRAFT"
					if strings.Contains(string(data), "secret-draft") != allowed {
						t.Fatalf("draft privacy: %s", data)
					}
					if !enabled && f.MemoryID != "" {
						t.Fatal("disabled memory link")
					}
				})
			}
		}
	}
}
