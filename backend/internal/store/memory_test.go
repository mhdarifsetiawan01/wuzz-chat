package store

import (
	"testing"
	"time"
)

func TestMemoryClientStore(t *testing.T) {
	s := NewMemoryClientStore()

	// 1. Test Set & Get
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

	// 2. Test List
	list := s.List()
	if len(list) != 1 {
		t.Errorf("expected 1 item in list, got %d", len(list))
	}

	// 3. Test Delete
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
		From:      "user-1",
		To:        "user-2",
		Content:   "halo",
		Timestamp: time.Now().UTC(),
	}

	if err := ms.Save(msg); err != nil {
		t.Errorf("Save failed: %v", err)
	}

	history, err := ms.GetHistory("user-1", "user-2", 10)
	if err == nil {
		t.Errorf("expected error for phase 1 GetHistory")
	}
	if len(history) != 0 {
		t.Errorf("expected empty history slice, got %d items", len(history))
	}
}
