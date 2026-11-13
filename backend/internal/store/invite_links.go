package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Tautan undangan grup privat (Wuzz Chat V2 Tahap 1, docs/plans/backlog/PRIVATE_GROUP_INVITES.md).
// Token rahasia membuka hak MENGAJUKAN gabung (mode approval), bukan hak masuk. Paling banyak satu tautan aktif per
// grup (indeks unik parsial); reset = cabut + buat baru dalam satu transaksi. Pengajuan memakai conversation_join_requests.

const (
	inviteTokenLength = 16
	inviteAttempts    = 5

	// InviteModeApproval: pengajuan menunggu persetujuan admin/creator. Satu-satunya mode Tahap 1
	// (nilai "direct" dan "paid" dicadangkan, belum dibangun).
	InviteModeApproval = "approval"

	// InviteRejoinCooldown: jeda sebelum pemohon yang ditolak boleh mengajukan lagi (keputusan D3, 14 Nov 2026).
	InviteRejoinCooldown = 24 * time.Hour
	// InviteMaxPendingPerGroup: batas pengajuan menunggu per grup agar tautan yang bocor tidak membanjiri admin (D5).
	InviteMaxPendingPerGroup = 500

	// Status pengajuan/keanggotaan pemanggil terhadap grup undangan.
	InviteStatusMember   = "member"
	InviteStatusPending  = "pending"
	InviteStatusRejected = "rejected"
	InviteStatusNone     = "none"
)

var (
	// ErrInviteNotFound: token tak dikenal, dicabut, grup tidak privat lagi, atau beda tenant. Satu galat untuk semua
	// agar pemanggil tidak bisa membedakan "pernah ada" dari "tidak pernah ada".
	ErrInviteNotFound = errors.New("tautan undangan tidak berlaku")
	// ErrInviteNotPrivate: tautan undangan hanya untuk grup utama privat.
	ErrInviteNotPrivate = errors.New("tautan undangan hanya untuk grup privat")
	// ErrRejoinCooldown dibungkus RejoinCooldownError (berisi sisa waktu tunggu).
	ErrRejoinCooldown = errors.New("permohonan baru ditolak, tunggu sebelum mengajukan lagi")
	// ErrTooManyPending: pengajuan menunggu di grup ini sudah mencapai batas.
	ErrTooManyPending = errors.New("terlalu banyak permohonan menunggu di grup ini")
	// ErrPaymentRequired: grup berbayar; pengajuan approval tidak berlaku, pemohon harus membayar (PurchaseAccess).
	ErrPaymentRequired = errors.New("grup ini berbayar")
	// ErrJoinRequestNotFound / ErrJoinRequestProcessed: untuk persetujuan admin.
	ErrJoinRequestNotFound  = errors.New("permohonan bergabung tidak ditemukan")
	ErrJoinRequestProcessed = errors.New("permohonan bergabung sudah diproses")

	inviteTokenPattern = regexp.MustCompile(`^[2-9a-km-np-zA-HJ-NP-Z]{16}$`)
)

// RejoinCooldownError membawa sisa jeda pengajuan ulang. errors.Is(err, ErrRejoinCooldown) bernilai true.
type RejoinCooldownError struct{ RetryAfter time.Duration }

func (e *RejoinCooldownError) Error() string { return ErrRejoinCooldown.Error() }
func (e *RejoinCooldownError) Is(target error) bool {
	return target == ErrRejoinCooldown
}

// IsInviteToken memeriksa bentuk token undangan (16 karakter dari alfabet tautan pendek).
func IsInviteToken(s string) bool { return inviteTokenPattern.MatchString(s) }

// InviteLink adalah tautan undangan aktif sebuah grup.
type InviteLink struct {
	Token     string    `json:"token"`
	Path      string    `json:"path"`
	Mode      string    `json:"mode"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

// InvitePreview adalah pratinjau grup untuk pemegang token yang sudah login (keputusan D2: nama, avatar, jumlah
// anggota; tanpa deskripsi dan daftar anggota).
type InvitePreview struct {
	GroupID     string `json:"group_id"`
	Title       string `json:"title"`
	AvatarURL   string `json:"avatar_url"`
	MemberCount int    `json:"member_count"`
	Mode        string `json:"mode"`
	MyStatus    string `json:"my_status"`
	// RetryAfterSeconds hanya diisi bila MyStatus = rejected dan jeda belum lewat.
	RetryAfterSeconds int `json:"retry_after_seconds,omitempty"`
	// Grup berbayar (Mode = paid, V2 Tahap 2a): harga dan saldo Star pemanggil.
	PriceStars int  `json:"price_stars,omitempty"`
	MyBalance  *int `json:"my_balance,omitempty"`
}

// InviteJoinResult adalah hasil POST /api/invites/{token}/join.
type InviteJoinResult struct {
	GroupID string `json:"group_id"`
	Status  string `json:"status"` // member | pending
	// Created: pengajuan baru (atau diaktifkan lagi) sehingga admin perlu diberi tahu.
	Created bool `json:"-"`
}

// InviteLinkStore menyimpan tautan undangan dan pengajuan gabung grup utama privat.
type InviteLinkStore struct {
	db         *sql.DB
	driverName string
	now        func() time.Time
	// stars (opsional, PAID_GROUPS_ENABLED): grup berbayar memakai mode paid. nil = semua tautan mode approval.
	stars *StarStore
}

// SetStarStore mengaktifkan grup berbayar pada tautan undangan. nil = mati.
func (s *InviteLinkStore) SetStarStore(st *StarStore) { s.stars = st }

// effectivePaid mengembalikan info grup berbayar yang berlaku, atau nil (mode approval).
func (s *InviteLinkStore) effectivePaid(ctx context.Context, groupID string) (*PaidGroupInfo, error) {
	if s.stars == nil {
		return nil, nil
	}
	return s.stars.activePaidGroup(ctx, s.db, groupID)
}

func NewInviteLinkStore(db *sql.DB, driverName string) *InviteLinkStore {
	return &InviteLinkStore{db: db, driverName: driverName, now: func() time.Time { return time.Now().UTC() }}
}

// SetClock mengganti sumber waktu (untuk tes jeda pengajuan ulang).
func (s *InviteLinkStore) SetClock(now func() time.Time) { s.now = now }

func (s *InviteLinkStore) q(query string) string { return rebindQuery(s.driverName, query) }

func generateInviteToken() (string, error) {
	max := big.NewInt(int64(len(shortCodeAlphabet)))
	var b strings.Builder
	for range inviteTokenLength {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b.WriteByte(shortCodeAlphabet[n.Int64()])
	}
	return b.String(), nil
}

// InvitePath adalah path tautan publik untuk token (https://<domain>/join/<token>).
func InvitePath(token string) string { return "/join/" + token }

type inviteGroup struct {
	id, tenantID, title, avatarURL string
	isPublic                       bool
}

// loadMainGroup membaca grup utama (grp_, type group, tanpa parent).
func (s *InviteLinkStore) loadMainGroup(ctx context.Context, groupID string) (*inviteGroup, error) {
	if !strings.HasPrefix(groupID, "grp_") {
		return nil, ErrGroupNotFound
	}
	var g inviteGroup
	var parentID string
	err := s.db.QueryRowContext(ctx, s.q(`SELECT id, COALESCE(tenant_id, 'default'), COALESCE(title, ''), COALESCE(avatar_url, ''),
		is_public, COALESCE(parent_id, '') FROM conversations WHERE id = ? AND type = 'group'`), groupID).
		Scan(&g.id, &g.tenantID, &g.title, &g.avatarURL, &g.isPublic, &parentID)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && parentID != "") {
		return nil, ErrGroupNotFound
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

func (s *InviteLinkStore) roleIn(ctx context.Context, groupID, userID string) (string, error) {
	var role string
	err := s.db.QueryRowContext(ctx, s.q(`SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?`),
		groupID, userID).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return role, err
}

func (s *InviteLinkStore) userTenant(ctx context.Context, userID string) (string, error) {
	var tenant string
	err := s.db.QueryRowContext(ctx, s.q(`SELECT COALESCE(tenant_id, 'default') FROM users WHERE id = ?`), userID).Scan(&tenant)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrUserNotFound
	}
	return tenant, err
}

// requireAdmin memastikan actor adalah creator/admin grup utama.
func (s *InviteLinkStore) requireAdmin(ctx context.Context, groupID, actorID string) (*inviteGroup, error) {
	g, err := s.loadMainGroup(ctx, groupID)
	if err != nil {
		return nil, err
	}
	role, err := s.roleIn(ctx, groupID, actorID)
	if err != nil {
		return nil, err
	}
	if role != "creator" && role != "admin" {
		return nil, ErrUnauthorizedGroup
	}
	return g, nil
}

func (s *InviteLinkStore) activeLink(ctx context.Context, groupID string) (*InviteLink, error) {
	var l InviteLink
	err := s.db.QueryRowContext(ctx, s.q(`SELECT token, mode, created_by, created_at FROM group_invite_links
		WHERE conversation_id = ? AND revoked_at IS NULL`), groupID).Scan(&l.Token, &l.Mode, &l.CreatedBy, &l.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	l.Path = InvitePath(l.Token)
	return &l, nil
}

// GetActive mengembalikan tautan aktif grup (nil bila tidak ada). Hanya creator/admin.
func (s *InviteLinkStore) GetActive(ctx context.Context, groupID, actorID string) (*InviteLink, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	g, err := s.requireAdmin(ctx, groupID, actorID)
	if err != nil {
		return nil, err
	}
	if g.isPublic {
		return nil, nil
	}
	return s.activeLink(ctx, groupID)
}

// CreateOrReset mengembalikan tautan aktif, membuatnya bila belum ada. reset=true mencabut tautan aktif lalu membuat
// yang baru dalam satu transaksi. Hanya creator/admin grup privat.
func (s *InviteLinkStore) CreateOrReset(ctx context.Context, groupID, actorID string, reset bool) (*InviteLink, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	g, err := s.requireAdmin(ctx, groupID, actorID)
	if err != nil {
		return nil, err
	}
	if g.isPublic {
		return nil, ErrInviteNotPrivate
	}
	if !reset {
		if l, err := s.activeLink(ctx, groupID); err != nil || l != nil {
			return l, err
		}
	}
	for range inviteAttempts {
		token, err := generateInviteToken()
		if err != nil {
			return nil, err
		}
		link, err := s.insertLink(ctx, groupID, actorID, token, reset)
		if err == nil {
			return link, nil
		}
		if !isUniqueViolation(err) {
			return nil, err
		}
		// Tabrakan: token kembar (sangat jarang) atau permintaan buat bersamaan memenangi indeks satu-aktif-per-grup.
		if !reset {
			if l, lerr := s.activeLink(ctx, groupID); lerr != nil || l != nil {
				return l, lerr
			}
		}
	}
	return nil, fmt.Errorf("gagal membuat tautan undangan setelah %d percobaan", inviteAttempts)
}

func (s *InviteLinkStore) insertLink(ctx context.Context, groupID, actorID, token string, revokeExisting bool) (*InviteLink, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	now := s.now()
	mode := InviteModeApproval
	if paid, err := s.effectivePaid(ctx, groupID); err != nil {
		return nil, err
	} else if paid != nil {
		mode = InviteModePaid
	}
	if revokeExisting {
		if _, err := tx.ExecContext(ctx, s.q(`UPDATE group_invite_links SET revoked_at = ?, revoked_by = ?
			WHERE conversation_id = ? AND revoked_at IS NULL`), now, actorID, groupID); err != nil {
			return nil, err
		}
	}
	if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO group_invite_links (id, conversation_id, token, mode, created_by, created_at)
		VALUES (?, ?, ?, ?, ?, ?)`), uuid.New().String(), groupID, token, mode, actorID, now); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &InviteLink{Token: token, Path: InvitePath(token), Mode: mode, CreatedBy: actorID, CreatedAt: now}, nil
}

// Revoke mematikan tautan aktif tanpa pengganti. Hanya creator/admin. Tidak ada tautan aktif = bukan galat.
func (s *InviteLinkStore) Revoke(ctx context.Context, groupID, actorID string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := s.requireAdmin(ctx, groupID, actorID); err != nil {
		return err
	}
	return s.revokeAll(ctx, groupID, actorID)
}

// RevokeForGroup mencabut tautan aktif tanpa pemeriksaan peran (dipakai sistem saat grup dijadikan publik).
func (s *InviteLinkStore) RevokeForGroup(ctx context.Context, groupID, actorID string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return s.revokeAll(ctx, groupID, actorID)
}

func (s *InviteLinkStore) revokeAll(ctx context.Context, groupID, actorID string) error {
	_, err := s.db.ExecContext(ctx, s.q(`UPDATE group_invite_links SET revoked_at = ?, revoked_by = ?
		WHERE conversation_id = ? AND revoked_at IS NULL`), s.now(), actorID, groupID)
	return err
}

// resolveToken menerjemahkan token aktif ke grup privat yang setenant dengan pemanggil. includeRevoked dipakai untuk
// membatalkan pengajuan lewat tautan yang sudah dicabut. Semua kegagalan = ErrInviteNotFound.
func (s *InviteLinkStore) resolveToken(ctx context.Context, token, userID string, includeRevoked bool) (*inviteGroup, string, error) {
	if !IsInviteToken(token) {
		return nil, "", ErrInviteNotFound
	}
	var linkID, groupID string
	var revoked sql.NullTime
	err := s.db.QueryRowContext(ctx, s.q(`SELECT id, conversation_id, revoked_at FROM group_invite_links WHERE token = ?`), token).
		Scan(&linkID, &groupID, &revoked)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && revoked.Valid && !includeRevoked) {
		return nil, "", ErrInviteNotFound
	}
	if err != nil {
		return nil, "", err
	}
	g, err := s.loadMainGroup(ctx, groupID)
	if errors.Is(err, ErrGroupNotFound) || (err == nil && g.isPublic && !includeRevoked) {
		return nil, "", ErrInviteNotFound
	}
	if err != nil {
		return nil, "", err
	}
	tenant, err := s.userTenant(ctx, userID)
	if errors.Is(err, ErrUserNotFound) || (err == nil && tenant != g.tenantID) {
		return nil, "", ErrInviteNotFound
	}
	if err != nil {
		return nil, "", err
	}
	return g, linkID, nil
}

type joinRequestRow struct {
	id, status string
	updatedAt  time.Time
}

func (s *InviteLinkStore) requestRow(ctx context.Context, groupID, userID string) (*joinRequestRow, error) {
	var r joinRequestRow
	err := s.db.QueryRowContext(ctx, s.q(`SELECT id, status, updated_at FROM conversation_join_requests
		WHERE conversation_id = ? AND user_id = ?`), groupID, userID).Scan(&r.id, &r.status, &r.updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// cooldownLeft mengembalikan sisa jeda bila pengajuan terakhir ditolak kurang dari InviteRejoinCooldown lalu.
func (s *InviteLinkStore) cooldownLeft(r *joinRequestRow) time.Duration {
	if r == nil || r.status != InviteStatusRejected {
		return 0
	}
	left := r.updatedAt.Add(InviteRejoinCooldown).Sub(s.now())
	if left < 0 {
		return 0
	}
	return left
}

// Preview mengembalikan pratinjau grup undangan untuk pengguna login (keputusan D2).
func (s *InviteLinkStore) Preview(ctx context.Context, token, userID string) (*InvitePreview, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	g, _, err := s.resolveToken(ctx, token, userID, false)
	if err != nil {
		return nil, err
	}
	p := &InvitePreview{GroupID: g.id, Title: g.title, AvatarURL: g.avatarURL, Mode: InviteModeApproval, MyStatus: InviteStatusNone}
	if err := s.db.QueryRowContext(ctx, s.q(`SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ?`), g.id).
		Scan(&p.MemberCount); err != nil {
		return nil, err
	}
	role, err := s.roleIn(ctx, g.id, userID)
	if err != nil {
		return nil, err
	}
	paid, err := s.effectivePaid(ctx, g.id)
	if err != nil {
		return nil, err
	}
	if paid != nil {
		p.Mode = InviteModePaid
		p.PriceStars = paid.PriceStars
		b, err := s.stars.balance(ctx, s.db, starTenantDefault, userID)
		if err != nil {
			return nil, err
		}
		p.MyBalance = &b
	}
	if role != "" {
		p.MyStatus = InviteStatusMember
		return p, nil
	}
	if paid != nil {
		return p, nil // grup berbayar: tidak ada status pengajuan/jeda
	}
	row, err := s.requestRow(ctx, g.id, userID)
	if err != nil {
		return nil, err
	}
	switch {
	case row != nil && row.status == InviteStatusPending:
		p.MyStatus = InviteStatusPending
	case s.cooldownLeft(row) > 0:
		p.MyStatus = InviteStatusRejected
		p.RetryAfterSeconds = int(s.cooldownLeft(row).Seconds()) + 1
	}
	return p, nil
}

// RequestJoin mengajukan gabung lewat token (mode approval). Idempoten: sudah anggota = member, sudah menunggu = pending
// tanpa Created. Ditolak < 24 jam lalu = RejoinCooldownError. Pengajuan ditolak lama, dibatalkan, atau milik anggota
// yang sudah keluar/dikeluarkan diaktifkan lagi pada baris yang sama (indeks unik conversation_id+user_id).
func (s *InviteLinkStore) RequestJoin(ctx context.Context, token, userID string) (*InviteJoinResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	g, linkID, err := s.resolveToken(ctx, token, userID, false)
	if err != nil {
		return nil, err
	}
	role, err := s.roleIn(ctx, g.id, userID)
	if err != nil {
		return nil, err
	}
	if role != "" {
		return &InviteJoinResult{GroupID: g.id, Status: InviteStatusMember}, nil
	}
	if paid, err := s.effectivePaid(ctx, g.id); err != nil {
		return nil, err
	} else if paid != nil {
		return nil, ErrPaymentRequired
	}
	row, err := s.requestRow(ctx, g.id, userID)
	if err != nil {
		return nil, err
	}
	if row != nil && row.status == InviteStatusPending {
		return &InviteJoinResult{GroupID: g.id, Status: InviteStatusPending}, nil
	}
	if left := s.cooldownLeft(row); left > 0 {
		return nil, &RejoinCooldownError{RetryAfter: left}
	}
	var pending int
	if err := s.db.QueryRowContext(ctx, s.q(`SELECT COUNT(*) FROM conversation_join_requests WHERE conversation_id = ? AND status = 'pending'`),
		g.id).Scan(&pending); err != nil {
		return nil, err
	}
	if pending >= InviteMaxPendingPerGroup {
		return nil, ErrTooManyPending
	}
	now := s.now()
	if row != nil {
		// UPDATE bersyarat pada status lama: dua pengajuan bersamaan tidak saling menimpa.
		res, err := s.db.ExecContext(ctx, s.q(`UPDATE conversation_join_requests
			SET status = 'pending', reviewed_by = '', invite_link_id = ?, created_at = ?, updated_at = ?
			WHERE id = ? AND status = ?`), linkID, now, now, row.id, row.status)
		if err != nil {
			return nil, err
		}
		n, _ := res.RowsAffected()
		return &InviteJoinResult{GroupID: g.id, Status: InviteStatusPending, Created: n == 1}, nil
	}
	_, err = s.db.ExecContext(ctx, s.q(`INSERT INTO conversation_join_requests
		(id, conversation_id, user_id, status, reviewed_by, invite_link_id, created_at, updated_at)
		VALUES (?, ?, ?, 'pending', '', ?, ?, ?)`), "req_"+uuid.New().String(), g.id, userID, linkID, now, now)
	if isUniqueViolation(err) {
		// Kalah balapan dengan pengajuan bersamaan dari pengguna yang sama: pengajuan sudah ada.
		return &InviteJoinResult{GroupID: g.id, Status: InviteStatusPending}, nil
	}
	if err != nil {
		return nil, err
	}
	return &InviteJoinResult{GroupID: g.id, Status: InviteStatusPending, Created: true}, nil
}

// CancelRequest membatalkan pengajuan menunggu milik pemanggil (juga lewat tautan yang sudah dicabut).
// Mengembalikan ID grup. Tidak ada pengajuan menunggu = ErrJoinRequestNotFound.
func (s *InviteLinkStore) CancelRequest(ctx context.Context, token, userID string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	g, _, err := s.resolveToken(ctx, token, userID, true)
	if err != nil {
		return "", err
	}
	res, err := s.db.ExecContext(ctx, s.q(`UPDATE conversation_join_requests SET status = 'cancelled', updated_at = ?
		WHERE conversation_id = ? AND user_id = ? AND status = 'pending'`), s.now(), g.id, userID)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return "", ErrJoinRequestNotFound
	}
	return g.id, nil
}

// ListPending mengembalikan pengajuan menunggu grup utama untuk creator/admin, terlama dulu.
func (s *InviteLinkStore) ListPending(ctx context.Context, groupID, actorID string) ([]JoinRequestItem, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := s.requireAdmin(ctx, groupID, actorID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, s.q(`SELECT cjr.id, cjr.conversation_id, cjr.user_id, u.username,
		COALESCE(u.display_name, u.username), COALESCE(u.avatar_url, ''), COALESCE(u.is_verified, false), cjr.status, cjr.created_at
		FROM conversation_join_requests cjr JOIN users u ON u.id = cjr.user_id
		WHERE cjr.conversation_id = ? AND cjr.status = 'pending' ORDER BY cjr.created_at ASC LIMIT ?`), groupID, InviteMaxPendingPerGroup)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []JoinRequestItem{}
	for rows.Next() {
		var it JoinRequestItem
		if err := rows.Scan(&it.ID, &it.ConversationID, &it.UserID, &it.Username, &it.DisplayName, &it.AvatarURL,
			&it.IsVerified, &it.Status, &it.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

// Respond menyetujui/menolak pengajuan grup utama. Hanya creator/admin. Persetujuan memasukkan anggota dalam transaksi
// yang sama dengan perubahan status; UPDATE bersyarat status='pending' mencegah dua admin memproses ganda.
// Mengembalikan ID pemohon.
func (s *InviteLinkStore) Respond(ctx context.Context, groupID, requestID, actorID string, approve bool) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	g, err := s.requireAdmin(ctx, groupID, actorID)
	if err != nil {
		return "", err
	}
	var targetID, status string
	err = s.db.QueryRowContext(ctx, s.q(`SELECT user_id, status FROM conversation_join_requests WHERE id = ? AND conversation_id = ?`),
		requestID, groupID).Scan(&targetID, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrJoinRequestNotFound
	}
	if err != nil {
		return "", err
	}
	if status != InviteStatusPending {
		return "", ErrJoinRequestProcessed
	}
	if approve {
		// Pemohon yang sudah dihapus atau pindah tenant tidak dimasukkan.
		tenant, terr := s.userTenant(ctx, targetID)
		if errors.Is(terr, ErrUserNotFound) || (terr == nil && tenant != g.tenantID) {
			return "", ErrJoinRequestNotFound
		}
		if terr != nil {
			return "", terr
		}
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback() }()
	now := s.now()
	newStatus := InviteStatusRejected
	if approve {
		newStatus = "approved"
	}
	res, err := tx.ExecContext(ctx, s.q(`UPDATE conversation_join_requests SET status = ?, reviewed_by = ?, updated_at = ?
		WHERE id = ? AND conversation_id = ? AND status = 'pending'`), newStatus, actorID, now, requestID, groupID)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return "", ErrJoinRequestProcessed
	}
	if approve {
		if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
			VALUES (?, ?, 'member', ?) ON CONFLICT (conversation_id, user_id) DO NOTHING`), groupID, targetID, now); err != nil {
			return "", err
		}
		if _, err := tx.ExecContext(ctx, s.q(`UPDATE conversations SET updated_at = ? WHERE id = ?`), now, groupID); err != nil {
			return "", err
		}
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return targetID, nil
}

// GroupAdmins mengembalikan creator/admin grup (penerima notifikasi pengajuan baru).
func (s *InviteLinkStore) GroupAdmins(ctx context.Context, groupID string) ([]string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	rows, err := s.db.QueryContext(ctx, s.q(`SELECT user_id FROM conversation_members WHERE conversation_id = ? AND role IN ('creator', 'admin')`), groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// GroupTitle mengembalikan nama grup untuk teks notifikasi (kosong bila tidak ada).
func (s *InviteLinkStore) GroupTitle(ctx context.Context, groupID string) string {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var title string
	_ = s.db.QueryRowContext(ctx, s.q(`SELECT COALESCE(title, '') FROM conversations WHERE id = ?`), groupID).Scan(&title)
	return title
}
