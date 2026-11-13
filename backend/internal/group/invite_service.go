package group

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"

	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

// Alias tipe undangan dari store agar lapisan HTTP tidak bergantung langsung pada store.
type (
	InviteLink       = store.InviteLink
	InvitePreview    = store.InvitePreview
	InviteJoinResult = store.InviteJoinResult
)

// InviteRepository adalah kontrak persistensi tautan undangan grup privat (dipenuhi *store.InviteLinkStore).
type InviteRepository interface {
	GetActive(ctx context.Context, groupID, actorID string) (*store.InviteLink, error)
	CreateOrReset(ctx context.Context, groupID, actorID string, reset bool) (*store.InviteLink, error)
	Revoke(ctx context.Context, groupID, actorID string) error
	RevokeForGroup(ctx context.Context, groupID, actorID string) error
	Preview(ctx context.Context, token, userID string) (*store.InvitePreview, error)
	RequestJoin(ctx context.Context, token, userID string) (*store.InviteJoinResult, error)
	CancelRequest(ctx context.Context, token, userID string) (string, error)
	ListPending(ctx context.Context, groupID, actorID string) ([]store.JoinRequestItem, error)
	Respond(ctx context.Context, groupID, requestID, actorID string, approve bool) (string, error)
	GroupAdmins(ctx context.Context, groupID string) ([]string, error)
	GroupTitle(ctx context.Context, groupID string) string
}

// InviteService mengorkestrasi tautan undangan grup privat dan pengajuan gabung grup utama (V2 Tahap 1).
type InviteService struct {
	repo        InviteRepository
	userRepo    UserLookupRepository
	broadcaster GroupBroadcaster
	notifier    GroupNotifier
}

func NewInviteService(repo InviteRepository, userRepo UserLookupRepository) *InviteService {
	return &InviteService{repo: repo, userRepo: userRepo}
}

func (s *InviteService) SetBroadcaster(b GroupBroadcaster) { s.broadcaster = b }
func (s *InviteService) SetNotifier(n GroupNotifier)       { s.notifier = n }

func (s *InviteService) displayName(userID string) string {
	if s.userRepo == nil || userID == "" {
		return "Seseorang"
	}
	u, err := s.userRepo.GetUserByID(userID)
	if err != nil || u == nil {
		return "Seseorang"
	}
	if u.DisplayName != "" {
		return u.DisplayName
	}
	if u.Username != "" {
		return "@" + u.Username
	}
	return "Seseorang"
}

func (s *InviteService) groupTitle(ctx context.Context, groupID string) string {
	if t := s.repo.GroupTitle(ctx, groupID); t != "" {
		return t
	}
	return "grup privat"
}

func (s *InviteService) GetLink(ctx context.Context, groupID, actorID string) (*InviteLink, error) {
	return s.repo.GetActive(ctx, groupID, actorID)
}

func (s *InviteService) CreateOrResetLink(ctx context.Context, groupID, actorID string, reset bool) (*InviteLink, error) {
	return s.repo.CreateOrReset(ctx, groupID, actorID, reset)
}

func (s *InviteService) RevokeLink(ctx context.Context, groupID, actorID string) error {
	return s.repo.Revoke(ctx, groupID, actorID)
}

// RevokeOnPublic mencabut tautan undangan saat grup dijadikan publik (dipanggil GroupService.UpdateGroupInfo).
// Best-effort: penegakan utama tetap di store (token grup publik selalu ditolak).
func (s *InviteService) RevokeOnPublic(ctx context.Context, groupID, actorID string) {
	if err := s.repo.RevokeForGroup(ctx, groupID, actorID); err != nil {
		log.Printf("⚠️ [Invite] Gagal mencabut tautan grup %s yang dijadikan publik: %v", groupID, err)
	}
}

func (s *InviteService) Preview(ctx context.Context, token, userID string) (*InvitePreview, error) {
	return s.repo.Preview(ctx, token, userID)
}

// RequestJoin mengajukan gabung lewat token. Admin/creator diberi tahu hanya bila pengajuan baru dibuat; tag push
// per grup membuat notifikasi beruntun menumpuk menjadi satu di perangkat.
func (s *InviteService) RequestJoin(ctx context.Context, token, userID string) (*InviteJoinResult, error) {
	res, err := s.repo.RequestJoin(ctx, token, userID)
	if err != nil || !res.Created {
		return res, err
	}
	admins, aerr := s.repo.GroupAdmins(ctx, res.GroupID)
	if aerr != nil || len(admins) == 0 {
		return res, nil
	}
	content := fmt.Sprintf("%s meminta bergabung ke grup '%s'", s.displayName(userID), s.groupTitle(ctx, res.GroupID))
	if s.broadcaster != nil {
		s.broadcaster.NotifyUsers(admins, ws.Message{
			ID: uuid.New().String(), Type: ws.TypeJoinRequest, Room: res.GroupID, From: userID,
			Nickname: s.displayName(userID), Content: content, Timestamp: time.Now().UTC(),
		})
	}
	if s.notifier != nil {
		s.notifier.NotifyUsers(admins, "Permohonan Bergabung Grup", content, "join-request-"+res.GroupID, "/chat?room="+res.GroupID)
	}
	return res, nil
}

func (s *InviteService) CancelRequest(ctx context.Context, token, userID string) error {
	_, err := s.repo.CancelRequest(ctx, token, userID)
	return err
}

func (s *InviteService) ListPending(ctx context.Context, groupID, actorID string) ([]JoinRequestItem, error) {
	return s.repo.ListPending(ctx, groupID, actorID)
}

// Respond menyetujui/menolak pengajuan grup utama, lalu memberi tahu grup (bila disetujui) dan pemohon.
func (s *InviteService) Respond(ctx context.Context, groupID, requestID, actorID string, approve bool) error {
	targetID, err := s.repo.Respond(ctx, groupID, requestID, actorID, approve)
	if err != nil {
		return err
	}
	title := s.groupTitle(ctx, groupID)
	if approve && s.broadcaster != nil {
		s.broadcaster.InvalidateRoomMembersCache(groupID)
		s.broadcaster.BroadcastRoomUsers(groupID)
		s.broadcaster.BroadcastGroupSystemEvent(groupID, "group_member_joined",
			fmt.Sprintf("%s bergabung lewat tautan undangan.", s.displayName(targetID)))
	}
	action := "ditolak"
	if approve {
		action = "disetujui"
	}
	content := fmt.Sprintf("Permohonan bergabung Anda ke grup '%s' telah %s.", title, action)
	if s.broadcaster != nil {
		s.broadcaster.NotifyUsers([]string{targetID}, ws.Message{
			ID: uuid.New().String(), Type: ws.TypeJoinRequest, Room: groupID, From: "server",
			Nickname: "Sistem", Content: content, Timestamp: time.Now().UTC(),
		})
	}
	if s.notifier != nil {
		s.notifier.NotifyUsers([]string{targetID}, "Status Permohonan Grup", content, "join-response-"+groupID, "/chat?room="+groupID)
	}
	return nil
}
