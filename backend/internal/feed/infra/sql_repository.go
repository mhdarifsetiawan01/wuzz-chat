package infra

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/feed"
)

// SQLFeedRepository mengimplementasikan feed.FeedRepository menggunakan database SQL (PostgreSQL & SQLite).
type SQLFeedRepository struct {
	db         *sql.DB
	driverName string
}

// NewSQLFeedRepository membuat instance baru SQLFeedRepository.
func NewSQLFeedRepository(db *sql.DB, driverName string) *SQLFeedRepository {
	return &SQLFeedRepository{
		db:         db,
		driverName: driverName,
	}
}

// Ensure interface compliance at compile time.
var _ feed.FeedRepository = (*SQLFeedRepository)(nil)

func (r *SQLFeedRepository) isPostgres() bool {
	return r.driverName == "postgres"
}

// CreatePost menyimpan postingan baru ke tabel feed_posts.
func (r *SQLFeedRepository) CreatePost(ctx context.Context, post *feed.FeedPost) error {
	mediaJSON := feed.MediaURLsToJSON(post.MediaURLs)
	if post.PostType == "" {
		post.PostType = feed.PostTypeStandard
	}
	metaStr := "{}"
	if len(post.Metadata) > 0 {
		metaStr = string(post.Metadata)
	}

	var query string
	if r.isPostgres() {
		query = `INSERT INTO feed_posts (
			id, tenant_id, user_id, content, media_urls, post_type, is_pinned, metadata, likes_count, comments_count, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`
	} else {
		query = `INSERT INTO feed_posts (
			id, tenant_id, user_id, content, media_urls, post_type, is_pinned, metadata, likes_count, comments_count, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	}

	_, err := r.db.ExecContext(ctx, query,
		post.ID,
		post.TenantID,
		post.UserID,
		post.Content,
		mediaJSON,
		post.PostType,
		post.IsPinned,
		metaStr,
		post.LikesCount,
		post.CommentsCount,
		post.CreatedAt,
		post.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("gagal membuat postingan: %w", err)
	}
	return nil
}

// GetPostByID mengambil satu postingan beserta info author dan status like pemanggil.
func (r *SQLFeedRepository) GetPostByID(ctx context.Context, tenantID, postID, currentUserID string) (*feed.FeedPost, error) {
	var query string
	if r.isPostgres() {
		query = `SELECT 
			p.id, p.tenant_id, p.user_id, p.content, p.media_urls, p.post_type, p.is_pinned, p.metadata, p.likes_count, p.comments_count, p.created_at, p.updated_at,
			u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.role, ''), COALESCE(u.is_verified, false),
			(CASE WHEN l.user_id IS NOT NULL THEN 1 ELSE 0 END) AS is_liked
		FROM feed_posts p
		JOIN users u ON p.user_id = u.id
		LEFT JOIN feed_likes l ON p.id = l.post_id AND l.user_id = $3
		WHERE p.tenant_id = $1 AND p.id = $2
		LIMIT 1`
	} else {
		query = `SELECT 
			p.id, p.tenant_id, p.user_id, p.content, p.media_urls, p.post_type, p.is_pinned, p.metadata, p.likes_count, p.comments_count, p.created_at, p.updated_at,
			u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.role, ''), COALESCE(u.is_verified, false),
			(CASE WHEN l.user_id IS NOT NULL THEN 1 ELSE 0 END) AS is_liked
		FROM feed_posts p
		JOIN users u ON p.user_id = u.id
		LEFT JOIN feed_likes l ON p.id = l.post_id AND l.user_id = ?
		WHERE p.tenant_id = ? AND p.id = ?
		LIMIT 1`
	}

	var row *sql.Row
	if r.isPostgres() {
		row = r.db.QueryRowContext(ctx, query, tenantID, postID, currentUserID)
	} else {
		row = r.db.QueryRowContext(ctx, query, currentUserID, tenantID, postID)
	}

	var p feed.FeedPost
	var mediaRaw string
	var metaRaw string
	var isLikedInt int
	err := row.Scan(
		&p.ID, &p.TenantID, &p.UserID, &p.Content, &mediaRaw, &p.PostType, &p.IsPinned, &metaRaw, &p.LikesCount, &p.CommentsCount, &p.CreatedAt, &p.UpdatedAt,
		&p.Author.Username, &p.Author.DisplayName, &p.Author.AvatarURL, &p.Author.Role, &p.Author.IsVerified,
		&isLikedInt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, feed.ErrPostNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gagal query post by id: %w", err)
	}

	p.Author.ID = p.UserID
	p.MediaURLs = feed.ParseMediaURLs(mediaRaw)
	if metaRaw == "" || metaRaw == "null" {
		p.Metadata = []byte("{}")
	} else {
		p.Metadata = []byte(metaRaw)
	}
	p.IsLiked = (isLikedInt == 1)
	return &p, nil
}

// ListTimeline mengambil linimasa postingan publik ber-cursor (terurut is_pinned DESC, created_at DESC).
func (r *SQLFeedRepository) ListTimeline(ctx context.Context, tenantID, currentUserID string, before time.Time, limit int) ([]*feed.FeedPost, error) {
	if limit <= 0 {
		limit = 20
	}

	var query string
	var rows *sql.Rows
	var err error

	if before.IsZero() {
		if r.isPostgres() {
			query = `SELECT 
				p.id, p.tenant_id, p.user_id, p.content, p.media_urls, p.post_type, p.is_pinned, p.metadata, p.likes_count, p.comments_count, p.created_at, p.updated_at,
				u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.role, ''), COALESCE(u.is_verified, false),
				(CASE WHEN l.user_id IS NOT NULL THEN 1 ELSE 0 END) AS is_liked
			FROM feed_posts p
			JOIN users u ON p.user_id = u.id
			LEFT JOIN feed_likes l ON p.id = l.post_id AND l.user_id = $2
			WHERE p.tenant_id = $1
			ORDER BY p.is_pinned DESC, p.created_at DESC
			LIMIT $3`
			rows, err = r.db.QueryContext(ctx, query, tenantID, currentUserID, limit)
		} else {
			query = `SELECT 
				p.id, p.tenant_id, p.user_id, p.content, p.media_urls, p.post_type, p.is_pinned, p.metadata, p.likes_count, p.comments_count, p.created_at, p.updated_at,
				u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.role, ''), COALESCE(u.is_verified, false),
				(CASE WHEN l.user_id IS NOT NULL THEN 1 ELSE 0 END) AS is_liked
			FROM feed_posts p
			JOIN users u ON p.user_id = u.id
			LEFT JOIN feed_likes l ON p.id = l.post_id AND l.user_id = ?
			WHERE p.tenant_id = ?
			ORDER BY p.is_pinned DESC, p.created_at DESC
			LIMIT ?`
			rows, err = r.db.QueryContext(ctx, query, currentUserID, tenantID, limit)
		}
	} else {
		if r.isPostgres() {
			query = `SELECT 
				p.id, p.tenant_id, p.user_id, p.content, p.media_urls, p.post_type, p.is_pinned, p.metadata, p.likes_count, p.comments_count, p.created_at, p.updated_at,
				u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.role, ''), COALESCE(u.is_verified, false),
				(CASE WHEN l.user_id IS NOT NULL THEN 1 ELSE 0 END) AS is_liked
			FROM feed_posts p
			JOIN users u ON p.user_id = u.id
			LEFT JOIN feed_likes l ON p.id = l.post_id AND l.user_id = $2
			WHERE p.tenant_id = $1 AND p.created_at < $3
			ORDER BY p.is_pinned DESC, p.created_at DESC
			LIMIT $4`
			rows, err = r.db.QueryContext(ctx, query, tenantID, currentUserID, before, limit)
		} else {
			query = `SELECT 
				p.id, p.tenant_id, p.user_id, p.content, p.media_urls, p.post_type, p.is_pinned, p.metadata, p.likes_count, p.comments_count, p.created_at, p.updated_at,
				u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.role, ''), COALESCE(u.is_verified, false),
				(CASE WHEN l.user_id IS NOT NULL THEN 1 ELSE 0 END) AS is_liked
			FROM feed_posts p
			JOIN users u ON p.user_id = u.id
			LEFT JOIN feed_likes l ON p.id = l.post_id AND l.user_id = ?
			WHERE p.tenant_id = ? AND p.created_at < ?
			ORDER BY p.is_pinned DESC, p.created_at DESC
			LIMIT ?`
			rows, err = r.db.QueryContext(ctx, query, currentUserID, tenantID, before, limit)
		}
	}

	if err != nil {
		return nil, fmt.Errorf("gagal query linimasa: %w", err)
	}
	defer rows.Close()

	var posts []*feed.FeedPost
	for rows.Next() {
		var p feed.FeedPost
		var mediaRaw string
		var metaRaw string
		var isLikedInt int
		if err := rows.Scan(
			&p.ID, &p.TenantID, &p.UserID, &p.Content, &mediaRaw, &p.PostType, &p.IsPinned, &metaRaw, &p.LikesCount, &p.CommentsCount, &p.CreatedAt, &p.UpdatedAt,
			&p.Author.Username, &p.Author.DisplayName, &p.Author.AvatarURL, &p.Author.Role, &p.Author.IsVerified,
			&isLikedInt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan baris postingan: %w", err)
		}
		p.Author.ID = p.UserID
		p.MediaURLs = feed.ParseMediaURLs(mediaRaw)
		if metaRaw == "" || metaRaw == "null" {
			p.Metadata = []byte("{}")
		} else {
			p.Metadata = []byte(metaRaw)
		}
		p.IsLiked = (isLikedInt == 1)
		posts = append(posts, &p)
	}

	return posts, nil
}

// ToggleLike melakukan switch suka / batal suka secara atomic dalam satu database transaction.
func (r *SQLFeedRepository) ToggleLike(ctx context.Context, tenantID, postID, userID string) (bool, int, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return false, 0, fmt.Errorf("gagal memulai transaksi like: %w", err)
	}
	defer tx.Rollback()

	// 1. Cek apakah post ada di tenant ini
	var checkPostQuery string
	if r.isPostgres() {
		checkPostQuery = `SELECT 1 FROM feed_posts WHERE id = $1 AND tenant_id = $2 LIMIT 1`
	} else {
		checkPostQuery = `SELECT 1 FROM feed_posts WHERE id = ? AND tenant_id = ? LIMIT 1`
	}
	var dummy int
	if err := tx.QueryRowContext(ctx, checkPostQuery, postID, tenantID).Scan(&dummy); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, 0, feed.ErrPostNotFound
		}
		return false, 0, err
	}

	// 2. Cek apakah user sudah menyukai postingan ini
	var checkLikeQuery string
	if r.isPostgres() {
		checkLikeQuery = `SELECT COUNT(1) FROM feed_likes WHERE post_id = $1 AND user_id = $2`
	} else {
		checkLikeQuery = `SELECT COUNT(1) FROM feed_likes WHERE post_id = ? AND user_id = ?`
	}
	var count int
	if err := tx.QueryRowContext(ctx, checkLikeQuery, postID, userID).Scan(&count); err != nil {
		return false, 0, err
	}

	var liked bool
	if count > 0 {
		// Batalkan suka (Unlike)
		liked = false
		var deleteLikeQuery string
		var decrementPostQuery string
		if r.isPostgres() {
			deleteLikeQuery = `DELETE FROM feed_likes WHERE post_id = $1 AND user_id = $2`
			decrementPostQuery = `UPDATE feed_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1 AND tenant_id = $2`
		} else {
			deleteLikeQuery = `DELETE FROM feed_likes WHERE post_id = ? AND user_id = ?`
			decrementPostQuery = `UPDATE feed_posts SET likes_count = MAX(likes_count - 1, 0) WHERE id = ? AND tenant_id = ?`
		}

		if _, err := tx.ExecContext(ctx, deleteLikeQuery, postID, userID); err != nil {
			return false, 0, err
		}
		if _, err := tx.ExecContext(ctx, decrementPostQuery, postID, tenantID); err != nil {
			return false, 0, err
		}
	} else {
		// Tambahkan suka (Like)
		liked = true
		now := time.Now().UTC()
		var insertLikeQuery string
		var incrementPostQuery string
		if r.isPostgres() {
			insertLikeQuery = `INSERT INTO feed_likes (post_id, tenant_id, user_id, created_at) VALUES ($1, $2, $3, $4)`
			incrementPostQuery = `UPDATE feed_posts SET likes_count = likes_count + 1 WHERE id = $1 AND tenant_id = $2`
		} else {
			insertLikeQuery = `INSERT INTO feed_likes (post_id, tenant_id, user_id, created_at) VALUES (?, ?, ?, ?)`
			incrementPostQuery = `UPDATE feed_posts SET likes_count = likes_count + 1 WHERE id = ? AND tenant_id = ?`
		}

		if _, err := tx.ExecContext(ctx, insertLikeQuery, postID, tenantID, userID, now); err != nil {
			return false, 0, err
		}
		if _, err := tx.ExecContext(ctx, incrementPostQuery, postID, tenantID); err != nil {
			return false, 0, err
		}
	}

	// 3. Ambil likes_count terbaru
	var selectCountQuery string
	if r.isPostgres() {
		selectCountQuery = `SELECT likes_count FROM feed_posts WHERE id = $1 AND tenant_id = $2`
	} else {
		selectCountQuery = `SELECT likes_count FROM feed_posts WHERE id = ? AND tenant_id = ?`
	}
	var newCount int
	if err := tx.QueryRowContext(ctx, selectCountQuery, postID, tenantID).Scan(&newCount); err != nil {
		return false, 0, err
	}

	if err := tx.Commit(); err != nil {
		return false, 0, fmt.Errorf("gagal commit transaksi like: %w", err)
	}

	return liked, newCount, nil
}

// CreateComment menambahkan komentar baru dan menaikkan comments_count pada postingan.
func (r *SQLFeedRepository) CreateComment(ctx context.Context, comment *feed.FeedComment) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("gagal mulai transaksi komentar: %w", err)
	}
	defer tx.Rollback()

	// 1. Cek apakah post ada di tenant ini
	var checkPostQuery string
	if r.isPostgres() {
		checkPostQuery = `SELECT 1 FROM feed_posts WHERE id = $1 AND tenant_id = $2 LIMIT 1`
	} else {
		checkPostQuery = `SELECT 1 FROM feed_posts WHERE id = ? AND tenant_id = ? LIMIT 1`
	}
	var dummy int
	if err := tx.QueryRowContext(ctx, checkPostQuery, comment.PostID, comment.TenantID).Scan(&dummy); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return feed.ErrPostNotFound
		}
		return err
	}

	// 2. Simpan komentar
	var insertCommentQuery string
	if r.isPostgres() {
		insertCommentQuery = `INSERT INTO feed_comments (id, tenant_id, post_id, user_id, content, created_at) VALUES ($1, $2, $3, $4, $5, $6)`
	} else {
		insertCommentQuery = `INSERT INTO feed_comments (id, tenant_id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`
	}
	if _, err := tx.ExecContext(ctx, insertCommentQuery, comment.ID, comment.TenantID, comment.PostID, comment.UserID, comment.Content, comment.CreatedAt); err != nil {
		return fmt.Errorf("gagal insert komentar: %w", err)
	}

	// 3. Increment comments_count di feed_posts
	var incrementQuery string
	if r.isPostgres() {
		incrementQuery = `UPDATE feed_posts SET comments_count = comments_count + 1 WHERE id = $1 AND tenant_id = $2`
	} else {
		incrementQuery = `UPDATE feed_posts SET comments_count = comments_count + 1 WHERE id = ? AND tenant_id = ?`
	}
	if _, err := tx.ExecContext(ctx, incrementQuery, comment.PostID, comment.TenantID); err != nil {
		return fmt.Errorf("gagal menaikkan comments_count: %w", err)
	}

	return tx.Commit()
}

// ListComments mengambil daftar komentar terurut kronologis (created_at ASC).
func (r *SQLFeedRepository) ListComments(ctx context.Context, tenantID, postID string, before time.Time, limit int) ([]*feed.FeedComment, error) {
	if limit <= 0 {
		limit = 20
	}

	var query string
	var rows *sql.Rows
	var err error

	if before.IsZero() {
		if r.isPostgres() {
			query = `SELECT 
				c.id, c.tenant_id, c.post_id, c.user_id, c.content, c.created_at,
				u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.role, ''), COALESCE(u.is_verified, false)
			FROM feed_comments c
			JOIN users u ON c.user_id = u.id
			WHERE c.tenant_id = $1 AND c.post_id = $2
			ORDER BY c.created_at ASC
			LIMIT $3`
			rows, err = r.db.QueryContext(ctx, query, tenantID, postID, limit)
		} else {
			query = `SELECT 
				c.id, c.tenant_id, c.post_id, c.user_id, c.content, c.created_at,
				u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.role, ''), COALESCE(u.is_verified, false)
			FROM feed_comments c
			JOIN users u ON c.user_id = u.id
			WHERE c.tenant_id = ? AND c.post_id = ?
			ORDER BY c.created_at ASC
			LIMIT ?`
			rows, err = r.db.QueryContext(ctx, query, tenantID, postID, limit)
		}
	} else {
		if r.isPostgres() {
			query = `SELECT 
				c.id, c.tenant_id, c.post_id, c.user_id, c.content, c.created_at,
				u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.role, ''), COALESCE(u.is_verified, false)
			FROM feed_comments c
			JOIN users u ON c.user_id = u.id
			WHERE c.tenant_id = $1 AND c.post_id = $2 AND c.created_at > $3
			ORDER BY c.created_at ASC
			LIMIT $4`
			rows, err = r.db.QueryContext(ctx, query, tenantID, postID, before, limit)
		} else {
			query = `SELECT 
				c.id, c.tenant_id, c.post_id, c.user_id, c.content, c.created_at,
				u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.role, ''), COALESCE(u.is_verified, false)
			FROM feed_comments c
			JOIN users u ON c.user_id = u.id
			WHERE c.tenant_id = ? AND c.post_id = ? AND c.created_at > ?
			ORDER BY c.created_at ASC
			LIMIT ?`
			rows, err = r.db.QueryContext(ctx, query, tenantID, postID, before, limit)
		}
	}

	if err != nil {
		return nil, fmt.Errorf("gagal query komentar: %w", err)
	}
	defer rows.Close()

	var comments []*feed.FeedComment
	for rows.Next() {
		var c feed.FeedComment
		if err := rows.Scan(
			&c.ID, &c.TenantID, &c.PostID, &c.UserID, &c.Content, &c.CreatedAt,
			&c.Author.Username, &c.Author.DisplayName, &c.Author.AvatarURL, &c.Author.Role, &c.Author.IsVerified,
		); err != nil {
			return nil, fmt.Errorf("gagal scan baris komentar: %w", err)
		}
		c.Author.ID = c.UserID
		comments = append(comments, &c)
	}

	return comments, nil
}

// DeletePost menghapus postingan beserta seluruh likes dan komentar terkait secara atomik.
func (r *SQLFeedRepository) DeletePost(ctx context.Context, tenantID, postID string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("gagal mulai transaksi delete post: %w", err)
	}
	defer tx.Rollback()

	var delLikesQuery, delCommentsQuery, delPostQuery string
	if r.isPostgres() {
		delLikesQuery = `DELETE FROM feed_likes WHERE post_id = $1`
		delCommentsQuery = `DELETE FROM feed_comments WHERE post_id = $1`
		delPostQuery = `DELETE FROM feed_posts WHERE id = $1 AND tenant_id = $2`
	} else {
		delLikesQuery = `DELETE FROM feed_likes WHERE post_id = ?`
		delCommentsQuery = `DELETE FROM feed_comments WHERE post_id = ?`
		delPostQuery = `DELETE FROM feed_posts WHERE id = ? AND tenant_id = ?`
	}

	if _, err := tx.ExecContext(ctx, delLikesQuery, postID); err != nil {
		return fmt.Errorf("gagal hapus likes post: %w", err)
	}
	if _, err := tx.ExecContext(ctx, delCommentsQuery, postID); err != nil {
		return fmt.Errorf("gagal hapus komentar post: %w", err)
	}
	res, err := tx.ExecContext(ctx, delPostQuery, postID, tenantID)
	if err != nil {
		return fmt.Errorf("gagal hapus postingan: %w", err)
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return feed.ErrPostNotFound
	}

	return tx.Commit()
}
