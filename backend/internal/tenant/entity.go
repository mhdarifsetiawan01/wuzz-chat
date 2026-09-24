package tenant

import (
	"errors"
	"strings"
	"time"
)

// DefaultTenantID adalah ID tenant bawaan untuk backward compatibility.
const DefaultTenantID = "default"

// Tenant merepresentasikan entitas organisasi/klien mandiri dalam WuzzChat Engine.
type Tenant struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Validate memeriksa kelayakan data Tenant sebelum disimpan.
func (t *Tenant) Validate() error {
	if strings.TrimSpace(t.ID) == "" {
		return errors.New("tenant id tidak boleh kosong")
	}
	if strings.TrimSpace(t.Name) == "" {
		return errors.New("tenant name tidak boleh kosong")
	}
	if strings.TrimSpace(t.Slug) == "" {
		return errors.New("tenant slug tidak boleh kosong")
	}
	return nil
}

// IsDefault mengindikasikan apakah tenant ini merupakan tenant bawaan sistem.
func (t *Tenant) IsDefault() bool {
	return t.ID == DefaultTenantID || t.Slug == DefaultTenantID
}

// TenantAPIKey merepresentasikan kredensial API untuk integrasi B2B pihak ketiga.
type TenantAPIKey struct {
	ID         string    `json:"id"`
	TenantID   string    `json:"tenant_id"`
	AppID      string    `json:"app_id"`
	SecretHash string    `json:"-"` // Hash bcrypt dari secret, tidak diekspos
	Name       string    `json:"name"`
	IsActive   bool      `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
}

// Validate memeriksa kelayakan data API Key sebelum disimpan.
func (k *TenantAPIKey) Validate() error {
	if strings.TrimSpace(k.ID) == "" {
		return errors.New("api key id tidak boleh kosong")
	}
	if strings.TrimSpace(k.TenantID) == "" {
		return errors.New("tenant id tidak boleh kosong")
	}
	if strings.TrimSpace(k.AppID) == "" {
		return errors.New("app id tidak boleh kosong")
	}
	if strings.TrimSpace(k.SecretHash) == "" {
		return errors.New("secret hash tidak boleh kosong")
	}
	return nil
}

// ExchangeToken merepresentasikan token penukaran sementara (One-Time Token, TTL 60s)
// untuk alur JIT Provisioning klien pihak ketiga.
type ExchangeToken struct {
	Token     string     `json:"token"`
	TenantID  string     `json:"tenant_id"`
	UserID    string     `json:"user_id"`
	ExpiresAt time.Time  `json:"expires_at"`
	UsedAt    *time.Time `json:"used_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

// Validate memeriksa kelayakan data ExchangeToken sebelum disimpan.
func (e *ExchangeToken) Validate() error {
	if strings.TrimSpace(e.Token) == "" {
		return errors.New("exchange token tidak boleh kosong")
	}
	if strings.TrimSpace(e.TenantID) == "" {
		return errors.New("tenant id tidak boleh kosong")
	}
	if strings.TrimSpace(e.UserID) == "" {
		return errors.New("user id tidak boleh kosong")
	}
	if e.ExpiresAt.IsZero() {
		return errors.New("expires at tidak boleh kosong")
	}
	return nil
}

// IsExpired memeriksa apakah token sudah melewati batas waktu kadaluarsa.
func (e *ExchangeToken) IsExpired() bool {
	return time.Now().UTC().After(e.ExpiresAt)
}

// IsUsed memeriksa apakah token sudah pernah digunakan.
func (e *ExchangeToken) IsUsed() bool {
	return e.UsedAt != nil
}

