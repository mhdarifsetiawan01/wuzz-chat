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

func TestMediaHandler_AcknowledgeDownload_SharedMediaHub_GroupAndSubGroup(t *testing.T) {
	tempDB := filepath.Join(t.TempDir(), "test_shared_media.db")
	msgStore, err := store.NewSQLMessageStore("sqlite", tempDB)
	if err != nil {
		t.Fatalf("failed to create sql message store: %v", err)
	}
	userStore := store.NewSQLUserStore(msgStore.DB(), msgStore.DriverName())
	groupStore := store.NewSQLGroupStore(msgStore.DB(), msgStore.DriverName())

	tempDir := t.TempDir()
	ls, _ := storage.NewLocalStorage(tempDir, "/uploads")
	handler := NewMediaHandler(ls, msgStore)
	handler.SetUserStore(userStore)

	userAlice, _ := userStore.Register("alice_hub", "Alice Hub", "pass123")
	userBob, _ := userStore.Register("bob_hub", "Bob Hub", "pass123")
	userCharlie, _ := userStore.Register("charlie_hub", "Charlie Hub", "pass123")

	// 1. Buat Parent Group & Subgroup / Forum
	group, err := groupStore.CreateGroup("Komunitas Utama", "Deskripsi", "", userAlice.ID, "", false, []string{userBob.ID, userCharlie.ID})
	if err != nil {
		t.Fatalf("gagal membuat group: %v", err)
	}

	subGroup, err := groupStore.CreateSubGroup(group.ID, "Forum Diskusi", "Topik", userAlice.ID, "7_days", true)
	if err != nil {
		t.Fatalf("gagal membuat subgrup: %v", err)
	}
	// Pastikan Bob bergabung ke subgrup
	_ = groupStore.JoinSubGroup(subGroup.ID, userBob.ID)

	// Buat file fisik mock untuk Group dan SubGroup
	groupFileName := "group_photo.jpg"
	groupFilePath := filepath.Join(tempDir, groupFileName)
	_ = os.WriteFile(groupFilePath, []byte("group-image-content"), 0644)
	groupMediaURL := "/uploads/" + groupFileName

	subgroupFileName := "subgroup_doc.pdf"
	subgroupFilePath := filepath.Join(tempDir, subgroupFileName)
	_ = os.WriteFile(subgroupFilePath, []byte("subgroup-doc-content"), 0644)
	subgroupMediaURL := "/uploads/" + subgroupFileName

	// Simpan pesan media di grup
	_ = msgStore.Save(store.StoredMessage{
		ID:          "msg-grp-media-1",
		RoomID:      group.ID,
		FromID:      userAlice.ID,
		Nickname:    userAlice.DisplayName,
		Content:     "Foto grup bersama",
		MediaURL:    groupMediaURL,
		MediaType:   "image",
		FileName:    groupFileName,
		FileSize:    int64(len("group-image-content")),
		MediaStatus: "active",
		Timestamp:   time.Now().UTC(),
	})

	// Simpan pesan media di subgrup/forum
	_ = msgStore.Save(store.StoredMessage{
		ID:          "msg-sub-media-1",
		RoomID:      subGroup.ID,
		FromID:      userAlice.ID,
		Nickname:    userAlice.DisplayName,
		Content:     "Dokumen topik forum",
		MediaURL:    subgroupMediaURL,
		MediaType:   "document",
		FileName:    subgroupFileName,
		FileSize:    int64(len("subgroup-doc-content")),
		MediaStatus: "active",
		Timestamp:   time.Now().UTC(),
	})

	// 2. Test ACK pada Grup oleh Bob: File TIDAK BOLEH terhapus, status tetap active
	bobClaims := &auth.UserClaims{
		UserID:      userBob.ID,
		Username:    userBob.Username,
		DisplayName: userBob.DisplayName,
	}
	ackGroupBody, _ := json.Marshal(MediaAckRequest{MessageID: "msg-grp-media-1"})
	reqGroup := httptest.NewRequest(http.MethodPost, "/api/media/ack", bytes.NewReader(ackGroupBody))
	reqGroup = reqGroup.WithContext(auth.SetUserContext(reqGroup.Context(), bobClaims))
	rrGroup := httptest.NewRecorder()

	handler.AcknowledgeDownload(rrGroup, reqGroup)
	if rrGroup.Code != http.StatusOK {
		t.Fatalf("Ekspektasi 200 OK untuk ACK grup, dapat: %d", rrGroup.Code)
	}

	// Verifikasi file fisik grup masih ada
	if _, statErr := os.Stat(groupFilePath); os.IsNotExist(statErr) {
		t.Fatalf("File fisik grup tidak boleh dihapus saat anggota pertama ACK!")
	}
	// Verifikasi status pesan di DB masih 'active'
	msgGroupInDB, _ := msgStore.GetMessageByID("msg-grp-media-1")
	if msgGroupInDB.MediaStatus != "active" {
		t.Fatalf("Ekspektasi media_status pesan grup tetap 'active', dapat: %s", msgGroupInDB.MediaStatus)
	}

	// 3. Test ACK pada Subgrup/Forum oleh Bob: File TIDAK BOLEH terhapus, status tetap active
	ackSubBody, _ := json.Marshal(MediaAckRequest{MessageID: "msg-sub-media-1"})
	reqSub := httptest.NewRequest(http.MethodPost, "/api/media/ack", bytes.NewReader(ackSubBody))
	reqSub = reqSub.WithContext(auth.SetUserContext(reqSub.Context(), bobClaims))
	rrSub := httptest.NewRecorder()

	handler.AcknowledgeDownload(rrSub, reqSub)
	if rrSub.Code != http.StatusOK {
		t.Fatalf("Ekspektasi 200 OK untuk ACK subgrup/forum, dapat: %d", rrSub.Code)
	}

	// Verifikasi file fisik subgrup masih ada
	if _, statErr := os.Stat(subgroupFilePath); os.IsNotExist(statErr) {
		t.Fatalf("File fisik subgrup/forum tidak boleh dihapus saat anggota ACK!")
	}
	// Verifikasi status pesan di DB masih 'active'
	msgSubInDB, _ := msgStore.GetMessageByID("msg-sub-media-1")
	if msgSubInDB.MediaStatus != "active" {
		t.Fatalf("Ekspektasi media_status pesan subgrup tetap 'active', dapat: %s", msgSubInDB.MediaStatus)
	}

	// 4. Test ACK pada Direct Message (1-on-1): File HARUS terhapus dan status menjadi 'expired'
	dmRoomID, _ := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)
	dmFileName := "dm_secret.jpg"
	dmFilePath := filepath.Join(tempDir, dmFileName)
	_ = os.WriteFile(dmFilePath, []byte("dm-secret-content"), 0644)
	dmMediaURL := "/uploads/" + dmFileName

	_ = msgStore.Save(store.StoredMessage{
		ID:          "msg-dm-media-1",
		RoomID:      dmRoomID,
		FromID:      userAlice.ID,
		Nickname:    userAlice.DisplayName,
		ToID:        userBob.ID,
		Content:     "Pesan DM rahasia",
		MediaURL:    dmMediaURL,
		MediaType:   "image",
		FileName:    dmFileName,
		FileSize:    int64(len("dm-secret-content")),
		MediaStatus: "active",
		Timestamp:   time.Now().UTC(),
	})

	ackDMBody, _ := json.Marshal(MediaAckRequest{MessageID: "msg-dm-media-1"})
	reqDM := httptest.NewRequest(http.MethodPost, "/api/media/ack", bytes.NewReader(ackDMBody))
	reqDM = reqDM.WithContext(auth.SetUserContext(reqDM.Context(), bobClaims))
	rrDM := httptest.NewRecorder()

	handler.AcknowledgeDownload(rrDM, reqDM)
	if rrDM.Code != http.StatusOK {
		t.Fatalf("Ekspektasi 200 OK untuk ACK DM, dapat: %d", rrDM.Code)
	}

	// Verifikasi file fisik DM HARUS TERHAPUS (Store-and-Forward)
	if _, statErr := os.Stat(dmFilePath); !os.IsNotExist(statErr) {
		t.Fatalf("File fisik DM harus dihapus setelah penerima ACK!")
	}
	// Verifikasi status pesan DM di DB menjadi 'expired'
	msgDMInDB, _ := msgStore.GetMessageByID("msg-dm-media-1")
	if msgDMInDB.MediaStatus != "expired" {
		t.Fatalf("Ekspektasi media_status pesan DM berubah menjadi 'expired', dapat: %s", msgDMInDB.MediaStatus)
	}
}


