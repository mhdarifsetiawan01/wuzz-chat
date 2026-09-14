package api

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/storage"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func TestMediaHandler_Config(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "wuzz_test_media_*")
	defer os.RemoveAll(tempDir)

	ls, _ := storage.NewLocalStorage(tempDir, "/uploads")
	handler := NewMediaHandler(ls, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	rr := httptest.NewRecorder()

	handler.Config(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Ekspektasi status 200, dapat: %d", rr.Code)
	}

	var res AppConfigResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("Gagal unmarshal respon config: %v", err)
	}

	if !res.MediaUploadEnabled {
		t.Errorf("Ekspektasi media upload aktif")
	}
	if res.StorageDriver != "local" {
		t.Errorf("Ekspektasi storage driver 'local', dapat: %s", res.StorageDriver)
	}
	if res.MediaRetentionDays != 7 {
		t.Errorf("Ekspektasi default media retention 7 hari, dapat: %d", res.MediaRetentionDays)
	}
}

func TestMediaHandler_UploadSuccess(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "wuzz_test_media_*")
	defer os.RemoveAll(tempDir)

	ls, _ := storage.NewLocalStorage(tempDir, "/uploads")
	handler := NewMediaHandler(ls, nil)

	// Buat multipart form data
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "cat.png")
	if err != nil {
		t.Fatalf("Gagal membuat form file: %v", err)
	}
	// PNG Magic bytes
	pngHeader := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00}
	part.Write(pngHeader)
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/media/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rr := httptest.NewRecorder()

	handler.Upload(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Ekspektasi status 200, dapat: %d, body: %s", rr.Code, rr.Body.String())
	}

	var res MediaUploadResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &res); err != nil {
		t.Fatalf("Gagal decode respon upload: %v", err)
	}

	if res.FileName != "cat.png" {
		t.Errorf("Ekspektasi file_name 'cat.png', dapat: %s", res.FileName)
	}
	if res.MediaType != "image" {
		t.Errorf("Ekspektasi media_type 'image', dapat: %s", res.MediaType)
	}
}

func TestMediaHandler_UploadDisabled(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "wuzz_test_media_*")
	defer os.RemoveAll(tempDir)

	ls, _ := storage.NewLocalStorage(tempDir, "/uploads")
	handler := NewMediaHandler(ls, nil)
	handler.SetEnabled(false) // Nonaktifkan fitur

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("file", "cat.png")
	part.Write([]byte("dummy content"))
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/media/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rr := httptest.NewRecorder()

	handler.Upload(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("Ekspektasi status 403 Forbidden saat fitur upload dimatikan, dapat: %d", rr.Code)
	}
}

func TestMediaHandler_UploadDangerousFile(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "wuzz_test_media_*")
	defer os.RemoveAll(tempDir)

	ls, _ := storage.NewLocalStorage(tempDir, "/uploads")
	handler := NewMediaHandler(ls, nil)

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("file", "malicious_virus.exe")
	part.Write([]byte("dangerous binary code"))
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/media/upload", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rr := httptest.NewRecorder()

	handler.Upload(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("Ekspektasi status 400 Bad Request untuk file berbahaya .exe, dapat: %d", rr.Code)
	}
}

func TestMediaHandler_AcknowledgeDownload(t *testing.T) {
	tempDir, _ := os.MkdirTemp("", "wuzz_test_media_*")
	defer os.RemoveAll(tempDir)

	ls, _ := storage.NewLocalStorage(tempDir, "/uploads")
	handler := NewMediaHandler(ls, nil)

	ackBody, _ := json.Marshal(MediaAckRequest{
		MessageID: "msg-123",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/media/ack", bytes.NewReader(ackBody))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handler.AcknowledgeDownload(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Ekspektasi status 200 OK untuk ACK download, dapat: %d", rr.Code)
	}
}

func TestMediaHandler_AcknowledgeDownload_IDORProtection(t *testing.T) {
	tempDB := filepath.Join(t.TempDir(), "test_media_idor.db")
	msgStore, err := store.NewSQLMessageStore("sqlite", tempDB)
	if err != nil {
		t.Fatalf("failed to create sql message store: %v", err)
	}
	userStore := store.NewSQLUserStore(msgStore.DB(), msgStore.DriverName())

	tempDir := t.TempDir()
	ls, _ := storage.NewLocalStorage(tempDir, "/uploads")
	handler := NewMediaHandler(ls, msgStore)
	handler.SetUserStore(userStore)

	userAlice, _ := userStore.Register("alice_media", "Alice Media", "pass123")
	userBob, _ := userStore.Register("bob_media", "Bob Media", "pass123")
	userMallory, _ := userStore.Register("mallory_media", "Mallory Media", "pass123")

	dmRoomID, _ := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)

	// Simpan pesan media dalam room Alice-Bob
	_ = msgStore.Save(store.StoredMessage{
		ID:          "msg-media-photo-1",
		RoomID:      dmRoomID,
		FromID:      userAlice.ID,
		Nickname:    userAlice.DisplayName,
		ToID:      userBob.ID,
		Content:     "Foto rahasia",
		MediaURL:    "/uploads/photo.jpg",
		MediaType:   "image",
		FileName:    "photo.jpg",
		FileSize:    1024,
		MediaStatus: "active",
		Timestamp:   time.Now().UTC(),
	})

	// 1. Mallory (Bukan anggota room) mencoba kirim ACK untuk menghapus media
	malClaims := &auth.UserClaims{
		UserID:      userMallory.ID,
		Username:    userMallory.Username,
		DisplayName: userMallory.DisplayName,
	}
	ackBody, _ := json.Marshal(MediaAckRequest{
		MessageID: "msg-media-photo-1",
	})
	reqMal := httptest.NewRequest(http.MethodPost, "/api/media/ack", bytes.NewReader(ackBody))
	reqMal = reqMal.WithContext(auth.SetUserContext(reqMal.Context(), malClaims))
	rrMal := httptest.NewRecorder()

	handler.AcknowledgeDownload(rrMal, reqMal)
	if rrMal.Code != http.StatusForbidden {
		t.Fatalf("Ekspektasi 403 Forbidden untuk Mallory (non-anggota), dapat: %d", rrMal.Code)
	}

	// 2. Bob (Penerima sah) mengirim ACK -> Harus berhasil 200 OK
	bobClaims := &auth.UserClaims{
		UserID:      userBob.ID,
		Username:    userBob.Username,
		DisplayName: userBob.DisplayName,
	}
	reqBob := httptest.NewRequest(http.MethodPost, "/api/media/ack", bytes.NewReader(ackBody))
	reqBob = reqBob.WithContext(auth.SetUserContext(reqBob.Context(), bobClaims))
	rrBob := httptest.NewRecorder()

	handler.AcknowledgeDownload(rrBob, reqBob)
	if rrBob.Code != http.StatusOK {
		t.Fatalf("Ekspektasi 200 OK untuk Bob (anggota sah), dapat: %d", rrBob.Code)
	}
}

