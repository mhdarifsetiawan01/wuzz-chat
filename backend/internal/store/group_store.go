package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrGroupNotFound      = errors.New("grup tidak ditemukan")
	ErrUnauthorizedGroup  = errors.New("anda tidak memiliki izin untuk tindakan ini di grup")
	ErrGroupUsernameTaken = errors.New("username grup sudah digunakan oleh grup lain")
	ErrCannotKickCreator  = errors.New("pembuat grup (creator) tidak dapat dikeluarkan")
	ErrCannotDemoteCreator = errors.New("role pembuat grup (creator) tidak dapat diubah")
	ErrAlreadyGroupMember = errors.New("user sudah menjadi anggota grup ini")
	ErrNotPublicGroup     = errors.New("grup ini adalah grup privat")
)

// GroupMemberItem merepresentasikan profil seorang anggota dalam grup.
type GroupMemberItem struct {
	UserID      string    `json:"user_id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
	AvatarURL   string    `json:"avatar_url"`
	Role        string    `json:"role"` // "creator", "admin", "member"
	IsVerified  bool      `json:"is_verified"`
	JoinedAt    time.Time `json:"joined_at"`
}

// GroupDetails merepresentasikan informasi detail sebuah grup.
type GroupDetails struct {
	ID            string            `json:"id"`
	Title         string            `json:"title"`
	Description   string            `json:"description"`
	AvatarURL     string            `json:"avatar_url"`
	IsPublic      bool              `json:"is_public"`
	GroupUsername string            `json:"group_username,omitempty"`
	ParentID      string            `json:"parent_id,omitempty"`
	CreatedBy     string            `json:"created_by"`
	CreatedAt     time.Time         `json:"created_at"`
	UpdatedAt     time.Time         `json:"updated_at"`
	MemberCount   int               `json:"member_count"`
	MyRole        string            `json:"my_role,omitempty"`
	Members       []GroupMemberItem `json:"members,omitempty"`
}

// GroupStore mendefinisikan operasi pengelolaan grup.
type GroupStore interface {
	CreateGroup(title, description, avatarURL, creatorID, groupUsername string, isPublic bool, memberIDs []string) (*GroupDetails, error)
	GetGroupDetails(conversationID, currentUserID string) (*GroupDetails, error)
	GetGroupMembers(conversationID string) ([]GroupMemberItem, error)
	JoinPublicGroup(conversationID, userID string) error
	AddGroupMembers(conversationID, actorUserID string, userIDs []string) error
	RemoveGroupMember(conversationID, actorUserID, targetUserID string) error
	UpdateMemberRole(conversationID, actorUserID, targetUserID, newRole string) error
	UpdateGroupInfo(conversationID, actorUserID, title, description, avatarURL string, isPublic *bool, groupUsername *string) error
	SearchPublicGroups(query string, limit int) ([]GroupDetails, error)
	GetUserRoleInGroup(conversationID, userID string) (string, error)
}

// CreateGroup membuat entitas grup baru secara atomik di dalam 1 transaksi database.
func (s *SQLUserStore) CreateGroup(title, description, avatarURL, creatorID, groupUsername string, isPublic bool, memberIDs []string) (*GroupDetails, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, errors.New("nama grup tidak boleh kosong")
	}
	groupUsername = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(groupUsername, "@")))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Jika publik dan ada group_username, pastikan unik
	if isPublic && groupUsername != "" {
		var checkQuery string
		if s.driverName == "postgres" {
			checkQuery = `SELECT COUNT(*) FROM conversations WHERE LOWER(group_username) = $1`
		} else {
			checkQuery = `SELECT COUNT(*) FROM conversations WHERE LOWER(group_username) = ?`
		}
		var exists int
		if err := s.db.QueryRowContext(ctx, checkQuery, groupUsername).Scan(&exists); err == nil && exists > 0 {
			return nil, ErrGroupUsernameTaken
		}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("gagal memulai transaksi database: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	groupID := fmt.Sprintf("grp_%s", uuid.New().String())
	now := time.Now().UTC()

	// 1. Insert ke tabel conversations
	var insertConvQuery string
	if s.driverName == "postgres" {
		insertConvQuery = `
			INSERT INTO conversations (
				id, type, title, is_public, group_username, parent_id, expires_at,
				created_by, avatar_url, description, is_e2ee, created_at, updated_at
			) VALUES ($1, 'group', $2, $3, $4, NULL, NULL, $5, $6, $7, false, $8, $9)
		`
	} else {
		insertConvQuery = `
			INSERT INTO conversations (
				id, type, title, is_public, group_username, parent_id, expires_at,
				created_by, avatar_url, description, is_e2ee, created_at, updated_at
			) VALUES (?, 'group', ?, ?, ?, NULL, NULL, ?, ?, ?, false, ?, ?)
		`
	}

	_, err = tx.ExecContext(ctx, insertConvQuery,
		groupID, title, isPublic, groupUsername, creatorID, avatarURL, description, now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("gagal membuat entitas grup: %w", err)
	}

	// 2. Masukkan creator sebagai 'creator'
	var insertMemberQuery string
	if s.driverName == "postgres" {
		insertMemberQuery = `
			INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (conversation_id, user_id) DO NOTHING
		`
	} else {
		insertMemberQuery = `
			INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at)
			VALUES (?, ?, ?, ?)
		`
	}

	_, err = tx.ExecContext(ctx, insertMemberQuery, groupGroupID(groupID), creatorID, "creator", now)
	if err != nil {
		return nil, fmt.Errorf("gagal mendaftarkan pembuat grup: %w", err)
	}

	// 3. Masukkan initial members yang dipilih
	memberCount := 1
	for _, mID := range memberIDs {
		mID = strings.TrimSpace(mID)
		if mID == "" || mID == creatorID {
			continue
		}
		if _, err := tx.ExecContext(ctx, insertMemberQuery, groupID, mID, "member", now); err == nil {
			memberCount++
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("gagal komit transaksi grup: %w", err)
	}

	return &GroupDetails{
		ID:            groupID,
		Title:         title,
		Description:   description,
		AvatarURL:     avatarURL,
		IsPublic:      isPublic,
		GroupUsername: groupUsername,
		CreatedBy:     creatorID,
		CreatedAt:     now,
		UpdatedAt:     now,
		MemberCount:   memberCount,
		MyRole:        "creator",
	}, nil
}

func groupGroupID(id string) string {
	return id
}

// GetUserRoleInGroup memeriksa role user dalam grup tertentu ('creator', 'admin', 'member', atau '' jika bukan member).
func (s *SQLUserStore) GetUserRoleInGroup(conversationID, userID string) (string, error) {
	var query string
	if s.driverName == "postgres" {
		query = `SELECT COALESCE(role, 'member') FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`
	} else {
		query = `SELECT COALESCE(role, 'member') FROM conversation_members WHERE conversation_id = ? AND user_id = ?`
	}

	var role string
	err := s.db.QueryRow(query, conversationID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return role, nil
}

// GetGroupDetails mengambil detail informasi grup.
func (s *SQLUserStore) GetGroupDetails(conversationID, currentUserID string) (*GroupDetails, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var convQuery string
	if s.driverName == "postgres" {
		convQuery = `
			SELECT 
				id, title, description, avatar_url, is_public, 
				COALESCE(group_username, ''), COALESCE(parent_id, ''),
				created_by, created_at, updated_at
			FROM conversations
			WHERE id = $1 AND type = 'group'
		`
	} else {
		convQuery = `
			SELECT 
				id, title, description, avatar_url, is_public, 
				COALESCE(group_username, ''), COALESCE(parent_id, ''),
				created_by, created_at, updated_at
			FROM conversations
			WHERE id = ? AND type = 'group'
		`
	}

	var g GroupDetails
	err := s.db.QueryRowContext(ctx, convQuery, conversationID).Scan(
		&g.ID, &g.Title, &g.Description, &g.AvatarURL, &g.IsPublic,
		&g.GroupUsername, &g.ParentID, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, err
	}

	// Cek role pemanggil
	myRole, _ := s.GetUserRoleInGroup(conversationID, currentUserID)
	g.MyRole = myRole

	// Proteksi BOLA: Jika grup privat dan pemanggil bukan anggota -> tolak akses!
	if !g.IsPublic && myRole == "" {
		return nil, ErrUnauthorizedGroup
	}

	// Hitung total member
	var countQuery string
	if s.driverName == "postgres" {
		countQuery = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1`
	} else {
		countQuery = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ?`
	}
	_ = s.db.QueryRowContext(ctx, countQuery, conversationID).Scan(&g.MemberCount)

	return &g, nil
}

// GetGroupMembers mengambil daftar seluruh anggota dalam suatu grup.
func (s *SQLUserStore) GetGroupMembers(conversationID string) ([]GroupMemberItem, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var query string
	if s.driverName == "postgres" {
		query = `
			SELECT 
				u.id, 
				u.username, 
				u.display_name, 
				COALESCE(u.avatar_url, '') AS avatar_url, 
				COALESCE(cm.role, 'member') AS role,
				COALESCE(u.is_verified, false) AS is_verified,
				cm.joined_at
			FROM conversation_members cm
			JOIN users u ON cm.user_id = u.id
			WHERE cm.conversation_id = $1
			ORDER BY 
				CASE 
					WHEN cm.role = 'creator' THEN 1
					WHEN cm.role = 'admin' THEN 2
					ELSE 3
				END ASC,
				cm.joined_at ASC
		`
	} else {
		query = `
			SELECT 
				u.id, 
				u.username, 
				u.display_name, 
				COALESCE(u.avatar_url, '') AS avatar_url, 
				COALESCE(cm.role, 'member') AS role,
				COALESCE(u.is_verified, false) AS is_verified,
				cm.joined_at
			FROM conversation_members cm
			JOIN users u ON cm.user_id = u.id
			WHERE cm.conversation_id = ?
			ORDER BY 
				CASE 
					WHEN cm.role = 'creator' THEN 1
					WHEN cm.role = 'admin' THEN 2
					ELSE 3
				END ASC,
				cm.joined_at ASC
		`
	}

	rows, err := s.db.QueryContext(ctx, query, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []GroupMemberItem
	for rows.Next() {
		var m GroupMemberItem
		if err := rows.Scan(
			&m.UserID, &m.Username, &m.DisplayName, &m.AvatarURL,
			&m.Role, &m.IsVerified, &m.JoinedAt,
		); err != nil {
			continue
		}
		members = append(members, m)
	}

	return members, nil
}

// JoinPublicGroup mengizinkan pengguna umum melakukan self-join ke grup publik.
func (s *SQLUserStore) JoinPublicGroup(conversationID, userID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Pastikan grup ada dan bersifat publik
	var isPublic bool
	var checkQuery string
	if s.driverName == "postgres" {
		checkQuery = `SELECT is_public FROM conversations WHERE id = $1 AND type = 'group'`
	} else {
		checkQuery = `SELECT is_public FROM conversations WHERE id = ? AND type = 'group'`
	}

	err := s.db.QueryRowContext(ctx, checkQuery, conversationID).Scan(&isPublic)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrGroupNotFound
	}
	if err != nil {
		return err
	}
	if !isPublic {
		return ErrNotPublicGroup
	}

	// 2. Periksa apakah sudah menjadi anggota
	role, err := s.GetUserRoleInGroup(conversationID, userID)
	if err == nil && role != "" {
		return ErrAlreadyGroupMember
	}

	// 3. Masukkan sebagai member baru
	now := time.Now().UTC()
	var insertQuery string
	if s.driverName == "postgres" {
		insertQuery = `
			INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
			VALUES ($1, $2, 'member', $3)
			ON CONFLICT (conversation_id, user_id) DO NOTHING
		`
	} else {
		insertQuery = `
			INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at)
			VALUES (?, ?, 'member', ?)
		`
	}

	if _, err := s.db.ExecContext(ctx, insertQuery, conversationID, userID, now); err != nil {
		return fmt.Errorf("gagal bergabung ke grup: %w", err)
	}

	// Update timestamp obrolan
	s.touchConversation(ctx, conversationID, now)
	return nil
}

// AddGroupMembers menambahkan anggota-anggota baru oleh Creator atau Admin.
func (s *SQLUserStore) AddGroupMembers(conversationID, actorUserID string, userIDs []string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	actorRole, err := s.GetUserRoleInGroup(conversationID, actorUserID)
	if err != nil || (actorRole != "creator" && actorRole != "admin") {
		return ErrUnauthorizedGroup
	}

	now := time.Now().UTC()
	var insertQuery string
	if s.driverName == "postgres" {
		insertQuery = `
			INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
			VALUES ($1, $2, 'member', $3)
			ON CONFLICT (conversation_id, user_id) DO NOTHING
		`
	} else {
		insertQuery = `
			INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at)
			VALUES (?, ?, 'member', ?)
		`
	}

	for _, uID := range userIDs {
		uID = strings.TrimSpace(uID)
		if uID == "" {
			continue
		}
		_, _ = s.db.ExecContext(ctx, insertQuery, conversationID, uID, now)
	}

	s.touchConversation(ctx, conversationID, now)
	return nil
}

// RemoveGroupMember mengeluarkan anggota dari grup (Kick oleh Admin/Creator, atau Self-Leave).
func (s *SQLUserStore) RemoveGroupMember(conversationID, actorUserID, targetUserID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	targetRole, err := s.GetUserRoleInGroup(conversationID, targetUserID)
	if err != nil || targetRole == "" {
		return errors.New("pengguna bukan anggota grup")
	}

	// Skenario 1: Self-Leave (pengguna keluar secara mandiri)
	if actorUserID == targetUserID {
		if targetRole == "creator" {
			// Periksa apakah masih ada member lain
			var memberCount int
			var cQuery string
			if s.driverName == "postgres" {
				cQuery = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1`
			} else {
				cQuery = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ?`
			}
			_ = s.db.QueryRowContext(ctx, cQuery, conversationID).Scan(&memberCount)
			if memberCount > 1 {
				return errors.New("pembuat grup wajib mengalihkan status creator ke anggota lain sebelum keluar")
			}
		}
	} else {
		// Skenario 2: Kick oleh user lain
		actorRole, err := s.GetUserRoleInGroup(conversationID, actorUserID)
		if err != nil || (actorRole != "creator" && actorRole != "admin") {
			return ErrUnauthorizedGroup
		}
		// Admin/Creator tidak boleh menendang Creator
		if targetRole == "creator" {
			return ErrCannotKickCreator
		}
		// Admin biasa tidak boleh menendang sesama Admin (hanya Creator yang boleh)
		if actorRole == "admin" && targetRole == "admin" {
			return errors.New("admin tidak dapat mengeluarkan sesama admin")
		}
	}

	var delQuery string
	if s.driverName == "postgres" {
		delQuery = `DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`
	} else {
		delQuery = `DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?`
	}

	if _, err := s.db.ExecContext(ctx, delQuery, conversationID, targetUserID); err != nil {
		return fmt.Errorf("gagal mengeluarkan anggota dari grup: %w", err)
	}

	now := time.Now().UTC()
	s.touchConversation(ctx, conversationID, now)
	return nil
}

// UpdateMemberRole mengubah role seorang anggota ('admin' atau 'member').
func (s *SQLUserStore) UpdateMemberRole(conversationID, actorUserID, targetUserID, newRole string) error {
	newRole = strings.ToLower(strings.TrimSpace(newRole))
	if newRole != "admin" && newRole != "member" {
		return errors.New("role tidak valid (hanya 'admin' atau 'member')")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	actorRole, err := s.GetUserRoleInGroup(conversationID, actorUserID)
	if err != nil || (actorRole != "creator" && actorRole != "admin") {
		return ErrUnauthorizedGroup
	}

	targetRole, err := s.GetUserRoleInGroup(conversationID, targetUserID)
	if err != nil || targetRole == "" {
		return errors.New("pengguna bukan anggota grup")
	}

	if targetRole == "creator" {
		return ErrCannotDemoteCreator
	}

	var updateQuery string
	if s.driverName == "postgres" {
		updateQuery = `UPDATE conversation_members SET role = $1 WHERE conversation_id = $2 AND user_id = $3`
	} else {
		updateQuery = `UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND user_id = ?`
	}

	if _, err := s.db.ExecContext(ctx, updateQuery, newRole, conversationID, targetUserID); err != nil {
		return fmt.Errorf("gagal memperbarui role anggota: %w", err)
	}

	return nil
}

// UpdateGroupInfo memperbarui informasi profil grup (nama, deskripsi, avatar, visibilitas).
func (s *SQLUserStore) UpdateGroupInfo(conversationID, actorUserID, title, description, avatarURL string, isPublic *bool, groupUsername *string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	actorRole, err := s.GetUserRoleInGroup(conversationID, actorUserID)
	if err != nil || (actorRole != "creator" && actorRole != "admin") {
		return ErrUnauthorizedGroup
	}

	title = strings.TrimSpace(title)
	if title == "" {
		return errors.New("nama grup tidak boleh kosong")
	}

	var cleanUsername string
	if groupUsername != nil {
		cleanUsername = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(*groupUsername, "@")))
		if cleanUsername != "" {
			var checkQuery string
			if s.driverName == "postgres" {
				checkQuery = `SELECT COUNT(*) FROM conversations WHERE LOWER(group_username) = $1 AND id != $2`
			} else {
				checkQuery = `SELECT COUNT(*) FROM conversations WHERE LOWER(group_username) = ? AND id != ?`
			}
			var exists int
			if err := s.db.QueryRowContext(ctx, checkQuery, cleanUsername, conversationID).Scan(&exists); err == nil && exists > 0 {
				return ErrGroupUsernameTaken
			}
		}
	}

	now := time.Now().UTC()
	var updateQuery string
	if s.driverName == "postgres" {
		updateQuery = `
			UPDATE conversations
			SET title = $1, description = $2, avatar_url = $3,
			    is_public = COALESCE($4::boolean, is_public),
			    group_username = COALESCE($5::text, group_username),
			    updated_at = $6
			WHERE id = $7 AND type = 'group'
		`
	} else {
		updateQuery = `
			UPDATE conversations
			SET title = ?, description = ?, avatar_url = ?,
			    is_public = COALESCE(?, is_public),
			    group_username = COALESCE(?, group_username),
			    updated_at = ?
			WHERE id = ? AND type = 'group'
		`
	}

	var pubVal interface{}
	if isPublic != nil {
		pubVal = *isPublic
	}
	var uVal interface{}
	if groupUsername != nil {
		uVal = cleanUsername
	}

	_, err = s.db.ExecContext(ctx, updateQuery, title, description, avatarURL, pubVal, uVal, now, conversationID)
	return err
}

// SearchPublicGroups mencari grup publik yang cocok dengan query nama atau @username.
func (s *SQLUserStore) SearchPublicGroups(query string, limit int) ([]GroupDetails, error) {
	query = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(query, "@")))
	if query == "" {
		return []GroupDetails{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pattern := "%" + query + "%"
	var sqlQuery string
	if s.driverName == "postgres" {
		sqlQuery = `
			SELECT 
				c.id, c.title, c.description, c.avatar_url, c.is_public,
				COALESCE(c.group_username, ''), c.created_by, c.created_at, c.updated_at,
				(SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS member_count
			FROM conversations c
			WHERE c.type = 'group' AND c.is_public = true
			  AND (LOWER(c.title) LIKE $1 OR LOWER(c.group_username) LIKE $1)
			ORDER BY c.updated_at DESC
			LIMIT $2
		`
	} else {
		sqlQuery = `
			SELECT 
				c.id, c.title, c.description, c.avatar_url, c.is_public,
				COALESCE(c.group_username, ''), c.created_by, c.created_at, c.updated_at,
				(SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS member_count
			FROM conversations c
			WHERE c.type = 'group' AND c.is_public = true
			  AND (LOWER(c.title) LIKE ? OR LOWER(c.group_username) LIKE ?)
			ORDER BY c.updated_at DESC
			LIMIT ?
		`
	}

	var rows *sql.Rows
	var err error
	if s.driverName == "postgres" {
		rows, err = s.db.QueryContext(ctx, sqlQuery, pattern, limit)
	} else {
		rows, err = s.db.QueryContext(ctx, sqlQuery, pattern, pattern, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []GroupDetails
	for rows.Next() {
		var g GroupDetails
		if err := rows.Scan(
			&g.ID, &g.Title, &g.Description, &g.AvatarURL, &g.IsPublic,
			&g.GroupUsername, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt,
			&g.MemberCount,
		); err != nil {
			continue
		}
		groups = append(groups, g)
	}

	return groups, nil
}

func (s *SQLUserStore) touchConversation(ctx context.Context, conversationID string, now time.Time) {
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE conversations SET updated_at = $1 WHERE id = $2`
	} else {
		query = `UPDATE conversations SET updated_at = ? WHERE id = ?`
	}
	_, _ = s.db.ExecContext(ctx, query, now, conversationID)
}
