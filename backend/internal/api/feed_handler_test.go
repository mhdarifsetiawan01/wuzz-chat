package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/feed"
	feedinfra "github.com/bms-del112/wuzz-chat/internal/feed/infra"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func setupTestFeedHandler(t *testing.T) (*api.FeedHandler, store.UserStore, *store.SQLMessageStore, func()) {
	t.Helper()
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_feed.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Gagal inisialisasi SQL store: %v", err)
	}

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	feedRepo := feedinfra.NewSQLFeedRepository(sqlStore.DB(), sqlStore.DriverName())
	feedSvc := feed.NewFeedService(feedRepo)
	handler := api.NewFeedHandlerWithService(feedSvc)

	cleanup := func() {
		_ = sqlStore.Close()
	}

	return handler, userStore, sqlStore, cleanup
}

func createTestUser(t *testing.T, sqlStore *store.SQLMessageStore, userStore store.UserStore, username, displayName, systemRole string) *store.User {
	t.Helper()
	u, err := userStore.RegisterWithContext(context.Background(), username, displayName, "password123")
	if err != nil {
		t.Fatalf("Register user %s gagal: %v", username, err)
	}
	if systemRole != "" && systemRole != "user" {
		// Update system_role langsung di DB untuk keperluan pengujian
		_, err := sqlStore.DB().Exec("UPDATE users SET system_role = ? WHERE id = ?", systemRole, u.ID)
		if err != nil {
			t.Fatalf("Update system_role gagal: %v", err)
		}
		u.SystemRole = systemRole
	}
	return u
}

func TestFeedHandler_FullFlow(t *testing.T) {
	handler, userStore, sqlStore, cleanup := setupTestFeedHandler(t)
	defer cleanup()

	// 1. Setup user: Author, Moderator, dan Stranger
	author := createTestUser(t, sqlStore, userStore, "alice_author", "Alice", "user")
	stranger := createTestUser(t, sqlStore, userStore, "bob_stranger", "Bob", "user")
	moderator := createTestUser(t, sqlStore, userStore, "charlie_mod", "Charlie", "moderator")

	authorClaims := &auth.UserClaims{
		UserID:      author.ID,
		Username:    author.Username,
		DisplayName: author.DisplayName,
		TenantID:    "default",
		SystemRole:  "user",
	}
	strangerClaims := &auth.UserClaims{
		UserID:      stranger.ID,
		Username:    stranger.Username,
		DisplayName: stranger.DisplayName,
		TenantID:    "default",
		SystemRole:  "user",
	}
	modClaims := &auth.UserClaims{
		UserID:      moderator.ID,
		Username:    moderator.Username,
		DisplayName: moderator.DisplayName,
		TenantID:    "default",
		SystemRole:  feed.SystemRoleWuzzModerator,
	}
	adminClaims := &auth.UserClaims{
		UserID:      "admin-system-1",
		Username:    "admin_wuzz",
		DisplayName: "Wuzz Admin Official",
		TenantID:    "default",
		SystemRole:  feed.SystemRoleWuzzAdmin,
	}

	// 2. Author membuat postingan baru (POST /api/feed)
	postPayload := feed.CreatePostInput{
		Content:   "Halo Komunitas WuzzChat! Ini postingan pertama saya 🚀",
		MediaURLs: []string{"https://example.com/media1.jpg"},
	}
	body, _ := json.Marshal(postPayload)
	req := httptest.NewRequest(http.MethodPost, "/api/feed", bytes.NewReader(body))
	req = req.WithContext(auth.SetUserContext(req.Context(), authorClaims))
	w := httptest.NewRecorder()

	handler.HandleFeedRoot(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("Expected status 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var createdPost feed.FeedPost
	if err := json.Unmarshal(w.Body.Bytes(), &createdPost); err != nil {
		t.Fatalf("Failed to parse created post: %v", err)
	}
	if createdPost.ID == "" || createdPost.Content != postPayload.Content {
		t.Fatalf("Created post content mismatch: %+v", createdPost)
	}
	if createdPost.Author.Username != "alice_author" {
		t.Fatalf("Expected author username alice_author, got %s", createdPost.Author.Username)
	}

	// 3. Mengambil linimasa feed (GET /api/feed)
	reqGet := httptest.NewRequest(http.MethodGet, "/api/feed?limit=10", nil)
	reqGet = reqGet.WithContext(auth.SetUserContext(reqGet.Context(), authorClaims))
	wGet := httptest.NewRecorder()

	handler.HandleFeedRoot(wGet, reqGet)
	if wGet.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d: %s", wGet.Code, wGet.Body.String())
	}

	var timelineResp feed.FeedTimelineResponse
	if err := json.Unmarshal(wGet.Body.Bytes(), &timelineResp); err != nil {
		t.Fatalf("Failed to parse timeline response: %v", err)
	}
	if len(timelineResp.Posts) != 1 {
		t.Fatalf("Expected 1 post in timeline, got %d", len(timelineResp.Posts))
	}

	// 4. Stranger melakukan Like pada postingan (POST /api/feed/{id}/like)
	likeReq := httptest.NewRequest(http.MethodPost, "/api/feed/"+createdPost.ID+"/like", nil)
	likeReq = likeReq.WithContext(auth.SetUserContext(likeReq.Context(), strangerClaims))
	wLike := httptest.NewRecorder()

	handler.RouteFeedRequest(wLike, likeReq)
	if wLike.Code != http.StatusOK {
		t.Fatalf("Expected status 200 on like, got %d: %s", wLike.Code, wLike.Body.String())
	}

	var likeResult feed.ToggleLikeResult
	if err := json.Unmarshal(wLike.Body.Bytes(), &likeResult); err != nil {
		t.Fatalf("Failed to parse like result: %v", err)
	}
	if !likeResult.Liked || likeResult.LikesCount != 1 {
		t.Fatalf("Expected liked=true, count=1, got: %+v", likeResult)
	}

	// Stranger unlike
	wUnlike := httptest.NewRecorder()
	handler.RouteFeedRequest(wUnlike, likeReq)
	if wUnlike.Code != http.StatusOK {
		t.Fatalf("Expected status 200 on unlike, got %d: %s", wUnlike.Code, wUnlike.Body.String())
	}
	var unlikeResult feed.ToggleLikeResult
	_ = json.Unmarshal(wUnlike.Body.Bytes(), &unlikeResult)
	if unlikeResult.Liked || unlikeResult.LikesCount != 0 {
		t.Fatalf("Expected liked=false, count=0, got: %+v", unlikeResult)
	}

	// 5. Menambahkan dan mengambil komentar (POST & GET /api/feed/{id}/comments)
	commentPayload := feed.CreateCommentInput{
		Content: "Komentar keren dari Bob!",
	}
	commentBody, _ := json.Marshal(commentPayload)
	reqComment := httptest.NewRequest(http.MethodPost, "/api/feed/"+createdPost.ID+"/comments", bytes.NewReader(commentBody))
	reqComment = reqComment.WithContext(auth.SetUserContext(reqComment.Context(), strangerClaims))
	wComment := httptest.NewRecorder()

	handler.RouteFeedRequest(wComment, reqComment)
	if wComment.Code != http.StatusCreated {
		t.Fatalf("Expected status 201 on comment, got %d: %s", wComment.Code, wComment.Body.String())
	}

	reqListComments := httptest.NewRequest(http.MethodGet, "/api/feed/"+createdPost.ID+"/comments", nil)
	reqListComments = reqListComments.WithContext(auth.SetUserContext(reqListComments.Context(), authorClaims))
	wListComments := httptest.NewRecorder()

	handler.RouteFeedRequest(wListComments, reqListComments)
	if wListComments.Code != http.StatusOK {
		t.Fatalf("Expected status 200 on list comments, got %d: %s", wListComments.Code, wListComments.Body.String())
	}
	var commentsResp feed.FeedCommentsResponse
	if err := json.Unmarshal(wListComments.Body.Bytes(), &commentsResp); err != nil {
		t.Fatalf("Failed to parse comments response: %v", err)
	}
	if len(commentsResp.Comments) != 1 || commentsResp.Comments[0].Content != commentPayload.Content {
		t.Fatalf("Unexpected comments response: %+v", commentsResp)
	}

	// 6. Pengujian Otorisasi Delete (DELETE /api/feed/{id})
	// A. Stranger mencoba menghapus postingan milik Author -> Harus 403 Forbidden
	reqDelStranger := httptest.NewRequest(http.MethodDelete, "/api/feed/"+createdPost.ID, nil)
	reqDelStranger = reqDelStranger.WithContext(auth.SetUserContext(reqDelStranger.Context(), strangerClaims))
	wDelStranger := httptest.NewRecorder()

	handler.RouteFeedRequest(wDelStranger, reqDelStranger)
	if wDelStranger.Code != http.StatusForbidden {
		t.Fatalf("Expected status 403 Forbidden when stranger deletes post, got %d: %s", wDelStranger.Code, wDelStranger.Body.String())
	}

	// B. Moderator menghapus postingan -> Harus 200 OK
	reqDelMod := httptest.NewRequest(http.MethodDelete, "/api/feed/"+createdPost.ID, nil)
	reqDelMod = reqDelMod.WithContext(auth.SetUserContext(reqDelMod.Context(), modClaims))
	wDelMod := httptest.NewRecorder()

	handler.RouteFeedRequest(wDelMod, reqDelMod)
	if wDelMod.Code != http.StatusOK {
		t.Fatalf("Expected status 200 OK when moderator deletes post, got %d: %s", wDelMod.Code, wDelMod.Body.String())
	}

	// C. Verifikasi postingan sudah terhapus (GET /api/feed/{id} -> 404 Not Found)
	reqGetDeleted := httptest.NewRequest(http.MethodGet, "/api/feed/"+createdPost.ID, nil)
	reqGetDeleted = reqGetDeleted.WithContext(auth.SetUserContext(reqGetDeleted.Context(), authorClaims))
	wGetDeleted := httptest.NewRecorder()

	handler.RouteFeedRequest(wGetDeleted, reqGetDeleted)
	if wGetDeleted.Code != http.StatusNotFound {
		t.Fatalf("Expected status 404 Not Found for deleted post, got %d: %s", wGetDeleted.Code, wGetDeleted.Body.String())
	}

	// 7. Pengujian Pembuatan Pengumuman Resmi & Pinning
	// A. Author reguler mencoba pin & type announcement -> harus dinormalisasi (is_pinned: false, post_type: standard)
	regTryPin := feed.CreatePostInput{
		Content:  "User biasa mencoba pin di handler",
		PostType: feed.PostTypeAnnouncement,
		IsPinned: true,
	}
	bodyPin, _ := json.Marshal(regTryPin)
	reqPinUser := httptest.NewRequest(http.MethodPost, "/api/feed", bytes.NewReader(bodyPin))
	reqPinUser = reqPinUser.WithContext(auth.SetUserContext(reqPinUser.Context(), authorClaims))
	wPinUser := httptest.NewRecorder()

	handler.HandleFeedRoot(wPinUser, reqPinUser)
	if wPinUser.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created for normalized post, got %d: %s", wPinUser.Code, wPinUser.Body.String())
	}
	var normPost feed.FeedPost
	if err := json.Unmarshal(wPinUser.Body.Bytes(), &normPost); err != nil {
		t.Fatalf("Failed to parse normPost: %v", err)
	}
	if normPost.IsPinned || normPost.PostType != feed.PostTypeStandard {
		t.Fatalf("Expected normalized post (unpinned & standard), got: %+v", normPost)
	}

	// B. Moderator (wuzz_moderator) mencoba pin & announcement -> DITOLAK / dinormalisasi (hanya tugas moderasi)
	modTryPin := feed.CreatePostInput{
		Content:  "Moderator mencoba pin",
		PostType: feed.PostTypeAnnouncement,
		IsPinned: true,
	}
	bodyModPin, _ := json.Marshal(modTryPin)
	reqModPin := httptest.NewRequest(http.MethodPost, "/api/feed", bytes.NewReader(bodyModPin))
	reqModPin = reqModPin.WithContext(auth.SetUserContext(reqModPin.Context(), modClaims))
	wModPin := httptest.NewRecorder()

	handler.HandleFeedRoot(wModPin, reqModPin)
	if wModPin.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created for mod normalized post, got %d: %s", wModPin.Code, wModPin.Body.String())
	}
	var modNormPost feed.FeedPost
	if err := json.Unmarshal(wModPin.Body.Bytes(), &modNormPost); err != nil {
		t.Fatalf("Failed to parse modNormPost: %v", err)
	}
	if modNormPost.IsPinned || modNormPost.PostType != feed.PostTypeStandard {
		t.Fatalf("Expected normalized post for moderator, got: %+v", modNormPost)
	}

	// C. Administrator (wuzz_admin) membuat pengumuman resmi dengan pin -> harus sukses tersimpan sebagai announcement & is_pinned: true
	adminAnnounce := feed.CreatePostInput{
		Content:  "Pengumuman Resmi Wuzz Admin",
		PostType: feed.PostTypeAnnouncement,
		IsPinned: true,
		Metadata: []byte(`{"cta_text":"Kunjungi Website","cta_url":"https://wuzzhub.id"}`),
	}
	bodyAdmin, _ := json.Marshal(adminAnnounce)
	reqAnnounceAdmin := httptest.NewRequest(http.MethodPost, "/api/feed", bytes.NewReader(bodyAdmin))
	reqAnnounceAdmin = reqAnnounceAdmin.WithContext(auth.SetUserContext(reqAnnounceAdmin.Context(), adminClaims))
	wAnnounceAdmin := httptest.NewRecorder()

	handler.HandleFeedRoot(wAnnounceAdmin, reqAnnounceAdmin)
	if wAnnounceAdmin.Code != http.StatusCreated {
		t.Fatalf("Expected 201 Created for admin announcement, got %d: %s", wAnnounceAdmin.Code, wAnnounceAdmin.Body.String())
	}
	var officialPost feed.FeedPost
	if err := json.Unmarshal(wAnnounceAdmin.Body.Bytes(), &officialPost); err != nil {
		t.Fatalf("Failed to parse officialPost: %v", err)
	}
	if !officialPost.IsPinned || officialPost.PostType != feed.PostTypeAnnouncement {
		t.Fatalf("Expected pinned announcement, got: %+v", officialPost)
	}

	// 8. Pengujian Tab Ganda: Tab Explore dengan Seed Acak (GET /api/feed?tab=explore&seed=my_seed_123)
	reqExplore := httptest.NewRequest(http.MethodGet, "/api/feed?tab=explore&seed=my_seed_123&limit=10", nil)
	reqExplore = reqExplore.WithContext(auth.SetUserContext(reqExplore.Context(), authorClaims))
	wExplore := httptest.NewRecorder()

	handler.HandleFeedRoot(wExplore, reqExplore)
	if wExplore.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK on explore tab, got %d: %s", wExplore.Code, wExplore.Body.String())
	}
	var exploreResp feed.FeedTimelineResponse
	if err := json.Unmarshal(wExplore.Body.Bytes(), &exploreResp); err != nil {
		t.Fatalf("Failed to parse exploreResp: %v", err)
	}
	if len(exploreResp.Posts) == 0 {
		t.Fatalf("Expected at least 1 post in explore tab, got 0")
	}
}
