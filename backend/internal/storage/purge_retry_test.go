package storage

import (
	"context"
	"errors"
	"io"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// flakyStorage menolak Delete selagi failing=true (atau untuk URL yang cocok failOn) dan mencatat yang berhasil.
type flakyStorage struct {
	mu      sync.Mutex
	failing bool
	failOn  string
	deleted []string
}

func (f *flakyStorage) Upload(context.Context, io.Reader, string, string) (string, error) {
	return "", nil
}
func (f *flakyStorage) CreateSignedUploadURL(context.Context, string, string) (*SignedUploadResult, error) {
	return nil, ErrSignedUploadNotSupported
}
func (f *flakyStorage) Delete(_ context.Context, k string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failing || (f.failOn != "" && strings.HasSuffix(k, f.failOn)) {
		return errors.New("R2 tidak tersedia")
	}
	f.deleted = append(f.deleted, k)
	return nil
}
func (f *flakyStorage) DriverName() string { return "flaky" }

type failingEnqueueQueue struct{}

func (failingEnqueueQueue) ClaimDue(context.Context, int) ([]string, error) { return nil, nil }
func (failingEnqueueQueue) Enqueue(context.Context, string) error           { return errors.New("db down") }
func (failingEnqueueQueue) Complete(context.Context, string) error          { return nil }
func (failingEnqueueQueue) Fail(context.Context, string, int) (bool, error) { return false, nil }

func saveOldVideo(t *testing.T, ms store.MessageStore, id, url string) {
	t.Helper()
	err := ms.Save(store.StoredMessage{
		ID: id, RoomID: "room-r", FromID: "u1", Nickname: "A", ToID: "u2", Content: "",
		MediaURL: url, MediaType: "video", MediaStatus: "active", Timestamp: time.Now().AddDate(0, 0, -3),
	})
	if err != nil {
		t.Fatal(err)
	}
}

func mediaStatusOf(t *testing.T, ms store.MessageStore, id string) string {
	t.Helper()
	h, _ := ms.GetRoomHistory("room-r", 10)
	for _, m := range h {
		if m.ID == id {
			return m.MediaStatus
		}
	}
	t.Fatalf("pesan %s tidak ditemukan", id)
	return ""
}

func TestPurgeWorker_FailedDeleteIsRetriedViaQueue(t *testing.T) {
	dir, _ := os.MkdirTemp("", "wuzz_purge_retry_*")
	defer os.RemoveAll(dir)
	sqlStore, err := store.NewSQLMessageStore("sqlite", dir+"/q.db")
	if err != nil {
		t.Fatal(err)
	}
	defer sqlStore.Close()
	queue := store.NewSQLMediaPurgeQueue(sqlStore.DB(), sqlStore.DriverName())

	msgs := store.NewMemoryMessageStore()
	const video = "https://media.contoh.id/video/abc.mp4"
	saveOldVideo(t, msgs, "m-video", video)

	fs := &flakyStorage{failing: true}
	w := NewPurgeWorker(fs, msgs, 1, time.Hour)
	w.SetQueue(queue)

	// Siklus 1: hapus gagal -> masuk antrean, pesan tetap ditandai expired (tidak diproses ulang tiap jam).
	if n := w.PurgeOnce(context.Background()); n != 1 {
		t.Fatalf("PurgeOnce = %d, want 1", n)
	}
	if st := mediaStatusOf(t, msgs, "m-video"); st != "expired" {
		t.Fatalf("status = %q, want expired", st)
	}
	var attempts int
	if err := sqlStore.DB().QueryRow(`SELECT attempts FROM media_purge_queue WHERE media_url = ?`, video).Scan(&attempts); err != nil || attempts != 1 {
		t.Fatalf("berkas harus ada di antrean dengan attempts=1, err=%v attempts=%d", err, attempts)
	}
	// Belum waktunya dicoba ulang (jeda 1 jam).
	if n := w.DrainQueue(context.Background()); n != 0 {
		t.Fatalf("DrainQueue sebelum waktunya = %d, want 0", n)
	}

	// R2 pulih dan jadwal sudah lewat: video dan thumbnail terhapus, antrean kosong.
	fs.failing = false
	_, _ = sqlStore.DB().Exec(`UPDATE media_purge_queue SET next_attempt_at = ?`, time.Now().UTC().Add(-time.Minute))
	if n := w.DrainQueue(context.Background()); n != 1 {
		t.Fatalf("DrainQueue = %d, want 1", n)
	}
	if len(fs.deleted) != 2 || fs.deleted[1] != "https://media.contoh.id/video/abc.thumb.jpg" {
		t.Fatalf("video + thumbnail harus terhapus: %v", fs.deleted)
	}
	var left int
	_ = sqlStore.DB().QueryRow(`SELECT COUNT(1) FROM media_purge_queue`).Scan(&left)
	if left != 0 {
		t.Fatalf("antrean harus kosong, sisa %d", left)
	}

	// Enqueue idempoten: dua kali tidak menggandakan baris.
	_ = queue.Enqueue(context.Background(), video)
	_ = queue.Enqueue(context.Background(), video)
	_ = sqlStore.DB().QueryRow(`SELECT COUNT(1) FROM media_purge_queue`).Scan(&left)
	if left != 1 {
		t.Fatalf("Enqueue harus idempoten, baris = %d", left)
	}
}

func TestPurgeWorker_QueueFailureKeepsMessageForNextCycle(t *testing.T) {
	msgs := store.NewMemoryMessageStore()
	saveOldVideo(t, msgs, "m-video", "https://media.contoh.id/video/abc.mp4")

	w := NewPurgeWorker(&flakyStorage{failing: true}, msgs, 1, time.Hour)
	w.SetQueue(failingEnqueueQueue{})

	if n := w.PurgeOnce(context.Background()); n != 0 {
		t.Fatalf("PurgeOnce = %d, want 0 (hapus dan antrean sama-sama gagal)", n)
	}
	if st := mediaStatusOf(t, msgs, "m-video"); st != "active" {
		t.Fatalf("status harus tetap active agar siklus berikutnya mencoba lagi, dapat %q", st)
	}
}

func TestPurgeWorker_ThumbnailDeleteFailureIsReported(t *testing.T) {
	fs := &flakyStorage{failOn: ".thumb.jpg"}
	w := &PurgeWorker{storage: fs}
	if err := w.deleteWithThumbnail(context.Background(), "https://m.id/video/abc.mp4"); err == nil {
		t.Fatal("galat hapus thumbnail harus dilaporkan supaya dicoba ulang")
	}
	if err := w.deleteWithThumbnail(context.Background(), "https://m.id/foto.jpg"); err != nil {
		t.Fatalf("foto tanpa thumbnail harus sukses: %v", err)
	}
}
