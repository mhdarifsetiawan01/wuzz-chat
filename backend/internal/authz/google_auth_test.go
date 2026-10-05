package authz_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	"github.com/bms-del112/wuzz-chat/internal/authz/google"
	"github.com/bms-del112/wuzz-chat/internal/authz/infra"
	sharederrors "github.com/bms-del112/wuzz-chat/internal/shared/errors"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	sharedvalidator "github.com/bms-del112/wuzz-chat/internal/shared/validator"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// fakeVerifier mengganti verifikasi JWKS: token uji dipetakan langsung ke identitas.
type fakeVerifier struct {
	ids map[string]*google.Identity
}

func (f *fakeVerifier) Verify(_ context.Context, tok string) (*google.Identity, error) {
	if id, ok := f.ids[tok]; ok {
		cp := *id
		return &cp, nil
	}
	return nil, google.ErrInvalidIDToken
}

// give mendaftarkan token uji: sub, dan usia token (0 = baru diterbitkan).
func (f *fakeVerifier) give(tok, sub string, age time.Duration) {
	f.ids[tok] = &google.Identity{Subject: sub, Email: sub + "@example.com", EmailVerified: true, IssuedAt: time.Now().Add(-age)}
}

type googleEnv struct {
	svc      *authz.AuthService
	users    *store.SQLUserStore
	oauth    *store.SQLOAuthStore
	verifier *fakeVerifier
	ctx      context.Context
}

func setupGoogleEnv(t *testing.T) *googleEnv {
	t.Helper()
	sqlStore := newTestStore(t, "google.db")

	drv := sqlStore.DriverName()
	users := store.NewSQLUserStore(sqlStore.DB(), drv)
	users.SetCredentialStore(store.NewSQLCredentialStore(sqlStore.DB(), drv))
	repo := infra.NewSQLAuthRepository(users,
		store.NewSQLSessionStore(sqlStore.DB(), drv), store.NewSQLDeviceStore(sqlStore.DB(), drv),
		store.NewSQLTokenStore(sqlStore.DB(), drv), store.NewSQLTransferStore(sqlStore.DB(), drv))

	svc := authz.NewAuthService(repo, nil)
	oauth := store.NewSQLOAuthStore(sqlStore.DB(), drv)
	v := &fakeVerifier{ids: map[string]*google.Identity{}}
	svc.SetGoogleAuth(v, oauth)

	return &googleEnv{svc: svc, users: users, oauth: oauth, verifier: v, ctx: context.Background()}
}

// signupGoogle menjalankan alur lengkap akun baru: sign-in (belum tertaut) lalu register.
func (e *googleEnv) signupGoogle(t *testing.T, tok, sub, username string) *authz.RegisterResult {
	t.Helper()
	e.verifier.give(tok, sub, 0)
	res, err := e.svc.GoogleSignIn(e.ctx, tok, authz.GoogleDevice{})
	if err != nil || res.NotLinked == nil {
		t.Fatalf("sign-in awal harus NotLinked, dapat (%+v, %v)", res, err)
	}
	reg, err := e.svc.GoogleRegister(e.ctx, authz.GoogleRegisterInput{
		LinkToken: res.NotLinked.LinkToken, Username: username,
		Device: authz.GoogleDevice{DeviceID: "dev-" + username},
	})
	if err != nil {
		t.Fatalf("register gagal: %v", err)
	}
	return reg
}

func TestGoogle_NewAccountFlow(t *testing.T) {
	e := setupGoogleEnv(t)
	reg := e.signupGoogle(t, "tok-alice", "sub-alice", "alice")

	if reg.Token == "" || reg.UserID == "" {
		t.Fatalf("hasil register tidak lengkap: %+v", reg)
	}
	claims, err := auth.ValidateToken(reg.Token)
	if err != nil || claims.UserID != reg.UserID || claims.Username != "alice" {
		t.Fatalf("JWT hasil register salah: %+v err=%v", claims, err)
	}

	// Sign-in berikutnya langsung login.
	res, err := e.svc.GoogleSignIn(e.ctx, "tok-alice", authz.GoogleDevice{DeviceID: "dev-alice"})
	if err != nil || res.Login == nil || res.Login.UserID != reg.UserID {
		t.Fatalf("sign-in kedua harus login ke akun yang sama, dapat (%+v, %v)", res, err)
	}

	// Akun Google-only tidak bisa login dengan password apa pun.
	for _, pw := range []string{"", "password", "alice", "123456"} {
		if _, _, err := e.svc.Login(authz.LoginInput{Username: "alice", Password: pw, DeviceID: "x"}); !errors.Is(err, authz.ErrInvalidCredentials) {
			t.Fatalf("login password %q untuk akun Google-only harus ditolak, dapat %v", pw, err)
		}
	}
}

func TestGoogle_Register_Validation(t *testing.T) {
	e := setupGoogleEnv(t)
	e.verifier.give("tok-x", "sub-x", 0)
	res, err := e.svc.GoogleSignIn(e.ctx, "tok-x", authz.GoogleDevice{})
	if err != nil || res.NotLinked == nil {
		t.Fatalf("setup: %v", err)
	}
	link := res.NotLinked.LinkToken

	for name, username := range map[string]string{"terlarang": "admin", "pendek": "ab", "karakter ilegal": "a b c", "kosong": ""} {
		t.Run(name, func(t *testing.T) {
			if _, err := e.svc.GoogleRegister(e.ctx, authz.GoogleRegisterInput{LinkToken: link, Username: username}); err == nil {
				t.Fatalf("username %q harus ditolak", username)
			}
		})
	}
	if _, err := e.svc.GoogleRegister(e.ctx, authz.GoogleRegisterInput{LinkToken: link, Username: "valid_name", DisplayName: string(make([]byte, 51))}); !errors.Is(err, sharedvalidator.ErrDisplayNameTooLong) {
		t.Fatalf("display name kepanjangan harus ditolak, dapat %v", err)
	}
	// Setelah semua penolakan, token masih berlaku (tidak terpakai) dan tidak ada user yatim.
	if _, found, _ := e.oauth.FindUserIDBySubject(e.ctx, "google", "sub-x"); found {
		t.Fatal("tidak boleh ada akun terbentuk dari percobaan yang ditolak")
	}
	if _, err := e.svc.GoogleRegister(e.ctx, authz.GoogleRegisterInput{LinkToken: link, Username: "valid_name"}); err != nil {
		t.Fatalf("token yang sama masih harus bisa dipakai setelah penolakan validasi: %v", err)
	}
}

func TestGoogle_Register_UsernameTaken(t *testing.T) {
	e := setupGoogleEnv(t)
	e.signupGoogle(t, "tok-a", "sub-a", "alice")

	e.verifier.give("tok-b", "sub-b", 0)
	res, _ := e.svc.GoogleSignIn(e.ctx, "tok-b", authz.GoogleDevice{})
	_, err := e.svc.GoogleRegister(e.ctx, authz.GoogleRegisterInput{LinkToken: res.NotLinked.LinkToken, Username: "Alice"})
	if !errors.Is(err, store.ErrUserExists) {
		t.Fatalf("username bentrok (beda huruf) harus ErrUserExists, dapat %v", err)
	}
	// Token tetap sah: pengguna bisa memilih username lain tanpa login Google ulang.
	if _, err := e.svc.GoogleRegister(e.ctx, authz.GoogleRegisterInput{LinkToken: res.NotLinked.LinkToken, Username: "alice2"}); err != nil {
		t.Fatalf("pilih username lain harus berhasil: %v", err)
	}
}

func TestGoogle_Register_LinkTokenReplayAndForgery(t *testing.T) {
	e := setupGoogleEnv(t)
	e.verifier.give("tok-a", "sub-a", 0)
	res, _ := e.svc.GoogleSignIn(e.ctx, "tok-a", authz.GoogleDevice{})
	link := res.NotLinked.LinkToken

	if _, err := e.svc.GoogleRegister(e.ctx, authz.GoogleRegisterInput{LinkToken: link, Username: "alice"}); err != nil {
		t.Fatal(err)
	}
	// Pakai ulang token yang sama untuk membuat akun kedua: ditolak (sub unik).
	if _, err := e.svc.GoogleRegister(e.ctx, authz.GoogleRegisterInput{LinkToken: link, Username: "mallory"}); !errors.Is(err, sharederrors.ErrOAuthSubjectTaken) {
		t.Fatalf("replay token harus ErrOAuthSubjectTaken, dapat %v", err)
	}
	if u, err := e.users.GetUserByUsernameWithContext(e.ctx, "mallory"); err == nil && u != nil {
		t.Fatal("akun kedua tidak boleh terbentuk dari replay token")
	}

	// Token palsu / token sesi / kosong ditolak.
	session, _ := auth.GenerateToken("u1", "x", "x")
	for name, tok := range map[string]string{"sampah": "abc", "token sesi": session, "kosong": ""} {
		if _, err := e.svc.GoogleRegister(e.ctx, authz.GoogleRegisterInput{LinkToken: tok, Username: "eve"}); !errors.Is(err, auth.ErrInvalidLinkToken) {
			t.Fatalf("%s: harus ErrInvalidLinkToken, dapat %v", name, err)
		}
	}
}

func TestGoogle_LinkExistingAccount(t *testing.T) {
	e := setupGoogleEnv(t)
	legacy, err := e.users.RegisterWithContext(e.ctx, "legacy", "Legacy", "password123")
	if err != nil {
		t.Fatal(err)
	}

	e.verifier.give("tok-L", "sub-L", 0)
	res, _ := e.svc.GoogleSignIn(e.ctx, "tok-L", authz.GoogleDevice{})
	link := res.NotLinked.LinkToken
	dev := authz.GoogleDevice{DeviceID: "dev-legacy"}

	// Password salah: ditolak dan TIDAK tertaut.
	if _, _, err := e.svc.GoogleLinkExisting(e.ctx, authz.GoogleLinkInput{LinkToken: link, Username: "legacy", Password: "salah", Device: dev}); !errors.Is(err, authz.ErrInvalidCredentials) {
		t.Fatalf("password salah harus ErrInvalidCredentials, dapat %v", err)
	}
	// Username tidak ada: pesan sama (tidak membocorkan keberadaan username).
	if _, _, err := e.svc.GoogleLinkExisting(e.ctx, authz.GoogleLinkInput{LinkToken: link, Username: "tidak-ada", Password: "x", Device: dev}); !errors.Is(err, authz.ErrInvalidCredentials) {
		t.Fatalf("username tak ada harus ErrInvalidCredentials, dapat %v", err)
	}
	if _, found, _ := e.oauth.FindUserIDBySubject(e.ctx, "google", "sub-L"); found {
		t.Fatal("tautan tidak boleh terbentuk tanpa password benar")
	}

	// Password benar: tertaut dan login.
	login, conflict, err := e.svc.GoogleLinkExisting(e.ctx, authz.GoogleLinkInput{LinkToken: link, Username: "legacy", Password: "password123", Device: dev})
	if err != nil || conflict != nil || login.UserID != legacy.ID {
		t.Fatalf("link harus sukses, dapat (%+v, %+v, %v)", login, conflict, err)
	}
	// Sesudahnya Google langsung login, dan password lama tetap berfungsi.
	if r, err := e.svc.GoogleSignIn(e.ctx, "tok-L", authz.GoogleDevice{DeviceID: "dev-legacy"}); err != nil || r.Login == nil || r.Login.UserID != legacy.ID {
		t.Fatalf("sign-in Google setelah tertaut harus login: (%+v, %v)", r, err)
	}
	if _, _, err := e.svc.Login(authz.LoginInput{Username: "legacy", Password: "password123", DeviceID: "dev-legacy"}); err != nil {
		t.Fatalf("password lama harus tetap berfungsi: %v", err)
	}
}

func TestGoogle_LinkExisting_Conflicts(t *testing.T) {
	e := setupGoogleEnv(t)
	if _, err := e.users.RegisterWithContext(e.ctx, "legacy", "Legacy", "password123"); err != nil {
		t.Fatal(err)
	}
	if _, err := e.users.RegisterWithContext(e.ctx, "other", "Other", "password123"); err != nil {
		t.Fatal(err)
	}
	e.signupGoogle(t, "tok-owner", "sub-owner", "owner")

	// Google yang sudah dimiliki akun "owner" tidak boleh ditautkan ke akun lain.
	e.verifier.give("tok-owner2", "sub-owner", 0)
	// sign-in dengan sub yang sudah tertaut tidak memberi link token, jadi buat token sendiri.
	linkTok, _, err := auth.GenerateLinkToken("google", "sub-owner", "owner@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := e.svc.GoogleLinkExisting(e.ctx, authz.GoogleLinkInput{LinkToken: linkTok, Username: "legacy", Password: "password123"}); !errors.Is(err, sharederrors.ErrOAuthSubjectTaken) {
		t.Fatalf("Google milik akun lain harus ErrOAuthSubjectTaken, dapat %v", err)
	}

	// Akun yang sudah punya Google tidak boleh menautkan Google kedua.
	e.verifier.give("tok-1", "sub-1", 0)
	r1, _ := e.svc.GoogleSignIn(e.ctx, "tok-1", authz.GoogleDevice{})
	if _, _, err := e.svc.GoogleLinkExisting(e.ctx, authz.GoogleLinkInput{LinkToken: r1.NotLinked.LinkToken, Username: "legacy", Password: "password123"}); err != nil {
		t.Fatal(err)
	}
	e.verifier.give("tok-2", "sub-2", 0)
	r2, _ := e.svc.GoogleSignIn(e.ctx, "tok-2", authz.GoogleDevice{})
	if _, _, err := e.svc.GoogleLinkExisting(e.ctx, authz.GoogleLinkInput{LinkToken: r2.NotLinked.LinkToken, Username: "legacy", Password: "password123"}); !errors.Is(err, sharederrors.ErrOAuthAlreadyLinked) {
		t.Fatalf("Google kedua harus ErrOAuthAlreadyLinked, dapat %v", err)
	}
}

func TestGoogle_DeviceLimit(t *testing.T) {
	e := setupGoogleEnv(t)
	e.signupGoogle(t, "tok-a", "sub-a", "alice") // perangkat 1: dev-alice
	for _, d := range []string{"dev-2"} {
		if r, err := e.svc.GoogleSignIn(e.ctx, "tok-a", authz.GoogleDevice{DeviceID: d}); err != nil || r.Login == nil {
			t.Fatalf("perangkat %s harus bisa login: (%+v, %v)", d, r, err)
		}
	}

	// Perangkat ke-3 ditolak dengan konflik, sama seperti login password.
	r, err := e.svc.GoogleSignIn(e.ctx, "tok-a", authz.GoogleDevice{DeviceID: "dev-3"})
	if err != nil || r.Conflict == nil || r.Login != nil {
		t.Fatalf("perangkat ke-3 harus konflik, dapat (%+v, %v)", r, err)
	}
	// Dengan konfirmasi, perangkat tertua digantikan.
	r, err = e.svc.GoogleSignIn(e.ctx, "tok-a", authz.GoogleDevice{DeviceID: "dev-3", ConfirmOverride: true})
	if err != nil || r.Login == nil {
		t.Fatalf("override harus sukses, dapat (%+v, %v)", r, err)
	}
}

func TestGoogle_LinkGoogleToAccount(t *testing.T) {
	e := setupGoogleEnv(t)
	legacy, _ := e.users.RegisterWithContext(e.ctx, "legacy", "Legacy", "password123")

	// Token basi (10 menit) ditolak untuk aksi menautkan.
	e.verifier.give("tok-stale", "sub-L", 10*time.Minute)
	if err := e.svc.LinkGoogleToAccount(e.ctx, legacy.ID, "tok-stale"); !errors.Is(err, authz.ErrGoogleReauthStale) {
		t.Fatalf("token basi harus ErrGoogleReauthStale, dapat %v", err)
	}
	// Token tak dikenal ditolak.
	if err := e.svc.LinkGoogleToAccount(e.ctx, legacy.ID, "tok-palsu"); !errors.Is(err, google.ErrInvalidIDToken) {
		t.Fatalf("token palsu harus ErrInvalidIDToken, dapat %v", err)
	}

	e.verifier.give("tok-L", "sub-L", 0)
	if err := e.svc.LinkGoogleToAccount(e.ctx, legacy.ID, "tok-L"); err != nil {
		t.Fatalf("tautkan harus sukses: %v", err)
	}
	// Idempoten untuk akun yang sama.
	if err := e.svc.LinkGoogleToAccount(e.ctx, legacy.ID, "tok-L"); err != nil {
		t.Fatalf("tautkan ulang ke akun yang sama harus idempoten: %v", err)
	}
	// Akun lain tidak bisa mengambil Google yang sama.
	other, _ := e.users.RegisterWithContext(e.ctx, "other", "Other", "password123")
	if err := e.svc.LinkGoogleToAccount(e.ctx, other.ID, "tok-L"); !errors.Is(err, sharederrors.ErrOAuthSubjectTaken) {
		t.Fatalf("harus ErrOAuthSubjectTaken, dapat %v", err)
	}
	// Akun yang sudah punya Google tidak bisa menautkan yang kedua.
	e.verifier.give("tok-M", "sub-M", 0)
	if err := e.svc.LinkGoogleToAccount(e.ctx, legacy.ID, "tok-M"); !errors.Is(err, sharederrors.ErrOAuthAlreadyLinked) {
		t.Fatalf("harus ErrOAuthAlreadyLinked, dapat %v", err)
	}
}

func TestGoogle_VerifyReauth(t *testing.T) {
	e := setupGoogleEnv(t)
	reg := e.signupGoogle(t, "tok-a", "sub-a", "alice")
	legacy, _ := e.users.RegisterWithContext(e.ctx, "legacy", "Legacy", "password123")

	e.verifier.give("tok-a-baru", "sub-a", time.Minute)
	if err := e.svc.VerifyGoogleReauth(e.ctx, reg.UserID, "tok-a-baru"); err != nil {
		t.Fatalf("re-auth sah harus lolos: %v", err)
	}
	e.verifier.give("tok-a-basi", "sub-a", 6*time.Minute)
	if err := e.svc.VerifyGoogleReauth(e.ctx, reg.UserID, "tok-a-basi"); !errors.Is(err, authz.ErrGoogleReauthStale) {
		t.Fatalf("token basi harus ditolak, dapat %v", err)
	}
	// Google milik orang lain tidak bisa dipakai untuk re-auth akun ini.
	e.verifier.give("tok-b", "sub-b", 0)
	if err := e.svc.VerifyGoogleReauth(e.ctx, reg.UserID, "tok-b"); !errors.Is(err, authz.ErrGoogleMismatch) {
		t.Fatalf("sub lain harus ErrGoogleMismatch, dapat %v", err)
	}
	// Akun tanpa Google tertaut tidak bisa re-auth lewat Google sama sekali.
	if err := e.svc.VerifyGoogleReauth(e.ctx, legacy.ID, "tok-b"); !errors.Is(err, authz.ErrGoogleMismatch) {
		t.Fatalf("akun tanpa Google harus ErrGoogleMismatch, dapat %v", err)
	}
}

func TestGoogle_ReplaceGoogle(t *testing.T) {
	e := setupGoogleEnv(t)
	reg := e.signupGoogle(t, "tok-a", "sub-a", "alice")
	e.signupGoogle(t, "tok-b", "sub-b", "bob")

	e.verifier.give("old", "sub-a", 0)
	e.verifier.give("new", "sub-new", 0)
	e.verifier.give("same", "sub-a", 0)
	e.verifier.give("taken", "sub-b", 0)
	e.verifier.give("wrong-old", "sub-zzz", 0)

	if err := e.svc.ReplaceGoogle(e.ctx, reg.UserID, "wrong-old", "new"); !errors.Is(err, authz.ErrGoogleMismatch) {
		t.Fatalf("bukti Google lama salah harus ditolak, dapat %v", err)
	}
	if err := e.svc.ReplaceGoogle(e.ctx, reg.UserID, "old", "same"); !errors.Is(err, authz.ErrGoogleSame) {
		t.Fatalf("Google sama harus ErrGoogleSame, dapat %v", err)
	}
	if err := e.svc.ReplaceGoogle(e.ctx, reg.UserID, "old", "taken"); !errors.Is(err, sharederrors.ErrOAuthSubjectTaken) {
		t.Fatalf("Google milik akun lain harus ditolak, dapat %v", err)
	}
	// Setelah penolakan, tautan lama utuh: login dengan Google lama masih berhasil.
	if r, err := e.svc.GoogleSignIn(e.ctx, "tok-a", authz.GoogleDevice{DeviceID: "dev-alice"}); err != nil || r.Login == nil {
		t.Fatalf("tautan lama harus utuh setelah ganti gagal: (%+v, %v)", r, err)
	}
	if err := e.svc.ReplaceGoogle(e.ctx, reg.UserID, "old", "new"); err != nil {
		t.Fatalf("ganti harus sukses: %v", err)
	}
	if r, err := e.svc.GoogleSignIn(e.ctx, "new", authz.GoogleDevice{DeviceID: "dev-alice"}); err != nil || r.Login == nil || r.Login.UserID != reg.UserID {
		t.Fatalf("Google baru harus login ke akun yang sama: (%+v, %v)", r, err)
	}
	// Google lama kini dianggap belum tertaut.
	if r, err := e.svc.GoogleSignIn(e.ctx, "tok-a", authz.GoogleDevice{}); err != nil || r.NotLinked == nil {
		t.Fatalf("Google lama harus NotLinked setelah diganti: (%+v, %v)", r, err)
	}
}

func TestGoogle_UnlinkGoogle(t *testing.T) {
	e := setupGoogleEnv(t)
	googleOnly := e.signupGoogle(t, "tok-a", "sub-a", "alice")
	legacy, _ := e.users.RegisterWithContext(e.ctx, "legacy", "Legacy", "password123")
	e.verifier.give("tok-L", "sub-L", 0)
	if err := e.svc.LinkGoogleToAccount(e.ctx, legacy.ID, "tok-L"); err != nil {
		t.Fatal(err)
	}

	// Akun Google-only tidak boleh memutus satu-satunya cara login-nya.
	if err := e.svc.UnlinkGoogle(e.ctx, googleOnly.UserID, "apa-saja"); !errors.Is(err, authz.ErrPasswordLoginUnavailable) {
		t.Fatalf("akun tanpa password harus ErrPasswordLoginUnavailable, dapat %v", err)
	}
	if r, err := e.svc.GoogleSignIn(e.ctx, "tok-a", authz.GoogleDevice{DeviceID: "dev-alice"}); err != nil || r.Login == nil {
		t.Fatalf("akun Google-only harus tetap bisa login: (%+v, %v)", r, err)
	}

	// Password salah ditolak; password benar memutus.
	if err := e.svc.UnlinkGoogle(e.ctx, legacy.ID, "salah"); !errors.Is(err, authz.ErrInvalidCredentials) {
		t.Fatalf("password salah harus ErrInvalidCredentials, dapat %v", err)
	}
	if err := e.svc.UnlinkGoogle(e.ctx, legacy.ID, "password123"); err != nil {
		t.Fatalf("unlink harus sukses: %v", err)
	}
	if r, err := e.svc.GoogleSignIn(e.ctx, "tok-L", authz.GoogleDevice{}); err != nil || r.NotLinked == nil {
		t.Fatalf("setelah diputus, Google harus NotLinked: (%+v, %v)", r, err)
	}
}

func TestGoogle_NonDefaultTenantRejected(t *testing.T) {
	e := setupGoogleEnv(t)
	e.verifier.give("tok", "sub", 0)
	ctx := tenantshared.WithTenant(context.Background(), "acme")

	if _, err := e.svc.GoogleSignIn(ctx, "tok", authz.GoogleDevice{}); !errors.Is(err, authz.ErrGoogleTenantNotAllowed) {
		t.Fatalf("sign-in tenant non-default harus ditolak, dapat %v", err)
	}
	link, _, _ := auth.GenerateLinkToken("google", "sub", "")
	if _, err := e.svc.GoogleRegister(ctx, authz.GoogleRegisterInput{LinkToken: link, Username: "alice"}); !errors.Is(err, authz.ErrGoogleTenantNotAllowed) {
		t.Fatalf("register tenant non-default harus ditolak, dapat %v", err)
	}
	if _, _, err := e.svc.GoogleLinkExisting(ctx, authz.GoogleLinkInput{LinkToken: link, Username: "a", Password: "b"}); !errors.Is(err, authz.ErrGoogleTenantNotAllowed) {
		t.Fatalf("link tenant non-default harus ditolak, dapat %v", err)
	}
}

func TestGoogle_NotConfigured(t *testing.T) {
	svc, cleanup := setupTestAuthService(t)
	defer cleanup()
	ctx := context.Background()

	if svc.GoogleEnabled() {
		t.Fatal("GoogleEnabled harus false tanpa konfigurasi")
	}
	if _, err := svc.GoogleSignIn(ctx, "x", authz.GoogleDevice{}); !errors.Is(err, google.ErrNotConfigured) {
		t.Fatalf("harus ErrNotConfigured, dapat %v", err)
	}
	link, _, _ := auth.GenerateLinkToken("google", "sub", "")
	if _, err := svc.GoogleRegister(ctx, authz.GoogleRegisterInput{LinkToken: link, Username: "alice"}); !errors.Is(err, google.ErrNotConfigured) {
		t.Fatalf("register harus ErrNotConfigured, dapat %v", err)
	}
	if err := svc.VerifyGoogleReauth(ctx, "u", "x"); !errors.Is(err, google.ErrNotConfigured) {
		t.Fatalf("re-auth harus ErrNotConfigured, dapat %v", err)
	}
}

func TestGoogle_ConfigSurvivesSetRepository(t *testing.T) {
	e := setupGoogleEnv(t)
	// AuthHandler.syncAuthRepo memanggil SetRepository berulang kali saat wiring; konfigurasi Google tidak boleh hilang.
	e.svc.SetRepository(infra.NewSQLAuthRepository(e.users, nil, nil, nil, nil))
	if !e.svc.GoogleEnabled() {
		t.Fatal("konfigurasi Google hilang setelah SetRepository")
	}
}
