package storage

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestPurgeWorker_PurgeOnce(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "wuzz_test_purge_*")
	defer os.RemoveAll(tempDir)

	ls, err := NewLocalStorage(tempDir, "/uploads")
	if err != nil {
		t.Fatalf("Gagal init LocalStorage: %v", err)
	}

	memStore := store.NewMemoryMessageStore()

	// Upload file dummy
	dummyFile := strings.NewReader("dummy media content")
	mediaURL, err := ls.Upload(context.Background(), dummyFile, "photo.png", "image/png")
	if err != nil {
		t.Fatalf("Gagal upload dummy file: %v", err)
	}

	// Simpan pesan dengan tanggal 10 hari yang lalu (kedaluwarsa karena batas 7 hari)
	oldTime := time.Now().AddDate(0, 0, -10)
	msg := store.StoredMessage{
		ID:          "msg-old-1",
		RoomID:      "room-test",
		FromID:      "user-1",
		Nickname:    "Arif",
		ToID:        "user-2",
		Content:     "Foto lama",
		MediaURL:    mediaURL,
		MediaType:   "image",
		MediaStatus: "active",
		Timestamp:   oldTime,
	}
	if err := memStore.Save(msg); err != nil {
		t.Fatalf("Gagal simpan pesan di memStore: %v", err)
	}

	worker := NewPurgeWorker(ls, memStore, 7, 1*time.Hour)
	purged := worker.PurgeOnce(context.Background())

	if purged != 1 {
		t.Errorf("Ekspektasi 1 pesan terpurge, dapat: %d", purged)
	}

	// Pastikan status pesan di memStore sekarang 'expired'
	history, _ := memStore.GetRoomHistory("room-test", 10)
	if len(history) != 1 || history[0].MediaStatus != "expired" {
		t.Errorf("Ekspektasi media_status 'expired', dapat: %+v", history)
	}
}
