package infra

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/tenant"
	"github.com/google/uuid"
)

// SQLTenantRepository mengimplementasikan tenant.TenantRepository menggunakan database SQL (PostgreSQL & SQLite).
type SQLTenantRepository struct {
	db         *sql.DB
	driverName string
}

// NewSQLTenantRepository membuat instance baru SQLTenantRepository.
func NewSQLTenantRepository(db *sql.DB, driverName string) *SQLTenantRepository {
	return &SQLTenantRepository{
		db:         db,
		driverName: driverName,
	}
}

func (r *SQLTenantRepository) isPostgres() bool {
	return r.driverName == "postgres"
}

// GetByID mengambil tenant berdasarkan ID.
func (r *SQLTenantRepository) GetByID(ctx context.Context, id string) (*tenant.Tenant, error) {
	var query string
	if r.isPostgres() {
		query = `SELECT id, name, slug, is_active, created_at, updated_at FROM tenants WHERE id = $1 LIMIT 1`
	} else {
		query = `SELECT id, name, slug, is_active, created_at, updated_at FROM tenants WHERE id = ? LIMIT 1`
	}

	var t tenant.Tenant
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&t.ID, &t.Name, &t.Slug, &t.IsActive, &t.CreatedAt, &t.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, tenant.ErrTenantNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gagal query tenant by id: %w", err)
	}
	return &t, nil
}

// GetBySlug mengambil tenant berdasarkan slug unik.
func (r *SQLTenantRepository) GetBySlug(ctx context.Context, slug string) (*tenant.Tenant, error) {
	var query string
	if r.isPostgres() {
		query = `SELECT id, name, slug, is_active, created_at, updated_at FROM tenants WHERE slug = $1 LIMIT 1`
	} else {
		query = `SELECT id, name, slug, is_active, created_at, updated_at FROM tenants WHERE slug = ? LIMIT 1`
	}

	var t tenant.Tenant
	err := r.db.QueryRowContext(ctx, query, slug).Scan(
		&t.ID, &t.Name, &t.Slug, &t.IsActive, &t.CreatedAt, &t.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, tenant.ErrTenantNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gagal query tenant by slug: %w", err)
	}
	return &t, nil
}

// Create menyimpan tenant baru ke database.
func (r *SQLTenantRepository) Create(ctx context.Context, t *tenant.Tenant) error {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	now := time.Now().UTC()
	if t.CreatedAt.IsZero() {
		t.CreatedAt = now
	}
	if t.UpdatedAt.IsZero() {
		t.UpdatedAt = now
	}

	if err := t.Validate(); err != nil {
		return err
	}

	var query string
	if r.isPostgres() {
		query = `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`
	} else {
		query = `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
	}

	_, err := r.db.ExecContext(ctx, query, t.ID, t.Name, t.Slug, t.IsActive, t.CreatedAt, t.UpdatedAt)
	if err != nil {
		errMsg := strings.ToLower(err.Error())
		if strings.Contains(errMsg, "unique") || strings.Contains(errMsg, "duplicate") {
			return tenant.ErrDuplicateSlug
		}
		return fmt.Errorf("gagal insert tenant: %w", err)
	}
	return nil
}

// Update memperbarui nama dan status aktif tenant.
func (r *SQLTenantRepository) Update(ctx context.Context, t *tenant.Tenant) error {
	t.UpdatedAt = time.Now().UTC()
	var query string
	if r.isPostgres() {
		query = `UPDATE tenants SET name = $1, is_active = $2, updated_at = $3 WHERE id = $4`
	} else {
		query = `UPDATE tenants SET name = ?, is_active = ?, updated_at = ? WHERE id = ?`
	}

	res, err := r.db.ExecContext(ctx, query, t.Name, t.IsActive, t.UpdatedAt, t.ID)
	if err != nil {
		return fmt.Errorf("gagal update tenant: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("gagal memeriksa rows affected: %w", err)
	}
	if rows == 0 {
		return tenant.ErrTenantNotFound
	}
	return nil
}

// List mengambil daftar tenant dengan paging.
func (r *SQLTenantRepository) List(ctx context.Context, limit, offset int) ([]*tenant.Tenant, error) {
	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	var query string
	if r.isPostgres() {
		query = `SELECT id, name, slug, is_active, created_at, updated_at FROM tenants ORDER BY created_at ASC LIMIT $1 OFFSET $2`
	} else {
		query = `SELECT id, name, slug, is_active, created_at, updated_at FROM tenants ORDER BY created_at ASC LIMIT ? OFFSET ?`
	}

	rows, err := r.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("gagal list tenants: %w", err)
	}
	defer rows.Close()

	var result []*tenant.Tenant
	for rows.Next() {
		var t tenant.Tenant
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &t.IsActive, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, fmt.Errorf("gagal scan row tenant: %w", err)
		}
		result = append(result, &t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterasi tenants: %w", err)
	}
	return result, nil
}

// GetAPIKeyByAppID mencari API key berdasarkan appID.
func (r *SQLTenantRepository) GetAPIKeyByAppID(ctx context.Context, appID string) (*tenant.TenantAPIKey, error) {
	var query string
	if r.isPostgres() {
		query = `SELECT id, tenant_id, app_id, secret_hash, name, is_active, created_at FROM tenant_api_keys WHERE app_id = $1 LIMIT 1`
	} else {
		query = `SELECT id, tenant_id, app_id, secret_hash, name, is_active, created_at FROM tenant_api_keys WHERE app_id = ? LIMIT 1`
	}

	var key tenant.TenantAPIKey
	err := r.db.QueryRowContext(ctx, query, appID).Scan(
		&key.ID, &key.TenantID, &key.AppID, &key.SecretHash, &key.Name, &key.IsActive, &key.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, tenant.ErrAPIKeyNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("gagal query api key: %w", err)
	}
	return &key, nil
}

// CreateAPIKey menyimpan record API key baru.
func (r *SQLTenantRepository) CreateAPIKey(ctx context.Context, key *tenant.TenantAPIKey) error {
	if key.ID == "" {
		key.ID = uuid.New().String()
	}
	if key.CreatedAt.IsZero() {
		key.CreatedAt = time.Now().UTC()
	}

	if err := key.Validate(); err != nil {
		return err
	}

	var query string
	if r.isPostgres() {
		query = `INSERT INTO tenant_api_keys (id, tenant_id, app_id, secret_hash, name, is_active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`
	} else {
		query = `INSERT INTO tenant_api_keys (id, tenant_id, app_id, secret_hash, name, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
	}

	_, err := r.db.ExecContext(ctx, query, key.ID, key.TenantID, key.AppID, key.SecretHash, key.Name, key.IsActive, key.CreatedAt)
	if err != nil {
		errMsg := strings.ToLower(err.Error())
		if strings.Contains(errMsg, "unique") || strings.Contains(errMsg, "duplicate") {
			return tenant.ErrDuplicateAppID
		}
		return fmt.Errorf("gagal insert api key: %w", err)
	}
	return nil
}

// ListAPIKeysByTenantID mengambil seluruh API key milik suatu tenant.
func (r *SQLTenantRepository) ListAPIKeysByTenantID(ctx context.Context, tenantID string) ([]*tenant.TenantAPIKey, error) {
	var query string
	if r.isPostgres() {
		query = `SELECT id, tenant_id, app_id, secret_hash, name, is_active, created_at FROM tenant_api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`
	} else {
		query = `SELECT id, tenant_id, app_id, secret_hash, name, is_active, created_at FROM tenant_api_keys WHERE tenant_id = ? ORDER BY created_at DESC`
	}

	rows, err := r.db.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, fmt.Errorf("gagal query api keys by tenant: %w", err)
	}
	defer rows.Close()

	var result []*tenant.TenantAPIKey
	for rows.Next() {
		var k tenant.TenantAPIKey
		if err := rows.Scan(&k.ID, &k.TenantID, &k.AppID, &k.SecretHash, &k.Name, &k.IsActive, &k.CreatedAt); err != nil {
			return nil, fmt.Errorf("gagal scan row api key: %w", err)
		}
		result = append(result, &k)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterasi api keys: %w", err)
	}
	return result, nil
}
