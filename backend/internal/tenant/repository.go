package tenant

import (
	"context"
	"errors"
)

var (
	// ErrTenantNotFound menandakan tenant tidak ditemukan.
	ErrTenantNotFound = errors.New("tenant tidak ditemukan")

	// ErrTenantInactive menandakan tenant dalam status nonaktif.
	ErrTenantInactive = errors.New("tenant dalam status nonaktif")

	// ErrDuplicateSlug menandakan slug tenant sudah digunakan.
	ErrDuplicateSlug = errors.New("slug tenant sudah terdaftar")

	// ErrDuplicateAppID menandakan App ID API key sudah terdaftar.
	ErrDuplicateAppID = errors.New("app id sudah terdaftar")

	// ErrAPIKeyNotFound menandakan API key tidak ditemukan.
	ErrAPIKeyNotFound = errors.New("api key tidak ditemukan")

	// ErrAPIKeyInactive menandakan API key dalam status nonaktif.
	ErrAPIKeyInactive = errors.New("api key dalam status nonaktif")

	// ErrExchangeTokenNotFound menandakan exchange token tidak ditemukan.
	ErrExchangeTokenNotFound = errors.New("exchange token tidak ditemukan")

	// ErrExchangeTokenExpired menandakan exchange token telah kadaluarsa.
	ErrExchangeTokenExpired = errors.New("exchange token telah kadaluarsa")

	// ErrExchangeTokenAlreadyUsed menandakan exchange token sudah pernah digunakan.
	ErrExchangeTokenAlreadyUsed = errors.New("exchange token sudah pernah digunakan")
)

// TenantRepository mendefinisikan kontrak interface persistensi data untuk Tenant dan API Key.
type TenantRepository interface {
	// GetByID mengambil tenant berdasarkan ID.
	GetByID(ctx context.Context, id string) (*Tenant, error)

	// GetBySlug mengambil tenant berdasarkan slug.
	GetBySlug(ctx context.Context, slug string) (*Tenant, error)

	// Create menyimpan tenant baru.
	Create(ctx context.Context, tenant *Tenant) error

	// Update memperbarui data tenant.
	Update(ctx context.Context, tenant *Tenant) error

	// List mengambil daftar tenant dengan pagination limit & offset.
	List(ctx context.Context, limit, offset int) ([]*Tenant, error)

	// GetAPIKeyByAppID mengambil API key berdasarkan AppID.
	GetAPIKeyByAppID(ctx context.Context, appID string) (*TenantAPIKey, error)

	// CreateAPIKey menyimpan API key baru untuk tenant.
	CreateAPIKey(ctx context.Context, key *TenantAPIKey) error

	// ListAPIKeysByTenantID mengambil seluruh API key milik suatu tenant.
	ListAPIKeysByTenantID(ctx context.Context, tenantID string) ([]*TenantAPIKey, error)

	// CreateExchangeToken menyimpan exchange token baru dengan masa berlaku singkat.
	CreateExchangeToken(ctx context.Context, token *ExchangeToken) error

	// ConsumeExchangeToken mengambil dan menandai token sebagai digunakan secara atomic (single-use).
	ConsumeExchangeToken(ctx context.Context, tokenStr string) (*ExchangeToken, error)
}

