package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
)

var ErrSourceUnavailable = errors.New("pesan sumber tidak tersedia")

// MessageContextReader is optional: stores without a secure implementation fail closed.
type MessageContextReader interface {
	GetMessageContext(context.Context, string, string, string) ([]StoredMessage, error)
}

// GetMessageContext reads a bounded forum window. Memory access never grants forum access.
// Messages inherit tenant isolation from their conversation (messages has no tenant column).
func (s *SQLMessageStore) GetMessageContext(ctx context.Context, roomID, userID, messageID string) ([]StoredMessage, error) {
	if !strings.HasPrefix(roomID, "sub_") || userID == "" || messageID == "" {
		return nil, ErrSourceUnavailable
	}
	query := `WITH anchor AS (
 SELECT m.id, m.created_at FROM messages m
 JOIN conversations c ON c.id = m.room_id AND c.tenant_id = ?
 JOIN users u ON u.id = ? AND u.tenant_id = c.tenant_id
 JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = u.id
 JOIN conversations p ON p.id = c.parent_id AND p.tenant_id = c.tenant_id
 JOIN conversation_members pm ON pm.conversation_id = p.id AND pm.user_id = u.id
 WHERE m.room_id = ? AND m.id = ? AND COALESCE(m.is_deleted, FALSE) = FALSE
 AND (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
), older AS (
 SELECT m.* FROM messages m JOIN anchor a ON 1=1
 WHERE m.room_id = ? AND (m.created_at < a.created_at OR (m.created_at = a.created_at AND m.id < a.id))
 ORDER BY m.created_at DESC, m.id DESC LIMIT 20
), newer AS (
 SELECT m.* FROM messages m JOIN anchor a ON 1=1
 WHERE m.room_id = ? AND (m.created_at > a.created_at OR (m.created_at = a.created_at AND m.id > a.id))
 ORDER BY m.created_at ASC, m.id ASC LIMIT 20
), source_window AS (
 SELECT * FROM older UNION ALL SELECT * FROM newer UNION ALL
 SELECT m.* FROM messages m JOIN anchor a ON m.id = a.id
)
SELECT m.id, m.room_id, m.from_id, m.from_nickname, m.to_id, m.content,
 COALESCE(m.status, 'sent'), COALESCE(m.reply_to_id, ''), COALESCE(m.reply_to_nickname, ''), COALESCE(m.reply_to_content, ''), COALESCE(m.reactions, '[]'),
 COALESCE(m.media_url, ''), COALESCE(m.media_type, ''), COALESCE(m.file_name, ''), COALESCE(m.file_size, 0), COALESCE(m.media_status, 'active'),
 COALESCE(m.is_deleted, FALSE), COALESCE(m.deleted_for_users, '[]'), COALESCE(m.mentions, '[]'),
 COALESCE(m.is_edited, FALSE), m.edited_at, COALESCE(m.is_forwarded, FALSE), m.created_at
FROM source_window m JOIN conversation_members cm ON cm.conversation_id = m.room_id AND cm.user_id = ?
WHERE (cm.cleared_at IS NULL OR m.created_at > cm.cleared_at)
ORDER BY m.created_at ASC, m.id ASC`
	tenantArg := tenantshared.MustFromContext(ctx).TenantID()
	if tenantArg == tenantshared.DefaultTenantID {
		// Match the existing Forum Saya contract: default context resolves the authenticated user's tenant.
		query = strings.Replace(query, "c.tenant_id = ?", "c.tenant_id = (SELECT tenant_id FROM users WHERE id = ?)", 1)
		tenantArg = userID
	}
	if s.driverName == "postgres" {
		n := 0
		query = strings.ReplaceAll(query, "?", "PLACEHOLDER")
		for strings.Contains(query, "PLACEHOLDER") {
			n++
			query = strings.Replace(query, "PLACEHOLDER", fmt.Sprintf("$%d", n), 1)
		}
	}
	rows, err := s.db.QueryContext(ctx, query, tenantArg, userID, roomID, messageID, roomID, roomID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var history []StoredMessage
	for rows.Next() {
		var m StoredMessage
		var createdAt time.Time
		var status, replyToID, replyToNickname, replyToContent, reactions string
		var mediaURL, mediaType, fileName, mediaStatus string
		var fileSize int64
		var isDeleted bool
		var deletedForUsers, mentions string

		if err := rows.Scan(
			&m.ID,
			&m.RoomID,
			&m.FromID,
			&m.Nickname,
			&m.ToID,
			&m.Content,
			&status,
			&replyToID,
			&replyToNickname,
			&replyToContent,
			&reactions,
			&mediaURL,
			&mediaType,
			&fileName,
			&fileSize,
			&mediaStatus,
			&isDeleted,
			&deletedForUsers,
			&mentions,
			&m.IsEdited,
			&m.EditedAt,
			&m.IsForwarded,
			&createdAt,
		); err != nil {
			return nil, fmt.Errorf("gagal scan baris history: %w", err)
		}

		// Filter pesan jika user telah menghapus untuk diri sendiri (Delete for Me)
		if userID != "" && deletedForUsers != "" && deletedForUsers != "[]" {
			var delUsers []string
			if err := json.Unmarshal([]byte(deletedForUsers), &delUsers); err != nil {
				continue
			} else {
				skip := false
				for _, u := range delUsers {
					if u == userID {
						skip = true
						break
					}
				}
				if skip {
					continue
				}
			}
		}

		if isDeleted {
			continue
		}
		m.Status = status
		m.ReplyToID = replyToID
		m.ReplyToNickname = replyToNickname
		m.ReplyToContent = replyToContent
		m.Reactions = reactions
		m.MediaURL = mediaURL
		m.MediaType = mediaType
		m.FileName = fileName
		m.FileSize = fileSize
		m.MediaStatus = mediaStatus
		m.IsDeleted = isDeleted
		m.DeletedForUsers = ""
		m.Mentions = mentions
		m.Timestamp = createdAt.UTC()
		history = append(history, m)
	}

	if history == nil {
		history = []StoredMessage{}
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, m := range history {
		if m.ID == messageID && !m.IsDeleted {
			return history, nil
		}
	}
	return nil, ErrSourceUnavailable
}
