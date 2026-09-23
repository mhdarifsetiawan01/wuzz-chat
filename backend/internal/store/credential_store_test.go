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
