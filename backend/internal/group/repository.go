package group

import "context"

// GroupRepository mendefinisikan kontrak persistensi untuk operasi grup dan subgrup.
type GroupRepository interface {
	// Operasi Grup Persisten
	CreateGroup(title, description, avatarURL, creatorID, groupUsername string, isPublic bool, memberIDs []string) (*GroupDetails, error)
	CreateGroupWithContext(ctx context.Context, title, description, avatarURL, creatorID, groupUsername string, isPublic bool, memberIDs []string) (*GroupDetails, error)
	GetGroupDetails(conversationID, currentUserID string) (*GroupDetails, error)
	GetGroupMembers(conversationID string) ([]GroupMemberItem, error)
	JoinPublicGroup(conversationID, userID string) error
	AddGroupMembers(conversationID, actorUserID string, userIDs []string) error
	RemoveGroupMember(conversationID, actorUserID, targetUserID string) error
	UpdateMemberRole(conversationID, actorUserID, targetUserID, newRole string) error
	UpdateGroupInfo(conversationID, actorUserID, title, description, avatarURL string, isPublic *bool, groupUsername *string) error
	SearchPublicGroups(query string, limit int) ([]GroupDetails, error)
	SearchPublicGroupsWithContext(ctx context.Context, query string, limit int) ([]GroupDetails, error)
	GetUserRoleInGroup(conversationID, userID string) (string, error)

	// Operasi Subgrup / Forum Ephemeral
	CreateSubGroup(parentID, title, description, creatorID, duration string, isPublic bool) (*GroupDetails, error)
	CreateSubGroupWithContext(ctx context.Context, parentID, title, description, creatorID, duration string, isPublic bool) (*GroupDetails, error)
	GetActiveSubGroups(parentID, currentUserID string) ([]SubGroupItem, error)
	IsParentMember(parentID, userID string) (bool, error)
	JoinSubGroup(subGroupID, userID string) error
	RequestToJoinSubGroup(subGroupID, userID string) error
	GetPendingJoinRequests(subGroupID, adminUserID string) ([]JoinRequestItem, error)
	RespondJoinRequest(subGroupID, requestID, adminUserID string, approve bool) (string, error)
	GetSubGroupAdmins(subGroupID string) ([]string, error)
	ExpireSubGroupsBatchDetailed() ([]ExpiredSubGroupItem, error)
	ExpireSubGroupNow(subGroupID string) error
}

// UserLookupRepository mendefinisikan operasi pembacaan profil pengguna.
type UserLookupRepository interface {
	GetUserByID(userID string) (*User, error)
}

