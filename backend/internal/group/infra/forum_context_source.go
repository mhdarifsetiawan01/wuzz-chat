// Package infra menyediakan implementasi ContextSource untuk domain group & forum.
package infra

import (
	"context"
	"errors"
	"fmt"

	"github.com/bms-del112/wuzz-chat/internal/group"
	"github.com/bms-del112/wuzz-chat/internal/memory"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// ForumContextSource mengimplementasikan memory.ContextSource untuk subgrup / forum ephemeral.
type ForumContextSource struct {
	groupRepo group.GroupRepository
	msgStore  store.MessageStore
}

// NewForumContextSource membuat instance baru ForumContextSource.
func NewForumContextSource(gr group.GroupRepository, ms store.MessageStore) *ForumContextSource {
	return &ForumContextSource{
		groupRepo: gr,
		msgStore:  ms,
	}
}

// Ensure interface compliance at compile time.
var _ memory.ContextSource = (*ForumContextSource)(nil)

// GetMessages mengambil riwayat pesan aktif dari forum untuk dianalisis oleh AI.
func (s *ForumContextSource) GetMessages(ctx context.Context, contextID string, limit int) ([]store.StoredMessage, error) {
	if s.msgStore == nil {
		return nil, errors.New("message store belum diinisialisasi pada ForumContextSource")
	}
	rawMsgs, err := s.msgStore.GetRoomHistory(contextID, limit)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil pesan riwayat forum: %w", err)
	}

	// Filter pesan yang belum dihapus
	validMsgs := make([]store.StoredMessage, 0, len(rawMsgs))
	for _, m := range rawMsgs {
		if !m.IsDeleted {
			validMsgs = append(validMsgs, m)
		}
	}
	return validMsgs, nil
}

// GetContextMeta mengambil metadata forum dan grup induknya.
func (s *ForumContextSource) GetContextMeta(ctx context.Context, contextID string) (*memory.MemoryContext, error) {
	if s.groupRepo == nil {
		return &memory.MemoryContext{
			ContextID:   contextID,
			ContextType: memory.ContextTypeForum,
			Title:       "Forum Diskusi",
		}, nil
	}

	details, err := s.groupRepo.GetGroupDetails(contextID, "")
	if err != nil || details == nil {
		return &memory.MemoryContext{
			ContextID:   contextID,
			ContextType: memory.ContextTypeForum,
			Title:       "Forum Diskusi",
		}, nil
	}

	parentID := details.ParentID
	title := details.Title
	if title == "" {
		title = "Forum Diskusi"
	}

	// Ambil daftar admin subgrup
	owners, _ := s.groupRepo.GetSubGroupAdmins(contextID)
	if len(owners) == 0 && details.CreatedBy != "" {
		owners = []string{details.CreatedBy}
	}

	return &memory.MemoryContext{
		ContextID:   contextID,
		ContextType: memory.ContextTypeForum,
		ParentID:    parentID,
		OwnerIDs:    owners,
		Title:       title,
	}, nil
}

// GetAuthorizedViewers memverifikasi apakah viewerID berhak melihat rekaman memori forum ini.
func (s *ForumContextSource) GetAuthorizedViewers(ctx context.Context, contextID, viewerID string) (bool, error) {
	if s.groupRepo == nil {
		return false, errors.New("group repository belum diinisialisasi")
	}

	// 1. Cek apakah user adalah anggota langsung dari forum/subgrup
	role, err := s.groupRepo.GetUserRoleInGroup(contextID, viewerID)
	if err == nil && role != "" {
		return true, nil
	}

	// 2. Jika bukan anggota langsung, cek apakah user anggota dari parent group
	details, err := s.groupRepo.GetGroupDetails(contextID, "")
	if err == nil && details != nil && details.ParentID != "" {
		isParentMember, errParent := s.groupRepo.IsParentMember(details.ParentID, viewerID)
		if errParent == nil && isParentMember {
			return true, nil
		}
	}

	return false, nil
}
