package store

import (
	"os"
	"testing"
	"time"
)

func TestSQLMessageStore_SQLite(t *testing.T) {
	tmpDB := "test_wuzz.db"
	defer os.Remove(tmpDB)

	sqlStore, err := NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	// 1. Test Save
	msg1 := StoredMessage{
		ID:        "msg-101",
		RoomID:    "alice:bob",
		FromID:    "alice",
		Nickname:  "Alice",
		ToID:      "bob",
		Content:   "Halo dari SQLite!",
		Timestamp: time.Now().UTC().Add(-2 * time.Minute),
	}

	msg2 := StoredMessage{
		ID:        "msg-102",
		RoomID:    "alice:bob",
		FromID:    "bob",
		Nickname:  "Bob",
		ToID:      "alice",
		Content:   "Halo juga Alice!",
		Timestamp: time.Now().UTC().Add(-1 * time.Minute),
	}

	if err := sqlStore.Save(msg1); err != nil {
		t.Fatalf("failed to save msg1: %v", err)
	}
	if err := sqlStore.Save(msg2); err != nil {
		t.Fatalf("failed to save msg2: %v", err)
	}

	// 2. Test GetRoomHistory
	history, err := sqlStore.GetRoomHistory("alice:bob", 10)
	if err != nil {
		t.Fatalf("failed to get history: %v", err)
	}

	if len(history) != 2 {
		t.Fatalf("expected 2 history items, got %d", len(history))
	}

	// Verify order: chronological (msg1 then msg2)
	if history[0].ID != "msg-101" || history[1].ID != "msg-102" {
		t.Errorf("history is not chronologically sorted: %v", history)
	}
}
