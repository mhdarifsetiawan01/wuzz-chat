package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
)

// SQLGroupStore adalah implementasi GroupStore berbasis SQL.
// Dipisahkan dari SQLUserStore untuk membangun domain boundary yang jelas
// antara Identity/Auth domain dan Group domain.
type SQLGroupStore struct {
	db         *sql.DB
	driverName string // "sqlite" atau "postgres"
}

// NewSQLGroupStore membuat instance baru SQLGroupStore menggunakan *sql.DB yang sudah ada.
// DB yang digunakan adalah koneksi yang sama dengan SQLMessageStore sehingga tidak membuka
// koneksi database tambahan.
func NewSQLGroupStore(db *sql.DB, driverName string) *SQLGroupStore {
	return &SQLGroupStore{
		db:         db,
		driverName: driverName,
	}
}

// groupGroupID adalah helper internal (no-op saat ini, disiapkan untuk normalisasi ID di masa depan).
func (s *SQLGroupStore) groupGroupID(id string) string {
	return id
}

// touchConversation memperbarui timestamp updated_at pada percakapan.
func (s *SQLGroupStore) touchConversation(ctx context.Context, conversationID string, now time.Time) {
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE conversations SET updated_at = $1 WHERE id = $2`
	} else {
		query = `UPDATE conversations SET updated_at = ? WHERE id = ?`
	}
	_, _ = s.db.ExecContext(ctx, query, now, conversationID)
}

// CreateGroup membuat entitas grup baru secara atomik di dalam 1 transaksi database.
func (s *SQLGroupStore) CreateGroup(title, description, avatarURL, creatorID, groupUsername string, isPublic bool, memberIDs []string) (*GroupDetails, error) {
	return s.CreateGroupWithContext(context.Background(), title, description, avatarURL, creatorID, groupUsername, isPublic, memberIDs)
}

// CreateGroupWithContext membuat entitas grup baru dengan tenant context propagation.
func (s *SQLGroupStore) CreateGroupWithContext(ctx context.Context, title, description, avatarURL, creatorID, groupUsername string, isPublic bool, memberIDs []string) (*GroupDetails, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, errors.New("nama grup tidak boleh kosong")
	}
	groupUsername = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(groupUsername, "@")))

	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	if tenantID == "default" && creatorID != "" {
		var userTenant string
		var checkUserQuery string
		if s.driverName == "postgres" {
			checkUserQuery = `SELECT COALESCE(tenant_id, 'default') FROM users WHERE id = $1`
		} else {
			checkUserQuery = `SELECT COALESCE(tenant_id, 'default') FROM users WHERE id = ?`
		}
		if err := s.db.QueryRowContext(ctx, checkUserQuery, creatorID).Scan(&userTenant); err == nil && userTenant != "" {
			tenantID = userTenant
		}
	}

	// Jika publik dan ada group_username, pastikan unik per tenant
	if isPublic && groupUsername != "" {
		var checkQuery string
		if s.driverName == "postgres" {
			checkQuery = `SELECT COUNT(*) FROM conversations WHERE LOWER(group_username) = $1 AND tenant_id = $2`
		} else {
			checkQuery = `SELECT COUNT(*) FROM conversations WHERE LOWER(group_username) = ? AND tenant_id = ?`
		}
		var exists int
		if err := s.db.QueryRowContext(ctx, checkQuery, groupUsername, tenantID).Scan(&exists); err == nil && exists > 0 {
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
				created_by, avatar_url, description, is_e2ee, created_at, updated_at, tenant_id
			) VALUES ($1, 'group', $2, $3, $4, NULL, NULL, $5, $6, $7, false, $8, $9, $10)
		`
	} else {
		insertConvQuery = `
			INSERT INTO conversations (
				id, type, title, is_public, group_username, parent_id, expires_at,
				created_by, avatar_url, description, is_e2ee, created_at, updated_at, tenant_id
			) VALUES (?, 'group', ?, ?, ?, NULL, NULL, ?, ?, ?, false, ?, ?, ?)
		`
	}

	_, err = tx.ExecContext(ctx, insertConvQuery,
		groupID, title, isPublic, groupUsername, creatorID, avatarURL, description, now, now, tenantID,
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

	_, err = tx.ExecContext(ctx, insertMemberQuery, s.groupGroupID(groupID), creatorID, "creator", now)
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

// GetUserRoleInGroup memeriksa role user dalam grup tertentu ('creator', 'admin', 'member', atau '' jika bukan member).
func (s *SQLGroupStore) GetUserRoleInGroup(conversationID, userID string) (string, error) {
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
func (s *SQLGroupStore) GetGroupDetails(conversationID, currentUserID string) (*GroupDetails, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var convQuery string
	if s.driverName == "postgres" {
		convQuery = `
			SELECT 
				id, title, description, avatar_url, is_public, 
				COALESCE(group_username, ''), COALESCE(parent_id, ''),
				created_by, created_at, updated_at,
				COALESCE(status, 'active'), expires_at, COALESCE(ai_summary, '')
			FROM conversations
			WHERE id = $1 AND type = 'group'
		`
	} else {
		convQuery = `
			SELECT 
				id, title, description, avatar_url, is_public, 
				COALESCE(group_username, ''), COALESCE(parent_id, ''),
				created_by, created_at, updated_at,
				COALESCE(status, 'active'), expires_at, COALESCE(ai_summary, '')
			FROM conversations
			WHERE id = ? AND type = 'group'
		`
	}

	var g GroupDetails
	err := s.db.QueryRowContext(ctx, convQuery, conversationID).Scan(
		&g.ID, &g.Title, &g.Description, &g.AvatarURL, &g.IsPublic,
		&g.GroupUsername, &g.ParentID, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt,
		&g.Status, &g.ExpiresAt, &g.AISummary,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, err
	}

	// Strict Parent-Membership Gate: Jika ini subgrup, pemanggil WAJIB anggota aktif grup induk
	if g.ParentID != "" {
		isParentMember, err := s.IsParentMember(g.ParentID, currentUserID)
		if err != nil || !isParentMember {
			return nil, ErrUnauthorizedGroup
		}
	}

	// Cek role pemanggil
	myRole, _ := s.GetUserRoleInGroup(conversationID, currentUserID)
	g.MyRole = myRole

	// Proteksi BOLA: Jika grup privat dan pemanggil bukan anggota -> tolak akses!
	if !g.IsPublic && myRole == "" && g.ParentID == "" {
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
func (s *SQLGroupStore) GetGroupMembers(conversationID string) ([]GroupMemberItem, error) {
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
func (s *SQLGroupStore) JoinPublicGroup(conversationID, userID string) error {
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
func (s *SQLGroupStore) AddGroupMembers(conversationID, actorUserID string, userIDs []string) error {
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
func (s *SQLGroupStore) RemoveGroupMember(conversationID, actorUserID, targetUserID string) error {
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
func (s *SQLGroupStore) UpdateMemberRole(conversationID, actorUserID, targetUserID, newRole string) error {
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
func (s *SQLGroupStore) UpdateGroupInfo(conversationID, actorUserID, title, description, avatarURL string, isPublic *bool, groupUsername *string) error {
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
func (s *SQLGroupStore) SearchPublicGroups(query string, limit int) ([]GroupDetails, error) {
	return s.SearchPublicGroupsWithContext(context.Background(), query, limit)
}

// SearchPublicGroupsWithContext mencari grup publik dengan tenant filtering.
func (s *SQLGroupStore) SearchPublicGroupsWithContext(ctx context.Context, query string, limit int) ([]GroupDetails, error) {
	query = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(query, "@")))
	if query == "" {
		return []GroupDetails{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	pattern := "%" + query + "%"
	var sqlQuery string
	if s.driverName == "postgres" {
		sqlQuery = `
			SELECT 
				c.id, c.title, c.description, c.avatar_url, c.is_public,
				COALESCE(c.group_username, ''), c.created_by, c.created_at, c.updated_at,
				(SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS member_count
			FROM conversations c
			WHERE c.type = 'group' AND c.is_public = true AND c.tenant_id = $3
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
			WHERE c.type = 'group' AND c.is_public = true AND c.tenant_id = ?
			  AND (LOWER(c.title) LIKE ? OR LOWER(c.group_username) LIKE ?)
			ORDER BY c.updated_at DESC
			LIMIT ?
		`
	}

	var rows *sql.Rows
	var err error
	if s.driverName == "postgres" {
		rows, err = s.db.QueryContext(ctx, sqlQuery, pattern, limit, tenantID)
	} else {
		rows, err = s.db.QueryContext(ctx, sqlQuery, tenantID, pattern, pattern, limit)
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

// CreateSubGroup membuat subgrup topik baru di bawah grup induk secara atomik.
func (s *SQLGroupStore) CreateSubGroup(parentID, title, description, creatorID, duration string, isPublic bool) (*GroupDetails, error) {
	return s.CreateSubGroupWithContext(context.Background(), parentID, title, description, creatorID, duration, isPublic)
}

// CreateSubGroupWithContext membuat subgrup topik baru dengan context tenant.
func (s *SQLGroupStore) CreateSubGroupWithContext(ctx context.Context, parentID, title, description, creatorID, duration string, isPublic bool) (*GroupDetails, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, errors.New("nama subgrup tidak boleh kosong")
	}
	if len(title) > 128 {
		return nil, errors.New("nama subgrup maksimal 128 karakter")
	}
	parentID = strings.TrimSpace(parentID)
	if parentID == "" {
		return nil, errors.New("parent_id grup utama wajib disertakan")
	}
	creatorID = strings.TrimSpace(creatorID)
	if creatorID == "" {
		return nil, errors.New("creator_id tidak valid")
	}

	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	if tenantID == "default" && parentID != "" {
		var parentTenant string
		var checkParentQuery string
		if s.driverName == "postgres" {
			checkParentQuery = `SELECT COALESCE(tenant_id, 'default') FROM conversations WHERE id = $1`
		} else {
			checkParentQuery = `SELECT COALESCE(tenant_id, 'default') FROM conversations WHERE id = ?`
		}
		if err := s.db.QueryRowContext(ctx, checkParentQuery, parentID).Scan(&parentTenant); err == nil && parentTenant != "" {
			tenantID = parentTenant
		}
	}

	// 1. Verifikasi bahwa parent group ada dan bertipe 'group'
	var parentType string
	var parentCheckQuery string
	if s.driverName == "postgres" {
		parentCheckQuery = `SELECT type FROM conversations WHERE id = $1`
	} else {
		parentCheckQuery = `SELECT type FROM conversations WHERE id = ?`
	}
	err := s.db.QueryRowContext(ctx, parentCheckQuery, parentID).Scan(&parentType)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("grup utama tidak ditemukan")
	}
	if err != nil {
		return nil, err
	}

	// 2. Strict Parent-Membership Gate & RBAC: Pastikan creator adalah admin atau pembuat di parent group (UUID check)
	role, err := s.GetUserRoleInGroup(parentID, creatorID)
	if err != nil {
		return nil, err
	}
	if role != "creator" && role != "admin" {
		return nil, ErrUnauthorizedGroup
	}

	// 3. Validasi & Kalkulasi TTL Server-Side secara deterministik
	now := time.Now().UTC()
	var expiresAt time.Time
	duration = strings.ToLower(strings.TrimSpace(duration))
	switch duration {
	case "30_days", "30d", "1_month", "month":
		expiresAt = now.AddDate(0, 1, 0)
	case "7_days", "7d", "1_week", "week", "": // default 1 minggu
		expiresAt = now.AddDate(0, 0, 7)
	default:
		return nil, errors.New("durasi tidak valid: hanya mendukung 1 minggu (7_days) atau 1 bulan (30_days)")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("gagal memulai transaksi database: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	subGroupID := fmt.Sprintf("sub_%s", uuid.New().String())

	// 4. Insert ke tabel conversations
	var insertConvQuery string
	if s.driverName == "postgres" {
		insertConvQuery = `
			INSERT INTO conversations (
				id, type, title, is_public, group_username, parent_id, expires_at,
				created_by, avatar_url, description, is_e2ee, status, ai_summary, created_at, updated_at, tenant_id
			) VALUES ($1, 'group', $2, $3, '', $4, $5, $6, '', $7, false, 'active', '', $8, $9, $10)
		`
	} else {
		insertConvQuery = `
			INSERT INTO conversations (
				id, type, title, is_public, group_username, parent_id, expires_at,
				created_by, avatar_url, description, is_e2ee, status, ai_summary, created_at, updated_at, tenant_id
			) VALUES (?, 'group', ?, ?, '', ?, ?, ?, '', ?, false, 'active', '', ?, ?, ?)
		`
	}

	_, err = tx.ExecContext(ctx, insertConvQuery,
		subGroupID, title, isPublic, parentID, expiresAt, creatorID, description, now, now, tenantID,
	)
	if err != nil {
		return nil, fmt.Errorf("gagal membuat entitas subgrup: %w", err)
	}

	// 5. Masukkan creator sebagai member 'creator'
	var insertMemberQuery string
	if s.driverName == "postgres" {
		insertMemberQuery = `
			INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
			VALUES ($1, $2, 'creator', $3)
			ON CONFLICT (conversation_id, user_id) DO NOTHING
		`
	} else {
		insertMemberQuery = `
			INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at)
			VALUES (?, ?, 'creator', ?)
		`
	}
	_, err = tx.ExecContext(ctx, insertMemberQuery, subGroupID, creatorID, now)
	if err != nil {
		return nil, fmt.Errorf("gagal mendaftarkan pembuat subgrup: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("gagal commit transaksi subgrup: %w", err)
	}

	return &GroupDetails{
		ID:          subGroupID,
		Title:       title,
		Description: description,
		IsPublic:    isPublic,
		ParentID:    parentID,
		CreatedBy:   creatorID,
		CreatedAt:   now,
		UpdatedAt:   now,
		MemberCount: 1,
		MyRole:      "creator",
		Status:      "active",
		ExpiresAt:   &expiresAt,
	}, nil
}

// IsParentMember memeriksa apakah user_id adalah anggota aktif dari grup induk parent_id (UUID-based).
func (s *SQLGroupStore) IsParentMember(parentID, userID string) (bool, error) {
	parentID = strings.TrimSpace(parentID)
	userID = strings.TrimSpace(userID)
	if parentID == "" || userID == "" {
		return false, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var query string
	if s.driverName == "postgres" {
		query = `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`
	} else {
		query = `SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1`
	}

	var dummy int
	err := s.db.QueryRowContext(ctx, query, parentID, userID).Scan(&dummy)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// GetActiveSubGroups mengambil daftar seluruh subgrup yang masih aktif di bawah grup induk parent_id.
func (s *SQLGroupStore) GetActiveSubGroups(parentID, currentUserID string) ([]SubGroupItem, error) {
	return s.GetActiveSubGroupsWithContext(context.Background(), parentID, currentUserID)
}

// GetActiveSubGroupsWithContext mengambil daftar seluruh subgrup yang masih aktif dengan context.
func (s *SQLGroupStore) GetActiveSubGroupsWithContext(ctx context.Context, parentID, currentUserID string) ([]SubGroupItem, error) {
	parentID = strings.TrimSpace(parentID)
	currentUserID = strings.TrimSpace(currentUserID)
	if parentID == "" {
		return nil, errors.New("parent_id wajib diisi")
	}

	// Strict Parent-Membership Gate: Pemanggil WAJIB member aktif grup induk (UUID)
	isMember, err := s.IsParentMember(parentID, currentUserID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, ErrUnauthorizedGroup
	}

	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	now := time.Now().UTC()

	var query string
	if s.driverName == "postgres" {
		query = `
			SELECT 
				c.id, c.parent_id, c.title, COALESCE(c.description, ''),
				c.expires_at, c.created_by, c.created_at, COALESCE(c.status, 'active'),
				COALESCE(c.is_public, true) AS is_public,
				COUNT(DISTINCT cm.user_id) AS member_count,
				BOOL_OR(cm.user_id = $2) AS is_member,
				BOOL_OR(cjr.id IS NOT NULL) AS has_pending_request,
				(SELECT COUNT(*) FROM conversation_join_requests WHERE conversation_id = c.id AND status = 'pending') AS pending_requests_count
			FROM conversations c
			LEFT JOIN conversation_members cm ON c.id = cm.conversation_id
			LEFT JOIN conversation_join_requests cjr ON c.id = cjr.conversation_id AND cjr.user_id = $2 AND cjr.status = 'pending'
			WHERE c.parent_id = $1 
			  AND (c.status IS NULL OR c.status = 'active')
			  AND (c.expires_at IS NULL OR c.expires_at > $3)
			GROUP BY c.id, c.parent_id, c.title, c.description, c.expires_at, c.created_by, c.created_at, c.status, c.is_public
			ORDER BY c.created_at DESC
		`
	} else {
		query = `
			SELECT 
				c.id, c.parent_id, c.title, COALESCE(c.description, ''),
				c.expires_at, c.created_by, c.created_at, COALESCE(c.status, 'active'),
				COALESCE(c.is_public, 1) AS is_public,
				COUNT(DISTINCT cm.user_id) AS member_count,
				MAX(CASE WHEN cm.user_id = ? THEN 1 ELSE 0 END) AS is_member,
				MAX(CASE WHEN cjr.id IS NOT NULL THEN 1 ELSE 0 END) AS has_pending_request,
				(SELECT COUNT(*) FROM conversation_join_requests WHERE conversation_id = c.id AND status = 'pending') AS pending_requests_count
			FROM conversations c
			LEFT JOIN conversation_members cm ON c.id = cm.conversation_id
			LEFT JOIN conversation_join_requests cjr ON c.id = cjr.conversation_id AND cjr.user_id = ? AND cjr.status = 'pending'
			WHERE c.parent_id = ? 
			  AND (c.status IS NULL OR c.status = 'active')
			  AND (c.expires_at IS NULL OR c.expires_at > ?)
			GROUP BY c.id, c.parent_id, c.title, c.description, c.expires_at, c.created_by, c.created_at, c.status, c.is_public
			ORDER BY c.created_at DESC
		`
	}

	var rows *sql.Rows
	if s.driverName == "postgres" {
		rows, err = s.db.QueryContext(ctx, query, parentID, currentUserID, now)
	} else {
		rows, err = s.db.QueryContext(ctx, query, currentUserID, currentUserID, parentID, now)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subGroups []SubGroupItem
	for rows.Next() {
		var item SubGroupItem
		var expiresAt *time.Time
		var isMemberVal sql.NullBool
		var hasPendingVal sql.NullBool
		var isPublicVal sql.NullBool

		if s.driverName == "postgres" {
			if err := rows.Scan(
				&item.ID, &item.ParentID, &item.Title, &item.Description,
				&expiresAt, &item.CreatedBy, &item.CreatedAt, &item.Status,
				&isPublicVal, &item.MemberCount, &isMemberVal, &hasPendingVal,
				&item.PendingRequestsCount,
			); err != nil {
				continue
			}
			item.IsPublic = !isPublicVal.Valid || isPublicVal.Bool
			item.IsMember = isMemberVal.Valid && isMemberVal.Bool
			item.HasPendingRequest = hasPendingVal.Valid && hasPendingVal.Bool
		} else {
			var isMemberInt sql.NullInt64
			var hasPendingInt sql.NullInt64
			var isPublicInt sql.NullInt64
			if err := rows.Scan(
				&item.ID, &item.ParentID, &item.Title, &item.Description,
				&expiresAt, &item.CreatedBy, &item.CreatedAt, &item.Status,
				&isPublicInt, &item.MemberCount, &isMemberInt, &hasPendingInt,
				&item.PendingRequestsCount,
			); err != nil {
				continue
			}
			item.IsPublic = !isPublicInt.Valid || isPublicInt.Int64 == 1
			item.IsMember = isMemberInt.Valid && isMemberInt.Int64 == 1
			item.HasPendingRequest = hasPendingInt.Valid && hasPendingInt.Int64 == 1
		}

		item.ExpiresAt = expiresAt
		if expiresAt != nil {
			rem := int64(expiresAt.Sub(now).Seconds())
			if rem < 0 {
				rem = 0
			}
			item.RemainingSeconds = rem
		}

		subGroups = append(subGroups, item)
	}

	return subGroups, nil
}

// JoinSubGroup memasukkan pengguna ke subgrup setelah memvalidasi bahwa pengguna adalah anggota aktif grup induk
// dan subgrup bertipe publik (atau pengguna telah diundang).
func (s *SQLGroupStore) JoinSubGroup(subGroupID, userID string) error {
	subGroupID = strings.TrimSpace(subGroupID)
	userID = strings.TrimSpace(userID)
	if subGroupID == "" || userID == "" {
		return errors.New("subGroupID dan userID wajib diisi")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Ambil parent_id, status, expires_at, is_public dari subgrup
	var parentID string
	var status string
	var expiresAt *time.Time
	var isPublic bool
	var query string
	if s.driverName == "postgres" {
		query = `SELECT COALESCE(parent_id, ''), COALESCE(status, 'active'), expires_at, COALESCE(is_public, true) FROM conversations WHERE id = $1`
	} else {
		query = `SELECT COALESCE(parent_id, ''), COALESCE(status, 'active'), expires_at, COALESCE(is_public, 1) FROM conversations WHERE id = ?`
	}

	err := s.db.QueryRowContext(ctx, query, subGroupID).Scan(&parentID, &status, &expiresAt, &isPublic)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrGroupNotFound
	}
	if err != nil {
		return err
	}
	if parentID == "" {
		return errors.New("grup ini bukan subgrup")
	}

	// 2. Cek apakah subgrup sudah kedaluwarsa
	now := time.Now().UTC()
	if status == "expired" || (expiresAt != nil && expiresAt.Before(now)) {
		return errors.New("subgrup telah kedaluwarsa dan terkunci")
	}

	// 3. Strict Parent-Membership Gate: Pengguna WAJIB anggota aktif di grup induk
	isParentMember, err := s.IsParentMember(parentID, userID)
	if err != nil {
		return err
	}
	if !isParentMember {
		return ErrUnauthorizedGroup
	}

	// 4. Access Control: Jika subgrup privat, tolak direct join dan instruksikan meminta izin
	if !isPublic {
		var isMemberCount int
		var checkQ string
		if s.driverName == "postgres" {
			checkQ = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`
		} else {
			checkQ = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = ?`
		}
		_ = s.db.QueryRowContext(ctx, checkQ, subGroupID, userID).Scan(&isMemberCount)
		if isMemberCount > 0 {
			return ErrAlreadyGroupMember
		}
		return errors.New("subgrup ini bersifat privat. Silakan ajukan izin bergabung")
	}

	// 5. Masukkan ke conversation_members subgrup
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

	_, err = s.db.ExecContext(ctx, insertQuery, subGroupID, userID, now)
	return err
}

// RequestToJoinSubGroup mengajukan permohonan bergabung ke subgrup privat.
func (s *SQLGroupStore) RequestToJoinSubGroup(subGroupID, userID string) error {
	subGroupID = strings.TrimSpace(subGroupID)
	userID = strings.TrimSpace(userID)
	if subGroupID == "" || userID == "" {
		return errors.New("subGroupID dan userID wajib diisi")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Cek subgrup (parent_id, status, expires_at, is_public)
	var parentID string
	var status string
	var expiresAt *time.Time
	var isPublic bool
	var query string
	if s.driverName == "postgres" {
		query = `SELECT COALESCE(parent_id, ''), COALESCE(status, 'active'), expires_at, COALESCE(is_public, true) FROM conversations WHERE id = $1`
	} else {
		query = `SELECT COALESCE(parent_id, ''), COALESCE(status, 'active'), expires_at, COALESCE(is_public, 1) FROM conversations WHERE id = ?`
	}

	err := s.db.QueryRowContext(ctx, query, subGroupID).Scan(&parentID, &status, &expiresAt, &isPublic)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrGroupNotFound
	}
	if err != nil {
		return err
	}
	if parentID == "" {
		return errors.New("grup ini bukan subgrup")
	}

	// 2. Cek apakah subgrup expired
	now := time.Now().UTC()
	if status == "expired" || (expiresAt != nil && expiresAt.Before(now)) {
		return errors.New("subgrup telah kedaluwarsa dan terkunci")
	}

	// 3. Strict Parent-Membership Gate: Pemohon WAJIB anggota aktif grup induk
	isParentMember, err := s.IsParentMember(parentID, userID)
	if err != nil {
		return err
	}
	if !isParentMember {
		return ErrUnauthorizedGroup
	}

	// 4. Jika subgrup publik, user bisa langsung join
	if isPublic {
		return errors.New("subgrup ini bersifat terbuka, Anda dapat langsung bergabung")
	}

	// 5. Cek apakah user sudah menjadi anggota subgrup
	var isMemberCount int
	var memberCheckQuery string
	if s.driverName == "postgres" {
		memberCheckQuery = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`
	} else {
		memberCheckQuery = `SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = ?`
	}
	_ = s.db.QueryRowContext(ctx, memberCheckQuery, subGroupID, userID).Scan(&isMemberCount)
	if isMemberCount > 0 {
		return ErrAlreadyGroupMember
	}

	// 6. Cek status permohonan yang ada di conversation_join_requests
	var existingStatus string
	var reqCheckQuery string
	if s.driverName == "postgres" {
		reqCheckQuery = `SELECT status FROM conversation_join_requests WHERE conversation_id = $1 AND user_id = $2`
	} else {
		reqCheckQuery = `SELECT status FROM conversation_join_requests WHERE conversation_id = ? AND user_id = ?`
	}
	err = s.db.QueryRowContext(ctx, reqCheckQuery, subGroupID, userID).Scan(&existingStatus)
	if err == nil {
		if existingStatus == "pending" {
			return errors.New("permohonan bergabung Anda masih menunggu persetujuan admin")
		}
		// Jika statusnya sebelumnya 'rejected', perbarui kembali jadi 'pending'
		var updateReqQuery string
		if s.driverName == "postgres" {
			updateReqQuery = `UPDATE conversation_join_requests SET status = 'pending', updated_at = $1 WHERE conversation_id = $2 AND user_id = $3`
		} else {
			updateReqQuery = `UPDATE conversation_join_requests SET status = 'pending', updated_at = ? WHERE conversation_id = ? AND user_id = ?`
		}
		_, err = s.db.ExecContext(ctx, updateReqQuery, now, subGroupID, userID)
		return err
	}

	// 7. Insert permohonan baru
	reqID := fmt.Sprintf("req_%s", uuid.New().String())
	var insertReqQuery string
	if s.driverName == "postgres" {
		insertReqQuery = `
			INSERT INTO conversation_join_requests (id, conversation_id, user_id, status, reviewed_by, created_at, updated_at)
			VALUES ($1, $2, $3, 'pending', '', $4, $5)
			ON CONFLICT (conversation_id, user_id) DO UPDATE SET status = 'pending', updated_at = $5
		`
	} else {
		insertReqQuery = `
			INSERT OR REPLACE INTO conversation_join_requests (id, conversation_id, user_id, status, reviewed_by, created_at, updated_at)
			VALUES (?, ?, ?, 'pending', '', ?, ?)
		`
	}
	_, err = s.db.ExecContext(ctx, insertReqQuery, reqID, subGroupID, userID, now, now)
	return err
}

// GetPendingJoinRequests mengambil permohonan bergabung subgrup yang masih pending bagi admin/creator.
func (s *SQLGroupStore) GetPendingJoinRequests(subGroupID, adminUserID string) ([]JoinRequestItem, error) {
	subGroupID = strings.TrimSpace(subGroupID)
	adminUserID = strings.TrimSpace(adminUserID)
	if subGroupID == "" || adminUserID == "" {
		return nil, errors.New("subGroupID dan adminUserID wajib diisi")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Ambil parent_id dari subgrup
	var parentID string
	var q string
	if s.driverName == "postgres" {
		q = `SELECT COALESCE(parent_id, '') FROM conversations WHERE id = $1`
	} else {
		q = `SELECT COALESCE(parent_id, '') FROM conversations WHERE id = ?`
	}
	err := s.db.QueryRowContext(ctx, q, subGroupID).Scan(&parentID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, err
	}

	// 2. Cek otorisasi: apakah adminUserID adalah creator/admin di subGroupID atau di parentID
	subRole, _ := s.GetUserRoleInGroup(subGroupID, adminUserID)
	parentRole, _ := s.GetUserRoleInGroup(parentID, adminUserID)
	isAuth := subRole == "creator" || subRole == "admin" || parentRole == "creator" || parentRole == "admin"
	if !isAuth {
		return nil, ErrUnauthorizedGroup
	}

	// 3. Query pending requests dengan identitas user pemohon
	var query string
	if s.driverName == "postgres" {
		query = `
			SELECT 
				cjr.id, cjr.conversation_id, cjr.user_id,
				u.username, COALESCE(u.display_name, u.username), COALESCE(u.avatar_url, ''),
				COALESCE(u.is_verified, false), cjr.status, cjr.created_at
			FROM conversation_join_requests cjr
			JOIN users u ON cjr.user_id = u.id
			WHERE cjr.conversation_id = $1 AND cjr.status = 'pending'
			ORDER BY cjr.created_at ASC
		`
	} else {
		query = `
			SELECT 
				cjr.id, cjr.conversation_id, cjr.user_id,
				u.username, COALESCE(u.display_name, u.username), COALESCE(u.avatar_url, ''),
				COALESCE(u.is_verified, 0), cjr.status, cjr.created_at
			FROM conversation_join_requests cjr
			JOIN users u ON cjr.user_id = u.id
			WHERE cjr.conversation_id = ? AND cjr.status = 'pending'
			ORDER BY cjr.created_at ASC
		`
	}

	rows, err := s.db.QueryContext(ctx, query, subGroupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []JoinRequestItem
	for rows.Next() {
		var item JoinRequestItem
		var isVerifiedVal sql.NullBool
		var isVerifiedInt sql.NullInt64

		if s.driverName == "postgres" {
			if err := rows.Scan(
				&item.ID, &item.ConversationID, &item.UserID,
				&item.Username, &item.DisplayName, &item.AvatarURL,
				&isVerifiedVal, &item.Status, &item.CreatedAt,
			); err != nil {
				continue
			}
			item.IsVerified = isVerifiedVal.Valid && isVerifiedVal.Bool
		} else {
			if err := rows.Scan(
				&item.ID, &item.ConversationID, &item.UserID,
				&item.Username, &item.DisplayName, &item.AvatarURL,
				&isVerifiedInt, &item.Status, &item.CreatedAt,
			); err != nil {
				continue
			}
			item.IsVerified = isVerifiedInt.Valid && isVerifiedInt.Int64 == 1
		}
		requests = append(requests, item)
	}

	return requests, nil
}

// RespondJoinRequest menyetujui (approve) atau menolak (reject) permohonan bergabung ke subgrup privat.
// Mengembalikan targetUserID dari pemohon agar sistem dapat mengirimkan notifikasi balik.
func (s *SQLGroupStore) RespondJoinRequest(subGroupID, requestID, adminUserID string, approve bool) (string, error) {
	subGroupID = strings.TrimSpace(subGroupID)
	requestID = strings.TrimSpace(requestID)
	adminUserID = strings.TrimSpace(adminUserID)
	if subGroupID == "" || requestID == "" || adminUserID == "" {
		return "", errors.New("subGroupID, requestID, dan adminUserID wajib diisi")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Ambil parent_id dari subgrup
	var parentID string
	var q string
	if s.driverName == "postgres" {
		q = `SELECT COALESCE(parent_id, '') FROM conversations WHERE id = $1`
	} else {
		q = `SELECT COALESCE(parent_id, '') FROM conversations WHERE id = ?`
	}
	err := s.db.QueryRowContext(ctx, q, subGroupID).Scan(&parentID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrGroupNotFound
	}
	if err != nil {
		return "", err
	}

	// 2. Cek otorisasi admin/creator
	subRole, _ := s.GetUserRoleInGroup(subGroupID, adminUserID)
	parentRole, _ := s.GetUserRoleInGroup(parentID, adminUserID)
	isAuth := subRole == "creator" || subRole == "admin" || parentRole == "creator" || parentRole == "admin"
	if !isAuth {
		return "", ErrUnauthorizedGroup
	}

	// 3. Ambil data request
	var reqConvID, targetUserID, currentStatus string
	var reqQuery string
	if s.driverName == "postgres" {
		reqQuery = `SELECT conversation_id, user_id, status FROM conversation_join_requests WHERE id = $1 AND conversation_id = $2`
	} else {
		reqQuery = `SELECT conversation_id, user_id, status FROM conversation_join_requests WHERE id = ? AND conversation_id = ?`
	}
	err = s.db.QueryRowContext(ctx, reqQuery, requestID, subGroupID).Scan(&reqConvID, &targetUserID, &currentStatus)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errors.New("permohonan bergabung tidak ditemukan")
	}
	if err != nil {
		return "", err
	}
	if currentStatus != "pending" {
		return "", fmt.Errorf("permohonan bergabung sudah diproses sebelumnya (status: %s)", currentStatus)
	}

	now := time.Now().UTC()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("gagal memulai transaksi: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	newStatus := "rejected"
	if approve {
		newStatus = "approved"
	}

	// 4. Update status request
	var updateReqQ string
	if s.driverName == "postgres" {
		updateReqQ = `UPDATE conversation_join_requests SET status = $1, reviewed_by = $2, updated_at = $3 WHERE id = $4`
	} else {
		updateReqQ = `UPDATE conversation_join_requests SET status = ?, reviewed_by = ?, updated_at = ? WHERE id = ?`
	}
	_, err = tx.ExecContext(ctx, updateReqQ, newStatus, adminUserID, now, requestID)
	if err != nil {
		return "", fmt.Errorf("gagal update status permohonan: %w", err)
	}

	// 5. Jika disetujui, masukkan ke conversation_members
	if approve {
		var insertMemberQ string
		if s.driverName == "postgres" {
			insertMemberQ = `
				INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
				VALUES ($1, $2, 'member', $3)
				ON CONFLICT (conversation_id, user_id) DO NOTHING
			`
		} else {
			insertMemberQ = `
				INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at)
				VALUES (?, ?, 'member', ?)
			`
		}
		_, err = tx.ExecContext(ctx, insertMemberQ, subGroupID, targetUserID, now)
		if err != nil {
			return "", fmt.Errorf("gagal menambahkan anggota ke subgrup: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}
	return targetUserID, nil
}

// GetSubGroupAdmins mengembalikan daftar userID dari pembuat (creator) dan admin yang terdaftar sebagai anggota subgrup tersebut.
// Pengecekan ini strictly scoped: admin grup induk yang tidak bergabung ke subgrup TIDAK akan masuk ke daftar ini.
func (s *SQLGroupStore) GetSubGroupAdmins(subGroupID string) ([]string, error) {
	subGroupID = strings.TrimSpace(subGroupID)
	if subGroupID == "" {
		return nil, errors.New("subGroupID tidak boleh kosong")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var query string
	if s.driverName == "postgres" {
		query = `
			SELECT user_id FROM conversation_members 
			WHERE conversation_id = $1 AND role IN ('creator', 'admin')
			UNION
			SELECT created_by FROM conversations 
			WHERE id = $1 AND created_by IS NOT NULL AND created_by != ''
		`
	} else {
		query = `
			SELECT user_id FROM conversation_members 
			WHERE conversation_id = ? AND role IN ('creator', 'admin')
			UNION
			SELECT created_by FROM conversations 
			WHERE id = ? AND created_by IS NOT NULL AND created_by != ''
		`
	}

	var rows *sql.Rows
	var err error
	if s.driverName == "postgres" {
		rows, err = s.db.QueryContext(ctx, query, subGroupID)
	} else {
		rows, err = s.db.QueryContext(ctx, query, subGroupID, subGroupID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var adminIDs []string
	seen := make(map[string]bool)
	for rows.Next() {
		var uid string
		if err := rows.Scan(&uid); err == nil && uid != "" {
			if !seen[uid] {
				seen[uid] = true
				adminIDs = append(adminIDs, uid)
			}
		}
	}
	return adminIDs, nil
}

// ExpireSubGroupsBatchDetailed mencari dan memperbarui seluruh subgrup yang kedaluwarsa menjadi 'expired',
// mengembalikan daftar ID dan parent_id (group_id) yang terdampak, serta membersihkan join request.
func (s *SQLGroupStore) ExpireSubGroupsBatchDetailed() ([]ExpiredSubGroupItem, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	now := time.Now().UTC()
	var selectQuery string
	if s.driverName == "postgres" {
		selectQuery = `
			SELECT id, parent_id FROM conversations
			WHERE parent_id IS NOT NULL 
			  AND parent_id != ''
			  AND (status = 'active' OR status IS NULL)
			  AND expires_at IS NOT NULL 
			  AND expires_at <= $1
		`
	} else {
		selectQuery = `
			SELECT id, parent_id FROM conversations
			WHERE parent_id IS NOT NULL 
			  AND parent_id != ''
			  AND (status = 'active' OR status IS NULL)
			  AND expires_at IS NOT NULL 
			  AND expires_at <= ?
		`
	}

	rows, err := s.db.QueryContext(ctx, selectQuery, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var expiredList []ExpiredSubGroupItem
	for rows.Next() {
		var item ExpiredSubGroupItem
		if err := rows.Scan(&item.ID, &item.ParentID); err != nil {
			return nil, err
		}
		expiredList = append(expiredList, item)
	}

	if len(expiredList) == 0 {
		return nil, nil
	}

	var updateQuery string
	if s.driverName == "postgres" {
		updateQuery = `
			UPDATE conversations
			SET status = 'expired', updated_at = $1
			WHERE parent_id IS NOT NULL 
			  AND parent_id != ''
			  AND (status = 'active' OR status IS NULL)
			  AND expires_at IS NOT NULL 
			  AND expires_at <= $1
		`
	} else {
		updateQuery = `
			UPDATE conversations
			SET status = 'expired', updated_at = ?
			WHERE parent_id IS NOT NULL 
			  AND parent_id != ''
			  AND (status = 'active' OR status IS NULL)
			  AND expires_at IS NOT NULL 
			  AND expires_at <= ?
		`
	}

	if s.driverName == "postgres" {
		_, err = s.db.ExecContext(ctx, updateQuery, now)
	} else {
		_, err = s.db.ExecContext(ctx, updateQuery, now, now)
	}
	if err != nil {
		return nil, err
	}

	// Purge seluruh permohonan join request dari subgrup yang berstatus 'expired'
	purgeQuery := `
		DELETE FROM conversation_join_requests 
		WHERE conversation_id IN (
			SELECT id FROM conversations WHERE parent_id IS NOT NULL AND parent_id != '' AND status = 'expired'
		)
	`
	_, _ = s.db.ExecContext(ctx, purgeQuery)

	return expiredList, nil
}

// ExpireSubGroupsBatch memperbarui seluruh subgrup yang telah melewati masa expires_at menjadi status 'expired'
// dan otomatis menghapus seluruh permohonan join request dari subgrup yang telah kedaluwarsa.
func (s *SQLGroupStore) ExpireSubGroupsBatch() (int, error) {
	list, err := s.ExpireSubGroupsBatchDetailed()
	return len(list), err
}

// ExpireSubGroupNow mengatur expires_at suatu subgrup ke waktu lampau untuk memfasilitasi bypass TTL testing / admin force expire.
func (s *SQLGroupStore) ExpireSubGroupNow(subGroupID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	past := time.Now().UTC().Add(-1 * time.Second)
	var query string
	if s.driverName == "postgres" {
		query = `UPDATE conversations SET expires_at = $1 WHERE id = $2 AND parent_id IS NOT NULL AND parent_id != ''`
	} else {
		query = `UPDATE conversations SET expires_at = ? WHERE id = ? AND parent_id IS NOT NULL AND parent_id != ''`
	}
	_, err := s.db.ExecContext(ctx, query, past, subGroupID)
	return err
}
