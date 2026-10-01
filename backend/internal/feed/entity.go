package feed

import (
	"encoding/json"
	"errors"
	"time"
)

// ─── Domain Sentinel Errors ──────────────────────────────────────────────────

var (
	ErrPostNotFound        = errors.New("postingan tidak ditemukan")
	ErrCommentNotFound     = errors.New("komentar tidak ditemukan")
	ErrContentEmpty        = errors.New("konten postingan tidak boleh kosong")
	ErrContentTooLong      = errors.New("konten postingan melebihi batas maksimal 1.000 karakter")
	ErrCommentEmpty        = errors.New("konten komentar tidak boleh kosong")
	ErrCommentTooLong      = errors.New("konten komentar melebihi batas maksimal 500 karakter")
	ErrTooManyMedia        = errors.New("lampiran media melebihi batas maksimal 4 item")
	ErrInvalidMediaURL     = errors.New("lampiran media tidak valid: hanya gambar (JPG, PNG, WebP, GIF, HEIC) yang diperbolehkan")
	ErrUnauthorizedAction  = errors.New("tidak memiliki hak akses untuk tindakan ini")
)

// ─── Post Type Constants ─────────────────────────────────────────────────────

const (
	PostTypeStandard     = "standard"
	PostTypeAnnouncement = "announcement"
	PostTypeArticle      = "article"
	PostTypeSponsored    = "sponsored"
)

// ─── System Role Constants (Prefix wuzz_) ────────────────────────────────────

const (
	SystemRoleUser          = "user"
	SystemRoleWuzzAdmin     = "wuzz_admin"
	SystemRoleWuzzModerator = "wuzz_moderator"
)

// ─── Domain Models ───────────────────────────────────────────────────────────

// FeedAuthor merepresentasikan ringkasan profil pembuat postingan / komentar.
type FeedAuthor struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
	Role        string `json:"role"`
	IsVerified  bool   `json:"is_verified"`
}

// FeedPost adalah Aggregate Root untuk linimasa sosial komunitas.
type FeedPost struct {
	ID            string          `json:"id"`
	TenantID      string          `json:"tenant_id"`
	UserID        string          `json:"user_id"`
	Content       string          `json:"content"`
	MediaURLs     []string        `json:"media_urls"`
	PostType      string          `json:"post_type"`
	IsPinned      bool            `json:"is_pinned"`
	Metadata      json.RawMessage `json:"metadata,omitempty"`
	LikesCount    int             `json:"likes_count"`
	CommentsCount int             `json:"comments_count"`
	IsLiked       bool            `json:"is_liked"`
	Author        FeedAuthor      `json:"author"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// FeedLike merepresentasikan interaksi suka pengguna terhadap sebuah postingan.
type FeedLike struct {
	PostID    string    `json:"post_id"`
	TenantID  string    `json:"tenant_id"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// FeedComment merepresentasikan komentar pada suatu postingan.
type FeedComment struct {
	ID        string     `json:"id"`
	TenantID  string     `json:"tenant_id"`
	PostID    string     `json:"post_id"`
	UserID    string     `json:"user_id"`
	Content   string     `json:"content"`
	Author    FeedAuthor `json:"author"`
	CreatedAt time.Time  `json:"created_at"`
}

// ─── Input & Output DTOs ─────────────────────────────────────────────────────

// CreatePostInput adalah payload pembuatan postingan baru.
type CreatePostInput struct {
	Content   string          `json:"content"`
	MediaURLs []string        `json:"media_urls,omitempty"`
	PostType  string          `json:"post_type,omitempty"`
	IsPinned  bool            `json:"is_pinned,omitempty"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
}

// CreateCommentInput adalah payload pembuatan komentar baru.
type CreateCommentInput struct {
	Content string `json:"content"`
}

// ToggleLikeResult adalah hasil dari operasi atomic toggle like.
type ToggleLikeResult struct {
	Liked      bool `json:"liked"`
	LikesCount int  `json:"likes_count"`
}

// FeedTimelineResponse adalah struktur respon linimasa postingan ber-cursor.
type FeedTimelineResponse struct {
	Posts      []*FeedPost `json:"posts"`
	NextCursor string      `json:"next_cursor,omitempty"`
	HasMore    bool        `json:"has_more"`
}

// FeedCommentsResponse adalah struktur respon daftar komentar postingan ber-cursor.
type FeedCommentsResponse struct {
	Comments   []*FeedComment `json:"comments"`
	NextCursor string         `json:"next_cursor,omitempty"`
	HasMore    bool           `json:"has_more"`
}

// Helper serialize media URLs ke JSON string untuk penyimpanan database.
func MediaURLsToJSON(urls []string) string {
	if len(urls) == 0 {
		return "[]"
	}
	bytes, err := json.Marshal(urls)
	if err != nil {
		return "[]"
	}
	return string(bytes)
}

// Helper parse JSON string dari database ke slice string media URLs.
func ParseMediaURLs(raw string) []string {
	if raw == "" || raw == "[]" {
		return []string{}
	}
	var res []string
	if err := json.Unmarshal([]byte(raw), &res); err != nil {
		return []string{}
	}
	return res
}
