package feed_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/feed"
)

// mockFeedRepository adalah mock in-memory untuk FeedRepository.
type mockFeedRepository struct {
	posts    map[string]*feed.FeedPost
	likes    map[string]map[string]bool // postID -> userID -> true
	comments map[string][]*feed.FeedComment
}

func newMockFeedRepository() *mockFeedRepository {
	return &mockFeedRepository{
		posts:    make(map[string]*feed.FeedPost),
		likes:    make(map[string]map[string]bool),
		comments: make(map[string][]*feed.FeedComment),
	}
}

func (m *mockFeedRepository) CreatePost(ctx context.Context, post *feed.FeedPost) error {
	m.posts[post.ID] = post
	return nil
}

func (m *mockFeedRepository) GetPostByID(ctx context.Context, tenantID, postID, currentUserID string) (*feed.FeedPost, error) {
	p, ok := m.posts[postID]
	if !ok || p.TenantID != tenantID {
		return nil, feed.ErrPostNotFound
	}
	cp := *p
	if m.likes[postID] != nil && m.likes[postID][currentUserID] {
		cp.IsLiked = true
	}
	return &cp, nil
}

func (m *mockFeedRepository) ListTimeline(ctx context.Context, tenantID, currentUserID, tab, seed string, before time.Time, offset, limit int) ([]*feed.FeedPost, error) {
	var res []*feed.FeedPost
	for _, p := range m.posts {
		if p.TenantID == tenantID {
			if before.IsZero() || p.CreatedAt.Before(before) {
				cp := *p
				if m.likes[p.ID] != nil && m.likes[p.ID][currentUserID] {
					cp.IsLiked = true
				}
				res = append(res, &cp)
			}
		}
	}
	if offset > 0 && offset < len(res) {
		res = res[offset:]
	}
	if len(res) > limit {
		res = res[:limit]
	}
	return res, nil
}

func (m *mockFeedRepository) ToggleLike(ctx context.Context, tenantID, postID, userID string) (bool, int, error) {
	p, ok := m.posts[postID]
	if !ok || p.TenantID != tenantID {
		return false, 0, feed.ErrPostNotFound
	}

	if m.likes[postID] == nil {
		m.likes[postID] = make(map[string]bool)
	}

	liked := false
	if m.likes[postID][userID] {
		delete(m.likes[postID], userID)
		if p.LikesCount > 0 {
			p.LikesCount--
		}
	} else {
		m.likes[postID][userID] = true
		p.LikesCount++
		liked = true
	}

	return liked, p.LikesCount, nil
}

func (m *mockFeedRepository) CreateComment(ctx context.Context, comment *feed.FeedComment) error {
	p, ok := m.posts[comment.PostID]
	if !ok || p.TenantID != comment.TenantID {
		return feed.ErrPostNotFound
	}
	m.comments[comment.PostID] = append(m.comments[comment.PostID], comment)
	p.CommentsCount++
	return nil
}

func (m *mockFeedRepository) ListComments(ctx context.Context, tenantID, postID string, before time.Time, limit int) ([]*feed.FeedComment, error) {
	p, ok := m.posts[postID]
	if !ok || p.TenantID != tenantID {
		return nil, feed.ErrPostNotFound
	}
	comments := m.comments[postID]
	if len(comments) > limit {
		comments = comments[:limit]
	}
	return comments, nil
}

func (m *mockFeedRepository) DeletePost(ctx context.Context, tenantID, postID string) error {
	p, ok := m.posts[postID]
	if !ok || p.TenantID != tenantID {
		return feed.ErrPostNotFound
	}
	delete(m.posts, postID)
	delete(m.likes, postID)
	delete(m.comments, postID)
	return nil
}

// ─── Tests ───────────────────────────────────────────────────────────────────

func TestFeedService_CreatePost_Validation(t *testing.T) {
	repo := newMockFeedRepository()
	service := feed.NewFeedService(repo)
	ctx := context.Background()

	// 1. Konten kosong harus gagal
	_, err := service.CreatePost(ctx, "default", "user-1", "user", feed.CreatePostInput{
		Content: "   \n\t  ",
	})
	if err != feed.ErrContentEmpty {
		t.Fatalf("expected ErrContentEmpty, got: %v", err)
	}

	// 2. Konten lebih dari 1000 karakter harus gagal
	longContent := strings.Repeat("A", 1001)
	_, err = service.CreatePost(ctx, "default", "user-1", "user", feed.CreatePostInput{
		Content: longContent,
	})
	if err != feed.ErrContentTooLong {
		t.Fatalf("expected ErrContentTooLong, got: %v", err)
	}

	// 3. Lebih dari 4 URL media harus gagal
	_, err = service.CreatePost(ctx, "default", "user-1", "user", feed.CreatePostInput{
		Content:   "Postingan keren",
		MediaURLs: []string{"https://a.id/1.jpg", "https://a.id/2.jpg", "https://a.id/3.jpg", "https://a.id/4.jpg", "https://a.id/5.jpg"},
	})
	if err != feed.ErrTooManyMedia {
		t.Fatalf("expected ErrTooManyMedia, got: %v", err)
	}

	// 4. Postingan sah berhasil
	post, err := service.CreatePost(ctx, "default", "user-1", "user", feed.CreatePostInput{
		Content:   "Halo Komunitas WuzzChat!",
		MediaURLs: []string{"https://a.id/1.jpg", "/uploads/2.jpg"},
	})
	if err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}
	if post.ID == "" || post.Content != "Halo Komunitas WuzzChat!" {
		t.Fatalf("unexpected post content: %+v", post)
	}
	if len(post.MediaURLs) != 2 {
		t.Fatalf("expected 2 media urls, got %d", len(post.MediaURLs))
	}
}

func TestFeedService_CreatePost_RejectsUnsafeMediaURL(t *testing.T) {
	service := feed.NewFeedService(newMockFeedRepository())
	bad := []string{
		"javascript:alert(1)", "file:///etc/passwd", "data:image/png;base64,AAAA",
		"url1", "https://user:pw@a.id/x.jpg", "/uploads/../etc/passwd",
		"https://a.id/" + strings.Repeat("a", 2100), "https://a.id/x\n.jpg",
		"https://a.id/evil.svg", "https://a.id/evil.HTML", "/uploads/x.js", "https://a.id/doc.pdf", "https://a.id/noext", "https://a.id/x.bin",
	}
	for _, u := range bad {
		_, err := service.CreatePost(context.Background(), "default", "user-1", "user", feed.CreatePostInput{
			Content: "x", MediaURLs: []string{u},
		})
		if err != feed.ErrInvalidMediaURL {
			t.Fatalf("expected ErrInvalidMediaURL for %q, got: %v", u, err)
		}
	}
}

func TestFeedService_CreatePost_RolePermissions(t *testing.T) {
	repo := newMockFeedRepository()
	service := feed.NewFeedService(repo)
	ctx := context.Background()

	// 1. User biasa mencoba membuat postingan pengumuman & pin -> dinormalisasi jadi standard & unpinned
	regularPost, err := service.CreatePost(ctx, "default", "user-regular", feed.SystemRoleUser, feed.CreatePostInput{
		Content:  "User biasa mencoba pin",
		PostType: feed.PostTypeAnnouncement,
		IsPinned: true,
		Metadata: []byte(`{"priority":"high"}`),
	})
	if err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}
	if regularPost.IsPinned {
		t.Fatalf("expected regular user post to NOT be pinned")
	}
	if regularPost.PostType != feed.PostTypeStandard {
		t.Fatalf("expected regular user post to have post_type standard, got: %s", regularPost.PostType)
	}
	if string(regularPost.Metadata) != "{}" {
		t.Fatalf("expected regular user metadata to be empty '{}', got: %s", string(regularPost.Metadata))
	}

	// 2. Moderator (wuzz_moderator) mencoba membuat pengumuman & pin -> DILARANG (hanya bertugas moderasi, dinormalisasi ke standard & unpinned)
	modPost, err := service.CreatePost(ctx, "default", "user-mod", feed.SystemRoleWuzzModerator, feed.CreatePostInput{
		Content:  "Moderator mencoba membuat pengumuman",
		PostType: feed.PostTypeAnnouncement,
		IsPinned: true,
		Metadata: []byte(`{"note":"from moderator"}`),
	})
	if err != nil {
		t.Fatalf("expected nil error, got: %v", err)
	}
	if modPost.IsPinned {
		t.Fatalf("expected wuzz_moderator post to NOT be pinned")
	}
	if modPost.PostType != feed.PostTypeStandard {
		t.Fatalf("expected wuzz_moderator post to have post_type standard, got: %s", modPost.PostType)
	}
	if string(modPost.Metadata) != "{}" {
		t.Fatalf("expected wuzz_moderator metadata to be empty '{}', got: %s", string(modPost.Metadata))
	}

	// 3. Admin (wuzz_admin) membuat pengumuman resmi & di-pin -> diizinkan
	adminPost, err := service.CreatePost(ctx, "default", "user-admin", feed.SystemRoleWuzzAdmin, feed.CreatePostInput{
		Content:  "Pengumuman Maintenance Server WuzzChat",
		PostType: feed.PostTypeAnnouncement,
		IsPinned: true,
		Metadata: []byte(`{"cta_text":"Lihat Jadwal","cta_url":"https://wuzzhub.id/status"}`),
	})
	if err != nil {
		t.Fatalf("expected nil error for admin, got: %v", err)
	}
	if !adminPost.IsPinned {
		t.Fatalf("expected admin post to be pinned")
	}
	if adminPost.PostType != feed.PostTypeAnnouncement {
		t.Fatalf("expected post_type announcement, got: %s", adminPost.PostType)
	}
	if !strings.Contains(string(adminPost.Metadata), "Lihat Jadwal") {
		t.Fatalf("expected custom metadata preserved, got: %s", string(adminPost.Metadata))
	}
}

func TestFeedService_ToggleLike(t *testing.T) {
	repo := newMockFeedRepository()
	service := feed.NewFeedService(repo)
	ctx := context.Background()

	post, _ := service.CreatePost(ctx, "default", "user-author", "user", feed.CreatePostInput{
		Content: "Postingan untuk di-like",
	})

	// Like pertama -> Liked: true, LikesCount: 1
	res1, err := service.ToggleLike(ctx, "default", post.ID, "user-liker")
	if err != nil {
		t.Fatalf("ToggleLike 1 gagal: %v", err)
	}
	if !res1.Liked || res1.LikesCount != 1 {
		t.Fatalf("expected liked=true, count=1, got: %+v", res1)
	}

	// Like kedua oleh user yang sama -> Unlike -> Liked: false, LikesCount: 0
	res2, err := service.ToggleLike(ctx, "default", post.ID, "user-liker")
	if err != nil {
		t.Fatalf("ToggleLike 2 gagal: %v", err)
	}
	if res2.Liked || res2.LikesCount != 0 {
		t.Fatalf("expected liked=false, count=0, got: %+v", res2)
	}
}

func TestFeedService_Comment_Validation(t *testing.T) {
	repo := newMockFeedRepository()
	service := feed.NewFeedService(repo)
	ctx := context.Background()

	post, _ := service.CreatePost(ctx, "default", "user-author", "user", feed.CreatePostInput{
		Content: "Diskusi seru",
	})

	// Komentar kosong
	_, err := service.CreateComment(ctx, "default", post.ID, "user-2", feed.CreateCommentInput{
		Content: "  ",
	})
	if err != feed.ErrCommentEmpty {
		t.Fatalf("expected ErrCommentEmpty, got: %v", err)
	}

	// Komentar > 500 karakter
	longComment := strings.Repeat("B", 501)
	_, err = service.CreateComment(ctx, "default", post.ID, "user-2", feed.CreateCommentInput{
		Content: longComment,
	})
	if err != feed.ErrCommentTooLong {
		t.Fatalf("expected ErrCommentTooLong, got: %v", err)
	}

	// Komentar valid
	comment, err := service.CreateComment(ctx, "default", post.ID, "user-2", feed.CreateCommentInput{
		Content: "Komentar yang sangat bermanfaat!",
	})
	if err != nil {
		t.Fatalf("CreateComment gagal: %v", err)
	}
	if comment.Content != "Komentar yang sangat bermanfaat!" {
		t.Fatalf("unexpected comment content: %s", comment.Content)
	}
}

func TestFeedService_DeleteAuthorization(t *testing.T) {
	repo := newMockFeedRepository()
	service := feed.NewFeedService(repo)
	ctx := context.Background()

	post, _ := service.CreatePost(ctx, "default", "author-1", feed.SystemRoleUser, feed.CreatePostInput{
		Content: "Postingan untuk diuji hak hapus",
	})

	// 1. User lain (bukan author, bukan staf) mencoba menghapus -> harus DITOLAK
	err := service.DeletePost(ctx, "default", post.ID, "stranger-user", feed.SystemRoleUser)
	if err != feed.ErrUnauthorizedAction {
		t.Fatalf("expected ErrUnauthorizedAction, got: %v", err)
	}

	// 2. Moderator (wuzz_moderator) menghapus -> harus BERHASIL
	err = service.DeletePost(ctx, "default", post.ID, "moderator-user", feed.SystemRoleWuzzModerator)
	if err != nil {
		t.Fatalf("moderator delete failed: %v", err)
	}

	// 3. Postingan kedua dihapus oleh admin (wuzz_admin) -> harus BERHASIL
	post2, _ := service.CreatePost(ctx, "default", "author-2", feed.SystemRoleUser, feed.CreatePostInput{
		Content: "Postingan kedua",
	})
	err = service.DeletePost(ctx, "default", post2.ID, "admin-user", feed.SystemRoleWuzzAdmin)
	if err != nil {
		t.Fatalf("admin delete failed: %v", err)
	}

	// 4. Postingan ketiga dihapus oleh author aslinya sendiri -> harus BERHASIL
	post3, _ := service.CreatePost(ctx, "default", "author-3", feed.SystemRoleUser, feed.CreatePostInput{
		Content: "Postingan ketiga",
	})
	err = service.DeletePost(ctx, "default", post3.ID, "author-3", feed.SystemRoleUser)
	if err != nil {
		t.Fatalf("author delete failed: %v", err)
	}
}
