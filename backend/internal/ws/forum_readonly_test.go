package ws

import (
	"github.com/bms-del112/wuzz-chat/internal/store"
	"testing"
	"time"
)

type endedForumAuth struct{ stubRoomAuth }

func (*endedForumAuth) IsConversationExpired(string) bool { return true }

func TestEndedForum_HistoryReadable_NewMessageRejected(t *testing.T) {
	ms := store.NewMemoryMessageStore()
	h := NewHub(store.NewMemoryClientStore(), ms)
	h.SetRoomAuth(&endedForumAuth{stubRoomAuth{members: map[string][]string{"sub_ended": {"member"}}, denied: map[string]bool{"outsider": true}}})
	if err := ms.Save(store.StoredMessage{ID: "original", RoomID: "sub_ended", FromID: "member", Content: "history", Timestamp: time.Now().UTC()}); err != nil {
		t.Fatal(err)
	}
	member := newTypingTestClient(h, "member", "default", "Member")
	h.Register(member)
	member.onJoin(Message{Type: TypeJoin, Room: "sub_ended"})
	foundHistory := false
	for len(member.send) > 0 {
		m := <-member.send
		if m.Type == TypeHistory && len(m.Messages) == 1 && m.Messages[0].ID == "original" {
			foundHistory = true
		}
	}
	if !foundHistory {
		t.Fatal("ended forum history not delivered to member")
	}
	member.onMessage(Message{Type: TypeMessage, Room: "sub_ended", RequestID: "new", Content: "must fail"})
	rejected := false
	for len(member.send) > 0 {
		m := <-member.send
		if m.Type == TypeAck && m.RequestID == "new" && m.Status == "error" {
			rejected = true
		}
	}
	if !rejected {
		t.Fatal("new message to ended forum was not rejected")
	}
	history, _ := ms.GetRoomHistory("sub_ended", 50)
	if len(history) != 1 {
		t.Fatal("new message persisted in ended forum")
	}
	outsider := newTypingTestClient(h, "outsider", "default", "Outsider")
	outsider.onJoin(Message{Type: TypeJoin, Room: "sub_ended"})
	for len(outsider.send) > 0 {
		if m := <-outsider.send; m.Type == TypeHistory {
			t.Fatal("history leaked to outsider")
		}
	}
}
