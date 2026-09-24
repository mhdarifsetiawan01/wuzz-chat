// Package infra menyediakan implementasi infrastruktur untuk AuthRepository.
// SQLAuthRepository adalah adapter tipis yang mendelegasikan ke store lama
// (store.UserStore, store.SessionStore, store.DeviceStore, store.TokenStore, store.TransferStore).
//
// Ini adalah Strangler Fig Pattern — store lama tidak diubah sama sekali.
// Di masa depan (Fase 6 Track B), adapter ini akan digantikan oleh implementasi SQL langsung.
package infra

import (
	"context"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/authz"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// SQLAuthRepository mengimplementasikan authz.AuthRepository
// dengan mendelegasikan ke store-store yang sudah ada.
type SQLAuthRepository struct {
	userStore     store.UserStore
	sessionStore  store.SessionStore
	deviceStore   store.DeviceStore
	tokenStore    store.TokenStore
	transferStore store.TransferStore
}

// NewSQLAuthRepository membuat adapter baru.
// sessionStore, deviceStore, tokenStore, transferStore boleh nil — method terkait akan no-op.
func NewSQLAuthRepository(
	userStore store.UserStore,
	sessionStore store.SessionStore,
	deviceStore store.DeviceStore,
	tokenStore store.TokenStore,
	transferStore store.TransferStore,
) *SQLAuthRepository {
	return &SQLAuthRepository{
		userStore:     userStore,
		sessionStore:  sessionStore,
		deviceStore:   deviceStore,
		tokenStore:    tokenStore,
		transferStore: transferStore,
	}
}

// --- Identity ---

func (r *SQLAuthRepository) GetUserByUsername(username string) (string, string, error) {
	user, err := r.userStore.GetUserByUsername(username)
	if err != nil {
		return "", "", err
	}
	return user.ID, user.DisplayName, nil
}

func (r *SQLAuthRepository) CreateUser(username, displayName string) (string, error) {
	// Gunakan Register dari userStore yang sudah ada, tapi bypass password hashing
	// karena AuthService sudah hash di level service.
	// Buat user dengan password kosong — credential disimpan terpisah via CreateCredential.
	user, err := r.userStore.Register(username, displayName, "")
	if err != nil {
		return "", err
	}
	return user.ID, nil
}

func (r *SQLAuthRepository) GetActiveDeviceID(userID string) (string, error) {
	user, err := r.userStore.GetUserByID(userID)
	if err != nil {
		return "", err
	}
	return user.ActiveDeviceID, nil
}

func (r *SQLAuthRepository) UpdateActiveDevice(userID, deviceID string) error {
	return r.userStore.SetActiveDevice(userID, deviceID)
}

func (r *SQLAuthRepository) ClearActiveDevice(userID, deviceID string) error {
	return r.userStore.ClearActiveDevice(userID, deviceID)
}

func (r *SQLAuthRepository) SearchUsers(ctx context.Context, query, excludeUserID string) ([]authz.UserSummary, error) {
	users, err := r.userStore.SearchUsers(query, excludeUserID)
	if err != nil {
		return nil, err
	}
	res := make([]authz.UserSummary, 0, len(users))
	for _, u := range users {
		res = append(res, authz.UserSummary{
			ID:            u.ID,
			Username:      u.Username,
			DisplayName:   u.DisplayName,
			StatusMessage: u.StatusMessage,
			AvatarURL:     u.AvatarURL,
			IsVerified:    u.IsVerified,
			PublicKey:     u.PublicKey,
		})
	}
	return res, nil
}

func (r *SQLAuthRepository) GetUserByID(ctx context.Context, userID string) (*authz.UserProfile, error) {
	u, err := r.userStore.GetUserByID(userID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, nil
	}
	return toUserProfile(u), nil
}

func (r *SQLAuthRepository) GetUserByUsernameOrDisplayName(ctx context.Context, identifier string) (*authz.UserProfile, error) {
	clean := strings.TrimPrefix(identifier, "@")
	u, err := r.userStore.GetUserByUsername(clean)
	if err != nil || u == nil {
		u, err = r.userStore.GetUserByUsernameOrDisplayName(clean)
		if err != nil || u == nil {
			return nil, err
		}
	}
	return toUserProfile(u), nil
}

func toUserProfile(u *store.User) *authz.UserProfile {
	return &authz.UserProfile{
		ID:             u.ID,
		Username:       u.Username,
		DisplayName:    u.DisplayName,
		StatusMessage:  u.StatusMessage,
		AvatarURL:      u.AvatarURL,
		IsVerified:     u.IsVerified,
		PublicKey:      u.PublicKey,
		KeyVersion:     u.KeyVersion,
		ActiveDeviceID: u.ActiveDeviceID,
		CreatedAt:      u.CreatedAt,
	}
}

// --- Credential ---

func (r *SQLAuthRepository) GetPasswordHash(userID string) (string, error) {
	user, err := r.userStore.GetUserByID(userID)
	if err != nil {
		return "", err
	}
	return user.PasswordHash, nil
}

func (r *SQLAuthRepository) CreateCredential(userID, passwordHash string) error {
	if r.userStore == nil {
		return nil
	}
	// Delegate ke userStore's Register dual-write path tidak ada direct method.
	// Untuk sekarang, update password_hash di tabel users langsung.
	return r.userStore.ChangePassword(userID, passwordHash)
}

func (r *SQLAuthRepository) UpdatePassword(userID, newHash string, _ time.Time) error {
	return r.userStore.ChangePassword(userID, newHash)
}

func (r *SQLAuthRepository) VerifyPasswordByUserID(userID, plainPassword string) (bool, error) {
	return r.userStore.VerifyPassword(userID, plainPassword)
}

// --- Session ---

func (r *SQLAuthRepository) CreateSession(jti, userID, deviceID, userAgent, ip string, expiresAt time.Time) error {
	if r.sessionStore == nil {
		return nil
	}
	sess := &store.Session{
		ID:           jti,
		UserID:       userID,
		DeviceID:     deviceID,
		UserAgent:    userAgent,
		IPAddress:    ip,
		IsRevoked:    false,
		CreatedAt:    time.Now().UTC(),
		ExpiresAt:    expiresAt,
		LastActiveAt: time.Now().UTC(),
	}
	return r.sessionStore.CreateSession(sess)
}

func (r *SQLAuthRepository) GetActiveSessions(userID string) ([]authz.SessionInfo, error) {
	if r.sessionStore == nil {
		return nil, nil
	}
	sessions, err := r.sessionStore.GetActiveSessions(userID, "")
	if err != nil {
		return nil, err
	}
	result := make([]authz.SessionInfo, 0, len(sessions))
	for _, s := range sessions {
		result = append(result, authz.SessionInfo{
			ID:        s.ID,
			DeviceID:  s.DeviceID,
			UserAgent: s.UserAgent,
			IP:        s.IPAddress,
			CreatedAt: s.CreatedAt,
		})
	}
	return result, nil
}

func (r *SQLAuthRepository) RevokeSession(jti, userID string) error {
	if r.sessionStore == nil {
		return nil
	}
	return r.sessionStore.RevokeSession(jti, userID)
}

func (r *SQLAuthRepository) RevokeAllSessions(userID, exceptJTI string) error {
	if r.sessionStore == nil {
		return nil
	}
	return r.sessionStore.RevokeAllOtherSessions(userID, exceptJTI)
}

// --- Token Revocation ---

func (r *SQLAuthRepository) RevokeToken(jti string, expiresAt time.Time) error {
	if r.tokenStore == nil {
		return nil
	}
	return r.tokenStore.RevokeToken(jti, "", expiresAt)
}

func (r *SQLAuthRepository) IsTokenRevoked(jti string) (bool, error) {
	if r.tokenStore == nil {
		return false, nil
	}
	return r.tokenStore.IsTokenRevoked(jti)
}

func (r *SQLAuthRepository) IsUserRevokedBefore(userID string, issuedAt time.Time) (bool, error) {
	if r.tokenStore == nil {
		return false, nil
	}
	return r.tokenStore.IsUserRevokedBefore(userID, issuedAt)
}

// --- Device ---

func (r *SQLAuthRepository) UpsertDevice(deviceID, userID, name, platform string) error {
	if r.deviceStore == nil {
		return nil
	}
	device := &store.Device{
		ID:       deviceID,
		UserID:   userID,
		Name:     name,
		Platform: platform,
		IsActive: true,
	}
	return r.deviceStore.RegisterOrUpdateDevice(device)
}

func (r *SQLAuthRepository) GetUserDevices(userID string) ([]authz.DeviceRecord, error) {
	if r.deviceStore == nil {
		return nil, nil
	}
	devices, err := r.deviceStore.GetUserDevices(userID)
	if err != nil {
		return nil, err
	}
	result := make([]authz.DeviceRecord, 0, len(devices))
	for _, d := range devices {
		result = append(result, authz.DeviceRecord{
			ID:       d.ID,
			UserID:   d.UserID,
			Name:     d.Name,
			Platform: d.Platform,
			IsActive: d.IsActive,
		})
	}
	return result, nil
}

func (r *SQLAuthRepository) DeactivateDevice(deviceID, userID string) error {
	if r.deviceStore == nil {
		return nil
	}
	return r.deviceStore.DeactivateDevice(deviceID, userID)
}

// --- Transfer ---

func (r *SQLAuthRepository) CreateTransferToken(userID, token, encryptedBundle string, ttl time.Duration) error {
	if r.transferStore == nil {
		return nil
	}
	return r.transferStore.CreateTransferSession(userID, token, encryptedBundle, ttl)
}

func (r *SQLAuthRepository) ConsumeTransferToken(token, targetUserID, targetDeviceID string) (*authz.TransferRecord, error) {
	if r.transferStore == nil {
		return nil, store.ErrTransferNotFound
	}
	bundle, err := r.transferStore.ConsumeTransferSession(token, targetUserID, targetDeviceID)
	if err != nil {
		return nil, err
	}
	return &authz.TransferRecord{
		UserID:          targetUserID,
		EncryptedBundle: bundle,
	}, nil
}

// Pastikan SQLAuthRepository mengimplementasikan AuthRepository interface.
var _ authz.AuthRepository = (*SQLAuthRepository)(nil)
