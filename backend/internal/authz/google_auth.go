package authz

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz/google"
	sharederrors "github.com/bms-del112/wuzz-chat/internal/shared/errors"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	sharedvalidator "github.com/bms-del112/wuzz-chat/internal/shared/validator"
)

const (
	providerGoogle = "google"

	// googleReauthMaxAge membatasi usia ID token untuk aksi sensitif (hapus akun, reset kunci, ganti/tautkan Google).
	googleReauthMaxAge = 5 * time.Minute
)

var (
	// ErrGoogleTenantNotAllowed: login Google hanya untuk tenant default (user tenant B2B masuk lewat provisioning).
	ErrGoogleTenantNotAllowed = domainError("login Google tidak tersedia untuk tenant ini")
	// ErrGoogleReauthStale: ID token terlalu lama; klien harus meminta login Google ulang.
	ErrGoogleReauthStale = domainError("verifikasi Google sudah kedaluwarsa, silakan login Google ulang")
	// ErrGoogleMismatch: akun Google yang dipakai bukan yang tertaut ke akun ini.
	ErrGoogleMismatch = domainError("akun Google tidak cocok dengan akun ini")
	// ErrGoogleSame: akun Google baru sama dengan yang sedang tertaut.
	ErrGoogleSame = domainError("akun Google baru sama dengan yang sudah tertaut")
	// ErrPasswordLoginUnavailable: akun ini tidak punya password, sehingga Google tidak boleh diputus.
	ErrPasswordLoginUnavailable = domainError("akun ini tidak memiliki password; akun Google tidak dapat diputus")
)

// OAuthStore adalah kontrak penyimpanan kredensial pihak ketiga (diimplementasikan store.SQLOAuthStore).
// Error domain (store.ErrOAuthSubjectTaken, store.ErrOAuthAlreadyLinked, store.ErrUserExists, ...) diteruskan apa adanya.
type OAuthStore interface {
	FindUserIDBySubject(ctx context.Context, provider, subject string) (userID string, found bool, err error)
	GetLinkedSubject(ctx context.Context, userID, provider string) (subject string, found bool, err error)
	// GetLinkedLabel mengembalikan label tampilan (email) tautan; found=false bila belum tertaut.
	GetLinkedLabel(ctx context.Context, userID, provider string) (label string, found bool, err error)
	CreateUserWithOAuth(ctx context.Context, username, displayName, provider, subject, label string) (userID string, err error)
	LinkOAuth(ctx context.Context, userID, provider, subject, label string) error
	UnlinkOAuth(ctx context.Context, userID, provider string) error
	ReplaceOAuth(ctx context.Context, userID, provider, oldSubject, newSubject, label string) error
}

// SetGoogleAuth menyuntikkan verifier ID token dan store kredensial oauth. Terpisah dari AuthRepository agar tidak
// ikut tergantikan saat SetRepository dipanggil. Tanpa ini, semua metode Google mengembalikan google.ErrNotConfigured.
func (s *AuthService) SetGoogleAuth(v google.Verifier, o OAuthStore) {
	s.googleVerifier = v
	s.oauth = o
}

// GoogleEnabled memberi tahu apakah login Google sudah dikonfigurasi.
func (s *AuthService) GoogleEnabled() bool {
	return s.googleVerifier != nil && s.oauth != nil
}

func (s *AuthService) clock() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

func (s *AuthService) verifyGoogle(ctx context.Context, idToken string) (*google.Identity, error) {
	if !s.GoogleEnabled() {
		return nil, google.ErrNotConfigured
	}
	return s.googleVerifier.Verify(ctx, idToken)
}

// verifyFreshGoogle memverifikasi ID token dan memastikan baru diterbitkan (anti-replay token lama untuk aksi sensitif).
func (s *AuthService) verifyFreshGoogle(ctx context.Context, idToken string) (*google.Identity, error) {
	id, err := s.verifyGoogle(ctx, idToken)
	if err != nil {
		return nil, err
	}
	if id.IssuedAt.IsZero() || s.clock().Sub(id.IssuedAt) > googleReauthMaxAge {
		return nil, ErrGoogleReauthStale
	}
	return id, nil
}

func requireDefaultTenant(ctx context.Context) (string, error) {
	t := tenantshared.MustFromContext(ctx)
	if !t.IsDefault() {
		return "", ErrGoogleTenantNotAllowed
	}
	return t.TenantID(), nil
}

// --- Login / Register ---

// GoogleDevice membawa data perangkat/klien untuk login Google.
type GoogleDevice struct {
	DeviceID        string
	Platform        string
	ConfirmOverride bool
	KickDeviceID    string
	UserAgent       string
	IP              string
}

func (d GoogleDevice) toLoginDevice() loginDevice {
	return loginDevice{
		DeviceID:        strings.TrimSpace(d.DeviceID),
		Platform:        d.Platform,
		ConfirmOverride: d.ConfirmOverride,
		KickDeviceID:    d.KickDeviceID,
		UserAgent:       d.UserAgent,
		IP:              d.IP,
	}
}

// GoogleNotLinked dikembalikan saat akun Google valid tetapi belum tertaut ke akun Wuzz mana pun.
type GoogleNotLinked struct {
	LinkToken string
	Email     string
	ExpiresAt time.Time
}

// GoogleSignInResult adalah hasil GoogleSignIn: tepat satu dari Login, Conflict, atau NotLinked terisi.
type GoogleSignInResult struct {
	Login     *LoginResult
	Conflict  *DeviceConflict
	NotLinked *GoogleNotLinked
}

// GoogleSignIn memverifikasi ID token. Bila akun Google sudah tertaut, user login (kuota perangkat berlaku sama
// seperti login password). Bila belum, mengembalikan token penautan untuk mendaftar atau menautkan ke akun lama.
func (s *AuthService) GoogleSignIn(ctx context.Context, idToken string, dev GoogleDevice) (*GoogleSignInResult, error) {
	tenantID, err := requireDefaultTenant(ctx)
	if err != nil {
		return nil, err
	}
	id, err := s.verifyGoogle(ctx, idToken)
	if err != nil {
		return nil, err
	}

	userID, found, err := s.oauth.FindUserIDBySubject(ctx, providerGoogle, id.Subject)
	if err != nil {
		return nil, err
	}
	if !found {
		tok, claims, err := auth.GenerateLinkToken(providerGoogle, id.Subject, id.Email)
		if err != nil {
			return nil, err
		}
		return &GoogleSignInResult{NotLinked: &GoogleNotLinked{
			LinkToken: tok, Email: id.Email, ExpiresAt: claims.ExpiresAt.Time,
		}}, nil
	}

	// GetUserByID menerapkan isolasi tenant: user di tenant lain dianggap tidak ada.
	profile, err := s.repo.GetUserByID(ctx, userID)
	if err != nil || profile == nil {
		return nil, ErrInvalidCredentials
	}
	res, conflict, err := s.finishLogin(ctx, tenantID, userID, profile.Username, profile.DisplayName, dev.toLoginDevice())
	if err != nil {
		return nil, err
	}
	return &GoogleSignInResult{Login: res, Conflict: conflict}, nil
}

// GoogleRegisterInput adalah input pembuatan akun baru dari token penautan.
type GoogleRegisterInput struct {
	LinkToken   string
	Username    string
	DisplayName string
	Device      GoogleDevice
}

// GoogleRegister membuat akun baru (tanpa password) yang langsung tertaut ke akun Google dari token penautan.
// Pembuatan user dan kredensial berlangsung atomik di store.
func (s *AuthService) GoogleRegister(ctx context.Context, in GoogleRegisterInput) (*RegisterResult, error) {
	tenantID, err := requireDefaultTenant(ctx)
	if err != nil {
		return nil, err
	}
	if !s.GoogleEnabled() {
		return nil, google.ErrNotConfigured
	}
	link, err := auth.ParseLinkToken(in.LinkToken)
	if err != nil || link.Provider != providerGoogle {
		return nil, auth.ErrInvalidLinkToken
	}

	username := strings.TrimSpace(in.Username)
	displayName := strings.TrimSpace(in.DisplayName)
	if displayName == "" {
		displayName = username
	}
	if err := sharedvalidator.ValidateIdentity(username, displayName); err != nil {
		return nil, err
	}

	userID, err := s.oauth.CreateUserWithOAuth(ctx, username, displayName, providerGoogle, link.Subject, link.Email)
	if err != nil {
		return nil, err
	}
	s.consumeLinkToken(link)

	res, _, err := s.finishLogin(ctx, tenantID, userID, username, displayName, in.Device.toLoginDevice())
	if err != nil {
		return nil, err
	}
	return &RegisterResult{Token: res.Token, JTI: res.JTI, UserID: userID}, nil
}

// GoogleLinkInput adalah input penautan akun Google ke akun lama (username + password).
type GoogleLinkInput struct {
	LinkToken string
	Username  string
	Password  string
	Device    GoogleDevice
}

// GoogleLinkExisting menautkan akun Google dari token penautan ke akun lama setelah username dan password terbukti
// benar, lalu login. Idempoten: bila login tertahan konflik perangkat (409), klien dapat mengulang dengan token yang sama.
func (s *AuthService) GoogleLinkExisting(ctx context.Context, in GoogleLinkInput) (*LoginResult, *DeviceConflict, error) {
	tenantID, err := requireDefaultTenant(ctx)
	if err != nil {
		return nil, nil, err
	}
	if !s.GoogleEnabled() {
		return nil, nil, google.ErrNotConfigured
	}
	link, err := auth.ParseLinkToken(in.LinkToken)
	if err != nil || link.Provider != providerGoogle {
		return nil, nil, auth.ErrInvalidLinkToken
	}

	username := strings.TrimSpace(in.Username)
	userID, displayName, err := s.repo.GetUserByUsernameWithContext(ctx, username)
	if err != nil {
		return nil, nil, ErrInvalidCredentials
	}
	if ok, err := s.repo.VerifyPasswordByUserID(userID, in.Password); err != nil || !ok {
		return nil, nil, ErrInvalidCredentials
	}

	owner, found, err := s.oauth.FindUserIDBySubject(ctx, providerGoogle, link.Subject)
	if err != nil {
		return nil, nil, err
	}
	switch {
	case found && owner == userID:
		// sudah tertaut ke akun ini (percobaan ulang): lanjut login
	case found:
		return nil, nil, sharederrors.ErrOAuthSubjectTaken
	default:
		if err := s.oauth.LinkOAuth(ctx, userID, providerGoogle, link.Subject, link.Email); err != nil {
			return nil, nil, err
		}
	}

	res, conflict, err := s.finishLogin(ctx, tenantID, userID, username, displayName, in.Device.toLoginDevice())
	if err == nil && conflict == nil {
		s.consumeLinkToken(link)
	}
	return res, conflict, err
}

// consumeLinkToken menandai token penautan sebagai terpakai (best-effort; keunikan sub di database adalah
// pengaman utama terhadap pemakaian ulang).
func (s *AuthService) consumeLinkToken(link *auth.LinkClaims) {
	if link == nil || link.ID == "" {
		return
	}
	exp := time.Now().Add(auth.LinkTokenTTL)
	if link.ExpiresAt != nil {
		exp = link.ExpiresAt.Time
	}
	if err := s.repo.RevokeToken(link.ID, exp); err != nil {
		log.Printf("⚠️ [AuthService.Google] Gagal menandai token penautan terpakai: %v", err)
	}
}

// --- Kelola tautan Google pada akun yang sudah login ---

// IsGoogleLinked memberi tahu apakah akun sudah punya akun Google tertaut.
func (s *AuthService) IsGoogleLinked(ctx context.Context, userID string) (bool, error) {
	if !s.GoogleEnabled() {
		return false, nil
	}
	_, found, err := s.oauth.GetLinkedSubject(ctx, userID, providerGoogle)
	return found, err
}

// GoogleLinkInfo memberi tahu apakah akun tertaut ke Google beserta email Google-nya (kosong bila tak tersimpan).
func (s *AuthService) GoogleLinkInfo(ctx context.Context, userID string) (linked bool, email string, err error) {
	if !s.GoogleEnabled() {
		return false, "", nil
	}
	email, linked, err = s.oauth.GetLinkedLabel(ctx, userID, providerGoogle)
	return linked, email, err
}

// LinkGoogleToAccount menautkan akun Google ke akun yang sedang login (tanpa password; butuh sesi aktif + ID token segar).
func (s *AuthService) LinkGoogleToAccount(ctx context.Context, userID, idToken string) error {
	if _, err := requireDefaultTenant(ctx); err != nil {
		return err
	}
	id, err := s.verifyFreshGoogle(ctx, idToken)
	if err != nil {
		return err
	}
	owner, found, err := s.oauth.FindUserIDBySubject(ctx, providerGoogle, id.Subject)
	if err != nil {
		return err
	}
	switch {
	case found && owner == userID:
		return nil // sudah tertaut ke akun ini: idempoten
	case found:
		return sharederrors.ErrOAuthSubjectTaken
	}
	return s.oauth.LinkOAuth(ctx, userID, providerGoogle, id.Subject, id.Email)
}

// VerifyGoogleReauth membuktikan bahwa pemegang sesi juga mengendalikan akun Google yang tertaut ke akun ini.
// Dipakai sebagai pengganti password untuk hapus akun dan reset kunci E2EE pada akun tanpa password.
func (s *AuthService) VerifyGoogleReauth(ctx context.Context, userID, idToken string) error {
	id, err := s.verifyFreshGoogle(ctx, idToken)
	if err != nil {
		return err
	}
	linked, found, err := s.oauth.GetLinkedSubject(ctx, userID, providerGoogle)
	if err != nil {
		return err
	}
	if !found || linked != id.Subject {
		return ErrGoogleMismatch
	}
	return nil
}

// ReplaceGoogle mengganti akun Google yang tertaut: butuh bukti akun Google lama dan baru (keduanya segar).
func (s *AuthService) ReplaceGoogle(ctx context.Context, userID, oldIDToken, newIDToken string) error {
	if err := s.VerifyGoogleReauth(ctx, userID, oldIDToken); err != nil {
		return err
	}
	next, err := s.verifyFreshGoogle(ctx, newIDToken)
	if err != nil {
		return err
	}
	old, _, err := s.oauth.GetLinkedSubject(ctx, userID, providerGoogle)
	if err != nil {
		return err
	}
	if old == next.Subject {
		return ErrGoogleSame
	}
	return s.oauth.ReplaceOAuth(ctx, userID, providerGoogle, old, next.Subject, next.Email)
}

// UnlinkGoogle memutus akun Google dari akun yang masih punya password. Butuh password sebagai bukti, sehingga
// pemilik asli dapat melepas tautan Google yang dipasang pihak lain setelah mengganti password.
func (s *AuthService) UnlinkGoogle(ctx context.Context, userID, password string) error {
	if !s.GoogleEnabled() {
		return google.ErrNotConfigured
	}
	hash, err := s.repo.GetPasswordHash(userID)
	if err != nil {
		return err
	}
	if hash == "" {
		return ErrPasswordLoginUnavailable
	}
	if ok, err := s.repo.VerifyPasswordByUserID(userID, password); err != nil || !ok {
		return ErrInvalidCredentials
	}
	return s.oauth.UnlinkOAuth(ctx, userID, providerGoogle)
}
