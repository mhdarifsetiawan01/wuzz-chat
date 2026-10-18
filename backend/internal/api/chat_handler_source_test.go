package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestSourceHistoryAccessAndWindow(t *testing.T) {
	ms, err := store.NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "source.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer ms.Close()
	us := store.NewSQLUserStore(ms.DB(), ms.DriverName())
	gs := store.NewSQLGroupStore(ms.DB(), ms.DriverName())
	ctx := context.Background()
	owner, err := us.Register("sourceowner", "Owner", "password123")
	if err != nil {
		t.Fatal(err)
	}
	member, err := us.Register("sourcemember", "Member", "password123")
	if err != nil {
		t.Fatal(err)
	}
	parentOnly, err := us.Register("parentonly", "Parent only", "password123")
	if err != nil {
		t.Fatal(err)
	}
	parent, err := gs.CreateGroupWithContext(ctx, "Parent", "", "", owner.ID, "", true, []string{member.ID, parentOnly.ID})
	if err != nil {
		t.Fatal(err)
	}
	forum, err := gs.CreateSubGroupWithContext(ctx, parent.ID, "Source", "", owner.ID, "7_days", false)
	if err != nil {
		t.Fatal(err)
	}
	// Local fixture membership, without joining/mutating any live group.
	if _, err = ms.DB().Exec(`INSERT INTO conversation_members(conversation_id,user_id,role,joined_at) VALUES(?,?,?,?)`, forum.ID, member.ID, "member", time.Now()); err != nil {
		t.Fatal(err)
	}
	other, err := gs.CreateSubGroupWithContext(ctx, parent.ID, "Other", "", owner.ID, "7_days", false)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Add(-time.Second)
	for i := 0; i < 81; i++ { // Same timestamps exercise stable ID tie-breaking.
		if err = ms.Save(store.StoredMessage{ID: fmt.Sprintf("source-%03d", i), RoomID: forum.ID, FromID: owner.ID, Nickname: "Owner", Content: fmt.Sprint(i), Timestamp: now}); err != nil {
			t.Fatal(err)
		}
	}
	if err = gs.ExpireSubGroupNow(forum.ID); err != nil {
		t.Fatal(err)
	}
	handler := NewChatHandler(us, ms)
	request := func(t *testing.T, tenant, user, room, id string, want int) []store.StoredMessage {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/api/messages?room_id="+room+"&message_id="+id, nil)
		req = req.WithContext(auth.SetUserContext(tenantshared.WithTenant(req.Context(), tenant), &auth.UserClaims{UserID: user}))
		w := httptest.NewRecorder()
		handler.GetMessages(w, req)
		if w.Code != want {
			t.Fatalf("want %d got %d: %s", want, w.Code, w.Body.String())
		}
		if want != 200 {
			if w.Body.String() != "{\"error\":\"Pesan sumber sudah tidak tersedia. Kutipan tersimpan sebagai bagian audit Memori.\"}\n" {
				t.Fatalf("unexpected unavailable response: %s", w.Body.String())
			}
			return nil
		}
		var rows []store.StoredMessage
		if err := json.Unmarshal(w.Body.Bytes(), &rows); err != nil {
			t.Fatal(err)
		}
		return rows
	}
	t.Run("ended forum bounded stable target for member", func(t *testing.T) {
		rows := request(t, "default", member.ID, forum.ID, "source-040", 200)
		if len(rows) != 41 || rows[0].ID != "source-020" || rows[20].ID != "source-040" || rows[40].ID != "source-060" {
			t.Fatalf("window incorrect: %+v", rows)
		}
	})
	for _, tc := range []struct{ name, tenant, user, room, id string }{
		{"parent membership grants no private forum access", "default", parentOnly.ID, forum.ID, "source-040"},
		{"foreign tenant", "foreign", owner.ID, forum.ID, "source-040"},
		{"wrong room message pair", "default", owner.ID, other.ID, "source-040"},
		{"missing source", "default", owner.ID, forum.ID, "missing"},
		{"non forum", "default", owner.ID, parent.ID, "source-040"},
	} {
		t.Run(tc.name, func(t *testing.T) { request(t, tc.tenant, tc.user, tc.room, tc.id, 404) })
	}
	t.Run("actual tenant and forged cross tenant membership", func(t *testing.T) {
		acme := tenantshared.WithTenant(context.Background(), "acme")
		actor, err := us.RegisterWithContext(acme, "acmesource", "Acme", "password123")
		if err != nil {
			t.Fatal(err)
		}
		p, err := gs.CreateGroupWithContext(acme, "Acme parent", "", "", actor.ID, "", true, nil)
		if err != nil {
			t.Fatal(err)
		}
		f, err := gs.CreateSubGroupWithContext(acme, p.ID, "Acme forum", "", actor.ID, "7_days", false)
		if err != nil {
			t.Fatal(err)
		}
		if err = ms.Save(store.StoredMessage{ID: "acme-source", RoomID: f.ID, FromID: actor.ID, Nickname: "Acme", Content: "tenant private", Timestamp: now}); err != nil {
			t.Fatal(err)
		}
		request(t, "acme", actor.ID, f.ID, "acme-source", 200)
		request(t, "default", actor.ID, f.ID, "acme-source", 200)
		for _, room := range []string{p.ID, f.ID} {
			if _, err = ms.DB().Exec(`INSERT INTO conversation_members(conversation_id,user_id,role,joined_at) VALUES(?,?,?,?)`, room, owner.ID, "member", now); err != nil {
				t.Fatal(err)
			}
		}
		request(t, "acme", owner.ID, f.ID, "acme-source", 404)
		request(t, "default", owner.ID, f.ID, "acme-source", 404)
		if _, err = ms.DB().Exec(`UPDATE conversations SET tenant_id='other' WHERE id=?`, p.ID); err != nil {
			t.Fatal(err)
		}
		request(t, "acme", actor.ID, f.ID, "acme-source", 404)
	})
	t.Run("neighbors obey viewer cutoff", func(t *testing.T) {
		if err := ms.Save(store.StoredMessage{ID: "old-hidden", RoomID: forum.ID, FromID: owner.ID, Nickname: "Owner", Content: "before clear", Timestamp: now.Add(-time.Hour)}); err != nil {
			t.Fatal(err)
		}
		if _, err := ms.DB().Exec(`UPDATE conversation_members SET cleared_at=? WHERE conversation_id=? AND user_id=?`, now.Add(-time.Minute), forum.ID, member.ID); err != nil {
			t.Fatal(err)
		}
		rows := request(t, "default", member.ID, forum.ID, "source-000", 200)
		for _, row := range rows {
			if row.ID == "old-hidden" {
				t.Fatal("neighbor before cutoff leaked")
			}
		}
		request(t, "default", member.ID, forum.ID, "old-hidden", 404)
	})

	t.Run("deleted for viewer and neighbor filtering", func(t *testing.T) {
		if _, err := ms.DeleteMessage("source-040", member.ID, false); err != nil {
			t.Fatal(err)
		}
		request(t, "default", member.ID, forum.ID, "source-040", 404)
		rows := request(t, "default", member.ID, forum.ID, "source-041", 200)
		for _, m := range rows {
			if m.ID == "source-040" {
				t.Fatal("viewer deletion leaked")
			}
		}
		request(t, "default", owner.ID, forum.ID, "source-040", 200)
	})
	t.Run("deleted for everyone", func(t *testing.T) {
		if _, err := ms.DeleteMessage("source-040", owner.ID, true); err != nil {
			t.Fatal(err)
		}
		request(t, "default", owner.ID, forum.ID, "source-040", 404)
	})
	t.Run("cleared history", func(t *testing.T) {
		if err := us.ClearConversation(forum.ID, member.ID); err != nil {
			t.Fatal(err)
		}
		request(t, "default", member.ID, forum.ID, "source-041", 404)
	})
	t.Run("parent membership revoked", func(t *testing.T) {
		if _, err := ms.DB().Exec(`DELETE FROM conversation_members WHERE conversation_id=? AND user_id=?`, parent.ID, owner.ID); err != nil {
			t.Fatal(err)
		}
		request(t, "default", owner.ID, forum.ID, "source-041", 404)
	})
	t.Run("unauthenticated", func(t *testing.T) {
		w := httptest.NewRecorder()
		handler.GetMessages(w, httptest.NewRequest(http.MethodGet, "/api/messages?room_id="+forum.ID+"&message_id=source-041", nil))
		if w.Code != 401 {
			t.Fatal(w.Code)
		}
	})
	t.Run("cancelled context", func(t *testing.T) {
		canceled, cancel := context.WithCancel(ctx)
		cancel()
		if _, err := ms.GetMessageContext(canceled, forum.ID, member.ID, "source-041"); err == nil {
			t.Fatal("cancel ignored")
		}
	})
}
