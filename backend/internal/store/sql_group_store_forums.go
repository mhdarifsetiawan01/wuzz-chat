package store

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strconv"
	"strings"
	"time"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
)

// maxUserForums membatasi respons "Forum saya"; cukup untuk pemakaian wajar dan menjaga ukuran payload.
const maxUserForums = 300

// GetUserForumsWithContext mengembalikan forum tempat user menjadi anggota topik ("Forum saya"),
// aktif maupun sudah berakhir.
//
// Isolasi tenant: forum dan grup induknya wajib satu tenant dengan tenant request, dan keanggotaan
// dicek pada topik DAN grup induk (user yang sudah keluar dari grup induk tidak lagi melihat topiknya).
// Seperti daftar obrolan, untuk tenant "default" tenant asli user dicari dari tabel users.
func (s *SQLGroupStore) GetUserForumsWithContext(ctx context.Context, userID string) ([]UserForumItem, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, errors.New("userID wajib diisi")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	tenantExpr := "?"
	tenantArg := tenantID
	if tenantID == tenantshared.DefaultTenantID {
		tenantExpr = `COALESCE(NULLIF((SELECT tenant_id FROM users WHERE id = ?), ''), 'default')`
		tenantArg = userID
	}

	query := `
		SELECT
			c.id, c.parent_id, COALESCE(p.title, ''), COALESCE(p.avatar_url, ''),
			COALESCE(c.title, ''), COALESCE(c.description, ''),
			c.expires_at, c.created_at, COALESCE(c.status, 'active'),
			COALESCE(c.is_public, true),
			COALESCE(cm.role, 'member'),
			(SELECT COUNT(*) FROM conversation_members mc WHERE mc.conversation_id = c.id),
            COALESCE(am.id, ''), COALESCE(pm.role, 'member'),
            COALESCE(j.status, ''), COALESCE(d.status, ''), COALESCE(d.id, '')
		FROM conversations c
		JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
		JOIN conversations p ON p.id = c.parent_id AND COALESCE(p.tenant_id, 'default') = COALESCE(c.tenant_id, 'default')
		JOIN conversation_members pm ON pm.conversation_id = p.id AND pm.user_id = ?
        LEFT JOIN forum_memory_jobs j ON j.forum_id = c.id AND j.group_id = p.id
            AND j.tenant_id = COALESCE(c.tenant_id, 'default')
        LEFT JOIN memory_drafts d ON d.job_id = j.id AND d.forum_id = c.id AND d.group_id = p.id
            AND d.tenant_id = COALESCE(c.tenant_id, 'default')
        LEFT JOIN approved_memories am ON am.forum_id = c.id AND am.group_id = p.id
            AND am.tenant_id = COALESCE(c.tenant_id, 'default')
		WHERE COALESCE(c.tenant_id, 'default') = ` + tenantExpr + `
		  AND c.parent_id IS NOT NULL AND c.parent_id != ''
		ORDER BY c.created_at DESC
		LIMIT ` + strconv.Itoa(maxUserForums)

	rows, err := s.db.QueryContext(ctx, s.rebindForums(query), userID, userID, tenantArg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	now := time.Now().UTC()
	items := make([]UserForumItem, 0)
	for rows.Next() {
		var item UserForumItem
		var expiresAt *time.Time
		var isPublic sql.NullBool
		if err := rows.Scan(
			&item.ID, &item.ParentID, &item.ParentTitle, &item.ParentAvatarURL,
			&item.Title, &item.Description,
			&expiresAt, &item.CreatedAt, &item.Status,
			&isPublic, &item.MyRole, &item.MemberCount, &item.MemoryID, &item.ParentRole,
			&item.JobStatus, &item.DraftStatus, &item.PendingDraftID,
		); err != nil {
			return nil, err
		}
		item.IsPublic = !isPublic.Valid || isPublic.Bool
		item.HasApprovedMemory = item.MemoryID != ""
		item.ExpiresAt = expiresAt
		item.IsActive = item.Status == "active" && (expiresAt == nil || expiresAt.After(now))
		if item.IsActive && expiresAt != nil {
			item.RemainingSeconds = int64(expiresAt.Sub(now).Seconds())
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Aktif lebih dulu; di dalam kelompok, yang terbaru dibuat di atas (urutan SQL dipertahankan).
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].IsActive && !items[j].IsActive
	})
	return items, nil
}

func (s *SQLGroupStore) rebindForums(query string) string {
	if s.driverName != "postgres" {
		return query
	}
	var b strings.Builder
	n := 0
	for _, r := range query {
		if r == '?' {
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// ApplyMemoryVisibility projects internal lifecycle data into the viewer-safe API contract.
// The parent membership role is authoritative for review, independently of the forum role.
func (f *UserForumItem) ApplyMemoryVisibility(enabled bool) {
	f.MemoryEnabled = enabled
	f.DraftID = ""
	f.MemoryState = "ended"
	if f.IsActive {
		f.MemoryState = "active"
		f.MemoryID = ""
		return
	}
	if !enabled {
		f.MemoryID = ""
		return
	}
	admin := f.ParentRole == "admin" || f.ParentRole == "creator"
	switch {
	case f.MemoryID != "":
		f.MemoryState = "published"
	case f.DraftStatus == "DRAFT":
		f.MemoryState = "under_review"
		if admin {
			f.MemoryState = "review_required"
			f.DraftID = f.PendingDraftID
		}
	case f.DraftStatus == "REJECTED":
		if admin {
			f.MemoryState = "rejected"
		}
	case f.JobStatus == "QUEUED" || f.JobStatus == "PROCESSING":
		f.MemoryState = "processing"
	case f.JobStatus == "FAILED":
		f.MemoryState = "failed"
	}
}
