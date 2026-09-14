package store

import (
	"path/filepath"
	"testing"
	"time"
)

func TestSQLMessageStore_SQLite(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_wuzz.db")

	sqlStore, err := NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	// 1. Test Save
	msg1 := StoredMessage{
		ID:        "msg-101",
		RoomID:    "alice:bob",
		FromID:    "alice",
		Nickname:  "Alice",
		ToID:      "bob",
		Content:   "Halo dari SQLite!",
		Timestamp: time.Now().UTC().Add(-2 * time.Minute),
	}

	msg2 := StoredMessage{
		ID:        "msg-102",
		RoomID:    "alice:bob",
		FromID:    "bob",
		Nickname:  "Bob",
		ToID:      "alice",
		Content:   "Halo juga Alice!",
		Timestamp: time.Now().UTC().Add(-1 * time.Minute),
	}

	if err := sqlStore.Save(msg1); err != nil {
		t.Fatalf("failed to save msg1: %v", err)
	}
	if err := sqlStore.Save(msg2); err != nil {
		t.Fatalf("failed to save msg2: %v", err)
	}

	// 2. Test GetRoomHistory
	history, err := sqlStore.GetRoomHistory("alice:bob", 10)
	if err != nil {
		t.Fatalf("failed to get history: %v", err)
	}

	if len(history) != 2 {
		t.Fatalf("expected 2 history items, got %d", len(history))
	}

	// Verify order: chronological (msg1 then msg2)
	if history[0].ID != "msg-101" || history[1].ID != "msg-102" {
		t.Errorf("history is not chronologically sorted: %v", history)
	}
}

func TestSQLUserStore_Profile(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_user_profile.db")

	sqlStore, err := NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	userStore := NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	// 1. Register User
	user, err := userStore.Register("charlie", "Charlie Brown", "password123")
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	if user.StatusMessage != "Tersedia untuk mengobrol" {
		t.Errorf("expected default status message, got: %s", user.StatusMessage)
	}

	// 2. Update Profile
	updated, err := userStore.UpdateProfile(user.ID, "Charlie Super", "🚀 Sedang coding Wuzz Chat", "avatar_1")
	if err != nil {
		t.Fatalf("failed to update profile: %v", err)
	}

	if updated.DisplayName != "Charlie Super" {
		t.Errorf("expected DisplayName 'Charlie Super', got: %s", updated.DisplayName)
	}
	if updated.StatusMessage != "🚀 Sedang coding Wuzz Chat" {
		t.Errorf("expected StatusMessage '🚀 Sedang coding Wuzz Chat', got: %s", updated.StatusMessage)
	}
	if updated.AvatarURL != "avatar_1" {
		t.Errorf("expected AvatarURL 'avatar_1', got: %s", updated.AvatarURL)
	}

	// 4. Test GetUserByUsernameOrDisplayName
	byUsername, err := userStore.GetUserByUsernameOrDisplayName("charlie")
	if err != nil || byUsername.StatusMessage != "🚀 Sedang coding Wuzz Chat" {
		t.Fatalf("failed to get user by username: %v, status: %v", err, byUsername)
	}

	byDisplayName, err := userStore.GetUserByUsernameOrDisplayName("Charlie Super")
	if err != nil || byDisplayName.StatusMessage != "🚀 Sedang coding Wuzz Chat" {
		t.Fatalf("failed to get user by display name: %v, status: %v", err, byDisplayName)
	}

	// 5. Test Update and Retrieve E2EE PublicKey
	testPublicKey := `{"kty":"EC","crv":"P-256","x":"test-x","y":"test-y"}`
	if err := userStore.UpdatePublicKey(user.ID, testPublicKey); err != nil {
		t.Fatalf("failed to update public key: %v", err)
	}

	fetchedUser, err := userStore.GetUserByID(user.ID)
	if err != nil {
		t.Fatalf("failed to get user by ID after key update: %v", err)
	}
	if fetchedUser.PublicKey != testPublicKey {
		t.Errorf("expected PublicKey '%s', got '%s'", testPublicKey, fetchedUser.PublicKey)
	}

	// Verify SearchUsers also returns PublicKey
	searchResults, err := userStore.SearchUsers("charlie", "other-id")
	if err != nil || len(searchResults) == 0 {
		t.Fatalf("SearchUsers failed: %v, len: %d", err, len(searchResults))
	}
	if searchResults[0].PublicKey != testPublicKey {
		t.Errorf("expected SearchUsers to return PublicKey '%s', got '%s'", testPublicKey, searchResults[0].PublicKey)
	}
}

func TestSQLUserStore_RoomAccessAuthorization(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_user_auth_room.db")

	sqlStore, err := NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	userStore := NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userA, _ := userStore.Register("alice_sec", "Alice Sec", "pass123")
	userB, _ := userStore.Register("bob_sec", "Bob Sec", "pass123")
	userC, _ := userStore.Register("mallory_sec", "Mallory Sec", "pass123")

	// 1. Alice dan Bob membuat direct conversation
	dmRoomID, err := userStore.GetOrCreateDirectConversation(userA.ID, userB.ID)
	if err != nil {
		t.Fatalf("failed to create DM: %v", err)
	}

	// 2. Alice harus diizinkan (true)
	allowedA, err := userStore.IsUserInConversation(dmRoomID, userA.ID)
	if err != nil || !allowedA {
		t.Errorf("Alice should be allowed, got allowed=%v, err=%v", allowedA, err)
	}

	// 3. Bob harus diizinkan (true)
	allowedB, err := userStore.IsUserInConversation(dmRoomID, userB.ID)
	if err != nil || !allowedB {
		t.Errorf("Bob should be allowed, got allowed=%v, err=%v", allowedB, err)
	}

	// 4. Mallory (pihak ketiga yang bukan anggota) harus DITOLAK (false)
	allowedC, err := userStore.IsUserInConversation(dmRoomID, userC.ID)
	if err != nil || allowedC {
		t.Errorf("Mallory should be DENIED access to Alice-Bob DM, got allowed=%v", allowedC)
	}

	// 5. Room publik / ad-hoc group biasa harus diizinkan untuk semua
	allowedPublic, err := userStore.IsUserInConversation("room-kopi-santai", userC.ID)
	if err != nil || !allowedPublic {
		t.Errorf("Public room should be accessible, got allowed=%v", allowedPublic)
	}
}

func TestClearConversation_PrivacyFilter(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_clear_conv.db")

	sqlStore, err := NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	userStore := NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, _ := userStore.Register("alice_clear", "Alice Clear", "pass123")
	userBob, _ := userStore.Register("bob_clear", "Bob Clear", "pass123")

	dmRoomID, err := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)
	if err != nil {
		t.Fatalf("failed to create DM: %v", err)
	}

	// 1. Kirim pesan sebelum clear
	time1 := time.Now().UTC().Add(-10 * time.Minute)
	time2 := time.Now().UTC().Add(-5 * time.Minute)

	_ = sqlStore.Save(StoredMessage{
		ID:        "msg-1",
		RoomID:    dmRoomID,
		FromID:    userAlice.ID,
		Nickname:  "Alice Clear",
		ToID:      userBob.ID,
		Content:   "Pesan lama dari Alice",
		Timestamp: time1,
	})

	_ = sqlStore.Save(StoredMessage{
		ID:        "msg-2",
		RoomID:    dmRoomID,
		FromID:    userBob.ID,
		Nickname:  "Bob Clear",
		ToID:      userAlice.ID,
		Content:   "Pesan lama dari Bob",
		Timestamp: time2,
	})

	// 2. Cek history awal untuk Alice dan Bob
	histAlice, _ := sqlStore.GetRoomHistoryForUser(dmRoomID, userAlice.ID, 10)
	if len(histAlice) != 2 {
		t.Fatalf("Alice should see 2 messages initially, got %d", len(histAlice))
	}
	histBob, _ := sqlStore.GetRoomHistoryForUser(dmRoomID, userBob.ID, 10)
	if len(histBob) != 2 {
		t.Fatalf("Bob should see 2 messages initially, got %d", len(histBob))
	}

	// 3. Alice melakukan ClearConversation
	time.Sleep(50 * time.Millisecond)
	if err := userStore.ClearConversation(dmRoomID, userAlice.ID); err != nil {
		t.Fatalf("ClearConversation failed: %v", err)
	}

	// 4. Verifikasi: Percakapan hilang dari sidebar Alice
	convsAlice, _ := userStore.GetUserConversations(userAlice.ID)
	if len(convsAlice) != 0 {
		t.Fatalf("Alice sidebar should be empty after clear, got %d conversations", len(convsAlice))
	}

	// 5. Verifikasi: Percakapan TETAP ADA di sidebar Bob
	convsBob, _ := userStore.GetUserConversations(userBob.ID)
	if len(convsBob) != 1 {
		t.Fatalf("Bob sidebar should still have 1 conversation, got %d", len(convsBob))
	}

	// 6. Verifikasi: History Alice kosong, History Bob tetap lengkap
	histAliceAfter, _ := sqlStore.GetRoomHistoryForUser(dmRoomID, userAlice.ID, 10)
	if len(histAliceAfter) != 0 {
		t.Fatalf("Alice history should be empty after clear, got %d messages", len(histAliceAfter))
	}

	histBobAfter, _ := sqlStore.GetRoomHistoryForUser(dmRoomID, userBob.ID, 10)
	if len(histBobAfter) != 2 {
		t.Fatalf("Bob history should still have 2 messages, got %d", len(histBobAfter))
	}

	// 7. Bob kirim pesan baru setelah Alice clear
	time.Sleep(50 * time.Millisecond)
	time3 := time.Now().UTC()
	_ = sqlStore.Save(StoredMessage{
		ID:        "msg-3",
		RoomID:    dmRoomID,
		FromID:    userBob.ID,
		Nickname:  "Bob Clear",
		ToID:      userAlice.ID,
		Content:   "Pesan baru setelah clear",
		Timestamp: time3,
	})

	// 8. Verifikasi: Percakapan MUNCUL KEMBALI di sidebar Alice dengan snippet pesan baru
	convsAliceNew, _ := userStore.GetUserConversations(userAlice.ID)
	if len(convsAliceNew) != 1 {
		t.Fatalf("Alice sidebar should reappear with new message, got %d conversations", len(convsAliceNew))
	}
	if convsAliceNew[0].LastMessage != "Pesan baru setelah clear" {
		t.Errorf("Alice last message should be new message, got: %s", convsAliceNew[0].LastMessage)
	}

	// 9. Verifikasi: History Alice HANYA berisi pesan baru (msg-3), bukan pesan lama (msg-1, msg-2)
	histAliceFinal, _ := sqlStore.GetRoomHistoryForUser(dmRoomID, userAlice.ID, 10)
	if len(histAliceFinal) != 1 {
		t.Fatalf("Alice history should only have 1 new message, got %d", len(histAliceFinal))
	}
	if histAliceFinal[0].ID != "msg-3" {
		t.Errorf("Alice history should have msg-3, got %s", histAliceFinal[0].ID)
	}

	// 10. Verifikasi: History Bob berisi SELURUH 3 pesan (msg-1, msg-2, msg-3)
	histBobFinal, _ := sqlStore.GetRoomHistoryForUser(dmRoomID, userBob.ID, 10)
	if len(histBobFinal) != 3 {
		t.Fatalf("Bob history should have all 3 messages, got %d", len(histBobFinal))
	}
}

func TestDeleteMessage_Scenarios(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_del_msg.db")

	sqlStore, err := NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	userStore := NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, _ := userStore.Register("alice_del", "Alice Del", "pass123")
	userBob, _ := userStore.Register("bob_del", "Bob Del", "pass123")

	dmRoomID, _ := userStore.GetOrCreateDirectConversation(userAlice.ID, userBob.ID)

	// 1. Pesan baru (< 60 detik)
	now := time.Now().UTC()
	_ = sqlStore.Save(StoredMessage{
		ID:        "msg-recent",
		RoomID:    dmRoomID,
		FromID:    userAlice.ID,
		Nickname:  "Alice Del",
		ToID:      userBob.ID,
		Content:   "Pesan baru yang ingin ditarik",
		Timestamp: now,
	})

	// 2. Pesan lama (> 60 detik)
	_ = sqlStore.Save(StoredMessage{
		ID:        "msg-old",
		RoomID:    dmRoomID,
		FromID:    userAlice.ID,
		Nickname:  "Alice Del",
		ToID:      userBob.ID,
		Content:   "Pesan lama yang sudah 5 menit",
		Timestamp: now.Add(-5 * time.Minute),
	})

	// Skenario A: Hapus untuk Semua Orang pada pesan lama (> 1 menit) -> HARUS GAGAL
	_, err = sqlStore.DeleteMessage("msg-old", userAlice.ID, userAlice.DisplayName, true)
	if err == nil {
		t.Errorf("Delete for everyone on message > 1 min should FAIL")
	}

	// Skenario B: Hapus untuk Semua Orang oleh pihak lain (Bob) -> HARUS GAGAL
	_, err = sqlStore.DeleteMessage("msg-recent", userBob.ID, userBob.DisplayName, true)
	if err == nil {
		t.Errorf("Delete for everyone by non-author should FAIL")
	}

	// Skenario C: Hapus untuk Semua Orang pada pesan baru (< 1 menit) oleh pemilik -> HARUS SUKSES
	deletedMsg, err := sqlStore.DeleteMessage("msg-recent", userAlice.ID, userAlice.DisplayName, true)
	if err != nil {
		t.Fatalf("Delete for everyone within 1 min should SUCCEED: %v", err)
	}
	if deletedMsg.Content != "🚫 Pesan ini telah dihapus" || !deletedMsg.IsDeleted {
		t.Errorf("expected deleted placeholder, got: %s (is_deleted: %v)", deletedMsg.Content, deletedMsg.IsDeleted)
	}

	// Verifikasi: History menampilkan placeholder untuk kedua pihak
	histAlice, _ := sqlStore.GetRoomHistoryForUser(dmRoomID, userAlice.ID, 10)
	histBob, _ := sqlStore.GetRoomHistoryForUser(dmRoomID, userBob.ID, 10)
	if histAlice[1].Content != "🚫 Pesan ini telah dihapus" || histBob[1].Content != "🚫 Pesan ini telah dihapus" {
		t.Errorf("History should show deleted placeholder to both users")
	}

	// Skenario D: Hapus untuk Saya Saja pada pesan lama (Bob menghapus pesan msg-old untuk dirinya saja) -> HARUS SUKSES
	_, err = sqlStore.DeleteMessage("msg-old", userBob.ID, userBob.DisplayName, false)
	if err != nil {
		t.Fatalf("Delete for me should SUCCEED: %v", err)
	}

	// Verifikasi: msg-old HILANG untuk Bob, tapi TETAP ADA untuk Alice
	histBobAfterForMe, _ := sqlStore.GetRoomHistoryForUser(dmRoomID, userBob.ID, 10)
	histAliceAfterForMe, _ := sqlStore.GetRoomHistoryForUser(dmRoomID, userAlice.ID, 10)

	// Bob hanya melihat msg-recent (yang telah ditarik), msg-old sudah hilang
	if len(histBobAfterForMe) != 1 || histBobAfterForMe[0].ID != "msg-recent" {
		t.Errorf("Bob should only see msg-recent after deleting msg-old for me, got %d messages", len(histBobAfterForMe))
	}
	// Alice tetap melihat 2 pesan
	if len(histAliceAfterForMe) != 2 {
		t.Errorf("Alice should still see 2 messages, got %d", len(histAliceAfterForMe))
	}
}

func TestGetOrCreateDirectConversation_CollisionAndLegacy(t *testing.T) {
	tmpDB := filepath.Join(t.TempDir(), "test_collision.db")
	sqlStore, err := NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("failed to init SQLite store: %v", err)
	}
	defer sqlStore.Close()

	userStore := NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	// 1. Uji Anti-Tabrakan: 4 pengguna dengan prefix ID 8 karakter yang identik
	user1, _ := userStore.Register("user_col_1", "User 1", "pass123")
	user2, _ := userStore.Register("user_col_2", "User 2", "pass123")
	user3, _ := userStore.Register("user_col_3", "User 3", "pass123")
	user4, _ := userStore.Register("user_col_4", "User 4", "pass123")

	// Pasangan 1: user1 <-> user2
	room12, err12 := userStore.GetOrCreateDirectConversation(user1.ID, user2.ID)
	if err12 != nil {
		t.Fatalf("Failed to create room12: %v", err12)
	}

	// Pasangan 2: user1 <-> user3
	room13, err13 := userStore.GetOrCreateDirectConversation(user1.ID, user3.ID)
	if err13 != nil {
		t.Fatalf("Failed to create room13: %v", err13)
	}

	// Pasangan 3: user2 <-> user4
	room24, err24 := userStore.GetOrCreateDirectConversation(user2.ID, user4.ID)
	if err24 != nil {
		t.Fatalf("Failed to create room24: %v", err24)
	}

	// Verifikasi: Seluruh room ID harus unik (0 collision)
	if room12 == room13 || room12 == room24 || room13 == room24 {
		t.Fatalf("COLLISION DETECTED: room IDs overlap! room12=%s, room13=%s, room24=%s", room12, room13, room24)
	}

	// 2. Uji Idempotensi & Order-Invariance:
	// Memanggil (user1, user2) atau (user2, user1) harus menghasilkan room yang sama persis
	room21, err21 := userStore.GetOrCreateDirectConversation(user2.ID, user1.ID)
	if err21 != nil {
		t.Fatalf("Failed to retrieve room21: %v", err21)
	}
	if room21 != room12 {
		t.Errorf("Idempotency violation: room21 (%s) != room12 (%s)", room21, room12)
	}

	// 3. Uji Backward Compatibility Ruang Direct Legacy
	// Simulasikan room legacy yang dibuat dengan format lama (dm_legacy_1_legacy_2)
	legacyRoomID := "dm_legacy_1_legacy_2"
	now := time.Now().UTC()
	_, _ = sqlStore.DB().Exec(`INSERT INTO conversations (id, type, title, created_at, updated_at) VALUES (?, 'direct', '', ?, ?)`, legacyRoomID, now, now)
	_, _ = sqlStore.DB().Exec(`INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?), (?, ?, ?)`, legacyRoomID, user3.ID, now, legacyRoomID, user4.ID, now)

	// Panggil GetOrCreateDirectConversation untuk user3 dan user4
	foundLegacyRoom, errLegacy := userStore.GetOrCreateDirectConversation(user3.ID, user4.ID)
	if errLegacy != nil {
		t.Fatalf("Failed to get legacy direct room: %v", errLegacy)
	}
	if foundLegacyRoom != legacyRoomID {
		t.Errorf("Legacy room was not reused: expected %s, got %s", legacyRoomID, foundLegacyRoom)
	}
}

func TestSQLUserStore_PushSubscriptions(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "test_push_sub.db")
	sqlStore, err := NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to create SQLMessageStore: %v", err)
	}
	defer sqlStore.Close()

	userStore := NewSQLUserStore(sqlStore.DB(), sqlStore.DriverName())

	userAlice, err := userStore.Register("alice_push", "Alice Push", "password123")
	if err != nil {
		t.Fatalf("Failed to register alice: %v", err)
	}
	userBob, err := userStore.Register("bob_push", "Bob Push", "password123")
	if err != nil {
		t.Fatalf("Failed to register bob: %v", err)
	}

	// 1. Simpan push subscription untuk Alice
	subAlice1 := &PushSubscription{
		UserID:    userAlice.ID,
		Platform:  "web",
		Endpoint:  "https://push.browser.com/sub/alice/1",
		P256dhKey: "p256dh_alice_1",
		AuthKey:   "auth_alice_1",
	}
	if err := userStore.SavePushSubscription(subAlice1); err != nil {
		t.Fatalf("Failed to save subAlice1: %v", err)
	}

	// Simpan subscription kedua untuk Alice (misal di browser HP)
	subAlice2 := &PushSubscription{
		UserID:    userAlice.ID,
		Platform:  "web",
		Endpoint:  "https://push.browser.com/sub/alice/2",
		P256dhKey: "p256dh_alice_2",
		AuthKey:   "auth_alice_2",
	}
	if err := userStore.SavePushSubscription(subAlice2); err != nil {
		t.Fatalf("Failed to save subAlice2: %v", err)
	}

	// Simpan push subscription untuk Bob
	subBob := &PushSubscription{
		UserID:    userBob.ID,
		Platform:  "android",
		Endpoint:  "https://fcm.googleapis.com/fcm/send/bob_token",
		P256dhKey: "",
		AuthKey:   "",
	}
	if err := userStore.SavePushSubscription(subBob); err != nil {
		t.Fatalf("Failed to save subBob: %v", err)
	}

	// 2. Query push subscriptions milik Alice
	aliceSubs, err := userStore.GetPushSubscriptionsByUserID(userAlice.ID)
	if err != nil {
		t.Fatalf("Failed to get Alice subs: %v", err)
	}
	if len(aliceSubs) != 2 {
		t.Fatalf("Expected 2 subscriptions for Alice, got %d", len(aliceSubs))
	}

	// 3. Query push subscriptions untuk sekumpulan penerima (Alice dan Bob)
	allSubs, err := userStore.GetPushSubscriptionsForRecipients([]string{userAlice.ID, userBob.ID})
	if err != nil {
		t.Fatalf("Failed to get all subs: %v", err)
	}
	if len(allSubs) != 3 {
		t.Fatalf("Expected 3 subscriptions total, got %d", len(allSubs))
	}

	// 4. Test Unsubscribe endpoint spesifik milik Alice
	if err := userStore.DeletePushSubscriptionByUser(userAlice.ID, subAlice1.Endpoint); err != nil {
		t.Fatalf("Failed to delete subAlice1: %v", err)
	}

	aliceSubsAfterDelete, err := userStore.GetPushSubscriptionsByUserID(userAlice.ID)
	if err != nil {
		t.Fatalf("Failed to get Alice subs after delete: %v", err)
	}
	if len(aliceSubsAfterDelete) != 1 {
		t.Fatalf("Expected 1 subscription for Alice after delete, got %d", len(aliceSubsAfterDelete))
	}
	if aliceSubsAfterDelete[0].Endpoint != subAlice2.Endpoint {
		t.Errorf("Remaining sub endpoint mismatch: got %s, want %s", aliceSubsAfterDelete[0].Endpoint, subAlice2.Endpoint)
	}
}




