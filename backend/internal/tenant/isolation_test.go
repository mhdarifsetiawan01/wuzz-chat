package tenant_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	authzinfra "github.com/bms-del112/wuzz-chat/internal/authz/infra"
	groupinfra "github.com/bms-del112/wuzz-chat/internal/group/infra"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/tenant"
	tenantinfra "github.com/bms-del112/wuzz-chat/internal/tenant/infra"
	_ "modernc.org/sqlite"
)

func setupIsolationEnvironment(t *testing.T) (
	tenant.TenantService,
	*authz.AuthService,
	*store.SQLUserStore,
	*store.SQLGroupStore,
	*store.SQLMemoryStore,
	*sql.DB,
	func(),
) {
	t.Helper()
	sqlStore, db := setupTestDB(t)

	tenantRepo := tenantinfra.NewSQLTenantRepository(db, "sqlite")
	tenantSvc := tenant.NewTenantService(tenantRepo)

	userStore := store.NewSQLUserStore(db, "sqlite")
	sessionStore := store.NewSQLSessionStore(db, "sqlite")
	deviceStore := store.NewSQLDeviceStore(db, "sqlite")
	tokenStore := store.NewSQLTokenStore(db, "sqlite")
	transferStore := store.NewSQLTransferStore(db, "sqlite")

	authRepo := authzinfra.NewSQLAuthRepository(userStore, sessionStore, deviceStore, tokenStore, transferStore)
	authSvc := authz.NewAuthService(authRepo, nil)

	groupStore := store.NewSQLGroupStore(db, "sqlite")
	_ = groupinfra.NewSQLGroupRepository(groupStore, userStore)

	memStore := store.NewSQLMemoryStore(db, "sqlite")

	cleanup := func() {
		sqlStore.Close()
	}

	return tenantSvc, authSvc, userStore, groupStore, memStore, db, cleanup
}

func TestTenant_UserIsolationAndSameUsername(t *testing.T) {
	tenantSvc, authSvc, userStore, _, _, _, cleanup := setupIsolationEnvironment(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. Buat dua tenant: alpha dan beta
	tAlpha, err := tenantSvc.CreateTenant(ctx, "Alpha Corp", "alpha")
	if err != nil {
		t.Fatalf("gagal membuat tenant alpha: %v", err)
	}

	tBeta, err := tenantSvc.CreateTenant(ctx, "Beta Corp", "beta")
	if err != nil {
		t.Fatalf("gagal membuat tenant beta: %v", err)
	}

	ctxAlpha := tenantshared.WithTenant(ctx, tAlpha.ID)
	ctxBeta := tenantshared.WithTenant(ctx, tBeta.ID)

	// 2. Registrasi user @alice di tenant alpha
	regAlpha, err := authSvc.Register(authz.RegisterInput{
		Ctx:         ctxAlpha,
		Username:    "alice",
		DisplayName: "Alice Alpha",
		Password:    "AlphaPass123!",
		DeviceID:    "dev_alpha_1",
	})
	if err != nil {
		t.Fatalf("gagal registrasi alice di tenant alpha: %v", err)
	}
	if regAlpha.UserID == "" {
		t.Fatalf("user id alice alpha kosong")
	}

	// 3. Registrasi user @alice di tenant beta (username identik!)
	regBeta, err := authSvc.Register(authz.RegisterInput{
		Ctx:         ctxBeta,
		Username:    "alice",
		DisplayName: "Alice Beta",
		Password:    "BetaPass456!",
		DeviceID:    "dev_beta_1",
	})
	if err != nil {
		t.Fatalf("gagal registrasi alice di tenant beta: %v", err)
	}
	if regBeta.UserID == "" {
		t.Fatalf("user id alice beta kosong")
	}

	// 4. Pastikan kedua user memiliki user ID berbeda dan tersimpan dengan tenant_id masing-masing
	if regAlpha.UserID == regBeta.UserID {
		t.Errorf("User ID alice alpha dan beta tidak boleh sama!")
	}

	userA, err := userStore.GetUserByUsernameWithContext(ctxAlpha, "alice")
	if err != nil || userA.ID != regAlpha.UserID || userA.TenantID != tAlpha.ID {
		t.Errorf("Gagal mengambil user alice di context alpha: %+v, err: %v", userA, err)
	}

	userB, err := userStore.GetUserByUsernameWithContext(ctxBeta, "alice")
	if err != nil || userB.ID != regBeta.UserID || userB.TenantID != tBeta.ID {
		t.Errorf("Gagal mengambil user alice di context beta: %+v, err: %v", userB, err)
	}

	// 5. Coba login silang (password alpha dicoba di context beta) -> Harus DITOLAK
	_, _, err = authSvc.Login(authz.LoginInput{
		Ctx:      ctxBeta,
		Username: "alice",
		Password: "AlphaPass123!", // password milik alpha
		DeviceID: "dev_hack",
	})
	if err == nil {
		t.Errorf("Login silang tenant dengan password tenant lain harus ditolak!")
	}

	// 6. Login sah di context alpha -> Token harus berisi claim tenant_id: tAlpha.ID
	loginAlpha, _, err := authSvc.Login(authz.LoginInput{
		Ctx:      ctxAlpha,
		Username: "alice",
		Password: "AlphaPass123!",
		DeviceID: "dev_alpha_2",
	})
	if err != nil {
		t.Fatalf("Login alice di tenant alpha gagal: %v", err)
	}

	claimsAlpha, err := auth.ValidateToken(loginAlpha.Token)
	if err != nil {
		t.Fatalf("Token login alpha tidak valid: %v", err)
	}
	if claimsAlpha.TenantID != tAlpha.ID {
		t.Errorf("TenantID pada klaim JWT alpha salah: dapat %q, ingin %q", claimsAlpha.TenantID, tAlpha.ID)
	}

	// 7. Login sah di context beta -> Token harus berisi claim tenant_id: tBeta.ID
	loginBeta, _, err := authSvc.Login(authz.LoginInput{
		Ctx:      ctxBeta,
		Username: "alice",
		Password: "BetaPass456!",
		DeviceID: "dev_beta_2",
	})
	if err != nil {
		t.Fatalf("Login alice di tenant beta gagal: %v", err)
	}

	claimsBeta, err := auth.ValidateToken(loginBeta.Token)
	if err != nil {
		t.Fatalf("Token login beta tidak valid: %v", err)
	}
	if claimsBeta.TenantID != tBeta.ID {
		t.Errorf("TenantID pada klaim JWT beta salah: dapat %q, ingin %q", claimsBeta.TenantID, tBeta.ID)
	}
}

func TestTenant_ContactSearchIsolation(t *testing.T) {
	tenantSvc, authSvc, userStore, _, _, _, cleanup := setupIsolationEnvironment(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tAlpha, _ := tenantSvc.CreateTenant(ctx, "Alpha", "alpha-search")
	tBeta, _ := tenantSvc.CreateTenant(ctx, "Beta", "beta-search")

	ctxAlpha := tenantshared.WithTenant(ctx, tAlpha.ID)
	ctxBeta := tenantshared.WithTenant(ctx, tBeta.ID)

	// User di Alpha
	aliceAlpha, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "alice_a", DisplayName: "Alice A", Password: "Pass123!Safe"})
	bobAlpha, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "bob_a", DisplayName: "Bob A", Password: "Pass123!Safe"})

	// User di Beta
	charlieBeta, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxBeta, Username: "charlie_b", DisplayName: "Charlie B", Password: "Pass123!Safe"})

	// Search di tenant Alpha untuk query "a"
	resultsAlpha, err := userStore.SearchUsersWithContext(ctxAlpha, "a", aliceAlpha.UserID)
	if err != nil {
		t.Fatalf("SearchUsersWithContext di alpha error: %v", err)
	}
	for _, u := range resultsAlpha {
		if u.Username == "charlie_b" {
			t.Errorf("LEAK! User charlie_b dari tenant Beta muncul di hasil pencarian tenant Alpha!")
		}
	}

	// Search di tenant Beta untuk query "" (semua kontak)
	resultsBeta, err := userStore.SearchUsersWithContext(ctxBeta, "", charlieBeta.UserID)
	if err != nil {
		t.Fatalf("SearchUsersWithContext di beta error: %v", err)
	}
	for _, u := range resultsBeta {
		if u.Username == "alice_a" || u.Username == "bob_a" {
			t.Errorf("LEAK! User %s dari tenant Alpha muncul di hasil pencarian tenant Beta!", u.Username)
		}
	}
	_ = bobAlpha
}

func TestTenant_DirectChatAndGroupSearchIsolation(t *testing.T) {
	tenantSvc, authSvc, userStore, groupStore, _, _, cleanup := setupIsolationEnvironment(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tAlpha, _ := tenantSvc.CreateTenant(ctx, "Alpha", "alpha-chat")
	tBeta, _ := tenantSvc.CreateTenant(ctx, "Beta", "beta-chat")

	ctxAlpha := tenantshared.WithTenant(ctx, tAlpha.ID)
	ctxBeta := tenantshared.WithTenant(ctx, tBeta.ID)

	uA1, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "user1", Password: "Pass123!Safe"})
	uA2, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "user2", Password: "Pass123!Safe"})

	uB1, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxBeta, Username: "user1", Password: "Pass123!Safe"})
	uB2, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxBeta, Username: "user2", Password: "Pass123!Safe"})

	// 1. Direct conversation isolation
	roomAlpha, err := userStore.GetOrCreateDirectConversationWithContext(ctxAlpha, uA1.UserID, uA2.UserID)
	if err != nil {
		t.Fatalf("Gagal membuat direct room di alpha: %v", err)
	}

	roomBeta, err := userStore.GetOrCreateDirectConversationWithContext(ctxBeta, uB1.UserID, uB2.UserID)
	if err != nil {
		t.Fatalf("Gagal membuat direct room di beta: %v", err)
	}

	if roomAlpha == roomBeta {
		t.Errorf("Direct conversation room ID di alpha dan beta tidak boleh sama!")
	}

	// 2. Public group search isolation
	grpAlpha, err := groupStore.CreateGroupWithContext(ctxAlpha, "Alpha Community", "Grup Alpha", "", uA1.UserID, "alphacomm", true, nil)
	if err != nil {
		t.Fatalf("Gagal membuat public group di alpha: %v", err)
	}

	grpBeta, err := groupStore.CreateGroupWithContext(ctxBeta, "Beta Community", "Grup Beta", "", uB1.UserID, "betacomm", true, nil)
	if err != nil {
		t.Fatalf("Gagal membuat public group di beta: %v", err)
	}

	// Search di alpha
	searchAlpha, err := groupStore.SearchPublicGroupsWithContext(ctxAlpha, "comm", 10)
	if err != nil {
		t.Fatalf("SearchPublicGroupsWithContext alpha error: %v", err)
	}
	foundAlpha := false
	for _, g := range searchAlpha {
		if g.ID == grpAlpha.ID {
			foundAlpha = true
		}
		if g.ID == grpBeta.ID {
			t.Errorf("LEAK! Public group beta (%s) ditemukan di pencarian tenant alpha!", g.Title)
		}
	}
	if !foundAlpha {
		t.Errorf("Public group alpha tidak ditemukan di pencarian tenant alpha!")
	}

	// Search di beta
	searchBeta, err := groupStore.SearchPublicGroupsWithContext(ctxBeta, "comm", 10)
	if err != nil {
		t.Fatalf("SearchPublicGroupsWithContext beta error: %v", err)
	}
	foundBeta := false
	for _, g := range searchBeta {
		if g.ID == grpBeta.ID {
			foundBeta = true
		}
		if g.ID == grpAlpha.ID {
			t.Errorf("LEAK! Public group alpha (%s) ditemukan di pencarian tenant beta!", g.Title)
		}
	}
	if !foundBeta {
		t.Errorf("Public group beta tidak ditemukan di pencarian tenant beta!")
	}
}

func TestTenant_AIMemoryIsolation(t *testing.T) {
	tenantSvc, authSvc, _, groupStore, memStore, db, cleanup := setupIsolationEnvironment(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tAlpha, _ := tenantSvc.CreateTenant(ctx, "Alpha", "alpha-mem")
	ctxAlpha := tenantshared.WithTenant(ctx, tAlpha.ID)

	creator, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "creator_a", Password: "Pass123!Safe"})
	grp, _ := groupStore.CreateGroupWithContext(ctxAlpha, "Parent Alpha", "", "", creator.UserID, "", false, nil)
	subGrp, err := groupStore.CreateSubGroupWithContext(ctxAlpha, grp.ID, "Forum Alpha", "", creator.UserID, "7d", false)
	if err != nil {
		t.Fatalf("Gagal membuat subgroup di alpha: %v", err)
	}

	job, err := memStore.CreateJob(ctxAlpha, subGrp.ID, grp.ID)
	if err != nil {
		t.Fatalf("Gagal membuat memory job: %v", err)
	}

	// Verifikasi tenant_id tersimpan di tabel forum_memory_jobs
	var storedJobTenant string
	err = db.QueryRowContext(ctxAlpha, "SELECT tenant_id FROM forum_memory_jobs WHERE id = ?", job.ID).Scan(&storedJobTenant)
	if err != nil {
		t.Fatalf("Gagal membaca tenant_id dari forum_memory_jobs: %v", err)
	}
	if storedJobTenant != tAlpha.ID {
		t.Errorf("tenant_id pada forum_memory_jobs salah: dapat %q, ingin %q", storedJobTenant, tAlpha.ID)
	}
}
