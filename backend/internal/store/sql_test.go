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

func TestSQLUserStore_Profile(t *testing.T) {
	tmpDB := "test_user_profile.db"
	defer os.Remove(tmpDB)

	sqlStore, err := NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	userStore := NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	// 1. Register User
	user, err := userStore.Register("charlie", "Charlie Brown", "password123")
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	if user.StatusMessage != "Tersedia untuk mengobrol" {
		t.Errorf("expected default status message, got: %s", user.StatusMessage)
	}

	// 2. Update Profile
	updated, err := userStore.UpdateProfile(user.ID, "Charlie Super", "🚀 Sedang coding Wuzz Chat", "avatar_1")
	if err != nil {
		t.Fatalf("failed to update profile: %v", err)
	}

	if updated.DisplayName != "Charlie Super" {
		t.Errorf("expected DisplayName 'Charlie Super', got: %s", updated.DisplayName)
	}
	if updated.StatusMessage != "🚀 Sedang coding Wuzz Chat" {
		t.Errorf("expected StatusMessage '🚀 Sedang coding Wuzz Chat', got: %s", updated.StatusMessage)
	}
	if updated.AvatarURL != "avatar_1" {
		t.Errorf("expected AvatarURL 'avatar_1', got: %s", updated.AvatarURL)
	}

	// 4. Test GetUserByUsernameOrDisplayName
	byUsername, err := userStore.GetUserByUsernameOrDisplayName("charlie")
	if err != nil || byUsername.StatusMessage != "🚀 Sedang coding Wuzz Chat" {
		t.Fatalf("failed to get user by username: %v, status: %v", err, byUsername)
	}

	byDisplayName, err := userStore.GetUserByUsernameOrDisplayName("Charlie Super")
	if err != nil || byDisplayName.StatusMessage != "🚀 Sedang coding Wuzz Chat" {
		t.Fatalf("failed to get user by display name: %v, status: %v", err, byDisplayName)
	}
}


