package feed

import (
	"context"
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

// FeedService mengorkestrasi logika bisnis untuk domain Community Social Feed.
type FeedService struct {
	repo FeedRepository
}

// NewFeedService membuat instance baru FeedService.
func NewFeedService(repo FeedRepository) *FeedService {
	return &FeedService{
		repo: repo,
	}
}

// CreatePost memvalidasi dan membuat postingan komunitas baru.
func (s *FeedService) CreatePost(ctx context.Context, tenantID, userID, callerSystemRole string, input CreatePostInput) (*FeedPost, error) {
	if tenantID == "" {
		tenantID = "default"
	}
	content := strings.TrimSpace(input.Content)
	if content == "" {
		return nil, ErrContentEmpty
	}
	if utf8.RuneCountInString(content) > 1000 {
		return nil, ErrContentTooLong
	}

	var cleanedMedia []string
	for _, m := range input.MediaURLs {
		trimmed := strings.TrimSpace(m)
		if trimmed != "" {
			cleanedMedia = append(cleanedMedia, trimmed)
		}
	}
	if len(cleanedMedia) > 4 {
		return nil, ErrTooManyMedia
	}

	// Default nilai tipe postingan, pinning, dan metadata
	postType := PostTypeStandard
	isPinned := false
	metadata := []byte("{}")

	// Authorization Guard: Hanya pengguna dengan systemRole == "wuzz_admin" yang berhak mem-pin atau mengatur tipe postingan khusus / metadata
	if callerSystemRole == SystemRoleWuzzAdmin {
		if input.PostType != "" {
			switch input.PostType {
			case PostTypeStandard, PostTypeAnnouncement, PostTypeArticle, PostTypeSponsored:
				postType = input.PostType
			default:
				postType = PostTypeStandard
			}
		}
		isPinned = input.IsPinned
		if len(input.Metadata) > 0 && json.Valid(input.Metadata) {
			metadata = input.Metadata
		}
	}

	now := time.Now().UTC()
	postID := uuid.New().String()

	post := &FeedPost{
		ID:            postID,
		TenantID:      tenantID,
		UserID:        userID,
		Content:       content,
		MediaURLs:     cleanedMedia,
		PostType:      postType,
		IsPinned:      isPinned,
		Metadata:      metadata,
		LikesCount:    0,
		CommentsCount: 0,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	if err := s.repo.CreatePost(ctx, post); err != nil {
		return nil, err
	}

	// Ambil kembali postingan utuh yang sudah di-JOIN dengan data author
	fullPost, err := s.repo.GetPostByID(ctx, tenantID, postID, userID)
	if err == nil && fullPost != nil {
		return fullPost, nil
	}

	return post, nil
}

// GetPostByID mengambil postingan tunggal berdasarkan ID.
func (s *FeedService) GetPostByID(ctx context.Context, tenantID, postID, currentUserID string) (*FeedPost, error) {
	if tenantID == "" {
		tenantID = "default"
	}
	return s.repo.GetPostByID(ctx, tenantID, postID, currentUserID)
}

// ListTimeline mengambil linimasa postingan dengan pagination berbasis cursor waktu (tab latest) atau seed-based explore (tab explore).
func (s *FeedService) ListTimeline(ctx context.Context, tenantID, currentUserID, tab, seed, beforeStr string, offset, limit int) (*FeedTimelineResponse, error) {
	if tenantID == "" {
		tenantID = "default"
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	tab = strings.ToLower(strings.TrimSpace(tab))
	if tab == "" {
		tab = "latest"
	}

	var before time.Time
	if strings.TrimSpace(beforeStr) != "" {
		t, err := time.Parse(time.RFC3339Nano, beforeStr)
		if err != nil {
			t, err = time.Parse(time.RFC3339, beforeStr)
		}
		if err == nil {
			before = t
		}
	}

	// Query limit + 1 untuk mengetahui ketersediaan halaman berikutnya (has_more)
	posts, err := s.repo.ListTimeline(ctx, tenantID, currentUserID, tab, seed, before, offset, limit+1)
	if err != nil {
		return nil, err
	}

	hasMore := false
	var nextCursor string

	if len(posts) > limit {
		hasMore = true
		posts = posts[:limit]
	}

	if len(posts) > 0 {
		lastPost := posts[len(posts)-1]
		nextCursor = lastPost.CreatedAt.Format(time.RFC3339Nano)
	}

	if posts == nil {
		posts = []*FeedPost{}
	}

	return &FeedTimelineResponse{
		Posts:      posts,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}, nil
}

// ToggleLike melakukan toggle suka/batal suka pada postingan.
func (s *FeedService) ToggleLike(ctx context.Context, tenantID, postID, userID string) (*ToggleLikeResult, error) {
	if tenantID == "" {
		tenantID = "default"
	}
	if strings.TrimSpace(postID) == "" {
		return nil, ErrPostNotFound
	}

	liked, newCount, err := s.repo.ToggleLike(ctx, tenantID, postID, userID)
	if err != nil {
		return nil, err
	}

	return &ToggleLikeResult{
		Liked:      liked,
		LikesCount: newCount,
	}, nil
}

// CreateComment menambahkan komentar baru pada postingan.
func (s *FeedService) CreateComment(ctx context.Context, tenantID, postID, userID string, input CreateCommentInput) (*FeedComment, error) {
	if tenantID == "" {
		tenantID = "default"
	}
	content := strings.TrimSpace(input.Content)
	if content == "" {
		return nil, ErrCommentEmpty
	}
	if utf8.RuneCountInString(content) > 500 {
		return nil, ErrCommentTooLong
	}

	now := time.Now().UTC()
	commentID := uuid.New().String()

	comment := &FeedComment{
		ID:        commentID,
		TenantID:  tenantID,
		PostID:    postID,
		UserID:    userID,
		Content:   content,
		CreatedAt: now,
	}

	if err := s.repo.CreateComment(ctx, comment); err != nil {
		return nil, err
	}

	// Ambil daftar komentar untuk mengambil objek komentar yang baru dibuat beserta data author
	comments, err := s.repo.ListComments(ctx, tenantID, postID, time.Time{}, 50)
	if err == nil {
		for _, c := range comments {
			if c.ID == commentID {
				return c, nil
			}
		}
	}

	return comment, nil
}

// ListComments mengambil daftar komentar suatu postingan dengan cursor pagination.
func (s *FeedService) ListComments(ctx context.Context, tenantID, postID, beforeStr string, limit int) (*FeedCommentsResponse, error) {
	if tenantID == "" {
		tenantID = "default"
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 50 {
		limit = 50
	}

	var before time.Time
	if strings.TrimSpace(beforeStr) != "" {
		t, err := time.Parse(time.RFC3339Nano, beforeStr)
		if err != nil {
			t, err = time.Parse(time.RFC3339, beforeStr)
		}
		if err == nil {
			before = t
		}
	}

	comments, err := s.repo.ListComments(ctx, tenantID, postID, before, limit+1)
	if err != nil {
		return nil, err
	}

	hasMore := false
	var nextCursor string

	if len(comments) > limit {
		hasMore = true
		comments = comments[:limit]
	}

	if len(comments) > 0 {
		lastComment := comments[len(comments)-1]
		nextCursor = lastComment.CreatedAt.Format(time.RFC3339Nano)
	}

	if comments == nil {
		comments = []*FeedComment{}
	}

	return &FeedCommentsResponse{
		Comments:   comments,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}, nil
}

// DeletePost menghapus postingan. Memvalidasi bahwa pemanggil adalah author atau moderator di tenant yang sama.
func (s *FeedService) DeletePost(ctx context.Context, tenantID, postID, callerUserID, callerSystemRole string) error {
	if tenantID == "" {
		tenantID = "default"
	}

	post, err := s.repo.GetPostByID(ctx, tenantID, postID, callerUserID)
	if err != nil {
		return err
	}
	if post == nil {
		return ErrPostNotFound
	}

	// Authorization Guard:
	// Postingan hanya boleh dihapus oleh pembuat aslinya ATAU staf (wuzz_admin / wuzz_moderator) tenant yang sama
	isAuthor := (post.UserID == callerUserID)
	isStaff := (callerSystemRole == SystemRoleWuzzAdmin || callerSystemRole == SystemRoleWuzzModerator) && (post.TenantID == tenantID)

	if !isAuthor && !isStaff {
		return ErrUnauthorizedAction
	}

	return s.repo.DeletePost(ctx, tenantID, postID)
}
