// Package group mengelola domain grup persisten dan subgrup/forum bertempo waktu (ephemeral).
// Mengikuti arsitektur 3-tier Pragmatic Modular Monolith:
//
//	Transport Layer (internal/api/group_handler.go)
//	       │
//	       ▼
//	Application Service (internal/group/service.go -> GroupService & ForumService)
//	       │
//	       ▼
//	Domain Layer (internal/group/repository.go, entity.go)
//	       ▲
//	       │
//	Infrastructure Adapter (internal/group/infra/sql_repository.go) -> store.GroupStore & store.UserStore
package group

import (
	"errors"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// ─── Role Constants ──────────────────────────────────────────────────────────

const (
	RoleCreator = "creator"
	RoleAdmin   = "admin"
	RoleMember  = "member"
)

// ─── Entity Type Aliases ─────────────────────────────────────────────────────

// GroupDetails merepresentasikan data lengkap sebuah grup.
type GroupDetails = store.GroupDetails

// GroupMemberItem merepresentasikan profil seorang anggota dalam grup.
type GroupMemberItem = store.GroupMemberItem

// SubGroupItem merepresentasikan ringkasan forum/subgrup di bawah grup induk.
type SubGroupItem = store.SubGroupItem

// JoinRequestItem merepresentasikan permohonan bergabung ke subgrup privat.
type JoinRequestItem = store.JoinRequestItem

// ExpiredSubGroupItem merepresentasikan forum yang kedaluwarsa beserta grup induknya.
type ExpiredSubGroupItem = store.ExpiredSubGroupItem

// User merepresentasikan entitas pengguna terdaftar.
type User = store.User

// ─── Domain Sentinel Errors ──────────────────────────────────────────────────

var (
	ErrGroupNotFound            = store.ErrGroupNotFound
	ErrUnauthorizedGroup        = store.ErrUnauthorizedGroup
	ErrGroupUsernameTaken       = store.ErrGroupUsernameTaken
	ErrCannotKickCreator        = store.ErrCannotKickCreator
	ErrCannotDemoteCreator      = store.ErrCannotDemoteCreator
	ErrAlreadyGroupMember       = store.ErrAlreadyGroupMember
	ErrNotPublicGroup           = store.ErrNotPublicGroup
	ErrUnauthorized             = errors.New("unauthorized: sesi pengguna tidak valid")
	ErrForbidden                = errors.New("forbidden: anda tidak memiliki hak akses untuk tindakan ini")
	ErrBadRequest               = errors.New("bad request: payload atau parameter tidak valid")
	ErrEmptyTitle               = errors.New("nama grup wajib diisi")
	ErrTitleTooLong             = errors.New("nama grup maksimal 128 karakter")
	ErrParentMemberOnly         = errors.New("hanya anggota grup utama yang dapat mengakses subgrup ini")
	ErrSubGroupDurationInvalid  = errors.New("durasi subgrup tidak valid (pilihan: 1h, 3h, 6h, 12h, 24h, 3d, 7d)")
	ErrSubGroupTitleEmpty       = errors.New("judul topik subgrup wajib diisi")
	ErrSubGroupTitleTooLong     = errors.New("judul topik subgrup maksimal 128 karakter")
	ErrInvalidRole              = errors.New("role baru tidak valid (hanya 'admin' atau 'member')")
	ErrCannotChangeOwnRole      = errors.New("tidak dapat mengubah role diri sendiri")
	ErrTargetUserNotFound       = errors.New("user target tidak ditemukan dalam grup")
	ErrRequestNotFound          = errors.New("permohonan bergabung tidak ditemukan atau sudah diproses")
)

// ─── Use Case Input DTOs ─────────────────────────────────────────────────────

// CreateGroupInput memuat parameter untuk membuat grup baru.
type CreateGroupInput struct {
	Title         string
	Description   string
	AvatarURL     string
	CreatorID     string
	GroupUsername string
	IsPublic      bool
	MemberIDs     []string
}

// UpdateGroupInput memuat parameter untuk mengubah informasi metadata grup.
type UpdateGroupInput struct {
	ConversationID string
	ActorUserID    string
	Title          string
	Description    string
	AvatarURL      string
	IsPublic       *bool
	GroupUsername  *string
}

// AddMembersInput memuat parameter penambahan anggota baru ke grup.
type AddMembersInput struct {
	ConversationID string
	ActorUserID    string
	UserIDs        []string
}

// RemoveMemberInput memuat parameter pengeluaran anggota dari grup.
type RemoveMemberInput struct {
	ConversationID string
	ActorUserID    string
	TargetUserID   string
}

// UpdateMemberRoleInput memuat parameter pembaruan peran anggota (admin/member).
type UpdateMemberRoleInput struct {
	ConversationID string
	ActorUserID    string
	TargetUserID   string
	NewRole        string
}

// CreateSubGroupInput memuat parameter pembuatan forum/subgrup bertempo waktu.
type CreateSubGroupInput struct {
	ParentID    string
	Title       string
	Description string
	CreatorID   string
	Duration    string
	IsPublic    bool
}

// RespondJoinRequestInput memuat tanggapan persetujuan/penolakan join request.
type RespondJoinRequestInput struct {
	SubGroupID  string
	RequestID   string
	AdminUserID string
	Approve     bool
}
