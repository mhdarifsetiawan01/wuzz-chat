# Phase 3 — Credential Separation (Memisahkan Kredensial ke Tabel Baru)

## Tujuan

Saat ini, password hash user (`password_hash`) disimpan langsung di tabel `users`.
Ini membuat kita **tidak bisa** di masa depan menambahkan metode login lain seperti **Passkey / WebAuthn** atau **OAuth (Google/GitHub)** tanpa merombak besar-besaran.

**Phase 3** memisahkan penyimpanan kredensial ke tabel baru `user_credentials` — sehingga satu akun bisa punya banyak cara login, tanpa menghapus kolom lama dan tanpa memutus koneksi klien yang sudah ada.

> [!IMPORTANT]
> **Strategi kunci: NON-DESTRUCTIVE (Tidak ada data yang dihapus!)**
> - Kolom `password_hash` di tabel `users` **TIDAK dihapus** — tetap ada sebagai fallback.
> - Kita **menambahkan** tabel baru `user_credentials` di samping tabel lama.
> - Seluruh klien yang sudah login **TIDAK akan terputus**.
> - Setelah Phase 3 selesai dan stabil, barulah kita bisa lanjut ke **Phase 4 (Passkey/WebAuthn)**.

---

## Gambaran Besar (Big Picture)

```
SEBELUM Phase 3:              SESUDAH Phase 3:
-----------------             ---------------------------------
tabel users:                  tabel users:
  id (PK)                       id (PK)
  username                      username
  password_hash  ----------->   password_hash (TETAP ADA, fallback)
  ...                           ...

                                tabel user_credentials (BARU):
                                  id (PK, UUID baru)
                                  user_id (FK ke users.id)
                                  type = 'password'
                                  identifier = username
                                  secret_data = password_hash (salinan)
                                  name = 'Password Akun'
                                  created_at
                                  updated_at
```

**Flow Login Sesudah Phase 3 (Dual-Read Strategy):**

```
Request Login (username + password)
         |
         v
[1] Cari di user_credentials WHERE user_id = ? AND type = 'password'
         | <- DITEMUKAN -> verifikasi bcrypt -> LOGIN OK
         | <- TIDAK DITEMUKAN (user lama tanpa backfill)
         v
[2] Fallback: cek users.password_hash (cara lama) -> LOGIN OK
         |
         v
[3] Auto-backfill: masukkan ke user_credentials supaya next login pakai jalur baru
```

---

## Daftar File yang Akan Diubah

### Backend (Go)

| No | File | Aksi | Keterangan |
|----|------|------|------------|
| 1 | `backend/internal/store/sql.go` | **MODIFY** | Tambah DDL tabel `user_credentials` + index |
| 2 | `backend/internal/store/credential_store.go` | **NEW** | Struct + Interface + Implementasi SQL |
| 3 | `backend/internal/store/user_store.go` | **MODIFY** | Update `Register`, `Authenticate`, `ChangePassword` |
| 4 | `backend/internal/api/credential_handler.go` | **NEW** | Handler `GET /api/auth/credentials` |
| 5 | `backend/main.go` | **MODIFY** | Wire up CredentialStore |

### Backend Tests

| No | File | Aksi | Keterangan |
|----|------|------|------------|
| 6 | `backend/internal/store/credential_store_test.go` | **NEW** | 4 unit test CredentialStore |

### Frontend (Next.js)

> Phase 3 **tidak mengubah UI/UX apapun** — tidak ada perubahan pada tampilan frontend.

---

## Urutan Eksekusi (Step-by-Step)

> **Aturan penting:** Kerjakan satu langkah selesai dulu (verifikasi `go build ./...` = 0 error),
> baru lanjut ke langkah berikutnya.

---

### STEP 1 - Tambah DDL Tabel `user_credentials` di `sql.go`

**File:** `backend/internal/store/sql.go`

**Apa yang dilakukan:** Tambahkan 3 entry SQL ke slice `migrations` di fungsi `autoMigrate()`.

**Lokasi persis:** Cari baris `migrations := []string{` dan tambahkan entry baru di paling bawah slice, tepat **sebelum** penutup `}`.

**SQL yang ditambahkan (copy-paste ke slice migrations):**

```go
// Tabel Kredensial (Phase 3: Credential Separation)
`CREATE TABLE IF NOT EXISTS user_credentials (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    type VARCHAR(32) NOT NULL,
    identifier TEXT DEFAULT '',
    secret_data TEXT NOT NULL,
    name VARCHAR(128) DEFAULT '',
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);`,
`CREATE INDEX IF NOT EXISTS idx_credentials_user ON user_credentials(user_id, type);`,
`CREATE INDEX IF NOT EXISTS idx_credentials_ident ON user_credentials(identifier);`,
```

**Verifikasi Step 1:**
```bash
cd backend && go build ./...
```
Harus **0 error**.

---

### STEP 2 - Buat File `credential_store.go` (File Baru)

**File:** `backend/internal/store/credential_store.go`

**Apa yang dilakukan:** Definisikan struct data, interface kontrak, dan implementasi SQL.
Pola persis sama dengan `device_store.go` — 3 blok: Model, Interface, SQL Implementation.

**Isi file lengkap (buat file baru, copy-paste):**

```go
package store

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// =============================================================
// MODEL
// =============================================================

// UserCredential merepresentasikan satu metode login yang dimiliki user.
// Contoh: type='password', type='passkey', type='oauth'.
type UserCredential struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	Type       string    `json:"type"`       // "password" | "passkey" | "oauth"
	Identifier string    `json:"identifier"` // username / email / credential_id
	SecretData string    `json:"-"`          // bcrypt hash -- TIDAK dikirim ke frontend!
	Name       string    `json:"name"`       // Label: "Password Akun", "Touch ID MacBook"
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// =============================================================
// INTERFACE (Kontrak)
// =============================================================

// CredentialStore mendefinisikan operasi tabel user_credentials.
type CredentialStore interface {
	// CreateCredential menyimpan kredensial baru untuk seorang user.
	// Jika sudah ada (ON CONFLICT), diabaikan -- tidak error.
	CreateCredential(cred *UserCredential) error

	// GetPasswordCredential mengambil kredensial password milik userID.
	// Mengembalikan (nil, nil) jika tidak ditemukan -- ini NORMAL untuk user lama!
	GetPasswordCredential(userID string) (*UserCredential, error)

	// UpdatePasswordCredential memperbarui hash password di tabel ini.
	// Dipanggil saat user berhasil ChangePassword.
	UpdatePasswordCredential(userID, newSecretData string) error

	// ListCredentials mengembalikan semua metode login user (tanpa secret_data).
	ListCredentials(userID string) ([]UserCredential, error)
}

// =============================================================
// SQL IMPLEMENTATION
// =============================================================

// SQLCredentialStore adalah implementasi CredentialStore menggunakan SQL.
type SQLCredentialStore struct {
	db         *sql.DB
	driverName string // "postgres" atau "sqlite"
}

// NewSQLCredentialStore membuat instance baru SQLCredentialStore.
func NewSQLCredentialStore(db *sql.DB, driverName string) *SQLCredentialStore {
	return &SQLCredentialStore{db: db, driverName: driverName}
}

// isPostgres mengembalikan true jika driver adalah PostgreSQL.
func (s *SQLCredentialStore) isPostgres() bool {
	return s.driverName == "postgres"
}

// CreateCredential menyimpan baris baru ke tabel user_credentials.
func (s *SQLCredentialStore) CreateCredential(cred *UserCredential) error {
	if cred.ID == "" {
		cred.ID = uuid.New().String()
	}
	now := time.Now().UTC()
	if cred.CreatedAt.IsZero() {
		cred.CreatedAt = now
	}
	cred.UpdatedAt = now

	var query string
	if s.isPostgres() {
		query = `INSERT INTO user_credentials
		         (id, user_id, type, identifier, secret_data, name, created_at, updated_at)
		         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		         ON CONFLICT DO NOTHING`
	} else {
		query = `INSERT OR IGNORE INTO user_credentials
		         (id, user_id, type, identifier, secret_data, name, created_at, updated_at)
		         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	}

	_, err := s.db.Exec(query,
		cred.ID, cred.UserID, cred.Type, cred.Identifier,
		cred.SecretData, cred.Name, cred.CreatedAt, cred.UpdatedAt)
	if err != nil {
		return fmt.Errorf("gagal menyimpan credential: %w", err)
	}
	return nil
}

// GetPasswordCredential mencari kredensial bertipe 'password' milik userID.
// PENTING: Mengembalikan (nil, nil) -- bukan error -- jika tidak ditemukan.
func (s *SQLCredentialStore) GetPasswordCredential(userID string) (*UserCredential, error) {
	var query string
	if s.isPostgres() {
		query = `SELECT id, user_id, type, identifier, secret_data, name, created_at, updated_at
		         FROM user_credentials WHERE user_id = $1 AND type = 'password' LIMIT 1`
	} else {
		query = `SELECT id, user_id, type, identifier, secret_data, name, created_at, updated_at
		         FROM user_credentials WHERE user_id = ? AND type = 'password' LIMIT 1`
	}

	row := s.db.QueryRow(query, userID)
	var cred UserCredential
	err := row.Scan(
		&cred.ID, &cred.UserID, &cred.Type, &cred.Identifier,
		&cred.SecretData, &cred.Name, &cred.CreatedAt, &cred.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil // Tidak ditemukan -- ini NORMAL untuk user lama
	}
	if err != nil {
		return nil, fmt.Errorf("gagal membaca credential: %w", err)
	}
	return &cred, nil
}

// UpdatePasswordCredential memperbarui hash password di tabel user_credentials.
func (s *SQLCredentialStore) UpdatePasswordCredential(userID, newSecretData string) error {
	now := time.Now().UTC()
	var query string
	if s.isPostgres() {
		query = `UPDATE user_credentials SET secret_data = $1, updated_at = $2
		         WHERE user_id = $3 AND type = 'password'`
	} else {
		query = `UPDATE user_credentials SET secret_data = ?, updated_at = ?
		         WHERE user_id = ? AND type = 'password'`
	}
	_, err := s.db.Exec(query, newSecretData, now, userID)
	if err != nil {
		return fmt.Errorf("gagal update password credential: %w", err)
	}
	return nil
}

// ListCredentials mengembalikan semua kredensial milik userID.
// PENTING: secret_data TIDAK diisi -- tidak boleh bocor ke frontend!
func (s *SQLCredentialStore) ListCredentials(userID string) ([]UserCredential, error) {
	var query string
	if s.isPostgres() {
		// Perhatikan: kita SELECT 7 kolom, TIDAK termasuk secret_data
		query = `SELECT id, user_id, type, identifier, name, created_at, updated_at
		         FROM user_credentials WHERE user_id = $1 ORDER BY created_at ASC`
	} else {
		query = `SELECT id, user_id, type, identifier, name, created_at, updated_at
		         FROM user_credentials WHERE user_id = ? ORDER BY created_at ASC`
	}

	rows, err := s.db.Query(query, userID)
	if err != nil {
		return nil, fmt.Errorf("gagal query credentials: %w", err)
	}
	defer rows.Close()

	var result []UserCredential
	for rows.Next() {
		var c UserCredential
		if err := rows.Scan(
			&c.ID, &c.UserID, &c.Type, &c.Identifier,
			&c.Name, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		// c.SecretData sengaja dikosongkan -- tidak di-SELECT dari DB
		result = append(result, c)
	}
	return result, nil
}
```

**Verifikasi Step 2:**
```bash
cd backend && go build ./...
```
Harus **0 error**.

---

### STEP 3 - Update `user_store.go`: Dual-Write & Dual-Read

**File:** `backend/internal/store/user_store.go`

Ada **5 perubahan kecil** di file ini. Kerjakan satu per satu.

---

#### Perubahan 3a - Tambah field ke struct `SQLUserStore`

**Cari:**
```go
type SQLUserStore struct {
	db         *sql.DB
	driverName string
}
```

**Ganti dengan:**
```go
type SQLUserStore struct {
	db              *sql.DB
	driverName      string
	credentialStore CredentialStore // nil = belum diset, backward-compatible
}
```

---

#### Perubahan 3b - Tambah method `SetCredentialStore`

**Lokasi:** Tepat setelah fungsi `NewSQLUserStore`.

**Tambahkan:**
```go
// SetCredentialStore menyuntikkan CredentialStore ke SQLUserStore.
// Dipanggil di main.go setelah kedua store dibuat.
func (s *SQLUserStore) SetCredentialStore(cs CredentialStore) {
	s.credentialStore = cs
}
```

---

#### Perubahan 3c - Update fungsi `Register` (tambah dual-write)

**Lokasi:** Fungsi `func (s *SQLUserStore) Register(...)`.

**Cari baris ini** (tepat sebelum `return user, nil`):
```go
	_, err = s.db.Exec(query, ...)
	if err != nil {
		return nil, fmt.Errorf("gagal simpan user: %w", err)
	}

	return user, nil
```

**Sisipkan blok ini DI ANTARA `}` penutup Exec dan `return user, nil`:**
```go
	// [Phase 3] Dual-write: simpan password hash ke user_credentials juga.
	// Jika credentialStore nil, skip -- tidak ada efek samping.
	if s.credentialStore != nil {
		_ = s.credentialStore.CreateCredential(&UserCredential{
			UserID:     user.ID,
			Type:       "password",
			Identifier: user.Username,
			SecretData: user.PasswordHash,
			Name:       "Password Akun",
			CreatedAt:  user.CreatedAt,
		})
		// Error CreateCredential diabaikan -- Register tetap berhasil via users.password_hash
	}
```

---

#### Perubahan 3d - Ganti seluruh fungsi `Authenticate` (dual-read)

**Lokasi:** Fungsi `func (s *SQLUserStore) Authenticate(username, password string) (*User, error)`.

**Ganti SELURUH fungsi (dari `func` sampai `}` penutup) dengan:**
```go
// Authenticate memvalidasi username + password.
// Dual-Read Strategy:
//   [1] Coba baca dari user_credentials (jalur baru)
//   [2] Fallback ke users.password_hash (jalur lama)
//   [3] Auto-backfill ke user_credentials jika login via fallback
func (s *SQLUserStore) Authenticate(username, password string) (*User, error) {
	user, err := s.GetUserByUsername(username)
	if err != nil {
		return nil, ErrUserNotFound
	}

	// [1] Coba jalur baru: user_credentials
	if s.credentialStore != nil {
		cred, _ := s.credentialStore.GetPasswordCredential(user.ID)
		if cred != nil {
			if err := bcrypt.CompareHashAndPassword([]byte(cred.SecretData), []byte(password)); err != nil {
				return nil, ErrInvalidPass
			}
			return user, nil
		}
		// cred == nil: user lama belum di-backfill, lanjut ke fallback
	}

	// [2] Fallback: jalur lama via users.password_hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidPass
	}

	// [3] Auto-backfill: isi user_credentials supaya login berikutnya pakai jalur baru
	if s.credentialStore != nil {
		_ = s.credentialStore.CreateCredential(&UserCredential{
			UserID:     user.ID,
			Type:       "password",
			Identifier: user.Username,
			SecretData: user.PasswordHash,
			Name:       "Password Akun",
		})
	}

	return user, nil
}
```

---

#### Perubahan 3e - Update fungsi `ChangePassword` (tambah dual-write)

**Lokasi:** Fungsi `func (s *SQLUserStore) ChangePassword(userID, newPasswordHash string) error`.

**Cari baris `return nil` terakhir di fungsi ini** (setelah `rows == 0` check).

**Sisipkan blok ini SEBELUM `return nil` terakhir:**
```go
	// [Phase 3] Sync perubahan password ke user_credentials juga.
	if s.credentialStore != nil {
		_ = s.credentialStore.UpdatePasswordCredential(userID, newPasswordHash)
	}
```

**Verifikasi Step 3:**
```bash
cd backend && go build ./...
```
Harus **0 error**.

---

### STEP 4 - Buat File `credential_handler.go` (File Baru)

**File:** `backend/internal/api/credential_handler.go`

**Apa yang dilakukan:** Endpoint `GET /api/auth/credentials` yang mengembalikan daftar metode login user.

**Isi file lengkap (buat file baru, copy-paste):**

```go
package api

import (
	"encoding/json"
	"net/http"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// CredentialHandler menangani permintaan terkait metode login user.
type CredentialHandler struct {
	credentialStore store.CredentialStore
}

// NewCredentialHandler membuat instance CredentialHandler.
func NewCredentialHandler(cs store.CredentialStore) *CredentialHandler {
	return &CredentialHandler{credentialStore: cs}
}

// ListCredentials mengembalikan daftar metode login milik user yang sedang login.
//
// Endpoint: GET /api/auth/credentials
// Header:   Authorization: Bearer <token>
// Response: [ { id, type, name, identifier, created_at, updated_at }, ... ]
// Catatan:  secret_data (hash password) TIDAK pernah dikembalikan.
func (h *CredentialHandler) ListCredentials(w http.ResponseWriter, r *http.Request) {
	// Ambil user ID dari JWT yang sudah divalidasi middleware RequireJWT
	claims, ok := r.Context().Value(auth.ClaimsKey).(*auth.UserClaims)
	if !ok || claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	credentials, err := h.credentialStore.ListCredentials(claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"gagal mengambil data"}`, http.StatusInternalServerError)
		return
	}

	// Jika nil (user lama belum punya record), kembalikan array kosong bukan null
	if credentials == nil {
		credentials = []store.UserCredential{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(credentials)
}
```

**Verifikasi Step 4:**
```bash
cd backend && go build ./...
```
Harus **0 error**.

---

### STEP 5 - Wire Up di `main.go`

**File:** `backend/main.go`

**Apa yang dilakukan:** Buat instance store baru, sambungkan ke userStore, daftarkan endpoint.

**Cari bagian** di `main.go` tempat `NewSQLDeviceStore` atau `NewSQLSessionStore` dibuat.
Tambahkan 4 baris berikut di bawahnya:

```go
// [Phase 3] CredentialStore
credentialStore := store.NewSQLCredentialStore(db, driverName)
userStore.SetCredentialStore(credentialStore)

// [Phase 3] Route endpoint list credentials
credentialHandler := api.NewCredentialHandler(credentialStore)
mux.HandleFunc("GET /api/auth/credentials", authMiddleware(credentialHandler.ListCredentials))
```

> [!NOTE]
> `db` dan `driverName` adalah variabel yang **sudah ada** di main.go.
> `authMiddleware` adalah fungsi yang **sudah ada** untuk wrapping RequireJWT.
> Ikuti persis pola yang sama dengan DeviceHandler atau SessionHandler.

**Verifikasi Step 5:**
```bash
cd backend && go build ./...
```
Harus **0 error**.

---

### STEP 6 - Tulis Unit Test (File Baru)

**File:** `backend/internal/store/credential_store_test.go`

**Isi file lengkap (4 skenario test, copy-paste):**

```go
package store_test

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// setupTestCredentialDB menyiapkan SQLite in-memory + DDL tabel untuk test.
func setupTestCredentialDB(t *testing.T) (*sql.DB, store.CredentialStore) {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("gagal buka sqlite: %v", err)
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS user_credentials (
		id VARCHAR(64) PRIMARY KEY,
		user_id VARCHAR(64) NOT NULL,
		type VARCHAR(32) NOT NULL,
		identifier TEXT DEFAULT '',
		secret_data TEXT NOT NULL,
		name VARCHAR(128) DEFAULT '',
		created_at TIMESTAMP NOT NULL,
		updated_at TIMESTAMP NOT NULL
	)`)
	if err != nil {
		t.Fatalf("gagal buat tabel: %v", err)
	}
	cs := store.NewSQLCredentialStore(db, "sqlite")
	return db, cs
}

// Skenario 1: Simpan kredensial baru, lalu baca kembali
func TestCredentialStore_CreateAndGet(t *testing.T) {
	_, cs := setupTestCredentialDB(t)

	err := cs.CreateCredential(&store.UserCredential{
		UserID:     "user-abc",
		Type:       "password",
		Identifier: "alice",
		SecretData: "$2a$10$fakehash",
		Name:       "Password Akun",
	})
	if err != nil {
		t.Fatalf("CreateCredential gagal: %v", err)
	}

	cred, err := cs.GetPasswordCredential("user-abc")
	if err != nil {
		t.Fatalf("GetPasswordCredential gagal: %v", err)
	}
	if cred == nil {
		t.Fatal("seharusnya ditemukan, tapi nil")
	}
	if cred.SecretData != "$2a$10$fakehash" {
		t.Errorf("SecretData tidak cocok: got %q", cred.SecretData)
	}
}

// Skenario 2: User yang belum punya record -> kembalikan nil, BUKAN error
func TestCredentialStore_GetPasswordCredential_NotFound(t *testing.T) {
	_, cs := setupTestCredentialDB(t)

	cred, err := cs.GetPasswordCredential("user-tidak-ada")
	if err != nil {
		t.Fatalf("seharusnya tidak error, got: %v", err)
	}
	if cred != nil {
		t.Fatal("seharusnya nil karena tidak ditemukan")
	}
}

// Skenario 3: Update password hash berhasil
func TestCredentialStore_UpdatePassword(t *testing.T) {
	_, cs := setupTestCredentialDB(t)

	_ = cs.CreateCredential(&store.UserCredential{
		UserID:     "user-xyz",
		Type:       "password",
		Identifier: "bob",
		SecretData: "$2a$10$oldhash",
		Name:       "Password Akun",
	})

	err := cs.UpdatePasswordCredential("user-xyz", "$2a$10$newhash")
	if err != nil {
		t.Fatalf("UpdatePasswordCredential gagal: %v", err)
	}

	cred, _ := cs.GetPasswordCredential("user-xyz")
	if cred == nil || cred.SecretData != "$2a$10$newhash" {
		t.Errorf("hash tidak terupdate, got: %v", cred)
	}
}

// Skenario 4: ListCredentials mengembalikan data TANPA secret_data
func TestCredentialStore_ListCredentials(t *testing.T) {
	_, cs := setupTestCredentialDB(t)

	_ = cs.CreateCredential(&store.UserCredential{
		UserID:     "user-list",
		Type:       "password",
		Identifier: "charlie",
		SecretData: "$2a$10$shouldnotappear",
		Name:       "Password Akun",
	})

	list, err := cs.ListCredentials("user-list")
	if err != nil {
		t.Fatalf("ListCredentials gagal: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("seharusnya 1 credential, got %d", len(list))
	}
	// Verifikasi keamanan: secret_data harus kosong di hasil list
	if list[0].SecretData != "" {
		t.Error("KEAMANAN: SecretData seharusnya kosong di list, tidak boleh bocor ke frontend!")
	}
}
```

**Verifikasi Step 6:**
```bash
cd backend && go test -v ./internal/store/...
```
Harus **PASS 100% (4/4)**.

---

### STEP 7 - Verifikasi Final (Full Test Suite)

```bash
# 1. Test seluruh backend (tidak boleh ada regresi)
cd backend && go test -v ./...

# 2. Build frontend (tidak ada perubahan, tapi tetap verifikasi)
cd frontend && npm run build
```

Kedua perintah harus **PASS 100%** tanpa error.

---

## Rencana Verifikasi

| Test | Target | Perintah |
|------|--------|----------|
| Unit test credential store (4 skenario) | PASS 100% | `go test -v ./internal/store/...` |
| Semua test lama tidak regresi | PASS 100% | `go test ./...` |
| Frontend compile | 0 error | `npm run build` |
| Build binary | 0 error | `go build ./...` |

---

## Yang TIDAK Dikerjakan di Phase 3

| Hal | Alasan |
|-----|--------|
| Hapus `password_hash` dari tabel `users` | Terlalu dini -- hanya setelah Phase 4 stabil |
| Tambah UI/UX baru di frontend | Phase 3 adalah perubahan internal backend saja |
| Implementasi Passkey/WebAuthn | Itu Phase 4 -- setelah Phase 3 selesai |
| Migrasi data manual (bulk SQL) | Auto-backfill saat login sudah cukup dan lebih aman |

---

## Decision Log

| ID | Keputusan | Alasan |
|----|-----------|--------|
| DEC-001 | Kolom `password_hash` di `users` TIDAK dihapus | Non-destructive -- rollback aman tanpa kehilangan data |
| DEC-002 | Auto-backfill saat login, bukan bulk migration | Lebih aman -- menghindari downtime dan operasi TRUNCATE |
| DEC-003 | `GetPasswordCredential` mengembalikan `nil, nil` jika tidak ada | User lama valid -- kondisi ini bukan error |
| DEC-004 | `ListCredentials` tidak menyertakan `secret_data` | Keamanan -- hash password tidak boleh bocor ke frontend |
| DEC-005 | Inject via `SetCredentialStore(cs)` bukan di constructor | Backward-compatible -- test lama tidak perlu diubah |
