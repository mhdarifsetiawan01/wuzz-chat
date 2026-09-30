package infra

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/connection"
)

// SQLConnectionRepository mengimplementasikan connection.ConnectionRepository menggunakan database SQL (PostgreSQL & SQLite).
type SQLConnectionRepository struct {
	db         *sql.DB
	driverName string
}

// NewSQLConnectionRepository membuat instance baru SQLConnectionRepository.
func NewSQLConnectionRepository(db *sql.DB, driverName string) *SQLConnectionRepository {
	return &SQLConnectionRepository{
		db:         db,
		driverName: driverName,
	}
}

var _ connection.ConnectionRepository = (*SQLConnectionRepository)(nil)

func (r *SQLConnectionRepository) isPostgres() bool {
	return r.driverName == "postgres"
}

// CreateRequest menyimpan permohonan koneksi baru ke basis data.
func (r *SQLConnectionRepository) CreateRequest(ctx context.Context, conn *connection.UserConnection) error {
	var query string
	if r.isPostgres() {
		query = `INSERT INTO user_connections (
			id, tenant_id, requester_id, receiver_id, status, source_type, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`
	} else {
		query = `INSERT INTO user_connections (
			id, tenant_id, requester_id, receiver_id, status, source_type, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	}

	_, err := r.db.ExecContext(ctx, query,
		conn.ID,
		conn.TenantID,
		conn.RequesterID,
		conn.ReceiverID,
		string(conn.Status),
		string(conn.SourceType),
		conn.CreatedAt,
		conn.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("gagal insert user_connection: %w", err)
	}
	return nil
}

// FindConnection mencari relasi antara dua user di dalam tenant tertentu.
func (r *SQLConnectionRepository) FindConnection(ctx context.Context, tenantID, userA, userB string) (*connection.UserConnection, error) {
	var query string
	if r.isPostgres() {
		query = `SELECT id, tenant_id, requester_id, receiver_id, status, source_type, created_at, updated_at
		         FROM user_connections
		         WHERE tenant_id = $1 
		           AND ((requester_id = $2 AND receiver_id = $3) OR (requester_id = $3 AND receiver_id = $2))
		         LIMIT 1`
	} else {
		query = `SELECT id, tenant_id, requester_id, receiver_id, status, source_type, created_at, updated_at
		         FROM user_connections
		         WHERE tenant_id = ? 
		           AND ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?))
		         LIMIT 1`
	}

	var row *sql.Row
	if r.isPostgres() {
		row = r.db.QueryRowContext(ctx, query, tenantID, userA, userB)
	} else {
		row = r.db.QueryRowContext(ctx, query, tenantID, userA, userB, userB, userA)
	}

	var c connection.UserConnection
	var statusStr, sourceStr string
	if err := row.Scan(&c.ID, &c.TenantID, &c.RequesterID, &c.ReceiverID, &statusStr, &sourceStr, &c.CreatedAt, &c.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("gagal query find connection: %w", err)
	}
	c.Status = connection.ConnectionStatus(statusStr)
	c.SourceType = connection.SourceType(sourceStr)
	return &c, nil
}

// FindConnectionByID mengambil relasi berdasarkan ID primary key.
func (r *SQLConnectionRepository) FindConnectionByID(ctx context.Context, tenantID, connID string) (*connection.UserConnection, error) {
	var query string
	if r.isPostgres() {
		query = `SELECT id, tenant_id, requester_id, receiver_id, status, source_type, created_at, updated_at
		         FROM user_connections
		         WHERE tenant_id = $1 AND id = $2 LIMIT 1`
	} else {
		query = `SELECT id, tenant_id, requester_id, receiver_id, status, source_type, created_at, updated_at
		         FROM user_connections
		         WHERE tenant_id = ? AND id = ? LIMIT 1`
	}

	row := r.db.QueryRowContext(ctx, query, tenantID, connID)
	var c connection.UserConnection
	var statusStr, sourceStr string
	if err := row.Scan(&c.ID, &c.TenantID, &c.RequesterID, &c.ReceiverID, &statusStr, &sourceStr, &c.CreatedAt, &c.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("gagal query connection by id: %w", err)
	}
	c.Status = connection.ConnectionStatus(statusStr)
	c.SourceType = connection.SourceType(sourceStr)
	return &c, nil
}

// UpdateStatus memperbarui status relasi pertemanan.
func (r *SQLConnectionRepository) UpdateStatus(ctx context.Context, tenantID, connID string, status connection.ConnectionStatus) error {
	now := time.Now().UTC()
	var query string
	if r.isPostgres() {
		query = `UPDATE user_connections SET status = $1, updated_at = $2 WHERE tenant_id = $3 AND id = $4`
	} else {
		query = `UPDATE user_connections SET status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`
	}

	res, err := r.db.ExecContext(ctx, query, string(status), now, tenantID, connID)
	if err != nil {
		return fmt.Errorf("gagal update status koneksi: %w", err)
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return errors.New("koneksi tidak ditemukan")
	}
	return nil
}

// ResetRequest memperbarui relasi yang declined/expired menjadi pending kembali dengan pemohon baru.
func (r *SQLConnectionRepository) ResetRequest(ctx context.Context, tenantID, connID, requesterID, receiverID string) error {
	now := time.Now().UTC()
	var query string
	if r.isPostgres() {
		query = `UPDATE user_connections 
		         SET requester_id = $1, receiver_id = $2, status = 'pending', updated_at = $3 
		         WHERE tenant_id = $4 AND id = $5`
	} else {
		query = `UPDATE user_connections 
		         SET requester_id = ?, receiver_id = ?, status = 'pending', updated_at = ? 
		         WHERE tenant_id = ? AND id = ?`
	}

	_, err := r.db.ExecContext(ctx, query, requesterID, receiverID, now, tenantID, connID)
	if err != nil {
		return fmt.Errorf("gagal reset permintaan koneksi: %w", err)
	}
	return nil
}

// DeleteConnection menghapus relasi pertemanan (unfriend) antar dua pengguna.
func (r *SQLConnectionRepository) DeleteConnection(ctx context.Context, tenantID, userA, userB string) error {
	var query string
	if r.isPostgres() {
		query = `DELETE FROM user_connections
		         WHERE tenant_id = $1 
		           AND ((requester_id = $2 AND receiver_id = $3) OR (requester_id = $3 AND receiver_id = $2))`
	} else {
		query = `DELETE FROM user_connections
		         WHERE tenant_id = ? 
		           AND ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?))`
	}

	var err error
	if r.isPostgres() {
		_, err = r.db.ExecContext(ctx, query, tenantID, userA, userB)
	} else {
		_, err = r.db.ExecContext(ctx, query, tenantID, userA, userB, userB, userA)
	}
	if err != nil {
		return fmt.Errorf("gagal delete user_connection: %w", err)
	}
	return nil
}

// CountPendingRequestsReceived menghitung jumlah permintaan pending yang belum direspons oleh target user.
func (r *SQLConnectionRepository) CountPendingRequestsReceived(ctx context.Context, tenantID, receiverID string) (int, error) {
	var query string
	if r.isPostgres() {
		query = `SELECT COUNT(*) FROM user_connections WHERE tenant_id = $1 AND receiver_id = $2 AND status = 'pending'`
	} else {
		query = `SELECT COUNT(*) FROM user_connections WHERE tenant_id = ? AND receiver_id = ? AND status = 'pending'`
	}

	var count int
	if err := r.db.QueryRowContext(ctx, query, tenantID, receiverID).Scan(&count); err != nil {
		return 0, fmt.Errorf("gagal count pending requests: %w", err)
	}
	return count, nil
}

// CountDailyRequestsSent menghitung jumlah permintaan pertemanan yang dikirim user sejak waktu tertentu.
func (r *SQLConnectionRepository) CountDailyRequestsSent(ctx context.Context, tenantID, requesterID string, since time.Time) (int, error) {
	var query string
	if r.isPostgres() {
		query = `SELECT COUNT(*) FROM user_connections WHERE tenant_id = $1 AND requester_id = $2 AND created_at >= $3`
	} else {
		query = `SELECT COUNT(*) FROM user_connections WHERE tenant_id = ? AND requester_id = ? AND created_at >= ?`
	}

	var count int
	if err := r.db.QueryRowContext(ctx, query, tenantID, requesterID, since).Scan(&count); err != nil {
		return 0, fmt.Errorf("gagal count daily requests sent: %w", err)
	}
	return count, nil
}

// ListFriendsCursor mengambil daftar teman berstatus 'accepted' menggunakan cursor seek index.
func (r *SQLConnectionRepository) ListFriendsCursor(ctx context.Context, tenantID, userID string, beforeTime time.Time, beforeID string, limit int) ([]*connection.FriendItem, error) {
	if limit <= 0 {
		limit = 20
	}

	var query string
	var args []interface{}

	hasCursor := !beforeTime.IsZero() && beforeID != ""

	if r.isPostgres() {
		if hasCursor {
			query = `SELECT 
				u.id, u.username, u.display_name, COALESCE(u.avatar_url, ''), 
				COALESCE(u.status_message, ''), COALESCE(u.bio, ''), COALESCE(u.role, ''),
				COALESCE(u.is_verified, false), COALESCE(u.is_private_account, false),
				c.id, c.updated_at
			FROM user_connections c
			JOIN users u ON u.id = (CASE WHEN c.requester_id = $1 THEN c.receiver_id ELSE c.requester_id END)
			WHERE c.tenant_id = $2 
			  AND c.status = 'accepted'
			  AND (c.requester_id = $1 OR c.receiver_id = $1)
			  AND (c.updated_at < $3 OR (c.updated_at = $3 AND c.id < $4))
			ORDER BY c.updated_at DESC, c.id DESC
			LIMIT $5`
			args = []interface{}{userID, tenantID, beforeTime, beforeID, limit}
		} else {
			query = `SELECT 
				u.id, u.username, u.display_name, COALESCE(u.avatar_url, ''), 
				COALESCE(u.status_message, ''), COALESCE(u.bio, ''), COALESCE(u.role, ''),
				COALESCE(u.is_verified, false), COALESCE(u.is_private_account, false),
				c.id, c.updated_at
			FROM user_connections c
			JOIN users u ON u.id = (CASE WHEN c.requester_id = $1 THEN c.receiver_id ELSE c.requester_id END)
			WHERE c.tenant_id = $2 
			  AND c.status = 'accepted'
			  AND (c.requester_id = $1 OR c.receiver_id = $1)
			ORDER BY c.updated_at DESC, c.id DESC
			LIMIT $3`
			args = []interface{}{userID, tenantID, limit}
		}
	} else {
		if hasCursor {
			query = `SELECT 
				u.id, u.username, u.display_name, COALESCE(u.avatar_url, ''), 
				COALESCE(u.status_message, ''), COALESCE(u.bio, ''), COALESCE(u.role, ''),
				COALESCE(u.is_verified, false), COALESCE(u.is_private_account, false),
				c.id, c.updated_at
			FROM user_connections c
			JOIN users u ON u.id = (CASE WHEN c.requester_id = ? THEN c.receiver_id ELSE c.requester_id END)
			WHERE c.tenant_id = ? 
			  AND c.status = 'accepted'
			  AND (c.requester_id = ? OR c.receiver_id = ?)
			  AND (c.updated_at < ? OR (c.updated_at = ? AND c.id < ?))
			ORDER BY c.updated_at DESC, c.id DESC
			LIMIT ?`
			args = []interface{}{userID, tenantID, userID, userID, beforeTime, beforeTime, beforeID, limit}
		} else {
			query = `SELECT 
				u.id, u.username, u.display_name, COALESCE(u.avatar_url, ''), 
				COALESCE(u.status_message, ''), COALESCE(u.bio, ''), COALESCE(u.role, ''),
				COALESCE(u.is_verified, false), COALESCE(u.is_private_account, false),
				c.id, c.updated_at
			FROM user_connections c
			JOIN users u ON u.id = (CASE WHEN c.requester_id = ? THEN c.receiver_id ELSE c.requester_id END)
			WHERE c.tenant_id = ? 
			  AND c.status = 'accepted'
			  AND (c.requester_id = ? OR c.receiver_id = ?)
			ORDER BY c.updated_at DESC, c.id DESC
			LIMIT ?`
			args = []interface{}{userID, tenantID, userID, userID, limit}
		}
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("gagal query list friends cursor: %w", err)
	}
	defer rows.Close()

	var friends []*connection.FriendItem
	for rows.Next() {
		var f connection.FriendItem
		if err := rows.Scan(
			&f.ID,
			&f.Username,
			&f.DisplayName,
			&f.AvatarURL,
			&f.StatusMessage,
			&f.Bio,
			&f.Role,
			&f.IsVerified,
			&f.IsPrivateAccount,
			&f.ConnectionID,
			&f.ConnectedAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan friend item: %w", err)
		}
		friends = append(friends, &f)
	}

	return friends, nil
}

// ListPendingRequests mengambil daftar permohonan pertemanan pending.
func (r *SQLConnectionRepository) ListPendingRequests(ctx context.Context, tenantID, userID, direction string) ([]*connection.PendingRequestItem, error) {
	var items []*connection.PendingRequestItem

	// 1. Permintaan Masuk (Incoming): user saat ini adalah receiver
	if direction == "incoming" || direction == "all" || direction == "" {
		var inQuery string
		if r.isPostgres() {
			inQuery = `SELECT 
				c.id, c.requester_id, c.receiver_id, c.status, c.source_type, c.created_at, c.updated_at,
				u.id, u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.is_verified, false)
			FROM user_connections c
			JOIN users u ON u.id = c.requester_id
			WHERE c.tenant_id = $1 AND c.receiver_id = $2 AND c.status = 'pending'
			ORDER BY c.created_at DESC`
		} else {
			inQuery = `SELECT 
				c.id, c.requester_id, c.receiver_id, c.status, c.source_type, c.created_at, c.updated_at,
				u.id, u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.is_verified, false)
			FROM user_connections c
			JOIN users u ON u.id = c.requester_id
			WHERE c.tenant_id = ? AND c.receiver_id = ? AND c.status = 'pending'
			ORDER BY c.created_at DESC`
		}

		rows, err := r.db.QueryContext(ctx, inQuery, tenantID, userID)
		if err != nil {
			return nil, fmt.Errorf("gagal query pending incoming: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var it connection.PendingRequestItem
			var statusStr, sourceStr string
			if err := rows.Scan(
				&it.ID, &it.RequesterID, &it.ReceiverID, &statusStr, &sourceStr, &it.CreatedAt, &it.UpdatedAt,
				&it.PeerID, &it.PeerUsername, &it.PeerDisplayName, &it.PeerAvatarURL, &it.PeerIsVerified,
			); err != nil {
				return nil, fmt.Errorf("gagal scan pending incoming item: %w", err)
			}
			it.Direction = "incoming"
			it.Status = connection.ConnectionStatus(statusStr)
			it.SourceType = connection.SourceType(sourceStr)
			items = append(items, &it)
		}
	}

	// 2. Permintaan Keluar (Outgoing): user saat ini adalah requester
	if direction == "outgoing" || direction == "all" || direction == "" {
		var outQuery string
		if r.isPostgres() {
			outQuery = `SELECT 
				c.id, c.requester_id, c.receiver_id, c.status, c.source_type, c.created_at, c.updated_at,
				u.id, u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.is_verified, false)
			FROM user_connections c
			JOIN users u ON u.id = c.receiver_id
			WHERE c.tenant_id = $1 AND c.requester_id = $2 AND c.status = 'pending'
			ORDER BY c.created_at DESC`
		} else {
			outQuery = `SELECT 
				c.id, c.requester_id, c.receiver_id, c.status, c.source_type, c.created_at, c.updated_at,
				u.id, u.username, u.display_name, COALESCE(u.avatar_url, ''), COALESCE(u.is_verified, false)
			FROM user_connections c
			JOIN users u ON u.id = c.receiver_id
			WHERE c.tenant_id = ? AND c.requester_id = ? AND c.status = 'pending'
			ORDER BY c.created_at DESC`
		}

		rows, err := r.db.QueryContext(ctx, outQuery, tenantID, userID)
		if err != nil {
			return nil, fmt.Errorf("gagal query pending outgoing: %w", err)
		}
		defer rows.Close()

		for rows.Next() {
			var it connection.PendingRequestItem
			var statusStr, sourceStr string
			if err := rows.Scan(
				&it.ID, &it.RequesterID, &it.ReceiverID, &statusStr, &sourceStr, &it.CreatedAt, &it.UpdatedAt,
				&it.PeerID, &it.PeerUsername, &it.PeerDisplayName, &it.PeerAvatarURL, &it.PeerIsVerified,
			); err != nil {
				return nil, fmt.Errorf("gagal scan pending outgoing item: %w", err)
			}
			it.Direction = "outgoing"
			it.Status = connection.ConnectionStatus(statusStr)
			it.SourceType = connection.SourceType(sourceStr)
			items = append(items, &it)
		}
	}

	return items, nil
}

// IsFriend memeriksa apakah userA dan userB berstatus 'accepted' di tenant tertentu.
func (r *SQLConnectionRepository) IsFriend(ctx context.Context, tenantID, userA, userB string) (bool, error) {
	if userA == "" || userB == "" || userA == userB {
		return false, nil
	}

	var query string
	if r.isPostgres() {
		query = `SELECT COUNT(*) FROM user_connections
		         WHERE tenant_id = $1 
		           AND status = 'accepted'
		           AND ((requester_id = $2 AND receiver_id = $3) OR (requester_id = $3 AND receiver_id = $2))`
	} else {
		query = `SELECT COUNT(*) FROM user_connections
		         WHERE tenant_id = ? 
		           AND status = 'accepted'
		           AND ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?))`
	}

	var count int
	var err error
	if r.isPostgres() {
		err = r.db.QueryRowContext(ctx, query, tenantID, userA, userB).Scan(&count)
	} else {
		err = r.db.QueryRowContext(ctx, query, tenantID, userA, userB, userB, userA).Scan(&count)
	}
	if err != nil {
		return false, fmt.Errorf("gagal periksa status pertemanan: %w", err)
	}
	return count > 0, nil
}
