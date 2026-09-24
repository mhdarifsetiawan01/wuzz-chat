package tenant

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// TenantService mendefinisikan kontrak use-case manajemen dan validasi tenant.
type TenantService interface {
	GetTenant(ctx context.Context, id string) (*Tenant, error)
	GetTenantBySlug(ctx context.Context, slug string) (*Tenant, error)
	CreateTenant(ctx context.Context, name, slug string) (*Tenant, error)
	ListTenants(ctx context.Context, limit, offset int) ([]*Tenant, error)
	ValidateTenantActive(ctx context.Context, id string) (*Tenant, error)
	CreateAPIKey(ctx context.Context, tenantID, name string) (key *TenantAPIKey, rawSecret string, err error)
	ValidateAPIKey(ctx context.Context, appID, rawSecret string) (*Tenant, error)

	// Milestone 3: External Provisioning & Token Exchange
	SetUserStore(userStore store.UserStore)
	SetAuthzRepo(authzRepo authz.AuthRepository)
	ProvisionUserAndToken(ctx context.Context, externalUserID, displayName, avatarURL string) (token string, expiresIn int, user *store.User, err error)
	ExchangeToken(ctx context.Context, tokenStr, deviceID, platform, userAgent, ip string) (jwtToken string, user *store.User, jti string, err error)
}

type tenantService struct {
	repo       TenantRepository
	userStore  store.UserStore
	authzRepo  authz.AuthRepository
}

// NewTenantService membuat instance baru TenantService.
func NewTenantService(repo TenantRepository) TenantService {
	return &tenantService{
		repo: repo,
	}
}

// SetUserStore menyuntikkan store.UserStore ke TenantService.
func (s *tenantService) SetUserStore(userStore store.UserStore) {
	s.userStore = userStore
}

// SetAuthzRepo menyuntikkan authz.AuthRepository ke TenantService.
func (s *tenantService) SetAuthzRepo(authzRepo authz.AuthRepository) {
	s.authzRepo = authzRepo
}

// GetTenant mengambil tenant berdasarkan ID.
func (s *tenantService) GetTenant(ctx context.Context, id string) (*Tenant, error) {
	if strings.TrimSpace(id) == "" {
		return nil, errors.New("id tenant tidak boleh kosong")
	}
	return s.repo.GetByID(ctx, id)
}

// GetTenantBySlug mengambil tenant berdasarkan slug.
func (s *tenantService) GetTenantBySlug(ctx context.Context, slug string) (*Tenant, error) {
	slug = strings.ToLower(strings.TrimSpace(slug))
	if slug == "" {
		return nil, errors.New("slug tenant tidak boleh kosong")
	}
	return s.repo.GetBySlug(ctx, slug)
}

// CreateTenant mendaftarkan tenant baru.
func (s *tenantService) CreateTenant(ctx context.Context, name, slug string) (*Tenant, error) {
	name = strings.TrimSpace(name)
	slug = strings.ToLower(strings.TrimSpace(slug))

	if name == "" {
		return nil, errors.New("nama tenant tidak boleh kosong")
	}
	if slug == "" {
		return nil, errors.New("slug tenant tidak boleh kosong")
	}

	t := &Tenant{
		ID:        uuid.New().String(),
		Name:      name,
		Slug:      slug,
		IsActive:  true,
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	if err := s.repo.Create(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

// ListTenants mengambil daftar tenant.
func (s *tenantService) ListTenants(ctx context.Context, limit, offset int) ([]*Tenant, error) {
	return s.repo.List(ctx, limit, offset)
}

// ValidateTenantActive memeriksa apakah tenant ada dan berstatus aktif.
func (s *tenantService) ValidateTenantActive(ctx context.Context, id string) (*Tenant, error) {
	t, err := s.GetTenant(ctx, id)
	if err != nil {
		return nil, err
	}
	if !t.IsActive {
		return nil, ErrTenantInactive
	}
	return t, nil
}

// CreateAPIKey menghasilkan pasangan kredensial App ID dan raw secret baru untuk integrasi tenant.
func (s *tenantService) CreateAPIKey(ctx context.Context, tenantID, name string) (*TenantAPIKey, string, error) {
	// Pastikan tenant ada dan aktif
	if _, err := s.ValidateTenantActive(ctx, tenantID); err != nil {
		return nil, "", err
	}

	// Generate App ID (prefix: app_)
	randAppBytes := make([]byte, 12)
	if _, err := rand.Read(randAppBytes); err != nil {
		return nil, "", fmt.Errorf("gagal menghasilkan app id: %w", err)
	}
	appID := "app_" + hex.EncodeToString(randAppBytes)

	// Generate Raw Secret (prefix: sec_)
	randSecBytes := make([]byte, 24)
	if _, err := rand.Read(randSecBytes); err != nil {
		return nil, "", fmt.Errorf("gagal menghasilkan secret: %w", err)
	}
	rawSecret := "sec_" + hex.EncodeToString(randSecBytes)

	// Hash secret dengan bcrypt
	secretHash, err := bcrypt.GenerateFromPassword([]byte(rawSecret), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", fmt.Errorf("gagal hashing secret: %w", err)
	}

	apiKey := &TenantAPIKey{
		ID:         uuid.New().String(),
		TenantID:   tenantID,
		AppID:      appID,
		SecretHash: string(secretHash),
		Name:       strings.TrimSpace(name),
		IsActive:   true,
		CreatedAt:  time.Now().UTC(),
	}

	if err := s.repo.CreateAPIKey(ctx, apiKey); err != nil {
		return nil, "", err
	}

	return apiKey, rawSecret, nil
}

// ValidateAPIKey memvalidasi kredensial API dan mengembalikan Tenant yang bersangkutan jika sah.
func (s *tenantService) ValidateAPIKey(ctx context.Context, appID, rawSecret string) (*Tenant, error) {
	key, err := s.repo.GetAPIKeyByAppID(ctx, appID)
	if err != nil {
		return nil, err
	}
	if !key.IsActive {
		return nil, ErrAPIKeyInactive
	}

	// Verifikasi secret hash
	if err := bcrypt.CompareHashAndPassword([]byte(key.SecretHash), []byte(rawSecret)); err != nil {
		return nil, errors.New("secret api key tidak valid")
	}

	// Pastikan tenant pemilik juga berstatus aktif
	return s.ValidateTenantActive(ctx, key.TenantID)
}

// ProvisionUserAndToken melakukan atomic upsert pengguna eksternal pada tenant yang aktif
// dan menerbitkan Exchange Token sementara (TTL 60 detik).
func (s *tenantService) ProvisionUserAndToken(ctx context.Context, externalUserID, displayName, avatarURL string) (string, int, *store.User, error) {
	if s.userStore == nil {
		return "", 0, nil, errors.New("user store belum disuntikkan ke tenant service")
	}

	externalUserID = strings.TrimSpace(externalUserID)
	if externalUserID == "" {
		return "", 0, nil, errors.New("external_user_id tidak boleh kosong")
	}

	// 1. Dapatkan tenant ID dari context dan pastikan tenant berstatus aktif
	tenantID := tenantshared.MustFromContext(ctx).TenantID()
	if _, err := s.ValidateTenantActive(ctx, tenantID); err != nil {
		return "", 0, nil, err
	}

	// 2. Lakukan atomic upsert user eksternal pada tenant yang aktif
	u, err := s.userStore.UpsertExternalUserWithContext(ctx, externalUserID, displayName, avatarURL)
	if err != nil {
		return "", 0, nil, fmt.Errorf("gagal upsert external user: %w", err)
	}

	// 3. Generate Exchange Token yang aman (prefix: ext_)
	randBytes := make([]byte, 24)
	if _, err := rand.Read(randBytes); err != nil {
		return "", 0, nil, fmt.Errorf("gagal menghasilkan exchange token: %w", err)
	}
	tokenStr := "ext_" + hex.EncodeToString(randBytes)
	expiresIn := 60
	expiresAt := time.Now().UTC().Add(time.Duration(expiresIn) * time.Second)

	exToken := &ExchangeToken{
		Token:     tokenStr,
		TenantID:  tenantID,
		UserID:    u.ID,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now().UTC(),
	}

	if err := s.repo.CreateExchangeToken(ctx, exToken); err != nil {
		return "", 0, nil, fmt.Errorf("gagal menyimpan exchange token: %w", err)
	}

	return tokenStr, expiresIn, u, nil
}

// ExchangeToken menukarkan token penukaran sementara dengan Session JWT penuh,
// dan mendaftarkan perangkat serta sesi pada Level 2 Multi-Device registry.
func (s *tenantService) ExchangeToken(ctx context.Context, tokenStr, deviceID, platform, userAgent, ip string) (string, *store.User, string, error) {
	tokenStr = strings.TrimSpace(tokenStr)
	if tokenStr == "" {
		return "", nil, "", errors.New("exchange_token tidak boleh kosong")
	}
	deviceID = strings.TrimSpace(deviceID)
	if deviceID == "" {
		return "", nil, "", errors.New("device_id tidak boleh kosong")
	}

	// 1. Atomic consume exchange token (single-use)
	consumed, err := s.repo.ConsumeExchangeToken(ctx, tokenStr)
	if err != nil {
		return "", nil, "", err
	}

	// 2. Ambil data user
	if s.userStore == nil {
		return "", nil, "", errors.New("user store belum disuntikkan ke tenant service")
	}
	u, err := s.userStore.GetUserByID(consumed.UserID)
	if err != nil {
		return "", nil, "", fmt.Errorf("user terkait token tidak ditemukan: %w", err)
	}

	// 3. Pastikan tenant pemilik user berstatus aktif
	if _, err := s.ValidateTenantActive(ctx, consumed.TenantID); err != nil {
		return "", nil, "", fmt.Errorf("tenant tidak aktif: %w", err)
	}

	// 4. Terbitkan JWT Session Token penuh yang memuat claim: user_id, tenant_id, device_id, dan jti
	jwtToken, claims, err := auth.GenerateSessionToken(u.ID, u.Username, u.DisplayName, consumed.TenantID, deviceID)
	if err != nil {
		return "", nil, "", fmt.Errorf("gagal membuat session token: %w", err)
	}

	// 5. Daftarkan perangkat & catat sesi pada Level 2 Multi-Device registry (jika authzRepo tersedia)
	if s.authzRepo != nil {
		if platform == "" {
			platform = "web"
		}
		deviceName := fmt.Sprintf("%s (%s)", platform, deviceID)
		if len(deviceName) > 64 {
			deviceName = deviceName[:64]
		}
		_ = s.authzRepo.UpsertDevice(deviceID, u.ID, deviceName, platform)
		_ = s.authzRepo.CreateSession(claims.ID, u.ID, deviceID, userAgent, ip, claims.ExpiresAt.Time)
	}

	return jwtToken, u, claims.ID, nil
}

