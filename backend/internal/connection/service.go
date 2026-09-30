package connection

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/shared/config"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
)

var (
	ErrForbidden          = errors.New("akses ditolak")
	ErrSelfConnection     = errors.New("tidak dapat mengirim permintaan koneksi ke diri sendiri")
	ErrAlreadyFriends     = errors.New("sudah terhubung sebagai teman")
	ErrAlreadyRequested   = errors.New("permintaan koneksi sudah pernah dikirim sebelumnya")
	ErrCooldownActive     = errors.New("permintaan koneksi sedang dalam masa cooldown")
	ErrRateLimitExceeded  = errors.New("terlalu banyak permintaan koneksi, silakan coba lagi beberapa saat")
	ErrMaxPendingExceeded = errors.New("penerima telah mencapai kuota maksimal permintaan pending")
	ErrDailyLimitExceeded = errors.New("kuota harian pengiriman permintaan koneksi telah habis")
	ErrConnectionNotFound = errors.New("relasi koneksi tidak ditemukan")
)

type friendCacheEntry struct {
	isFriend  bool
	expiresAt time.Time
}

// ConnectionService mengelola aturan bisnis pertemanan, anti-spam, mitigasi IDOR, dan caching.
type ConnectionService struct {
	repo      ConnectionRepository
	userStore store.UserStore
	cfg       config.ConfigConnection

	// In-memory O(1) Friend Check Cache
	cacheMu     sync.RWMutex
	friendCache map[string]friendCacheEntry

	// Rate Limiting in-memory (Token Bucket / Sliding Window per user per minute)
	rateMu      sync.Mutex
	userHistory map[string][]time.Time
}

// NewConnectionService membuat instance baru ConnectionService.
func NewConnectionService(repo ConnectionRepository, userStore store.UserStore, cfg config.ConfigConnection) *ConnectionService {
	return &ConnectionService{
		repo:        repo,
		userStore:   userStore,
		cfg:         cfg,
		friendCache: make(map[string]friendCacheEntry),
		userHistory: make(map[string][]time.Time),
	}
}

func canonicalCacheKey(tenantID, userA, userB string) string {
	if userA > userB {
		userA, userB = userB, userA
	}
	return tenantID + ":" + userA + ":" + userB
}

func (s *ConnectionService) invalidateFriendCache(tenantID, userA, userB string) {
	key := canonicalCacheKey(tenantID, userA, userB)
	s.cacheMu.Lock()
	delete(s.friendCache, key)
	s.cacheMu.Unlock()
}

// checkRateLimit memeriksa kuota pengiriman friend request per user per menit.
func (s *ConnectionService) checkRateLimit(userID string) bool {
	s.rateMu.Lock()
	defer s.rateMu.Unlock()

	now := time.Now()
	windowStart := now.Add(-1 * time.Minute)

	history := s.userHistory[userID]
	var recent []time.Time
	for _, t := range history {
		if t.After(windowStart) {
			recent = append(recent, t)
		}
	}

	if len(recent) >= s.cfg.RateLimitPerMinute {
		s.userHistory[userID] = recent
		return false
	}

	recent = append(recent, now)
	s.userHistory[userID] = recent
	return true
}

// RequestConnection menangani pengiriman permintaan pertemanan baru dengan mitigasi anti-spam dan atomic mutual accept.
func (s *ConnectionService) RequestConnection(ctx context.Context, requesterID, receiverID string, sourceType SourceType) (*UserConnection, error) {
	if requesterID == "" || receiverID == "" {
		return nil, errors.New("requester_id dan receiver_id wajib diisi")
	}
	if requesterID == receiverID {
		return nil, ErrSelfConnection
	}

	// 1. Anti-spam in-memory rate limiting
	if !s.checkRateLimit(requesterID) {
		return nil, ErrRateLimitExceeded
	}

	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	// 2. Pastikan receiver exists
	if s.userStore != nil {
		targetUser, err := s.userStore.GetUserByID(receiverID)
		if err != nil || targetUser == nil {
			return nil, errors.New("user target tidak ditemukan")
		}
	}

	if sourceType == "" {
		sourceType = SourceInAppRequest
	}

	// 3. Cek relasi yang sudah ada
	existing, err := s.repo.FindConnection(ctx, tenantID, requesterID, receiverID)
	if err != nil {
		return nil, err
	}

	if existing != nil {
		switch existing.Status {
		case StatusAccepted:
			return existing, ErrAlreadyFriends
		case StatusBlocked:
			return nil, errors.New("tidak dapat mengirim permintaan koneksi")
		case StatusPending:
			// Jika pengirim sama: duplicate request
			if existing.RequesterID == requesterID {
				return existing, ErrAlreadyRequested
			}
			// Bilateral mutual request! (User B sudah request ke User A lebih dulu)
			// Atomic handshake: langsung terima menjadi StatusAccepted!
			if err := s.repo.UpdateStatus(ctx, tenantID, existing.ID, StatusAccepted); err != nil {
				return nil, err
			}
			s.invalidateFriendCache(tenantID, requesterID, receiverID)
			existing.Status = StatusAccepted
			existing.UpdatedAt = time.Now().UTC()
			return existing, nil
		case StatusDeclined:
			// Pengecekan masa cooldown
			cooldownDuration := time.Duration(s.cfg.DeclineCooldownHours) * time.Hour
			if time.Since(existing.UpdatedAt) < cooldownDuration {
				remainingHours := int(cooldownDuration.Hours() - time.Since(existing.UpdatedAt).Hours())
				if remainingHours < 1 {
					remainingHours = 1
				}
				return nil, fmt.Errorf("%w: silakan tunggu %d jam lagi sebelum mengirim ulang", ErrCooldownActive, remainingHours)
			}
			// Cooldown telah berakhir: reset request menjadi pending dengan requester baru
			if err := s.repo.ResetRequest(ctx, tenantID, existing.ID, requesterID, receiverID); err != nil {
				return nil, err
			}
			s.invalidateFriendCache(tenantID, requesterID, receiverID)
			existing.RequesterID = requesterID
			existing.ReceiverID = receiverID
			existing.Status = StatusPending
			existing.UpdatedAt = time.Now().UTC()
			return existing, nil
		}
	}

	// 4. Cek kuota pending penerima
	pendingCount, err := s.repo.CountPendingRequestsReceived(ctx, tenantID, receiverID)
	if err != nil {
		return nil, err
	}
	if pendingCount >= s.cfg.MaxPendingRequests {
		return nil, ErrMaxPendingExceeded
	}

	// 5. Cek kuota harian pengirim
	dailyCount, err := s.repo.CountDailyRequestsSent(ctx, tenantID, requesterID, time.Now().UTC().Add(-24*time.Hour))
	if err != nil {
		return nil, err
	}
	if dailyCount >= s.cfg.DailyLimit {
		return nil, ErrDailyLimitExceeded
	}

	// 6. Buat baris relasi baru
	now := time.Now().UTC()
	conn := &UserConnection{
		ID:          uuid.New().String(),
		TenantID:    tenantID,
		RequesterID: requesterID,
		ReceiverID:  receiverID,
		Status:      StatusPending,
		SourceType:  sourceType,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := s.repo.CreateRequest(ctx, conn); err != nil {
		return nil, err
	}
	s.invalidateFriendCache(tenantID, requesterID, receiverID)
	return conn, nil
}

// RespondConnection menanggapi permohonan koneksi (accept atau decline) dengan Zero-Trust IDOR protection.
func (s *ConnectionService) RespondConnection(ctx context.Context, responderID, connectionID, action string) (*UserConnection, error) {
	if connectionID == "" {
		return nil, errors.New("connection_id wajib diisi")
	}
	action = strings.ToLower(strings.TrimSpace(action))
	if action != "accept" && action != "decline" {
		return nil, errors.New("action harus 'accept' atau 'decline'")
	}

	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	conn, err := s.repo.FindConnectionByID(ctx, tenantID, connectionID)
	if err != nil {
		return nil, err
	}
	if conn == nil {
		return nil, ErrConnectionNotFound
	}

	// Zero-Trust IDOR Protection: HANYA receiver yang berhak menerima atau menolak permintaan!
	if conn.ReceiverID != responderID {
		return nil, fmt.Errorf("%w: Anda bukan penerima permintaan ini", ErrForbidden)
	}

	if conn.Status != StatusPending {
		return nil, fmt.Errorf("permintaan koneksi tidak sedang dalam status pending (status saat ini: %s)", conn.Status)
	}

	var targetStatus ConnectionStatus
	if action == "accept" {
		targetStatus = StatusAccepted
	} else {
		targetStatus = StatusDeclined
	}

	if err := s.repo.UpdateStatus(ctx, tenantID, conn.ID, targetStatus); err != nil {
		return nil, err
	}

	s.invalidateFriendCache(tenantID, conn.RequesterID, conn.ReceiverID)
	conn.Status = targetStatus
	conn.UpdatedAt = time.Now().UTC()
	return conn, nil
}

// Unfriend menghapus relasi pertemanan antar dua pengguna.
func (s *ConnectionService) Unfriend(ctx context.Context, currentUserID, targetUserID string) error {
	if targetUserID == "" || currentUserID == targetUserID {
		return errors.New("target_user_id tidak valid")
	}

	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	if err := s.repo.DeleteConnection(ctx, tenantID, currentUserID, targetUserID); err != nil {
		return err
	}

	s.invalidateFriendCache(tenantID, currentUserID, targetUserID)
	return nil
}

// ListFriends mengambil daftar teman menggunakan cursor seek pagination index.
func (s *ConnectionService) ListFriends(ctx context.Context, userID, cursorStr string, limit int) (*FriendsListResponse, error) {
	if limit <= 0 {
		limit = s.cfg.PageDefaultLimit
	}
	if limit > s.cfg.PageMaxLimit {
		limit = s.cfg.PageMaxLimit
	}

	beforeTime, beforeID, err := DecodeCursor(cursorStr)
	if err != nil {
		return nil, err
	}

	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	// Query limit + 1 untuk evaluasi has_more secara akurat tanpa COUNT tambahan
	rawFriends, err := s.repo.ListFriendsCursor(ctx, tenantID, userID, beforeTime, beforeID, limit+1)
	if err != nil {
		return nil, err
	}

	hasMore := false
	if len(rawFriends) > limit {
		hasMore = true
		rawFriends = rawFriends[:limit]
	}

	var nextCursor string
	if hasMore && len(rawFriends) > 0 {
		last := rawFriends[len(rawFriends)-1]
		nextCursor = EncodeCursor(last.ConnectedAt, last.ConnectionID)
	}

	return &FriendsListResponse{
		Friends:    rawFriends,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}, nil
}

// ListPendingRequests mengambil daftar permintaan pertemanan yang menunggu tanggapan.
func (s *ConnectionService) ListPendingRequests(ctx context.Context, userID, direction string) ([]*PendingRequestItem, error) {
	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	return s.repo.ListPendingRequests(ctx, tenantID, userID, direction)
}

// GetConnectionStatus memeriksa status hubungan dengan target user serta izin berkirim pesan dan panggilan.
func (s *ConnectionService) GetConnectionStatus(ctx context.Context, currentUserID, targetUserID string) (*ConnectionStatusResponse, error) {
	if targetUserID == "" {
		return nil, errors.New("target_user_id wajib diisi")
	}

	tenantID := tenantshared.MustFromContext(ctx).TenantID()

	var isPrivate bool
	if s.userStore != nil {
		targetUser, err := s.userStore.GetUserByID(targetUserID)
		if err == nil && targetUser != nil {
			isPrivate = targetUser.IsPrivateAccount
		}
	}

	if currentUserID == targetUserID {
		return &ConnectionStatusResponse{
			Status:           StatusNone,
			IsPrivateAccount: isPrivate,
			CanMessage:       true,
			CanCall:          true,
		}, nil
	}

	conn, err := s.repo.FindConnection(ctx, tenantID, currentUserID, targetUserID)
	if err != nil {
		return nil, err
	}

	if conn == nil {
		return &ConnectionStatusResponse{
			Status:           StatusNone,
			IsPrivateAccount: isPrivate,
			CanMessage:       !isPrivate,
			CanCall:          !isPrivate,
		}, nil
	}

	var direction string
	if conn.Status == StatusPending {
		if conn.RequesterID == currentUserID {
			direction = "outgoing"
		} else {
			direction = "incoming"
		}
	}

	isAccepted := conn.Status == StatusAccepted
	canInteract := isAccepted || !isPrivate

	return &ConnectionStatusResponse{
		Status:           conn.Status,
		Direction:        direction,
		ConnectionID:     conn.ID,
		IsPrivateAccount: isPrivate,
		CanMessage:       canInteract,
		CanCall:          canInteract,
	}, nil
}

// IsFriend memeriksa status pertemanan dengan caching O(1) cepat.
func (s *ConnectionService) IsFriend(ctx context.Context, tenantID, userA, userB string) (bool, error) {
	if userA == "" || userB == "" || userA == userB {
		return false, nil
	}

	key := canonicalCacheKey(tenantID, userA, userB)

	// 1. Cek in-memory cache
	s.cacheMu.RLock()
	entry, found := s.friendCache[key]
	s.cacheMu.RUnlock()

	if found && time.Now().Before(entry.expiresAt) {
		return entry.isFriend, nil
	}

	// 2. Query basis data
	isFriend, err := s.repo.IsFriend(ctx, tenantID, userA, userB)
	if err != nil {
		return false, err
	}

	// 3. Simpan di cache dengan TTL terkonfigurasi
	s.cacheMu.Lock()
	s.friendCache[key] = friendCacheEntry{
		isFriend:  isFriend,
		expiresAt: time.Now().Add(s.cfg.CacheTTL),
	}
	s.cacheMu.Unlock()

	return isFriend, nil
}

// PrivacyCallChecker memvalidasi kelayakan inisiasi panggilan WebRTC ke pengguna dengan profil privat.
type PrivacyCallChecker struct {
	userStore store.UserStore
	connSvc   *ConnectionService
}

// NewPrivacyCallChecker membuat instance PrivacyCallChecker.
func NewPrivacyCallChecker(us store.UserStore, cs *ConnectionService) *PrivacyCallChecker {
	return &PrivacyCallChecker{
		userStore: us,
		connSvc:   cs,
	}
}

// IsCallAllowed memeriksa apakah panggilan dari callerID ke seluruh anggota di roomID diizinkan.
// Jika ada anggota target yang berstatus privat dan bukan teman dari pemanggil, panggilan ditolak (fail-closed).
func (p *PrivacyCallChecker) IsCallAllowed(ctx context.Context, tenantID, callerID, roomID string) (bool, string) {
	if p.userStore == nil || p.connSvc == nil {
		return true, ""
	}

	members, err := p.userStore.GetConversationMemberUsernames(roomID)
	if err != nil || len(members) == 0 {
		return true, ""
	}

	for _, memberID := range members {
		if memberID == "" || memberID == callerID {
			continue
		}

		targetUser, err := p.userStore.GetUserByID(memberID)
		if err != nil || targetUser == nil {
			continue
		}

		// Jika akun target privat, wajib berteman berstatus accepted
		if targetUser.IsPrivateAccount {
			isFriend, err := p.connSvc.IsFriend(ctx, tenantID, callerID, targetUser.ID)
			if err != nil || !isFriend {
				return false, "Panggilan ditolak: Akun target bersifat privat dan Anda belum berteman"
			}
		}
	}

	return true, ""
}

