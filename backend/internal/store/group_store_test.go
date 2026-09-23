package store

import (
	"path/filepath"
	"testing"
)

// setupTestGroupStore menyiapkan SQLGroupStore dan SQLUserStore dari database SQLite yang sama.
// Dipisahkan setelah refactoring Fase 1 — GroupStore tidak lagi diimplementasikan oleh SQLUserStore.
func setupTestGroupStore(t *testing.T) (*SQLGroupStore, *SQLUserStore, func()) {
	t.Helper()
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_group.db")
	msgStore, err := NewSQLMessageStore("sqlite", dbPath)
	if err != nil {
		t.Fatalf("NewSQLMessageStore gagal: %v", err)
	}
	groupStore := NewSQLGroupStore(msgStore.DB(), "sqlite")
	userStore := NewSQLUserStore(msgStore.DB(), "sqlite")
	return groupStore, userStore, func() {
		msgStore.Close()
	}
}

func TestGroupStore_Lifecycle(t *testing.T) {
	gs, us, cleanup := setupTestGroupStore(t)
	defer cleanup()

	// 1. Buat User A (Creator), User B (Admin/Member), User C (Member)
	userA, err := us.Register("alice", "Alice Wonder", "password123")
	if err != nil {
		t.Fatalf("Register Alice gagal: %v", err)
	}
	userB, err := us.Register("bob", "Bob Builder", "password123")
	if err != nil {
		t.Fatalf("Register Bob gagal: %v", err)
	}
	userC, err := us.Register("charlie", "Charlie Brown", "password123")
	if err != nil {
		t.Fatalf("Register Charlie gagal: %v", err)
	}

	// 2. User A membuat grup privat dengan anggota User B
	group, err := gs.CreateGroup("Tim Frontend", "Diskusi UI Wuzz", "https://img.com/a.png", userA.ID, "", false, []string{userB.ID})
	if err != nil {
		t.Fatalf("CreateGroup gagal: %v", err)
	}

	if group.Title != "Tim Frontend" {
		t.Errorf("Expected title 'Tim Frontend', got %s", group.Title)
	}
	if group.MemberCount != 2 {
		t.Errorf("Expected 2 members, got %d", group.MemberCount)
	}
	if group.MyRole != "creator" {
		t.Errorf("Expected MyRole 'creator', got %s", group.MyRole)
	}

	// 3. Verifikasi role masing-masing
	roleA, _ := gs.GetUserRoleInGroup(group.ID, userA.ID)
	if roleA != "creator" {
		t.Errorf("Expected Alice role 'creator', got %s", roleA)
	}
	roleB, _ := gs.GetUserRoleInGroup(group.ID, userB.ID)
	if roleB != "member" {
		t.Errorf("Expected Bob role 'member', got %s", roleB)
	}

	// 4. Promosikan User B menjadi Admin
	err = gs.UpdateMemberRole(group.ID, userA.ID, userB.ID, "admin")
	if err != nil {
		t.Fatalf("UpdateMemberRole to admin gagal: %v", err)
	}
	roleB, _ = gs.GetUserRoleInGroup(group.ID, userB.ID)
	if roleB != "admin" {
		t.Errorf("Expected Bob role 'admin', got %s", roleB)
	}

	// 5. User B (Admin) menambahkan User C ke grup
	err = gs.AddGroupMembers(group.ID, userB.ID, []string{userC.ID})
	if err != nil {
		t.Fatalf("AddGroupMembers oleh Bob gagal: %v", err)
	}
	members, err := gs.GetGroupMembers(group.ID)
	if err != nil {
		t.Fatalf("GetGroupMembers gagal: %v", err)
	}
	if len(members) != 3 {
		t.Errorf("Expected 3 members, got %d", len(members))
	}

	// 6. Uji Proteksi: Bob (Admin) TIDAK BOLEH bisa mengeluarkan Alice (Creator)
	err = gs.RemoveGroupMember(group.ID, userB.ID, userA.ID)
	if err == nil {
		t.Errorf("Expected error saat Admin mencoba kick Creator, tapi berhasil")
	}

	// 7. Bob (Admin) mengeluarkan Charlie (Member) -> Berhasil
	err = gs.RemoveGroupMember(group.ID, userB.ID, userC.ID)
	if err != nil {
		t.Fatalf("Admin kick member gagal: %v", err)
	}

	// 8. Verifikasi Charlie sudah bukan anggota
	roleC, _ := gs.GetUserRoleInGroup(group.ID, userC.ID)
	if roleC != "" {
		t.Errorf("Expected Charlie role empty, got %s", roleC)
	}

	// 9. Charlie mencoba akses detail grup privat -> Ditolak ErrUnauthorizedGroup
	_, err = gs.GetGroupDetails(group.ID, userC.ID)
	if err != ErrUnauthorizedGroup {
		t.Errorf("Expected ErrUnauthorizedGroup, got %v", err)
	}
}

func TestGroupStore_PublicGroupAndSearch(t *testing.T) {
	gs, us, cleanup := setupTestGroupStore(t)
	defer cleanup()

	userA, _ := us.Register("alice", "Alice", "password123")
	userB, _ := us.Register("bob", "Bob", "password123")

	// 1. Buat grup publik dengan @username
	pubGroup, err := gs.CreateGroup("Komunitas Golang", "Tempat belajar Go", "", userA.ID, "golang_id", true, nil)
	if err != nil {
		t.Fatalf("CreateGroup public gagal: %v", err)
	}

	if !pubGroup.IsPublic {
		t.Errorf("Expected IsPublic true")
	}
	if pubGroup.GroupUsername != "golang_id" {
		t.Errorf("Expected group_username 'golang_id', got %s", pubGroup.GroupUsername)
	}

	// 2. Coba buat grup publik lain dengan username yang sama -> ErrGroupUsernameTaken
	_, err = gs.CreateGroup("Golang Keren", "Deskripsi", "", userA.ID, "GOLANG_ID", true, nil)
	if err != ErrGroupUsernameTaken {
		t.Errorf("Expected ErrGroupUsernameTaken, got %v", err)
	}

	// 3. User B mencari grup publik via search
	results, err := gs.SearchPublicGroups("golang", 10)
	if err != nil {
		t.Fatalf("SearchPublicGroups gagal: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(results))
	}
	if results[0].ID != pubGroup.ID {
		t.Errorf("Expected group ID %s, got %s", pubGroup.ID, results[0].ID)
	}

	// 4. User B melakukan self-join ke grup publik
	err = gs.JoinPublicGroup(pubGroup.ID, userB.ID)
	if err != nil {
		t.Fatalf("JoinPublicGroup gagal: %v", err)
	}

	// 5. Coba self-join lagi -> ErrAlreadyGroupMember
	err = gs.JoinPublicGroup(pubGroup.ID, userB.ID)
	if err != ErrAlreadyGroupMember {
		t.Errorf("Expected ErrAlreadyGroupMember, got %v", err)
	}
}
