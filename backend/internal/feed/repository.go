package feed

import (
	"context"
	"time"
)

// FeedRepository mendefinisikan kontrak persistensi data domain Community Feed.
// Seluruh method mengedepankan isolasi multi-tenant (tenantID) dan konteks operasi.
type FeedRepository interface {
	// CreatePost menyimpan postingan baru ke basis data.
	CreatePost(ctx context.Context, post *FeedPost) error

	// GetPostByID mengambil postingan tunggal beserta data author dan status like pemanggil.
	GetPostByID(ctx context.Context, tenantID, postID, currentUserID string) (*FeedPost, error)

	// ListTimeline mengambil daftar postingan linimasa ber-cursor atau acak/explore.
	ListTimeline(ctx context.Context, tenantID, currentUserID, tab, seed string, before time.Time, offset, limit int) ([]*FeedPost, error)

	// ToggleLike melakukan switch suka/batal suka secara atomic dan mengembalikan state terkini.
	ToggleLike(ctx context.Context, tenantID, postID, userID string) (liked bool, likesCount int, err error)

	// CreateComment menambahkan komentar baru dan menaikkan comments_count pada postingan.
	CreateComment(ctx context.Context, comment *FeedComment) error

	// ListComments mengambil daftar komentar pada postingan terurut kronologis (created_at ASC).
	ListComments(ctx context.Context, tenantID, postID string, before time.Time, limit int) ([]*FeedComment, error)

	// DeletePost menghapus postingan beserta likes dan komentar terkait (cascade).
	DeletePost(ctx context.Context, tenantID, postID string) error
}
