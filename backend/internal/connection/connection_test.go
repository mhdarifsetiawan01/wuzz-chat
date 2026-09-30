package connection_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/connection"
	connectioninfra "github.com/bms-del112/wuzz-chat/internal/connection/infra"
	"github.com/bms-del112/wuzz-chat/internal/messaging"
	messaginginfra "github.com/bms-del112/wuzz-chat/internal/messaging/infra"
	"github.com/bms-del112/wuzz-chat/internal/shared/config"
	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
	_ "modernc.org/sqlite"
)

func setupTestEnvironment(t *testing.T) (*connection.ConnectionService, store.UserStore, *store.SQLMessageStore, func()) {
	t.Helper()

	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_connection.db")

	sqlStore, err := store.NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("failed to init message store: %v", err)
	}

	userStore := store.NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())
	connRepo := connectioninfra.NewSQLConnectionRepository(sqlStore.DB(), sqlStore.DriverName())

	cfg := config.ConfigConnection{
		RateLimitPerMinute:   10,
		DailyLimit:           20,
		MaxPendingRequests:   5,
		DeclineCooldownHours: 24,
		PageDefaultLimit:     2,
		PageMaxLimit:         5,
		CacheTTL:             1 * time.Minute,
	}

	svc := connection.NewConnectionService(connRepo, userStore, cfg)

	cleanup := func() {
		_ = sqlStore.Close()
	}

	return svc, userStore, sqlStore, cleanup
}

func ctxWithTenant(tenantID string) context.Context {
	return tenantshared.WithTenant(context.Background(), tenantID)
}

func TestConnection_FullLifecycle(t *testing.T) {
	svc, userStore, _, cleanup := setupTestEnvironment(t)
	defer cleanup()

	ctx := ctxWithTenant("default")

	// 1. Buat User Alice & Bob
	alice, err := userStore.RegisterWithContext(ctx, "alice", "Alice Wonder", "password123")
	if err != nil {
		t.Fatalf("register alice failed: %v", err)
	}
	bob, err := userStore.RegisterWithContext(ctx, "bob", "Bob Builder", "password123")
	if err != nil {
		t.Fatalf("register bob failed: %v", err)
	}

	// 2. Alice kirim permohonan ke Bob
	conn, err := svc.RequestConnection(ctx, alice.ID, bob.ID, connection.SourceInAppRequest)
	if err != nil {
		t.Fatalf("request connection failed: %v", err)
	}
	if conn.Status != connection.StatusPending {
		t.Errorf("expected status pending, got %s", conn.Status)
	}

	// 3. Alice kirim lagi (Duplicate) -> harus ditolak
	_, errDup := svc.RequestConnection(ctx, alice.ID, bob.ID, connection.SourceInAppRequest)
	if errDup == nil {
		t.Fatalf("expected error on duplicate request, got nil")
	}

	// 4. Bob melihat permintaan pending masuk
	pendingBob, err := svc.ListPendingRequests(ctx, bob.ID, "incoming")
	if err != nil {
		t.Fatalf("list pending failed: %v", err)
	}
	if len(pendingBob) != 1 || pendingBob[0].PeerID != alice.ID {
		t.Fatalf("expected 1 incoming pending from alice, got %+v", pendingBob)
	}

	// 5. Bob menerima permintaan pertemanan Alice
	acceptedConn, err := svc.RespondConnection(ctx, bob.ID, conn.ID, "accept")
	if err != nil {
		t.Fatalf("accept connection failed: %v", err)
	}
	if acceptedConn.Status != connection.StatusAccepted {
		t.Errorf("expected accepted status, got %s", acceptedConn.Status)
	}

	// 6. Cek status relasi dan cache O(1) IsFriend
	isFriend, err := svc.IsFriend(ctx, "default", alice.ID, bob.ID)
	if err != nil || !isFriend {
		t.Fatalf("expected alice & bob to be friends, err=%v", err)
	}

	// 7. Cek Daftar Teman Alice (Cursor Pagination)
	res, err := svc.ListFriends(ctx, alice.ID, "", 10)
	if err != nil {
		t.Fatalf("list friends failed: %v", err)
	}
	if len(res.Friends) != 1 || res.Friends[0].ID != bob.ID {
		t.Fatalf("expected bob in alice friends list, got %+v", res.Friends)
	}

	// 8. Alice menghapus pertemanan (Unfriend)
	if err := svc.Unfriend(ctx, alice.ID, bob.ID); err != nil {
		t.Fatalf("unfriend failed: %v", err)
	}

	isStillFriend, _ := svc.IsFriend(ctx, "default", alice.ID, bob.ID)
	if isStillFriend {
		t.Fatalf("expected not friends after unfriend")
	}
}

func TestConnection_BilateralMutualHandshake(t *testing.T) {
	svc, userStore, _, cleanup := setupTestEnvironment(t)
	defer cleanup()

	ctx := ctxWithTenant("default")

	u1, _ := userStore.RegisterWithContext(ctx, "user1", "User One", "password123")
	u2, _ := userStore.RegisterWithContext(ctx, "user2", "User Two", "password123")

	// User 1 request ke User 2
	conn1, err := svc.RequestConnection(ctx, u1.ID, u2.ID, connection.SourceInAppRequest)
	if err != nil {
		t.Fatalf("first request failed: %v", err)
	}
	if conn1.Status != connection.StatusPending {
		t.Fatalf("expected pending, got %s", conn1.Status)
	}

	// User 2 secara bersamaan mengirim request ke User 1 -> Sistem langsung auto-accept (atomic handshake)!
	conn2, err := svc.RequestConnection(ctx, u2.ID, u1.ID, connection.SourceInAppRequest)
	if err != nil {
		t.Fatalf("mutual request failed: %v", err)
	}
	if conn2.Status != connection.StatusAccepted {
		t.Fatalf("expected mutual handshake to transition to accepted, got %s", conn2.Status)
	}

	isFriend, _ := svc.IsFriend(ctx, "default", u1.ID, u2.ID)
	if !isFriend {
		t.Fatalf("expected u1 and u2 to be friends after mutual handshake")
	}
}

func TestConnection_ZeroTrustIDORProtection(t *testing.T) {
	svc, userStore, _, cleanup := setupTestEnvironment(t)
	defer cleanup()

	ctx := ctxWithTenant("default")

	alice, _ := userStore.RegisterWithContext(ctx, "alice", "Alice", "password123")
	bob, _ := userStore.RegisterWithContext(ctx, "bob", "Bob", "password123")
	charlie, _ := userStore.RegisterWithContext(ctx, "charlie", "Charlie", "password123")

	conn, err := svc.RequestConnection(ctx, alice.ID, bob.ID, connection.SourceInAppRequest)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}

	// Charlie mencoba menerima permohonan yang ditujukan untuk Bob -> HARUS DITOLAK (Forbidden)!
	_, errIDOR := svc.RespondConnection(ctx, charlie.ID, conn.ID, "accept")
	if errIDOR == nil {
		t.Fatalf("expected IDOR error for unauthorized responder Charlie, got nil")
	}
	if !strings.Contains(errIDOR.Error(), "akses ditolak") {
		t.Fatalf("expected 'akses ditolak' in IDOR error, got: %v", errIDOR)
	}
}

func TestConnection_PrivateProfileDMGuard(t *testing.T) {
	svc, userStore, ms, cleanup := setupTestEnvironment(t)
	defer cleanup()

	ctx := ctxWithTenant("default")

	alice, _ := userStore.RegisterWithContext(ctx, "alice", "Alice", "password123")
	bob, _ := userStore.RegisterWithContext(ctx, "bob", "Bob", "password123")
	eve, _ := userStore.RegisterWithContext(ctx, "eve", "Eve", "password123")

	// Set Bob sebagai Akun Privat
	_, err := userStore.SetPrivateAccount(bob.ID, true)
	if err != nil {
		t.Fatalf("failed to set bob private: %v", err)
	}

	// Berteman antara Alice dan Bob
	conn, _ := svc.RequestConnection(ctx, alice.ID, bob.ID, connection.SourceInAppRequest)
	_, _ = svc.RespondConnection(ctx, bob.ID, conn.ID, "accept")

	// Inisialisasi ChatHandler dengan MessageService dan ConnectionService
	repo := messaginginfra.NewSQLMessagingRepository(ms, userStore)
	msgSvc := messaging.NewMessageService(repo, repo, repo, nil)
	chatHandler := api.NewChatHandlerWithService(msgSvc, userStore, ms)
	chatHandler.SetConnectionService(svc)

	// Skenario 1: Eve (bukan teman) mencoba memulai DM dengan Bob -> HARUS 403 Forbidden!
	reqEve := httptest.NewRequest(http.MethodPost, "/api/conversations", strings.NewReader(`{"target_user_id":"`+bob.ID+`"}`))
	claimsEve := &auth.UserClaims{UserID: eve.ID, TenantID: "default", Username: "eve"}
	reqEve = reqEve.WithContext(auth.SetUserContext(reqEve.Context(), claimsEve))
	wEve := httptest.NewRecorder()

	chatHandler.StartDirectChat(wEve, reqEve)
	if wEve.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for non-friend Eve attempting to DM private Bob, got: %d (%s)", wEve.Code, wEve.Body.String())
	}

	// Skenario 2: Alice (teman sah) memulai DM dengan Bob -> HARUS 200 OK!
	reqAlice := httptest.NewRequest(http.MethodPost, "/api/conversations", strings.NewReader(`{"target_user_id":"`+bob.ID+`"}`))
	claimsAlice := &auth.UserClaims{UserID: alice.ID, TenantID: "default", Username: "alice"}
	reqAlice = reqAlice.WithContext(auth.SetUserContext(reqAlice.Context(), claimsAlice))
	wAlice := httptest.NewRecorder()

	chatHandler.StartDirectChat(wAlice, reqAlice)
	if wAlice.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for friend Alice attempting to DM private Bob, got: %d (%s)", wAlice.Code, wAlice.Body.String())
	}
}

func TestConnection_PrivacyCallChecker(t *testing.T) {
	svc, userStore, _, cleanup := setupTestEnvironment(t)
	defer cleanup()

	ctx := ctxWithTenant("default")

	alice, _ := userStore.RegisterWithContext(ctx, "alice", "Alice", "password123")
	bob, _ := userStore.RegisterWithContext(ctx, "bob", "Bob", "password123")
	eve, _ := userStore.RegisterWithContext(ctx, "eve", "Eve", "password123")

	// Set Bob sebagai Akun Privat
	_, _ = userStore.SetPrivateAccount(bob.ID, true)

	// Buat room direct antara Eve dan Bob (misal dari legacy room)
	dmRoomEveBob, err := userStore.GetOrCreateDirectConversation(eve.ID, bob.ID)
	if err != nil {
		t.Fatalf("failed to create direct conv: %v", err)
	}

	// Buat room direct antara Alice dan Bob, lalu jadikan Alice dan Bob berteman
	dmRoomAliceBob, err := userStore.GetOrCreateDirectConversation(alice.ID, bob.ID)
	if err != nil {
		t.Fatalf("failed to create direct conv: %v", err)
	}
	conn, _ := svc.RequestConnection(ctx, alice.ID, bob.ID, connection.SourceInAppRequest)
	_, _ = svc.RespondConnection(ctx, bob.ID, conn.ID, "accept")

	pcc := connection.NewPrivacyCallChecker(userStore, svc)

	// Eve (non-teman) menelpon room direct Eve-Bob -> DITOLAK
	allowedEve, reason := pcc.IsCallAllowed(ctx, "default", eve.ID, dmRoomEveBob)
	if allowedEve {
		t.Fatalf("expected call from non-friend Eve to private Bob to be disallowed")
	}
	if !strings.Contains(reason, "privat") {
		t.Errorf("expected reason to mention 'privat', got: %s", reason)
	}

	// Alice (teman) menelpon room direct Alice-Bob -> DIIZINKAN
	allowedAlice, _ := pcc.IsCallAllowed(ctx, "default", alice.ID, dmRoomAliceBob)
	if !allowedAlice {
		t.Fatalf("expected call from friend Alice to private Bob to be allowed")
	}
}

func TestConnection_CursorPagination(t *testing.T) {
	svc, userStore, _, cleanup := setupTestEnvironment(t)
	defer cleanup()

	ctx := ctxWithTenant("default")

	alice, _ := userStore.RegisterWithContext(ctx, "alice", "Alice", "password123")
	b1, _ := userStore.RegisterWithContext(ctx, "bob1", "Bob 1", "password123")
	b2, _ := userStore.RegisterWithContext(ctx, "bob2", "Bob 2", "password123")
	b3, _ := userStore.RegisterWithContext(ctx, "bob3", "Bob 3", "password123")

	// Hubungkan Alice dengan ketiga teman
	for _, friend := range []*store.User{b1, b2, b3} {
		c, err := svc.RequestConnection(ctx, alice.ID, friend.ID, connection.SourceInAppRequest)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		_, err = svc.RespondConnection(ctx, friend.ID, c.ID, "accept")
		if err != nil {
			t.Fatalf("respond failed: %v", err)
		}
		time.Sleep(10 * time.Millisecond) // Memberikan perbedaan timestamp
	}

	// Halaman 1: limit 2
	page1, err := svc.ListFriends(ctx, alice.ID, "", 2)
	if err != nil {
		t.Fatalf("page 1 failed: %v", err)
	}
	if len(page1.Friends) != 2 {
		t.Fatalf("expected 2 friends on page 1, got %d", len(page1.Friends))
	}
	if !page1.HasMore {
		t.Fatalf("expected page1.HasMore to be true")
	}
	if page1.NextCursor == "" {
		t.Fatalf("expected page1.NextCursor to be non-empty")
	}

	// Halaman 2: gunakan cursor dari halaman 1
	page2, err := svc.ListFriends(ctx, alice.ID, page1.NextCursor, 2)
	if err != nil {
		t.Fatalf("page 2 failed: %v", err)
	}
	if len(page2.Friends) != 1 {
		t.Fatalf("expected 1 friend on page 2, got %d", len(page2.Friends))
	}
	if page2.HasMore {
		t.Fatalf("expected page2.HasMore to be false on last page")
	}

	// Pastikan tidak ada duplikasi ID antar page 1 dan page 2
	seen := make(map[string]bool)
	for _, f := range page1.Friends {
		seen[f.ID] = true
	}
	for _, f := range page2.Friends {
		if seen[f.ID] {
			t.Fatalf("duplicate friend ID %s found across pages", f.ID)
		}
	}
}
