// Package infra menyediakan implementasi infrastruktur untuk domain group.
// Menggunakan Strangler Fig Adapter membungkus store.GroupStore & store.UserStore.
package infra

import (
	"errors"

	"github.com/bms-del112/wuzz-chat/internal/group"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// SQLGroupRepository mengimplementasikan group.GroupRepository dan group.UserLookupRepository.
type SQLGroupRepository struct {
	groupStore store.GroupStore
	userStore  store.UserStore
}

// NewSQLGroupRepository membuat instance baru SQLGroupRepository.
func NewSQLGroupRepository(gs store.GroupStore, us store.UserStore) *SQLGroupRepository {
	return &SQLGroupRepository{
		groupStore: gs,
		userStore:  us,
	}
}

// Ensure interface compliance at compile time.
var (
	_ group.GroupRepository      = (*SQLGroupRepository)(nil)
	_ group.UserLookupRepository = (*SQLGroupRepository)(nil)
)

func (r *SQLGroupRepository) CreateGroup(title, description, avatarURL, creatorID, groupUsername string, isPublic bool, memberIDs []string) (*group.GroupDetails, error) {
	if r.groupStore == nil {
		return nil, errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.CreateGroup(title, description, avatarURL, creatorID, groupUsername, isPublic, memberIDs)
}

func (r *SQLGroupRepository) GetGroupDetails(conversationID, currentUserID string) (*group.GroupDetails, error) {
	if r.groupStore == nil {
		return nil, errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.GetGroupDetails(conversationID, currentUserID)
}

func (r *SQLGroupRepository) GetGroupMembers(conversationID string) ([]group.GroupMemberItem, error) {
	if r.groupStore == nil {
		return nil, errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.GetGroupMembers(conversationID)
}

func (r *SQLGroupRepository) JoinPublicGroup(conversationID, userID string) error {
	if r.groupStore == nil {
		return errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.JoinPublicGroup(conversationID, userID)
}

func (r *SQLGroupRepository) AddGroupMembers(conversationID, actorUserID string, userIDs []string) error {
	if r.groupStore == nil {
		return errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.AddGroupMembers(conversationID, actorUserID, userIDs)
}

func (r *SQLGroupRepository) RemoveGroupMember(conversationID, actorUserID, targetUserID string) error {
	if r.groupStore == nil {
		return errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.RemoveGroupMember(conversationID, actorUserID, targetUserID)
}

func (r *SQLGroupRepository) UpdateMemberRole(conversationID, actorUserID, targetUserID, newRole string) error {
	if r.groupStore == nil {
		return errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.UpdateMemberRole(conversationID, actorUserID, targetUserID, newRole)
}

func (r *SQLGroupRepository) UpdateGroupInfo(conversationID, actorUserID, title, description, avatarURL string, isPublic *bool, groupUsername *string) error {
	if r.groupStore == nil {
		return errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.UpdateGroupInfo(conversationID, actorUserID, title, description, avatarURL, isPublic, groupUsername)
}

func (r *SQLGroupRepository) SearchPublicGroups(query string, limit int) ([]group.GroupDetails, error) {
	if r.groupStore == nil {
		return nil, errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.SearchPublicGroups(query, limit)
}

func (r *SQLGroupRepository) GetUserRoleInGroup(conversationID, userID string) (string, error) {
	if r.groupStore == nil {
		return "", errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.GetUserRoleInGroup(conversationID, userID)
}

func (r *SQLGroupRepository) CreateSubGroup(parentID, title, description, creatorID, duration string, isPublic bool) (*group.GroupDetails, error) {
	if r.groupStore == nil {
		return nil, errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.CreateSubGroup(parentID, title, description, creatorID, duration, isPublic)
}

func (r *SQLGroupRepository) GetActiveSubGroups(parentID, currentUserID string) ([]group.SubGroupItem, error) {
	if r.groupStore == nil {
		return nil, errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.GetActiveSubGroups(parentID, currentUserID)
}

func (r *SQLGroupRepository) IsParentMember(parentID, userID string) (bool, error) {
	if r.groupStore == nil {
		return false, errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.IsParentMember(parentID, userID)
}

func (r *SQLGroupRepository) JoinSubGroup(subGroupID, userID string) error {
	if r.groupStore == nil {
		return errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.JoinSubGroup(subGroupID, userID)
}

func (r *SQLGroupRepository) RequestToJoinSubGroup(subGroupID, userID string) error {
	if r.groupStore == nil {
		return errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.RequestToJoinSubGroup(subGroupID, userID)
}

func (r *SQLGroupRepository) GetPendingJoinRequests(subGroupID, adminUserID string) ([]group.JoinRequestItem, error) {
	if r.groupStore == nil {
		return nil, errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.GetPendingJoinRequests(subGroupID, adminUserID)
}

func (r *SQLGroupRepository) RespondJoinRequest(subGroupID, requestID, adminUserID string, approve bool) (string, error) {
	if r.groupStore == nil {
		return "", errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.RespondJoinRequest(subGroupID, requestID, adminUserID, approve)
}

func (r *SQLGroupRepository) GetSubGroupAdmins(subGroupID string) ([]string, error) {
	if r.groupStore == nil {
		return nil, errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.GetSubGroupAdmins(subGroupID)
}

func (r *SQLGroupRepository) ExpireSubGroupsBatchDetailed() ([]group.ExpiredSubGroupItem, error) {
	if r.groupStore == nil {
		return nil, errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.ExpireSubGroupsBatchDetailed()
}

func (r *SQLGroupRepository) ExpireSubGroupNow(subGroupID string) error {
	if r.groupStore == nil {
		return errors.New("group store belum diinisialisasi")
	}
	return r.groupStore.ExpireSubGroupNow(subGroupID)
}

func (r *SQLGroupRepository) GetUserByID(userID string) (*group.User, error) {
	if r.userStore == nil {
		return nil, errors.New("user store belum diinisialisasi")
	}
	return r.userStore.GetUserByID(userID)
}
