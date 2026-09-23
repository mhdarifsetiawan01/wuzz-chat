package group

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)


// ─── External Collaboration Interfaces ────────────────────────────────────────

// GroupBroadcaster mendefinisikan interface pengiriman event real-time grup/forum.
// *ws.Hub langsung memenuhi interface ini tanpa pembungkus.
type GroupBroadcaster interface {
	BroadcastRoomUsers(roomID string)
	BroadcastGroupSystemEvent(roomID, eventType, content string)
	InvalidateRoomMembersCache(roomID string)
	NotifyUsers(userIDs []string, msg ws.Message)
}

// GroupNotifier mendefinisikan interface pengiriman Web Push Notification ke anggota.
// *push.Service langsung memenuhi interface ini tanpa pembungkus.
type GroupNotifier interface {
	NotifyUsers(userIDs []string, title, body, tag, url string)
}

// MemoryJobCreator mendefinisikan interface pembuatan job ekstraksi memori AI saat forum expire.
// store.MemoryStore langsung memenuhi interface ini.
type MemoryJobCreator interface {
	CreateJob(ctx context.Context, forumID, groupID string) (*store.ForumMemoryJob, error)
}

// ─── GroupService ─────────────────────────────────────────────────────────────

// GroupService mengorkestrasi logika bisnis grup persisten.
type GroupService struct {
	repo        GroupRepository
	userRepo    UserLookupRepository
	broadcaster GroupBroadcaster
	notifier    GroupNotifier
}

// NewGroupService membuat instance baru GroupService.
func NewGroupService(
	repo GroupRepository,
	userRepo UserLookupRepository,
	b GroupBroadcaster,
	n GroupNotifier,
) *GroupService {
	return &GroupService{
		repo:        repo,
		userRepo:    userRepo,
		broadcaster: b,
		notifier:    n,
	}
}

// SetBroadcaster menyetel broadcaster WebSocket.
func (s *GroupService) SetBroadcaster(b GroupBroadcaster) {
	s.broadcaster = b
}

// SetNotifier menyetel push notifier.
func (s *GroupService) SetNotifier(n GroupNotifier) {
	s.notifier = n
}

func (s *GroupService) resolveDisplayName(userID string) string {
	if s.userRepo == nil || userID == "" {
		return userID
	}
	profile, err := s.userRepo.GetUserByID(userID)
	if err != nil || profile == nil {
		return userID
	}
	if profile.DisplayName != "" {
		return profile.DisplayName
	}
	if profile.Username != "" {
		return "@" + profile.Username
	}
	return userID
}

// CreateGroup membuat grup baru dan mengambil daftar anggota lengkap.
func (s *GroupService) CreateGroup(ctx context.Context, input CreateGroupInput) (*GroupDetails, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return nil, ErrEmptyTitle
	}
	if len(title) > 128 {
		return nil, ErrTitleTooLong
	}

	group, err := s.repo.CreateGroup(
		title, input.Description, input.AvatarURL,
		input.CreatorID, input.GroupUsername, input.IsPublic, input.MemberIDs,
	)
	if err != nil {
		return nil, err
	}

	// Ambil daftar lengkap anggota untuk di-return
	if members, err := s.repo.GetGroupMembers(group.ID); err == nil {
		group.Members = members
	}

	return group, nil
}

// GetGroupDetails mengambil detail sebuah grup beserta anggotanya.
func (s *GroupService) GetGroupDetails(ctx context.Context, groupID, currentUserID string) (*GroupDetails, error) {
	group, err := s.repo.GetGroupDetails(groupID, currentUserID)
	if err != nil {
		return nil, err
	}

	// Jika grup privat dan user bukan anggota (my_role kosong), tolak akses
	if !group.IsPublic && group.MyRole == "" {
		return nil, ErrUnauthorizedGroup
	}

	members, err := s.repo.GetGroupMembers(groupID)
	if err != nil {
		return nil, err
	}
	group.Members = members

	return group, nil
}

// GetGroupMembers mengambil daftar anggota grup dengan proteksi akses grup privat.
func (s *GroupService) GetGroupMembers(ctx context.Context, groupID, currentUserID string) ([]GroupMemberItem, error) {
	group, err := s.repo.GetGroupDetails(groupID, currentUserID)
	if err != nil {
		return nil, err
	}

	if !group.IsPublic && group.MyRole == "" {
		return nil, ErrUnauthorizedGroup
	}

	return s.repo.GetGroupMembers(groupID)
}

// JoinPublicGroup menambahkan current user ke dalam grup publik.
func (s *GroupService) JoinPublicGroup(ctx context.Context, groupID, currentUserID string) error {
	if err := s.repo.JoinPublicGroup(groupID, currentUserID); err != nil {
		return err
	}

	if s.broadcaster != nil {
		s.broadcaster.BroadcastRoomUsers(groupID)
		actorName := s.resolveDisplayName(currentUserID)
		s.broadcaster.BroadcastGroupSystemEvent(groupID, "group_member_joined", fmt.Sprintf("%s bergabung ke grup.", actorName))
	}

	return nil
}

// AddGroupMembers menambahkan sejumlah anggota baru oleh admin/creator.
func (s *GroupService) AddGroupMembers(ctx context.Context, input AddMembersInput) error {
	if len(input.UserIDs) == 0 {
		return ErrBadRequest
	}

	if err := s.repo.AddGroupMembers(input.ConversationID, input.ActorUserID, input.UserIDs); err != nil {
		return err
	}

	if s.broadcaster != nil {
		s.broadcaster.BroadcastRoomUsers(input.ConversationID)

		addedNames := make([]string, 0, len(input.UserIDs))
		for _, uid := range input.UserIDs {
			addedNames = append(addedNames, s.resolveDisplayName(uid))
		}
		actorName := s.resolveDisplayName(input.ActorUserID)
		eventText := fmt.Sprintf("%s menambahkan %s ke grup.", actorName, strings.Join(addedNames, ", "))
		s.broadcaster.BroadcastGroupSystemEvent(input.ConversationID, "group_member_joined", eventText)
	}

	return nil
}

// RemoveGroupMember mengeluarkan anggota dari grup atau keluar secara mandiri.
func (s *GroupService) RemoveGroupMember(ctx context.Context, input RemoveMemberInput) error {
	if err := s.repo.RemoveGroupMember(input.ConversationID, input.ActorUserID, input.TargetUserID); err != nil {
		return err
	}

	if s.broadcaster != nil {
		s.broadcaster.BroadcastRoomUsers(input.ConversationID)

		var eventText string
		if input.ActorUserID == input.TargetUserID {
			eventText = fmt.Sprintf("%s keluar dari grup.", s.resolveDisplayName(input.TargetUserID))
		} else {
			eventText = fmt.Sprintf("%s mengeluarkan %s dari grup.",
				s.resolveDisplayName(input.ActorUserID),
				s.resolveDisplayName(input.TargetUserID),
			)
		}
		s.broadcaster.BroadcastGroupSystemEvent(input.ConversationID, "group_member_removed", eventText)
	}

	return nil
}

// UpdateMemberRole mengubah peran anggota menjadi admin atau member.
func (s *GroupService) UpdateMemberRole(ctx context.Context, input UpdateMemberRoleInput) error {
	if input.ActorUserID == input.TargetUserID {
		return ErrCannotChangeOwnRole
	}
	if input.NewRole != RoleAdmin && input.NewRole != RoleMember {
		return ErrInvalidRole
	}

	if err := s.repo.UpdateMemberRole(input.ConversationID, input.ActorUserID, input.TargetUserID, input.NewRole); err != nil {
		return err
	}

	if s.broadcaster != nil {
		actorName := s.resolveDisplayName(input.ActorUserID)
		targetName := s.resolveDisplayName(input.TargetUserID)
		eventText := fmt.Sprintf("%s mengubah role %s menjadi %s.", actorName, targetName, input.NewRole)
		s.broadcaster.BroadcastGroupSystemEvent(input.ConversationID, "group_role_updated", eventText)
	}

	return nil
}

// UpdateGroupInfo memperbarui metadata informasi grup (nama, deskripsi, avatar, visibilitas).
func (s *GroupService) UpdateGroupInfo(ctx context.Context, input UpdateGroupInput) error {
	if input.Title != "" && len(strings.TrimSpace(input.Title)) > 128 {
		return ErrTitleTooLong
	}

	if err := s.repo.UpdateGroupInfo(
		input.ConversationID, input.ActorUserID,
		input.Title, input.Description, input.AvatarURL,
		input.IsPublic, input.GroupUsername,
	); err != nil {
		return err
	}

	if s.broadcaster != nil {
		actorName := s.resolveDisplayName(input.ActorUserID)
		eventText := fmt.Sprintf("%s memperbarui info grup.", actorName)
		s.broadcaster.BroadcastGroupSystemEvent(input.ConversationID, "group_info_updated", eventText)
	}

	return nil
}

// SearchPublicGroups mencari grup publik berdasarkan nama atau username.
func (s *GroupService) SearchPublicGroups(ctx context.Context, query string, limit int) ([]GroupDetails, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	return s.repo.SearchPublicGroups(query, limit)
}

// ─── ForumService ─────────────────────────────────────────────────────────────

// ForumService mengorkestrasi logika topik subgrup/forum bertempo waktu (ephemeral).
type ForumService struct {
	repo         GroupRepository
	userRepo     UserLookupRepository
	memoryStore  MemoryJobCreator
	broadcaster  GroupBroadcaster
	notifier     GroupNotifier
}

// NewForumService membuat instance baru ForumService.
func NewForumService(
	repo GroupRepository,
	userRepo UserLookupRepository,
	mc MemoryJobCreator,
	b GroupBroadcaster,
	n GroupNotifier,
) *ForumService {
	return &ForumService{
		repo:        repo,
		userRepo:    userRepo,
		memoryStore: mc,
		broadcaster: b,
		notifier:    n,
	}
}

// SetBroadcaster menyetel broadcaster WebSocket.
func (s *ForumService) SetBroadcaster(b GroupBroadcaster) {
	s.broadcaster = b
}

// SetNotifier menyetel push notifier.
func (s *ForumService) SetNotifier(n GroupNotifier) {
	s.notifier = n
}

// SetMemoryStore menyetel MemoryJobCreator.
func (s *ForumService) SetMemoryStore(mc MemoryJobCreator) {
	s.memoryStore = mc
}

func (s *ForumService) resolveDisplayName(userID string) string {
	if s.userRepo == nil || userID == "" {
		return userID
	}
	profile, err := s.userRepo.GetUserByID(userID)
	if err != nil || profile == nil {
		return userID
	}
	if profile.DisplayName != "" {
		return profile.DisplayName
	}
	if profile.Username != "" {
		return "@" + profile.Username
	}
	return userID
}

// Valid durations untuk subgrup.
var validDurations = map[string]bool{
	"":        true,
	"1h":      true,
	"3h":      true,
	"6h":      true,
	"12h":     true,
	"24h":     true,
	"3d":      true,
	"7d":      true,
	"7_days":  true,
	"1_week":  true,
	"week":    true,
	"30d":     true,
	"30_days": true,
	"1_month": true,
	"month":   true,
}

// CreateSubGroup membuat topik subgrup baru di bawah grup induk.
func (s *ForumService) CreateSubGroup(ctx context.Context, input CreateSubGroupInput) (*GroupDetails, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return nil, ErrSubGroupTitleEmpty
	}
	if len(title) > 128 {
		return nil, ErrSubGroupTitleTooLong
	}
	duration := strings.ToLower(strings.TrimSpace(input.Duration))
	if !validDurations[duration] {
		return nil, ErrSubGroupDurationInvalid
	}

	// Verifikasi anggota grup induk
	isMember, err := s.repo.IsParentMember(input.ParentID, input.CreatorID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, ErrParentMemberOnly
	}

	// Verifikasi hak akses admin atau pembuat grup induk
	role, err := s.repo.GetUserRoleInGroup(input.ParentID, input.CreatorID)
	if err != nil || (role != RoleCreator && role != RoleAdmin) {
		return nil, ErrForbidden
	}

	subGroup, err := s.repo.CreateSubGroup(
		input.ParentID, title, input.Description,
		input.CreatorID, input.Duration, input.IsPublic,
	)
	if err != nil {
		return nil, err
	}

	if s.broadcaster != nil {
		actorName := s.resolveDisplayName(input.CreatorID)
		eventText := fmt.Sprintf("%s membuat topik baru: %s", actorName, title)
		s.broadcaster.BroadcastGroupSystemEvent(input.ParentID, "subgroup_created", eventText)
	}

	return subGroup, nil
}

// GetActiveSubGroups mengambil daftar subgrup aktif di bawah grup induk.
func (s *ForumService) GetActiveSubGroups(ctx context.Context, parentID, currentUserID string) ([]SubGroupItem, error) {
	isMember, err := s.repo.IsParentMember(parentID, currentUserID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, ErrParentMemberOnly
	}

	return s.repo.GetActiveSubGroups(parentID, currentUserID)
}

// JoinSubGroup menambahkan current user ke dalam subgrup (khusus subgrup publik).
func (s *ForumService) JoinSubGroup(ctx context.Context, subGroupID, currentUserID string) error {
	if err := s.repo.JoinSubGroup(subGroupID, currentUserID); err != nil {
		return err
	}

	if s.broadcaster != nil {
		s.broadcaster.BroadcastRoomUsers(subGroupID)
		actorName := s.resolveDisplayName(currentUserID)
		s.broadcaster.BroadcastGroupSystemEvent(subGroupID, "group_member_joined", fmt.Sprintf("%s bergabung ke topik forum.", actorName))
	}

	return nil
}

// RequestToJoinSubGroup mengajukan permohonan masuk ke subgrup privat.
func (s *ForumService) RequestToJoinSubGroup(ctx context.Context, subGroupID, currentUserID string) error {
	if err := s.repo.RequestToJoinSubGroup(subGroupID, currentUserID); err != nil {
		return err
	}

	// Kirim notifikasi realtime & push ke admin subgrup
	targetAdminIDs, err := s.repo.GetSubGroupAdmins(subGroupID)
	if err == nil && len(targetAdminIDs) > 0 {
		actorName := s.resolveDisplayName(currentUserID)
		subGroupTitle := "subgrup privat"
		if details, err := s.repo.GetGroupDetails(subGroupID, currentUserID); err == nil && details != nil && details.Title != "" {
			subGroupTitle = details.Title
		}

		content := fmt.Sprintf("%s meminta izin bergabung ke topik '%s'", actorName, subGroupTitle)
		now := time.Now().UTC()

		if s.broadcaster != nil {
			notifyMsg := ws.Message{
				ID:        uuid.New().String(),
				Type:      ws.TypeJoinRequest,
				Room:      subGroupID,
				From:      currentUserID,
				Nickname:  actorName,
				Content:   content,
				Timestamp: now,
			}
			s.broadcaster.NotifyUsers(targetAdminIDs, notifyMsg)
		}

		if s.notifier != nil {
			pushTitle := "Permohonan Izin Subgrup"
			pushTag := "join-request-" + subGroupID
			pushURL := "/chat?room=" + subGroupID
			s.notifier.NotifyUsers(targetAdminIDs, pushTitle, content, pushTag, pushURL)
		}
	}

	return nil
}

// GetPendingJoinRequests mengambil daftar request join yang tertunda (khusus admin).
func (s *ForumService) GetPendingJoinRequests(ctx context.Context, subGroupID, adminUserID string) ([]JoinRequestItem, error) {
	return s.repo.GetPendingJoinRequests(subGroupID, adminUserID)
}

// RespondJoinRequest menyetujui atau menolak request join ke subgrup privat.
func (s *ForumService) RespondJoinRequest(ctx context.Context, input RespondJoinRequestInput) (targetUserID string, approved bool, err error) {
	targetID, err := s.repo.RespondJoinRequest(input.SubGroupID, input.RequestID, input.AdminUserID, input.Approve)
	if err != nil {
		return "", false, err
	}

	if input.Approve && s.broadcaster != nil {
		s.broadcaster.BroadcastRoomUsers(input.SubGroupID)
		s.broadcaster.InvalidateRoomMembersCache(input.SubGroupID)
	}

	// Notifikasi kepada pemohon
	actionText := "disetujui"
	if !input.Approve {
		actionText = "ditolak"
	}

	subGroupTitle := "subgrup privat"
	if details, err := s.repo.GetGroupDetails(input.SubGroupID, input.AdminUserID); err == nil && details != nil && details.Title != "" {
		subGroupTitle = details.Title
	}

	content := fmt.Sprintf("Permohonan bergabung Anda ke topik '%s' telah %s.", subGroupTitle, actionText)
	now := time.Now().UTC()

	if s.broadcaster != nil {
		respMsg := ws.Message{
			ID:        uuid.New().String(),
			Type:      ws.TypeJoinRequest,
			Room:      input.SubGroupID,
			From:      "server",
			Nickname:  "Sistem",
			Content:   content,
			Timestamp: now,
		}
		s.broadcaster.NotifyUsers([]string{targetID}, respMsg)
	}

	if s.notifier != nil {
		pushTitle := "Status Permohonan Subgrup"
		pushTag := "join-response-" + input.SubGroupID
		pushURL := "/chat?room=" + input.SubGroupID
		s.notifier.NotifyUsers([]string{targetID}, pushTitle, content, pushTag, pushURL)
	}

	return targetID, input.Approve, nil
}

// InstantExpireSubGroup mengunci forum/subgrup seketika dan memicu pembuatan ForumMemoryJob.
func (s *ForumService) InstantExpireSubGroup(ctx context.Context, userID, groupID, subID string) error {
	// Verifikasi anggota grup utama
	isMember, err := s.repo.IsParentMember(groupID, userID)
	if err != nil || !isMember {
		return ErrForbidden
	}

	// Verifikasi hak akses admin/creator di grup utama
	role, err := s.repo.GetUserRoleInGroup(groupID, userID)
	if err != nil || (role != RoleCreator && role != RoleAdmin) {
		return ErrForbidden
	}

	if err := s.repo.ExpireSubGroupNow(subID); err != nil {
		return err
	}

	// Pemicu seketika ForumMemoryJob
	if s.memoryStore != nil {
		_, _ = s.memoryStore.CreateJob(ctx, subID, groupID)
	}

	if s.broadcaster != nil {
		s.broadcaster.BroadcastGroupSystemEvent(groupID, "subgroup_expired", "Topik forum telah berakhir dan memori AI sedang diproses.")
	}

	return nil
}

// ExpireSubGroupsBatchDetailed mengeksekusi scanning batch dan mengunci subgrup yang telah kedaluwarsa.
func (s *ForumService) ExpireSubGroupsBatchDetailed(ctx context.Context) ([]ExpiredSubGroupItem, error) {
	return s.repo.ExpireSubGroupsBatchDetailed()
}
