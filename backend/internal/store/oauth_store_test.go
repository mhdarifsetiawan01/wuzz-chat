package store_test

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/testutil/pgtest"
)

// openMessageStore membuka store uji: PostgreSQL bila PG_TEST_ADMIN_DSN diisi, selain itu SQLite sementara.
func openMessageStore(t *testing.T, sqliteName string) *store.SQLMessageStore {
	t.Helper()
	driver, target := "sqlite", filepath.Join(t.TempDir(), sqliteName)
	if dsn, ok := pgtest.NewDSN(t); ok {
		driver, target = "postgres", dsn
	}
	ms, err := store.NewSQLMessageStore(driver, target)
	if err != nil {
		t.Fatalf("gagal init store (%s): %v", driver, err)
	}
	t.Cleanup(func() { ms.Close() })
	if driver == "postgres" {
		pgtest.ProductionShape(t, ms.DB())
	}
	return ms
}

func setupOAuthStore(t *testing.T) (*store.SQLOAuthStore, *store.SQLUserStore, context.Context) {
	t.Helper()
	ms := openMessageStore(t, "oauth.db")
	return store.NewSQLOAuthStore(ms.DB(), ms.DriverName()),
		store.NewSQLUserStore(ms.DB(), ms.DriverName()),
		tenantshared.WithTenant(context.Background(), "default")
}

// mkUser membuat akun Google-only dan mengembalikan userID.
func mkUser(ctx context.Context, oas *store.SQLOAuthStore, provider, sub, username string) (string, error) {
	return oas.CreateUserWithOAuth(ctx, username, username, provider, sub, username+"@example.com")
}

func TestOAuthStore_CreateUserWithOAuth(t *testing.T) {
	oas, us, ctx := setupOAuthStore(t)

	u, err := mkUser(ctx, oas, "google", "sub-1", "alice")
	if err != nil {
		t.Fatalf("create gagal: %v", err)
	}
	if stored, err := us.GetUserByID(u); err != nil || stored.PasswordHash != "" {
		t.Fatalf("akun Google-only harus punya password_hash kosong (err=%v)", err)
	}

	id, found, err := oas.FindUserIDBySubject(ctx, "google", "sub-1")
	if err != nil || !found || id != u {
		t.Fatalf("FindUserIDBySubject = (%q,%v,%v), mau (%q,true,nil)", id, found, err, u)
	}
	sub, ok, err := oas.GetLinkedSubject(ctx, u, "google")
	if err != nil || !ok || sub != "sub-1" {
		t.Fatalf("GetLinkedSubject = (%q,%v,%v)", sub, ok, err)
	}
	if _, found, _ := oas.FindUserIDBySubject(ctx, "google", "sub-lain"); found {
		t.Fatal("sub lain tidak boleh ditemukan")
	}

	// Tidak ada baris password: login password mustahil.
	if ok, err := us.VerifyPassword(u, ""); err != nil || ok {
		t.Fatalf("VerifyPassword password kosong harus false, dapat (%v,%v)", ok, err)
	}
	if ok, _ := us.VerifyPassword(u, "apa-saja"); ok {
		t.Fatal("VerifyPassword harus false untuk akun tanpa password")
	}
}

func TestOAuthStore_UsernameTaken_NoOrphanCredential(t *testing.T) {
	oas, _, ctx := setupOAuthStore(t)

	if _, err := mkUser(ctx, oas, "google", "sub-1", "alice"); err != nil {
		t.Fatal(err)
	}
	// Username sama (beda huruf besar/kecil) dengan Google lain -> ditolak, sub-2 tidak boleh tertinggal.
	_, err := mkUser(ctx, oas, "google", "sub-2", "ALICE")
	if !errors.Is(err, store.ErrUserExists) {
		t.Fatalf("seharusnya ErrUserExists, dapat %v", err)
	}
	if _, found, _ := oas.FindUserIDBySubject(ctx, "google", "sub-2"); found {
		t.Fatal("kredensial yatim tertinggal setelah pembuatan user gagal")
	}
}

func TestOAuthStore_SubjectTaken_RollsBackUser(t *testing.T) {
	oas, us, ctx := setupOAuthStore(t)

	if _, err := mkUser(ctx, oas, "google", "sub-1", "alice"); err != nil {
		t.Fatal(err)
	}
	// Google yang sama dipakai membuat akun lain: harus gagal DAN user "bob" tidak boleh tertinggal (atomik).
	_, err := mkUser(ctx, oas, "google", "sub-1", "bob")
	if !errors.Is(err, store.ErrOAuthSubjectTaken) {
		t.Fatalf("seharusnya ErrOAuthSubjectTaken, dapat %v", err)
	}
	if u, err := us.GetUserByUsernameWithContext(ctx, "bob"); err == nil && u != nil {
		t.Fatal("user bob tertinggal tanpa kredensial: transaksi tidak atomik")
	}
	// Username bob harus masih bisa dipakai.
	if _, err := mkUser(ctx, oas, "google", "sub-3", "bob"); err != nil {
		t.Fatalf("username bob harus bebas setelah rollback: %v", err)
	}
}

func TestOAuthStore_LinkOAuth(t *testing.T) {
	oas, us, ctx := setupOAuthStore(t)

	legacy, err := us.RegisterWithContext(ctx, "legacy", "Legacy", "password123")
	if err != nil {
		t.Fatal(err)
	}
	other, err := us.RegisterWithContext(ctx, "other", "Other", "password123")
	if err != nil {
		t.Fatal(err)
	}

	if err := oas.LinkOAuth(ctx, legacy.ID, "google", "sub-L", "legacy@example.com"); err != nil {
		t.Fatalf("link gagal: %v", err)
	}
	// Akun yang sama tidak boleh punya dua Google.
	if err := oas.LinkOAuth(ctx, legacy.ID, "google", "sub-L2", "x"); !errors.Is(err, store.ErrOAuthAlreadyLinked) {
		t.Fatalf("seharusnya ErrOAuthAlreadyLinked, dapat %v", err)
	}
	// Satu Google tidak boleh ke dua akun.
	if err := oas.LinkOAuth(ctx, other.ID, "google", "sub-L", "x"); !errors.Is(err, store.ErrOAuthSubjectTaken) {
		t.Fatalf("seharusnya ErrOAuthSubjectTaken, dapat %v", err)
	}
	// Password lama tetap berfungsi setelah penautan.
	if ok, _ := us.VerifyPassword(legacy.ID, "password123"); !ok {
		t.Fatal("password lama harus tetap valid setelah menautkan Google")
	}
}

func TestOAuthStore_ReplaceOAuth(t *testing.T) {
	oas, _, ctx := setupOAuthStore(t)

	a, err := mkUser(ctx, oas, "google", "sub-A", "alice")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := mkUser(ctx, oas, "google", "sub-B", "bob"); err != nil {
		t.Fatal(err)
	}

	// old subject salah -> ditolak, tautan lama utuh.
	if err := oas.ReplaceOAuth(ctx, a, "google", "sub-salah", "sub-C", "c"); !errors.Is(err, store.ErrOAuthNotLinked) {
		t.Fatalf("seharusnya ErrOAuthNotLinked, dapat %v", err)
	}
	// new subject sudah dipakai akun lain -> ditolak dan tautan lama TIDAK hilang (rollback).
	if err := oas.ReplaceOAuth(ctx, a, "google", "sub-A", "sub-B", "b"); !errors.Is(err, store.ErrOAuthSubjectTaken) {
		t.Fatalf("seharusnya ErrOAuthSubjectTaken, dapat %v", err)
	}
	if sub, ok, _ := oas.GetLinkedSubject(ctx, a, "google"); !ok || sub != "sub-A" {
		t.Fatalf("tautan lama harus utuh setelah ganti gagal, dapat (%q,%v)", sub, ok)
	}
	// ganti sukses
	if err := oas.ReplaceOAuth(ctx, a, "google", "sub-A", "sub-C", "c"); err != nil {
		t.Fatalf("ganti gagal: %v", err)
	}
	if _, found, _ := oas.FindUserIDBySubject(ctx, "google", "sub-A"); found {
		t.Fatal("sub lama harus lepas")
	}
	if id, found, _ := oas.FindUserIDBySubject(ctx, "google", "sub-C"); !found || id != a {
		t.Fatal("sub baru harus tertaut ke akun")
	}
}

func TestOAuthStore_EraseUserFreesSubject(t *testing.T) {
	ms := openMessageStore(t, "erase.db")
	oas := store.NewSQLOAuthStore(ms.DB(), ms.DriverName())
	ctx := tenantshared.WithTenant(context.Background(), "default")

	u, err := mkUser(ctx, oas, "google", "sub-X", "alice")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.NewSQLAccountEraser(ms.DB(), ms.DriverName()).EraseUser(ctx, u); err != nil {
		t.Fatalf("EraseUser gagal: %v", err)
	}
	// Setelah akun dihapus, Google yang sama bebas dipakai mendaftar lagi (syarat hapus akun & klaim ulang username).
	if _, found, _ := oas.FindUserIDBySubject(ctx, "google", "sub-X"); found {
		t.Fatal("kredensial oauth harus ikut terhapus saat hapus akun")
	}
	if _, err := mkUser(ctx, oas, "google", "sub-X", "alice"); err != nil {
		t.Fatalf("daftar ulang dengan Google & username yang sama harus bisa: %v", err)
	}
}

func TestOAuthStore_UnlinkOAuth(t *testing.T) {
	oas, us, ctx := setupOAuthStore(t)

	legacy, err := us.RegisterWithContext(ctx, "legacy", "Legacy", "password123")
	if err != nil {
		t.Fatal(err)
	}
	if err := oas.UnlinkOAuth(ctx, legacy.ID, "google"); !errors.Is(err, store.ErrOAuthNotLinked) {
		t.Fatalf("unlink tanpa tautan harus ErrOAuthNotLinked, dapat %v", err)
	}
	if err := oas.LinkOAuth(ctx, legacy.ID, "google", "sub-L", "x"); err != nil {
		t.Fatal(err)
	}
	if err := oas.UnlinkOAuth(ctx, legacy.ID, "google"); err != nil {
		t.Fatalf("unlink gagal: %v", err)
	}
	if _, found, _ := oas.FindUserIDBySubject(ctx, "google", "sub-L"); found {
		t.Fatal("sub harus lepas setelah unlink")
	}
	// Setelah lepas, bisa ditautkan lagi (ke akun mana pun).
	if err := oas.LinkOAuth(ctx, legacy.ID, "google", "sub-L", "x"); err != nil {
		t.Fatalf("tautkan ulang gagal: %v", err)
	}
}

// Skenario deploy: database yang sudah berisi akun password lama dibuka ulang oleh versi baru (migrasi indeks oauth
// berjalan di atas data yang ada). Migrasi harus idempoten, tidak boleh gagal, dan login password lama tetap sah.
func TestOAuthMigration_ReopenWithExistingPasswordAccounts(t *testing.T) {
	driver, target := "sqlite", filepath.Join(t.TempDir(), "reopen.db")
	if dsn, ok := pgtest.NewDSN(t); ok {
		driver, target = "postgres", dsn
	}
	ctx := tenantshared.WithTenant(context.Background(), "default")

	first, err := store.NewSQLMessageStore(driver, target)
	if err != nil {
		t.Fatal(err)
	}
	if driver == "postgres" {
		pgtest.ProductionShape(t, first.DB())
	}
	users := store.NewSQLUserStore(first.DB(), first.DriverName())
	users.SetCredentialStore(store.NewSQLCredentialStore(first.DB(), first.DriverName()))
	legacy, err := users.RegisterWithContext(ctx, "legacy", "Legacy", "password123")
	if err != nil {
		t.Fatal(err)
	}
	first.Close()

	// Buka ulang dua kali berturut-turut (restart server) di atas data yang sudah ada.
	for i := 0; i < 2; i++ {
		again, err := store.NewSQLMessageStore(driver, target)
		if err != nil {
			t.Fatalf("migrasi pada database berisi data gagal (buka ke-%d): %v", i+1, err)
		}
		u := store.NewSQLUserStore(again.DB(), again.DriverName())
		u.SetCredentialStore(store.NewSQLCredentialStore(again.DB(), again.DriverName()))
		got, err := u.Authenticate("legacy", "password123")
		if err != nil || got.ID != legacy.ID {
			t.Fatalf("login password lama harus tetap sah setelah migrasi (buka ke-%d): %v", i+1, err)
		}
		if _, err := u.Authenticate("legacy", "salah"); err == nil {
			t.Fatal("password salah tetap harus ditolak")
		}
		again.Close()
	}
}
