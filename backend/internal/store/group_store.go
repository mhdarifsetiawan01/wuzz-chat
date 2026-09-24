package store

import (
	"context"
	"errors"
	"time"
)

// ─── Error Sentinels ─────────────────────────────────────────────────────────

var (
	ErrGroupNotFound       = errors.New("grup tidak ditemukan")
	ErrUnauthorizedGroup   = errors.New("anda tidak memiliki izin untuk tindakan ini di grup")
	ErrGroupUsernameTaken  = errors.New("username grup sudah digunakan oleh grup lain")
	ErrCannotKickCreator   = errors.New("pembuat grup (creator) tidak dapat dikeluarkan")
	ErrCannotDemoteCreator = errors.New("role pembuat grup (creator) tidak dapat diubah")
	ErrAlreadyGroupMember  = errors.New("user sudah menjadi anggota grup ini")
	ErrNotPublicGroup      = errors.New("grup ini adalah grup privat")
)

// ─── Entity Types ─────────────────────────────────────────────────────────────

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
	TenantID      string            `json:"tenant_id,omitempty"`
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
	Status        string            `json:"status,omitempty"`
	ExpiresAt     *time.Time        `json:"expires_at,omitempty"`
	AISummary     string            `json:"ai_summary,omitempty"`
	Members       []GroupMemberItem `json:"members,omitempty"`
}

// SubGroupItem merepresentasikan ringkasan subgrup aktif di bawah grup induk.
type SubGroupItem struct {
	ID                   string     `json:"id"`
	ParentID             string     `json:"parent_id"`
	Title                string     `json:"title"`
	Description          string     `json:"description"`
	MemberCount          int        `json:"member_count"`
	ExpiresAt            *time.Time `json:"expires_at"`
	RemainingSeconds     int64      `json:"remaining_seconds"`
	CreatedBy            string     `json:"created_by"`
	CreatedAt            time.Time  `json:"created_at"`
	Status               string     `json:"status"`
	IsMember             bool       `json:"is_member"`
	IsPublic             bool       `json:"is_public"`
	HasPendingRequest    bool       `json:"has_pending_request"`
	PendingRequestsCount int        `json:"pending_requests_count,omitempty"`
}

// JoinRequestItem merepresentasikan permohonan bergabung ke subgrup privat.
type JoinRequestItem struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	UserID         string    `json:"user_id"`
	Username       string    `json:"username"`
	DisplayName    string    `json:"display_name"`
	AvatarURL      string    `json:"avatar_url"`
	IsVerified     bool      `json:"is_verified"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
}

// ExpiredSubGroupItem merepresentasikan forum dan parent group yang kedaluwarsa.
type ExpiredSubGroupItem struct {
	ID       string `json:"id"`
	ParentID string `json:"parent_id"`
}

// ─── GroupStore Interface ──────────────────────────────────────────────────────

// GroupStore mendefinisikan operasi pengelolaan grup dan subgrup.
// SQL implementation tersedia via SQLGroupStore (lihat: sql_group_store.go).
type GroupStore interface {
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
	// Milestone 8.2B: Ephemeral Sub-Groups & TTL Lifecycle
	CreateSubGroup(parentID, title, description, creatorID, duration string, isPublic bool) (*GroupDetails, error)
	CreateSubGroupWithContext(ctx context.Context, parentID, title, description, creatorID, duration string, isPublic bool) (*GroupDetails, error)
	GetActiveSubGroups(parentID, currentUserID string) ([]SubGroupItem, error)
	GetActiveSubGroupsWithContext(ctx context.Context, parentID, currentUserID string) ([]SubGroupItem, error)
	IsParentMember(parentID, userID string) (bool, error)
	JoinSubGroup(subGroupID, userID string) error
	RequestToJoinSubGroup(subGroupID, userID string) error
	GetPendingJoinRequests(subGroupID, adminUserID string) ([]JoinRequestItem, error)
	RespondJoinRequest(subGroupID, requestID, adminUserID string, approve bool) (string, error)
	GetSubGroupAdmins(subGroupID string) ([]string, error)
	ExpireSubGroupsBatch() (int, error)
	ExpireSubGroupsBatchDetailed() ([]ExpiredSubGroupItem, error)
	ExpireSubGroupNow(subGroupID string) error
}
