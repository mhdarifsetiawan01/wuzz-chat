package group

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)


// ─── Mock Implementations ─────────────────────────────────────────────────────

type mockGroupRepo struct {
	createGroupFunc                  func(title, description, avatarURL, creatorID, groupUsername string, isPublic bool, memberIDs []string) (*GroupDetails, error)
	getGroupDetailsFunc              func(conversationID, currentUserID string) (*GroupDetails, error)
	getGroupMembersFunc              func(conversationID string) ([]GroupMemberItem, error)
	joinPublicGroupFunc              func(conversationID, userID string) error
	addGroupMembersFunc              func(conversationID, actorUserID string, userIDs []string) error
	removeGroupMemberFunc            func(conversationID, actorUserID, targetUserID string) error
	updateMemberRoleFunc             func(conversationID, actorUserID, targetUserID, newRole string) error
	updateGroupInfoFunc              func(conversationID, actorUserID, title, description, avatarURL string, isPublic *bool, groupUsername *string) error
	searchPublicGroupsFunc           func(query string, limit int) ([]GroupDetails, error)
	getUserRoleInGroupFunc           func(conversationID, userID string) (string, error)
	createSubGroupFunc               func(parentID, title, description, creatorID, duration string, isPublic bool) (*GroupDetails, error)
	getActiveSubGroupsFunc           func(parentID, currentUserID string) ([]SubGroupItem, error)
	isParentMemberFunc               func(parentID, userID string) (bool, error)
	joinSubGroupFunc                 func(subGroupID, userID string) error
	requestToJoinSubGroupFunc        func(subGroupID, userID string) error
	getPendingJoinRequestsFunc       func(subGroupID, adminUserID string) ([]JoinRequestItem, error)
	respondJoinRequestFunc           func(subGroupID, requestID, adminUserID string, approve bool) (string, error)
	getSubGroupAdminsFunc            func(subGroupID string) ([]string, error)
	expireSubGroupsBatchDetailedFunc func() ([]ExpiredSubGroupItem, error)
	expireSubGroupNowFunc            func(subGroupID string) error
}

func (m *mockGroupRepo) CreateGroup(title, description, avatarURL, creatorID, groupUsername string, isPublic bool, memberIDs []string) (*GroupDetails, error) {
	if m.createGroupFunc != nil {
		return m.createGroupFunc(title, description, avatarURL, creatorID, groupUsername, isPublic, memberIDs)
	}
	return &GroupDetails{ID: "grp_1", Title: title, CreatedBy: creatorID, IsPublic: isPublic}, nil
}

func (m *mockGroupRepo) CreateGroupWithContext(ctx context.Context, title, description, avatarURL, creatorID, groupUsername string, isPublic bool, memberIDs []string) (*GroupDetails, error) {
	return m.CreateGroup(title, description, avatarURL, creatorID, groupUsername, isPublic, memberIDs)
}

func (m *mockGroupRepo) GetGroupDetails(conversationID, currentUserID string) (*GroupDetails, error) {
	if m.getGroupDetailsFunc != nil {
		return m.getGroupDetailsFunc(conversationID, currentUserID)
	}
	return &GroupDetails{ID: conversationID, Title: "Test Group", IsPublic: true}, nil
}

func (m *mockGroupRepo) GetGroupMembers(conversationID string) ([]GroupMemberItem, error) {
	if m.getGroupMembersFunc != nil {
		return m.getGroupMembersFunc(conversationID)
	}
	return []GroupMemberItem{{UserID: "usr_1", Role: RoleCreator}}, nil
}

func (m *mockGroupRepo) JoinPublicGroup(conversationID, userID string) error {
	if m.joinPublicGroupFunc != nil {
		return m.joinPublicGroupFunc(conversationID, userID)
	}
	return nil
}

func (m *mockGroupRepo) AddGroupMembers(conversationID, actorUserID string, userIDs []string) error {
	if m.addGroupMembersFunc != nil {
		return m.addGroupMembersFunc(conversationID, actorUserID, userIDs)
	}
	return nil
}

func (m *mockGroupRepo) RemoveGroupMember(conversationID, actorUserID, targetUserID string) error {
	if m.removeGroupMemberFunc != nil {
		return m.removeGroupMemberFunc(conversationID, actorUserID, targetUserID)
	}
	return nil
}

func (m *mockGroupRepo) UpdateMemberRole(conversationID, actorUserID, targetUserID, newRole string) error {
	if m.updateMemberRoleFunc != nil {
		return m.updateMemberRoleFunc(conversationID, actorUserID, targetUserID, newRole)
	}
	return nil
}

func (m *mockGroupRepo) UpdateGroupInfo(conversationID, actorUserID, title, description, avatarURL string, isPublic *bool, groupUsername *string) error {
	if m.updateGroupInfoFunc != nil {
		return m.updateGroupInfoFunc(conversationID, actorUserID, title, description, avatarURL, isPublic, groupUsername)
	}
	return nil
}

func (m *mockGroupRepo) SearchPublicGroups(query string, limit int) ([]GroupDetails, error) {
	if m.searchPublicGroupsFunc != nil {
		return m.searchPublicGroupsFunc(query, limit)
	}
	return nil, nil
}

func (m *mockGroupRepo) SearchPublicGroupsWithContext(ctx context.Context, query string, limit int) ([]GroupDetails, error) {
	return m.SearchPublicGroups(query, limit)
}

func (m *mockGroupRepo) GetUserRoleInGroup(conversationID, userID string) (string, error) {
	if m.getUserRoleInGroupFunc != nil {
		return m.getUserRoleInGroupFunc(conversationID, userID)
	}
	return RoleAdmin, nil
}

func (m *mockGroupRepo) CreateSubGroup(parentID, title, description, creatorID, duration string, isPublic bool) (*GroupDetails, error) {
	if m.createSubGroupFunc != nil {
		return m.createSubGroupFunc(parentID, title, description, creatorID, duration, isPublic)
	}
	return &GroupDetails{ID: "sub_1", ParentID: parentID, Title: title, CreatedBy: creatorID}, nil
}

func (m *mockGroupRepo) CreateSubGroupWithContext(ctx context.Context, parentID, title, description, creatorID, duration string, isPublic bool) (*GroupDetails, error) {
	return m.CreateSubGroup(parentID, title, description, creatorID, duration, isPublic)
}

func (m *mockGroupRepo) GetActiveSubGroups(parentID, currentUserID string) ([]SubGroupItem, error) {
	if m.getActiveSubGroupsFunc != nil {
		return m.getActiveSubGroupsFunc(parentID, currentUserID)
	}
	return []SubGroupItem{{ID: "sub_1", ParentID: parentID, Title: "Topic 1"}}, nil
}

func (m *mockGroupRepo) IsParentMember(parentID, userID string) (bool, error) {
	if m.isParentMemberFunc != nil {
		return m.isParentMemberFunc(parentID, userID)
	}
	return true, nil
}

func (m *mockGroupRepo) JoinSubGroup(subGroupID, userID string) error {
	if m.joinSubGroupFunc != nil {
		return m.joinSubGroupFunc(subGroupID, userID)
	}
	return nil
}

func (m *mockGroupRepo) RequestToJoinSubGroup(subGroupID, userID string) error {
	if m.requestToJoinSubGroupFunc != nil {
		return m.requestToJoinSubGroupFunc(subGroupID, userID)
	}
	return nil
}

func (m *mockGroupRepo) GetPendingJoinRequests(subGroupID, adminUserID string) ([]JoinRequestItem, error) {
	if m.getPendingJoinRequestsFunc != nil {
		return m.getPendingJoinRequestsFunc(subGroupID, adminUserID)
	}
	return nil, nil
}

func (m *mockGroupRepo) RespondJoinRequest(subGroupID, requestID, adminUserID string, approve bool) (string, error) {
	if m.respondJoinRequestFunc != nil {
		return m.respondJoinRequestFunc(subGroupID, requestID, adminUserID, approve)
	}
	return "target_user_1", nil
}

func (m *mockGroupRepo) GetSubGroupAdmins(subGroupID string) ([]string, error) {
	if m.getSubGroupAdminsFunc != nil {
		return m.getSubGroupAdminsFunc(subGroupID)
	}
	return []string{"admin_1"}, nil
}

func (m *mockGroupRepo) ExpireSubGroupsBatchDetailed() ([]ExpiredSubGroupItem, error) {
	if m.expireSubGroupsBatchDetailedFunc != nil {
		return m.expireSubGroupsBatchDetailedFunc()
	}
	return []ExpiredSubGroupItem{{ID: "sub_1", ParentID: "grp_1"}}, nil
}

func (m *mockGroupRepo) ExpireSubGroupNow(subGroupID string) error {
	if m.expireSubGroupNowFunc != nil {
		return m.expireSubGroupNowFunc(subGroupID)
	}
	return nil
}

type mockUserRepo struct {
	users map[string]*User
}

func (m *mockUserRepo) GetUserByID(userID string) (*User, error) {
	if u, ok := m.users[userID]; ok {
		return u, nil
	}
	return &User{ID: userID, DisplayName: "User " + userID, Username: userID}, nil
}

type mockBroadcaster struct {
	roomUsersBroadcasted []string
	eventsBroadcasted    []string
	cacheInvalidated     []string
	notifiedUsers        []string
}

func (b *mockBroadcaster) BroadcastRoomUsers(roomID string) {
	b.roomUsersBroadcasted = append(b.roomUsersBroadcasted, roomID)
}

func (b *mockBroadcaster) BroadcastGroupSystemEvent(roomID, eventType, content string) {
	b.eventsBroadcasted = append(b.eventsBroadcasted, eventType+":"+content)
}

func (b *mockBroadcaster) InvalidateRoomMembersCache(roomID string) {
	b.cacheInvalidated = append(b.cacheInvalidated, roomID)
}

func (b *mockBroadcaster) NotifyUsers(userIDs []string, msg ws.Message) {
	b.notifiedUsers = append(b.notifiedUsers, userIDs...)
}

type mockNotifier struct {
	notifiedUsers []string
}

func (n *mockNotifier) NotifyUsers(userIDs []string, title, body, tag, url string) {
	n.notifiedUsers = append(n.notifiedUsers, userIDs...)
}

type mockMemoryJobCreator struct {
	createdJobs []string
}

func (m *mockMemoryJobCreator) CreateJob(ctx context.Context, forumID, groupID string) (*store.ForumMemoryJob, error) {
	m.createdJobs = append(m.createdJobs, forumID+":"+groupID)
	return &store.ForumMemoryJob{ID: "job_1", ForumID: forumID, GroupID: groupID}, nil
}

// ─── Tests for GroupService ───────────────────────────────────────────────────

func TestGroupService_CreateGroup(t *testing.T) {
	repo := &mockGroupRepo{}
	userRepo := &mockUserRepo{users: make(map[string]*User)}
	broadcaster := &mockBroadcaster{}
	svc := NewGroupService(repo, userRepo, broadcaster, nil)

	ctx := context.Background()

	// 1. Nama kosong ditolak
	_, err := svc.CreateGroup(ctx, CreateGroupInput{Title: "   "})
	if !errors.Is(err, ErrEmptyTitle) {
		t.Fatalf("expected ErrEmptyTitle, got: %v", err)
	}

	// 2. Nama > 128 karakter ditolak
	_, err = svc.CreateGroup(ctx, CreateGroupInput{Title: strings.Repeat("A", 129)})
	if !errors.Is(err, ErrTitleTooLong) {
		t.Fatalf("expected ErrTitleTooLong, got: %v", err)
	}

	// 3. Sukses
	res, err := svc.CreateGroup(ctx, CreateGroupInput{
		Title:     "Komunitas Golang",
		CreatorID: "usr_creator",
		IsPublic:  true,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Title != "Komunitas Golang" {
		t.Fatalf("expected Title 'Komunitas Golang', got: %s", res.Title)
	}
	if len(res.Members) != 1 {
		t.Fatalf("expected 1 member, got: %d", len(res.Members))
	}
}

func TestGroupService_GetGroupDetails_PrivacyAccess(t *testing.T) {
	repo := &mockGroupRepo{
		getGroupDetailsFunc: func(conversationID, currentUserID string) (*GroupDetails, error) {
			if currentUserID == "stranger" {
				return &GroupDetails{ID: conversationID, IsPublic: false, MyRole: ""}, nil
			}
			return &GroupDetails{ID: conversationID, IsPublic: false, MyRole: RoleMember}, nil
		},
	}
	svc := NewGroupService(repo, &mockUserRepo{}, nil, nil)
	ctx := context.Background()

	// Bukan anggota mengakses grup privat -> ditolak
	_, err := svc.GetGroupDetails(ctx, "grp_priv", "stranger")
	if !errors.Is(err, ErrUnauthorizedGroup) {
		t.Fatalf("expected ErrUnauthorizedGroup for stranger, got: %v", err)
	}

	// Anggota mengakses grup privat -> sukses
	details, err := svc.GetGroupDetails(ctx, "grp_priv", "member_1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if details.ID != "grp_priv" {
		t.Fatalf("expected ID 'grp_priv', got: %s", details.ID)
	}
}

func TestGroupService_AddAndRemoveMembers(t *testing.T) {
	broadcaster := &mockBroadcaster{}
	repo := &mockGroupRepo{}
	svc := NewGroupService(repo, &mockUserRepo{}, broadcaster, nil)
	ctx := context.Background()

	// 1. Add members kosong
	err := svc.AddGroupMembers(ctx, AddMembersInput{ConversationID: "grp_1", ActorUserID: "adm_1", UserIDs: nil})
	if !errors.Is(err, ErrBadRequest) {
		t.Fatalf("expected ErrBadRequest, got: %v", err)
	}

	// 2. Add members sukses
	err = svc.AddGroupMembers(ctx, AddMembersInput{
		ConversationID: "grp_1",
		ActorUserID:    "adm_1",
		UserIDs:        []string{"usr_new"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(broadcaster.roomUsersBroadcasted) == 0 {
		t.Fatal("expected BroadcastRoomUsers to be called")
	}

	// 3. Remove member (keluar sendiri)
	err = svc.RemoveGroupMember(ctx, RemoveMemberInput{
		ConversationID: "grp_1",
		ActorUserID:    "usr_new",
		TargetUserID:   "usr_new",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 4. Remove member (kick)
	err = svc.RemoveGroupMember(ctx, RemoveMemberInput{
		ConversationID: "grp_1",
		ActorUserID:    "adm_1",
		TargetUserID:   "usr_new",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestGroupService_UpdateMemberRole(t *testing.T) {
	broadcaster := &mockBroadcaster{}
	repo := &mockGroupRepo{}
	svc := NewGroupService(repo, &mockUserRepo{}, broadcaster, nil)
	ctx := context.Background()

	// 1. Ubah role diri sendiri ditolak
	err := svc.UpdateMemberRole(ctx, UpdateMemberRoleInput{
		ConversationID: "grp_1",
		ActorUserID:    "adm_1",
		TargetUserID:   "adm_1",
		NewRole:        RoleAdmin,
	})
	if !errors.Is(err, ErrCannotChangeOwnRole) {
		t.Fatalf("expected ErrCannotChangeOwnRole, got: %v", err)
	}

	// 2. Role tidak valid ditolak
	err = svc.UpdateMemberRole(ctx, UpdateMemberRoleInput{
		ConversationID: "grp_1",
		ActorUserID:    "adm_1",
		TargetUserID:   "usr_2",
		NewRole:        "superadmin",
	})
	if !errors.Is(err, ErrInvalidRole) {
		t.Fatalf("expected ErrInvalidRole, got: %v", err)
	}

	// 3. Role valid (admin)
	err = svc.UpdateMemberRole(ctx, UpdateMemberRoleInput{
		ConversationID: "grp_1",
		ActorUserID:    "adm_1",
		TargetUserID:   "usr_2",
		NewRole:        RoleAdmin,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// ─── Tests for ForumService ───────────────────────────────────────────────────

func TestForumService_CreateSubGroup(t *testing.T) {
	broadcaster := &mockBroadcaster{}
	repo := &mockGroupRepo{
		isParentMemberFunc: func(parentID, userID string) (bool, error) {
			if userID == "stranger" {
				return false, nil
			}
			return true, nil
		},
	}
	svc := NewForumService(repo, &mockUserRepo{}, nil, broadcaster, nil)
	ctx := context.Background()

	// 1. Title kosong
	_, err := svc.CreateSubGroup(ctx, CreateSubGroupInput{Title: "", ParentID: "grp_1", CreatorID: "usr_1", Duration: "1h"})
	if !errors.Is(err, ErrSubGroupTitleEmpty) {
		t.Fatalf("expected ErrSubGroupTitleEmpty, got: %v", err)
	}

	// 2. Durasi tidak valid
	_, err = svc.CreateSubGroup(ctx, CreateSubGroupInput{Title: "Topic", ParentID: "grp_1", CreatorID: "usr_1", Duration: "5h"})
	if !errors.Is(err, ErrSubGroupDurationInvalid) {
		t.Fatalf("expected ErrSubGroupDurationInvalid, got: %v", err)
	}

	// 3. Bukan anggota grup induk
	_, err = svc.CreateSubGroup(ctx, CreateSubGroupInput{Title: "Topic", ParentID: "grp_1", CreatorID: "stranger", Duration: "1h"})
	if !errors.Is(err, ErrParentMemberOnly) {
		t.Fatalf("expected ErrParentMemberOnly, got: %v", err)
	}

	// 4. Sukses
	sub, err := svc.CreateSubGroup(ctx, CreateSubGroupInput{
		Title:       "Diskusi Rilis",
		ParentID:    "grp_1",
		CreatorID:   "usr_1",
		Duration:    "24h",
		Description: "Persiapan v1.0",
		IsPublic:    true,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sub.Title != "Diskusi Rilis" {
		t.Fatalf("expected Title 'Diskusi Rilis', got: %s", sub.Title)
	}
}

func TestForumService_RequestAndRespondJoin(t *testing.T) {
	broadcaster := &mockBroadcaster{}
	notifier := &mockNotifier{}
	repo := &mockGroupRepo{}
	svc := NewForumService(repo, &mockUserRepo{}, nil, broadcaster, notifier)
	ctx := context.Background()

	// 1. Request join
	err := svc.RequestToJoinSubGroup(ctx, "sub_1", "usr_applicant")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(broadcaster.notifiedUsers) == 0 {
		t.Fatal("expected broadcaster.NotifyUsers to be called for admins")
	}
	if len(notifier.notifiedUsers) == 0 {
		t.Fatal("expected notifier.NotifyUsers to be called for admins")
	}

	// 2. Respond join (Approve)
	targetID, approved, err := svc.RespondJoinRequest(ctx, RespondJoinRequestInput{
		SubGroupID:  "sub_1",
		RequestID:   "req_1",
		AdminUserID: "adm_1",
		Approve:     true,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !approved {
		t.Fatal("expected approved to be true")
	}
	if targetID != "target_user_1" {
		t.Fatalf("expected targetID 'target_user_1', got: %s", targetID)
	}
	if len(broadcaster.cacheInvalidated) == 0 {
		t.Fatal("expected InvalidateRoomMembersCache on approval")
	}
}

func TestForumService_InstantExpireSubGroup(t *testing.T) {
	broadcaster := &mockBroadcaster{}
	memCreator := &mockMemoryJobCreator{}
	repo := &mockGroupRepo{
		isParentMemberFunc: func(parentID, userID string) (bool, error) {
			return true, nil
		},
		getUserRoleInGroupFunc: func(conversationID, userID string) (string, error) {
			if userID == "regular_member" {
				return RoleMember, nil
			}
			return RoleAdmin, nil
		},
	}
	svc := NewForumService(repo, &mockUserRepo{}, memCreator, broadcaster, nil)
	ctx := context.Background()

	// 1. Regular member coba expire -> ditolak
	err := svc.InstantExpireSubGroup(ctx, "regular_member", "grp_1", "sub_1")
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected ErrForbidden for regular member, got: %v", err)
	}

	// 2. Admin sukses expire
	err = svc.InstantExpireSubGroup(ctx, "admin_user", "grp_1", "sub_1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(memCreator.createdJobs) != 1 {
		t.Fatalf("expected 1 memory job created, got: %d", len(memCreator.createdJobs))
	}
}
