package store

import (
	"testing"
	"time"
)

func TestMemoryClientStore(t *testing.T) {
	s := NewMemoryClientStore()

	rec := ClientRecord{
		ID:       "test-id-1",
		Nickname: "Alice",
		PeerID:   "test-id-2",
		JoinedAt: time.Now().UTC(),
	}

	if err := s.Set(rec); err != nil {
		t.Fatalf("Set failed: %v", err)
	}

	got, ok := s.Get("test-id-1")
	if !ok {
		t.Fatalf("expected to find test-id-1")
	}
	if got.Nickname != "Alice" {
		t.Errorf("expected nickname Alice, got %s", got.Nickname)
	}

	list := s.List()
	if len(list) != 1 {
		t.Errorf("expected 1 item in list, got %d", len(list))
	}

	if err := s.Delete("test-id-1"); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}
	_, ok = s.Get("test-id-1")
	if ok {
		t.Errorf("expected test-id-1 to be deleted")
	}
}

func TestMemoryMessageStore(t *testing.T) {
	ms := NewMemoryMessageStore()

	msg := StoredMessage{
		ID:        "msg-1",
		RoomID:    "room-1",
		FromID:    "user-1",
		Nickname:  "Alice",
		ToID:      "user-2",
		Content:   "halo",
		Timestamp: time.Now().UTC(),
	}

	if err := ms.Save(msg); err != nil {
		t.Errorf("Save failed: %v", err)
	}

	history, err := ms.GetRoomHistory("room-1", 10)
	if err != nil {
		t.Fatalf("GetRoomHistory failed: %v", err)
	}
	if len(history) != 1 {
		t.Errorf("expected 1 history item, got %d", len(history))
	}
	if history[0].Content != "halo" {
		t.Errorf("expected content 'halo', got '%s'", history[0].Content)
	}
}
