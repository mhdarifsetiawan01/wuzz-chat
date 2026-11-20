package store

import (
	"path/filepath"
	"testing"
	"time"
)

// Receipt hanya boleh mengubah pesan di room yang keanggotaannya sudah diperiksa pemanggil.
func TestUpdateMessageStatus_ScopedToRoom(t *testing.T) {
	ms, err := NewSQLMessageStore("sqlite", filepath.Join(t.TempDir(), "status_scope.db"))
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	if err := ms.Save(StoredMessage{ID: "m1", RoomID: "room-a", FromID: "u1", Content: "hai", Status: "sent", Timestamp: time.Now().UTC()}); err != nil {
		t.Fatalf("save: %v", err)
	}

	status := func() string {
		m, err := ms.GetMessageByID("m1")
		if err != nil || m == nil {
			t.Fatalf("get: %v", err)
		}
		return m.Status
	}

	if err := ms.UpdateMessageStatus("m1", "room-b", "read"); err != nil {
		t.Fatalf("update other room: %v", err)
	}
	if got := status(); got != "sent" {
		t.Fatalf("status dari room lain mengubah pesan: %q", got)
	}
	if err := ms.UpdateMessageStatus("m1", "", "read"); err != nil {
		t.Fatalf("update empty room: %v", err)
	}
	if got := status(); got != "sent" {
		t.Fatalf("roomID kosong mengubah pesan: %q", got)
	}
	if err := ms.UpdateMessageStatus("m1", "room-a", "read"); err != nil {
		t.Fatalf("update same room: %v", err)
	}
	if got := status(); got != "read" {
		t.Fatalf("status = %q, want read", got)
	}
}

func TestMemoryUpdateMessageStatus_ScopedToRoom(t *testing.T) {
	ms := NewMemoryMessageStore()
	_ = ms.Save(StoredMessage{ID: "m1", RoomID: "room-a", Status: "sent", Timestamp: time.Now().UTC()})
	_ = ms.UpdateMessageStatus("m1", "room-b", "read")
	if ms.messages["room-a"][0].Status != "sent" {
		t.Fatalf("status dari room lain mengubah pesan")
	}
	_ = ms.UpdateMessageStatus("m1", "room-a", "read")
	if ms.messages["room-a"][0].Status != "read" {
		t.Fatalf("status = %q, want read", ms.messages["room-a"][0].Status)
	}
}
