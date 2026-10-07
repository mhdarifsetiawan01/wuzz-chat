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

	// Simpan pesan kedua dengan status 'downloaded' tanggal 2 hari lalu (batas retensi 1 hari / 24 jam)
	mediaURL2, err := ls.Upload(context.Background(), strings.NewReader("dummy media 2"), "photo2.png", "image/png")
	if err != nil {
		t.Fatalf("Gagal upload dummy file 2: %v", err)
	}
	msg2 := store.StoredMessage{
		ID:          "msg-downloaded-old",
		RoomID:      "room-test",
		FromID:      "user-1",
		Nickname:    "Arif",
		ToID:        "user-2",
		Content:     "Foto downloaded lama",
		MediaURL:    mediaURL2,
		MediaType:   "image",
		MediaStatus: "downloaded",
		Timestamp:   time.Now().AddDate(0, 0, -2),
	}
	if err := memStore.Save(msg2); err != nil {
		t.Fatalf("Gagal simpan pesan 2 di memStore: %v", err)
	}

	worker := NewPurgeWorker(ls, memStore, 1, 1*time.Hour)
	purged := worker.PurgeOnce(context.Background())

	if purged != 2 {
		t.Errorf("Ekspektasi 2 pesan terpurge (active & downloaded), dapat: %d", purged)
	}

	// Pastikan status pesan di memStore sekarang 'expired'
	history, _ := memStore.GetRoomHistory("room-test", 10)
	for _, h := range history {
		if h.MediaStatus != "expired" {
			t.Errorf("Ekspektasi pesan %s berstatus 'expired', dapat: %s", h.ID, h.MediaStatus)
		}
	}
}

func TestPurgeWorker_DrainQueue_DeletesFilesAndEmptiesQueue(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "wuzz_test_queue_*")
	defer os.RemoveAll(tempDir)
	ls, err := NewLocalStorage(tempDir, "/uploads")
	if err != nil {
		t.Fatal(err)
	}
	url, err := ls.Upload(context.Background(), strings.NewReader("x"), "orphan.png", "image/png")
	if err != nil {
		t.Fatal(err)
	}

	ms, err := store.NewSQLMessageStore("sqlite", tempDir+"/q.db")
	if err != nil {
		t.Fatal(err)
	}
	defer ms.Close()
	now := time.Now().UTC()
	if _, err := ms.DB().Exec(`INSERT INTO media_purge_queue (media_url, attempts, next_attempt_at, created_at) VALUES (?,0,?,?)`, url, now, now); err != nil {
		t.Fatal(err)
	}

	w := NewPurgeWorker(ls, ms, 0, time.Hour) // retensi permanen: antrean tetap harus jalan
	w.SetQueue(store.NewSQLMediaPurgeQueue(ms.DB(), ms.DriverName()))
	if n := w.DrainQueue(context.Background()); n != 1 {
		t.Fatalf("want 1 berkas terhapus, got %d", n)
	}
	var left int
	_ = ms.DB().QueryRow(`SELECT COUNT(1) FROM media_purge_queue`).Scan(&left)
	if left != 0 {
		t.Fatalf("antrean harus kosong, sisa %d", left)
	}
	if entries, _ := os.ReadDir(tempDir); func() bool {
		for _, e := range entries {
			if strings.HasSuffix(e.Name(), ".png") {
				return true
			}
		}
		return false
	}() {
		t.Fatal("berkas fisik harus sudah terhapus dari disk")
	}
}
