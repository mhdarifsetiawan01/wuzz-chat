package tenant_test

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	authzinfra "github.com/bms-del112/wuzz-chat/internal/authz/infra"
	groupinfra "github.com/bms-del112/wuzz-chat/internal/group/infra"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/storage"
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

func TestTenant_CrossTenantGroupIsolationAndMemberInjection(t *testing.T) {
	tenantSvc, authSvc, userStore, groupStore, _, db, cleanup := setupIsolationEnvironment(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. Buat Tenant Alpha dan Tenant Beta
	tAlpha, _ := tenantSvc.CreateTenant(ctx, "Tenant Alpha", "grp-alpha")
	ctxAlpha := tenantshared.WithTenant(ctx, tAlpha.ID)

	tBeta, _ := tenantSvc.CreateTenant(ctx, "Tenant Beta", "grp-beta")
	ctxBeta := tenantshared.WithTenant(ctx, tBeta.ID)

	// 2. Buat User di masing-masing tenant
	userAlpha, err := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "alice_a", Password: "Pass123!Safe"})
	if err != nil {
		t.Fatalf("Gagal register user alpha: %v", err)
	}
	userBeta, err := authSvc.Register(authz.RegisterInput{Ctx: ctxBeta, Username: "bob_b", Password: "Pass123!Safe"})
	if err != nil {
		t.Fatalf("Gagal register user beta: %v", err)
	}

	// 3. User Alpha membuat grup publik di Tenant Alpha
	grpAlpha, err := groupStore.CreateGroupWithContext(ctxAlpha, "Alpha Public Space", "Deskripsi Alpha", "", userAlpha.UserID, "alphapublic", true, nil)
	if err != nil {
		t.Fatalf("Gagal membuat public group di alpha: %v", err)
	}

	// 4. Test Blocker 1A: User Beta mencoba JoinPublicGroup ke grup milik Tenant Alpha -> HARUS GAGAL
	errJoin := groupStore.JoinPublicGroup(grpAlpha.ID, userBeta.UserID)
	if errJoin == nil {
		t.Errorf("LEAK! User Beta berhasil bergabung ke grup publik Tenant Alpha via JoinPublicGroup!")
	} else if !errors.Is(errJoin, store.ErrGroupNotFound) {
		t.Logf("Join ditolak dengan error: %v (OK)", errJoin)
	}

	// 5. Test Blocker 1B: User Beta mencoba membaca GetGroupDetails milik Tenant Alpha -> HARUS GAGAL
	dtl, errDtl := groupStore.GetGroupDetails(grpAlpha.ID, userBeta.UserID)
	if errDtl == nil && dtl != nil {
		t.Errorf("LEAK! User Beta berhasil membaca detail grup Tenant Alpha via GetGroupDetails!")
	}

	// 6. Test Blocker 1C: Admin Alpha mencoba menambahkan User Beta ke grup Alpha -> User Beta HARUS DITOLAK
	errAdd := groupStore.AddGroupMembers(grpAlpha.ID, userAlpha.UserID, []string{userBeta.UserID})
	if errAdd != nil {
		t.Logf("AddGroupMembers mengembalikan error: %v", errAdd)
	}

	// Pastikan User Beta TIDAK ada di conversation_members untuk grpAlpha
	var memberCount int
	_ = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = ?", grpAlpha.ID, userBeta.UserID).Scan(&memberCount)
	if memberCount > 0 {
		t.Errorf("LEAK! User Beta berhasil disuntikkan ke conversation_members grup Tenant Alpha!")
	}

	// 7. Test Blocker 2: User Profile Lookup Isolation via UserStore & AuthRepo
	sessionStore := store.NewSQLSessionStore(db, "sqlite")
	deviceStore := store.NewSQLDeviceStore(db, "sqlite")
	tokenStore := store.NewSQLTokenStore(db, "sqlite")
	transferStore := store.NewSQLTransferStore(db, "sqlite")
	authRepo := authzinfra.NewSQLAuthRepository(userStore, sessionStore, deviceStore, tokenStore, transferStore)

	// User Beta mencoba mencari profile User Alpha dengan ctxBeta -> HARUS NIL
	profile, errProf := authRepo.GetUserByID(ctxBeta, userAlpha.UserID)
	if errProf != nil {
		t.Logf("GetUserByID mengembalikan error: %v", errProf)
	}
	if profile != nil {
		t.Errorf("LEAK! User Beta berhasil mengintip profil publik User Alpha lintas tenant!")
	}

	// Sebaliknya, jika dicari dengan ctxAlpha -> HARUS DITEMUKAN
	profileAlpha, errProfAlpha := authRepo.GetUserByID(ctxAlpha, userAlpha.UserID)
	if errProfAlpha != nil || profileAlpha == nil {
		t.Errorf("Gagal membaca profil User Alpha di tenant Alpha sendiri: %v", errProfAlpha)
	}
}

func TestTenant_PushSubscriptionAndStoragePartition(t *testing.T) {
	tenantSvc, authSvc, userStore, _, _, db, cleanup := setupIsolationEnvironment(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tAlpha, _ := tenantSvc.CreateTenant(ctx, "Tenant Alpha", "store-alpha")
	ctxAlpha := tenantshared.WithTenant(ctx, tAlpha.ID)

	userAlpha, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "push_alice", Password: "Pass123!Safe"})

	// 1. Test Blocker 4: Push Subscription dengan tenant_id
	subAlpha := &store.PushSubscription{
		ID:        "sub-alpha-123",
		TenantID:  tAlpha.ID,
		UserID:    userAlpha.UserID,
		Platform:  "web",
		Endpoint:  "https://push.example.com/alpha",
		P256dhKey: "dummy_p256dh",
		AuthKey:   "dummy_auth",
	}
	if err := userStore.SavePushSubscription(subAlpha); err != nil {
		t.Fatalf("Gagal menyimpan push subscription alpha: %v", err)
	}

	// Verifikasi tenant_id tersimpan di database
	var storedTenantID string
	err := db.QueryRowContext(ctx, "SELECT COALESCE(tenant_id, 'default') FROM push_subscriptions WHERE id = ?", subAlpha.ID).Scan(&storedTenantID)
	if err != nil {
		t.Fatalf("Gagal membaca tenant_id dari push_subscriptions: %v", err)
	}
	if storedTenantID != tAlpha.ID {
		t.Errorf("tenant_id push subscription salah: dapat %q, ingin %q", storedTenantID, tAlpha.ID)
	}

	// 2. Test Blocker 3: Media Storage Directory Partitioning
	tempDir, err := os.MkdirTemp("", "wuzz_storage_tenant_test_*")
	if err != nil {
		t.Fatalf("Gagal membuat temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	ls, err := storage.NewLocalStorage(tempDir, "/uploads")
	if err != nil {
		t.Fatalf("Gagal inisialisasi LocalStorage: %v", err)
	}

	// Upload dengan ctxAlpha (Tenant non-default) -> Wajib ke subfolder /uploads/store-alpha/
	urlAlpha, err := ls.Upload(ctxAlpha, strings.NewReader("dummy data alpha"), "doc_alpha.pdf", "application/pdf")
	if err != nil {
		t.Fatalf("Upload tenant alpha gagal: %v", err)
	}
	expectedPrefix := "/uploads/" + tAlpha.ID + "/"
	if !strings.HasPrefix(urlAlpha, expectedPrefix) {
		t.Errorf("URL tenant alpha tidak memiliki subfolder tenant: %s (ekspektasi prefix %s)", urlAlpha, expectedPrefix)
	}

	// Pastikan file fisik berada di dalam subfolder direktori
	filenameAlpha := filepath.Base(urlAlpha)
	diskPathAlpha := filepath.Join(tempDir, tAlpha.ID, filenameAlpha)
	if _, err := os.Stat(diskPathAlpha); os.IsNotExist(err) {
		t.Errorf("File fisik tenant alpha tidak berada di subfolder tenant: %s", diskPathAlpha)
	}

	// Test Delete file bertingkat
	if err := ls.Delete(ctx, urlAlpha); err != nil {
		t.Fatalf("Gagal menghapus file tenant: %v", err)
	}
	if _, err := os.Stat(diskPathAlpha); !os.IsNotExist(err) {
		t.Errorf("File seharusnya sudah terhapus: %s", diskPathAlpha)
	}

	// Upload dengan ctx default (produk sendiri) -> Wajib ke root /uploads/
	urlDefault, err := ls.Upload(context.Background(), strings.NewReader("dummy default data"), "image.png", "image/png")
	if err != nil {
		t.Fatalf("Upload default gagal: %v", err)
	}
	if strings.Contains(urlDefault, "/default/") {
		t.Errorf("URL default tidak boleh mengandung /default/: %s", urlDefault)
	}
	filenameDefault := filepath.Base(urlDefault)
	diskPathDefault := filepath.Join(tempDir, filenameDefault)
	if _, err := os.Stat(diskPathDefault); os.IsNotExist(err) {
		t.Errorf("File fisik default tidak ditemukan di root storage: %s", diskPathDefault)
	}
}


// T2: DM tidak boleh menghubungkan dua user dari tenant berbeda.
func TestTenant_DirectChatRejectsCrossTenantTarget(t *testing.T) {
	tenantSvc, authSvc, userStore, _, _, db, cleanup := setupIsolationEnvironment(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tAlpha, _ := tenantSvc.CreateTenant(ctx, "Alpha", "dm-alpha")
	tBeta, _ := tenantSvc.CreateTenant(ctx, "Beta", "dm-beta")
	ctxAlpha := tenantshared.WithTenant(ctx, tAlpha.ID)
	ctxBeta := tenantshared.WithTenant(ctx, tBeta.ID)

	uA1, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "alice", Password: "Pass123!Safe"})
	uA2, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "adam", Password: "Pass123!Safe"})
	uB1, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxBeta, Username: "bob", Password: "Pass123!Safe"})

	countMembers := func(userID string) int {
		var n int
		_ = db.QueryRow("SELECT COUNT(*) FROM conversation_members WHERE user_id = ?", userID).Scan(&n)
		return n
	}

	// Kontrol: sesama tenant tetap berhasil.
	if room, err := userStore.GetOrCreateDirectConversationWithContext(ctxAlpha, uA1.UserID, uA2.UserID); err != nil || room == "" {
		t.Fatalf("DM sesama tenant harus berhasil: room=%q err=%v", room, err)
	}

	// Serangan: user alpha menarget user beta, dengan context tenant manapun.
	for name, c := range map[string]context.Context{"ctx alpha": ctxAlpha, "ctx beta": ctxBeta, "ctx default": ctx} {
		room, err := userStore.GetOrCreateDirectConversationWithContext(c, uA1.UserID, uB1.UserID)
		if err == nil {
			t.Errorf("LEAK (%s)! DM lintas tenant berhasil dibuat: room=%q", name, room)
		}
	}
	if n := countMembers(uB1.UserID); n != 0 {
		t.Errorf("LEAK! user beta menjadi anggota %d percakapan lintas tenant", n)
	}

	// Target yang tidak ada juga ditolak.
	if _, err := userStore.GetOrCreateDirectConversationWithContext(ctxAlpha, uA1.UserID, "id-tidak-ada"); err == nil {
		t.Errorf("DM ke user yang tidak ada harus ditolak")
	}
}

// T3: anggota awal saat membuat grup harus satu tenant dengan grup.
func TestTenant_CreateGroupSkipsCrossTenantInitialMembers(t *testing.T) {
	tenantSvc, authSvc, _, groupStore, _, db, cleanup := setupIsolationEnvironment(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tAlpha, _ := tenantSvc.CreateTenant(ctx, "Alpha", "mem-alpha")
	tBeta, _ := tenantSvc.CreateTenant(ctx, "Beta", "mem-beta")
	ctxAlpha := tenantshared.WithTenant(ctx, tAlpha.ID)
	ctxBeta := tenantshared.WithTenant(ctx, tBeta.ID)

	uA1, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "alice", Password: "Pass123!Safe"})
	uA2, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "adam", Password: "Pass123!Safe"})
	uB1, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxBeta, Username: "bob", Password: "Pass123!Safe"})

	grp, err := groupStore.CreateGroupWithContext(ctxAlpha, "Tim Alpha", "", "", uA1.UserID, "", false,
		[]string{uA2.UserID, uB1.UserID, "id-tidak-ada"})
	if err != nil {
		t.Fatalf("pembuatan grup harus tetap sukses: %v", err)
	}

	isMember := func(userID string) bool {
		var n int
		_ = db.QueryRow("SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id = ?", grp.ID, userID).Scan(&n)
		return n > 0
	}
	if !isMember(uA1.UserID) {
		t.Errorf("pembuat grup harus menjadi anggota")
	}
	if !isMember(uA2.UserID) {
		t.Errorf("anggota sesama tenant harus masuk")
	}
	if isMember(uB1.UserID) {
		t.Errorf("LEAK! user tenant beta disuntikkan ke grup tenant alpha lewat member_ids awal")
	}
	if isMember("id-tidak-ada") {
		t.Errorf("user yang tidak ada tidak boleh menjadi anggota")
	}
	if grp.MemberCount != 2 {
		t.Errorf("MemberCount seharusnya 2, dapat %d", grp.MemberCount)
	}
}

// T4: perangkat tidak boleh berpindah pemilik lintas tenant, tetapi rebind sesama tenant (ganti akun di
// perangkat yang sama) tetap diizinkan.
func TestTenant_DeviceRebindRejectsCrossTenantTakeover(t *testing.T) {
	tenantSvc, authSvc, _, _, _, db, cleanup := setupIsolationEnvironment(t)
	defer cleanup()
	deviceStore := store.NewSQLDeviceStore(db, "sqlite")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tAlpha, _ := tenantSvc.CreateTenant(ctx, "Alpha", "dev-alpha")
	tBeta, _ := tenantSvc.CreateTenant(ctx, "Beta", "dev-beta")
	ctxAlpha := tenantshared.WithTenant(ctx, tAlpha.ID)
	ctxBeta := tenantshared.WithTenant(ctx, tBeta.ID)

	uA1, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "alice", Password: "Pass123!Safe"})
	uA2, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "adam", Password: "Pass123!Safe"})
	uB1, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxBeta, Username: "bob", Password: "Pass123!Safe"})

	owner := func(deviceID string) string {
		d, err := deviceStore.GetDeviceByID(deviceID)
		if err != nil || d == nil {
			t.Fatalf("device %s tidak ditemukan: %v", deviceID, err)
		}
		return d.UserID
	}

	if err := deviceStore.RegisterOrUpdateDevice(&store.Device{ID: "dev-1", UserID: uA1.UserID, Name: "Ponsel Alice", Platform: "android"}); err != nil {
		t.Fatalf("registrasi awal gagal: %v", err)
	}

	// Serangan: user tenant beta mengklaim device milik user tenant alpha.
	if err := deviceStore.RegisterOrUpdateDevice(&store.Device{ID: "dev-1", UserID: uB1.UserID, Name: "Ponsel Bob", Platform: "android"}); err == nil {
		t.Errorf("LEAK! device milik tenant alpha berhasil diambil alih user tenant beta")
	}
	if got := owner("dev-1"); got != uA1.UserID {
		t.Errorf("pemilik device berubah ke %s setelah upaya lintas tenant", got)
	}

	// Kontrol: rebind sesama tenant (ganti akun di perangkat yang sama) tetap berjalan.
	if err := deviceStore.RegisterOrUpdateDevice(&store.Device{ID: "dev-1", UserID: uA2.UserID, Name: "Ponsel Bersama", Platform: "android"}); err != nil {
		t.Fatalf("rebind sesama tenant harus berhasil: %v", err)
	}
	if got := owner("dev-1"); got != uA2.UserID {
		t.Errorf("pemilik device seharusnya adam setelah rebind sesama tenant, dapat %s", got)
	}

	// Kontrol: pemilik yang sama memperbarui device-nya sendiri.
	if err := deviceStore.RegisterOrUpdateDevice(&store.Device{ID: "dev-1", UserID: uA2.UserID, Name: "Ponsel Baru", Platform: "android"}); err != nil {
		t.Fatalf("pembaruan oleh pemilik harus berhasil: %v", err)
	}
}

// T6: audit baca-saja untuk keanggotaan lintas tenant (sisa data dari celah lama).
func TestTenant_FindCrossTenantMemberships(t *testing.T) {
	tenantSvc, authSvc, userStore, groupStore, _, db, cleanup := setupIsolationEnvironment(t)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tAlpha, _ := tenantSvc.CreateTenant(ctx, "Alpha", "aud-alpha")
	tBeta, _ := tenantSvc.CreateTenant(ctx, "Beta", "aud-beta")
	ctxAlpha := tenantshared.WithTenant(ctx, tAlpha.ID)
	ctxBeta := tenantshared.WithTenant(ctx, tBeta.ID)

	uA1, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "alice", Password: "Pass123!Safe"})
	uA2, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxAlpha, Username: "adam", Password: "Pass123!Safe"})
	uB1, _ := authSvc.Register(authz.RegisterInput{Ctx: ctxBeta, Username: "bob", Password: "Pass123!Safe"})

	// Data sehat lewat jalur resmi: tidak boleh terdeteksi.
	if _, err := userStore.GetOrCreateDirectConversationWithContext(ctxAlpha, uA1.UserID, uA2.UserID); err != nil {
		t.Fatal(err)
	}
	grp, err := groupStore.CreateGroupWithContext(ctxAlpha, "Tim", "", "", uA1.UserID, "", false, []string{uA2.UserID})
	if err != nil {
		t.Fatal(err)
	}
	found, err := store.FindCrossTenantMemberships(ctx, db)
	if err != nil {
		t.Fatalf("audit gagal: %v", err)
	}
	if len(found) != 0 {
		t.Fatalf("data sehat tidak boleh terdeteksi, dapat %+v", found)
	}

	// Simulasikan data tercemar (seperti sebelum perbaikan T2/T3).
	if _, err := db.Exec("INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", grp.ID, uB1.UserID, time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	found, err = store.FindCrossTenantMemberships(ctx, db)
	if err != nil {
		t.Fatalf("audit gagal: %v", err)
	}
	if len(found) != 1 || found[0].ConversationID != grp.ID || found[0].UserID != uB1.UserID ||
		found[0].ConversationTenant != tAlpha.ID || found[0].UserTenant != tBeta.ID {
		t.Fatalf("hasil audit tidak sesuai: %+v", found)
	}
}
