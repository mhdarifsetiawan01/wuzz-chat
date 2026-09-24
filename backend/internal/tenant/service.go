package tenant

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

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
}

type tenantService struct {
	repo TenantRepository
}

// NewTenantService membuat instance baru TenantService.
func NewTenantService(repo TenantRepository) TenantService {
	return &tenantService{
		repo: repo,
	}
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
