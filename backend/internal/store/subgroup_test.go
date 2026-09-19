package store

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func setupTestSubGroupDB(t *testing.T) (*SQLMessageStore, *SQLUserStore) {
	tmpDB := filepath.Join(t.TempDir(), "test_subgroup.db")
	sqlStore, err := NewSQLMessageStore("sqlite", tmpDB)
	if err != nil {
		t.Fatalf("Gagal membuka sqlite: %v", err)
	}

	userStore := NewSQLUserStore(sqlStore.DB(), "sqlite")
	return sqlStore, userStore
}

func TestSubGroup_FullLifecycle(t *testing.T) {
	sqlStore, store := setupTestSubGroupDB(t)
	defer sqlStore.Close()
	db := sqlStore.DB()

	// 1. Buat 3 user (UUID immutable)
	creator, err := store.Register("creator_user", "Creator Boss", "Secret123!")
	if err != nil {
		t.Fatalf("Gagal register creator: %v", err)
	}
	member, err := store.Register("member_user", "Member Active", "Secret123!")
	if err != nil {
		t.Fatalf("Gagal register member: %v", err)
	}
	outsider, err := store.Register("outsider_user", "Outsider Stranger", "Secret123!")
	if err != nil {
		t.Fatalf("Gagal register outsider: %v", err)
	}

	// 2. Buat grup utama (parent group) dengan creator & member
	parentGroup, err := store.CreateGroup(
		"Grup Utama BMS", "Deskripsi grup utama", "",
		creator.ID, "grup_utama", true, []string{member.ID},
	)
	if err != nil {
		t.Fatalf("Gagal membuat parent group: %v", err)
	}
	if !strings.HasPrefix(parentGroup.ID, "grp_") {
		t.Errorf("Format ID parent group tidak diawali grp_: %s", parentGroup.ID)
	}

	// 3. Uji Security: Outsider (bukan member grup utama) DILARANG membuat subgrup!
	_, err = store.CreateSubGroup(parentGroup.ID, "Topik Ilegal Outsider", "Desc", outsider.ID, "7_days", true)
	if err == nil {
		t.Fatalf("Ekspektasi error saat outsider membuat subgrup, tapi berhasil!")
	}

	// 4. Uji Durasi Invalid (Hanya boleh 7_days atau 30_days)
	_, err = store.CreateSubGroup(parentGroup.ID, "Topik Durasi Ngawur", "Desc", creator.ID, "999_years", true)
	if err == nil {
		t.Fatalf("Ekspektasi error saat durasi tidak valid, tapi berhasil!")
	}

	// 5. Creator membuat subgrup valid durasi default 1 minggu (7_days)
	sub7, err := store.CreateSubGroup(parentGroup.ID, "Diskusi Sprint 1 Minggu", "Fokus sprint", creator.ID, "7_days", true)
	if err != nil {
		t.Fatalf("Gagal membuat subgrup 7 hari: %v", err)
	}
	if !strings.HasPrefix(sub7.ID, "sub_") {
		t.Errorf("Format ID subgrup tidak diawali sub_: %s", sub7.ID)
	}
	if sub7.ParentID != parentGroup.ID {
		t.Errorf("Ekspektasi parent_id %s, dapat: %s", parentGroup.ID, sub7.ParentID)
	}
	if sub7.Status != "active" {
		t.Errorf("Ekspektasi status active, dapat: %s", sub7.Status)
	}
	if sub7.ExpiresAt == nil || sub7.ExpiresAt.Before(time.Now().UTC().Add(6*24*time.Hour)) {
		t.Errorf("ExpiresAt tidak sesuai durasi 7 hari: %v", sub7.ExpiresAt)
	}

	// 6. Uji Security RBAC: Member biasa DILARANG membuat subgrup!
	_, err = store.CreateSubGroup(parentGroup.ID, "Topik Ilegal Member", "Desc", member.ID, "30_days", true)
	if err == nil {
		t.Fatalf("Ekspektasi error saat member biasa membuat subgrup, tapi berhasil!")
	}

	// 6b. Creator mempromosikan member menjadi admin
	err = store.UpdateMemberRole(parentGroup.ID, creator.ID, member.ID, "admin")
	if err != nil {
		t.Fatalf("Gagal mempromosikan member menjadi admin: %v", err)
	}

	// 6c. Admin grup utama berhasil membuat subgrup valid durasi 1 bulan (30_days)
	sub30, err := store.CreateSubGroup(parentGroup.ID, "Diskusi Roadmap 1 Bulan", "Perencanaan", member.ID, "30_days", true)
	if err != nil {
		t.Fatalf("Gagal membuat subgrup 30 hari oleh admin: %v", err)
	}
	if sub30.ExpiresAt == nil || sub30.ExpiresAt.Before(time.Now().UTC().Add(28*24*time.Hour)) {
		t.Errorf("ExpiresAt tidak sesuai durasi 30 hari: %v", sub30.ExpiresAt)
	}

	// 7. Uji Security: Outsider DILARANG melihat list subgrup!
	_, err = store.GetActiveSubGroups(parentGroup.ID, outsider.ID)
	if err == nil {
		t.Fatalf("Ekspektasi error saat outsider melihat list subgrup, tapi berhasil!")
	}

	// 8. Anggota grup utama (member) dapat melihat list subgrup aktif
	activeSubs, err := store.GetActiveSubGroups(parentGroup.ID, member.ID)
	if err != nil {
		t.Fatalf("Gagal mengambil active subgrup untuk member: %v", err)
	}
	if len(activeSubs) != 2 {
		t.Fatalf("Ekspektasi 2 active subgrup, dapat: %d", len(activeSubs))
	}

	// 9. Uji Security: Outsider DILARANG join subgrup!
	err = store.JoinSubGroup(sub7.ID, outsider.ID)
	if err == nil {
		t.Fatalf("Ekspektasi error saat outsider mencoba join subgrup, tapi berhasil!")
	}

	// 10. Member grup utama BERHASIL join subgrup
	err = store.JoinSubGroup(sub7.ID, member.ID)
	if err != nil {
		t.Fatalf("Gagal join subgrup untuk anggota grup utama: %v", err)
	}

	// 11. Verifikasi IsUserInConversation (Parent-Membership Gate)
	// Member terdaftar di parent dan join sub7 -> allowed
	allowedMember, err := store.IsUserInConversation(sub7.ID, member.ID)
	if err != nil || !allowedMember {
		t.Fatalf("Ekspektasi member diizinkan di subgrup sub7, dapat: %v (err: %v)", allowedMember, err)
	}
	// Outsider tidak terdaftar di parent -> DITOLAK
	allowedOutsider, err := store.IsUserInConversation(sub7.ID, outsider.ID)
	if allowedOutsider {
		t.Fatalf("Ekspektasi outsider ditolak di subgrup sub7!")
	}

	// 12. Uji Expired Lifecycle: Manipulasi expires_at sub7 ke masa lalu
	pastTime := time.Now().UTC().Add(-1 * time.Hour)
	_, err = db.Exec(`UPDATE conversations SET expires_at = ? WHERE id = ?`, pastTime, sub7.ID)
	if err != nil {
		t.Fatalf("Gagal memanipulasi expires_at: %v", err)
	}

	// Jalankan ExpireSubGroupsBatch
	affected, err := store.ExpireSubGroupsBatch()
	if err != nil {
		t.Fatalf("ExpireSubGroupsBatch error: %v", err)
	}
	if affected != 1 {
		t.Errorf("Ekspektasi 1 subgrup ter-expire, dapat: %d", affected)
	}

	// Verifikasi IsConversationExpired
	if !store.IsConversationExpired(sub7.ID) {
		t.Errorf("Ekspektasi IsConversationExpired(sub7) bernilai true!")
	}
	if store.IsConversationExpired(sub30.ID) {
		t.Errorf("Ekspektasi IsConversationExpired(sub30) bernilai false!")
	}

	// Subgrup yang expired otomatis hilang dari daftar subgrup aktif
	activeSubsAfter, err := store.GetActiveSubGroups(parentGroup.ID, member.ID)
	if err != nil {
		t.Fatalf("Gagal mengambil active subgrup: %v", err)
	}
	if len(activeSubsAfter) != 1 {
		t.Fatalf("Ekspektasi tinggal 1 active subgrup (sub30), dapat: %d", len(activeSubsAfter))
	}
	if activeSubsAfter[0].ID != sub30.ID {
		t.Errorf("Subgrup aktif tersisa salah: %s", activeSubsAfter[0].ID)
	}

	// Uji Fail-Closed: Join subgrup yang sudah expired DITOLAK
	err = store.JoinSubGroup(sub7.ID, creator.ID)
	if err == nil {
		t.Fatalf("Ekspektasi error saat join subgrup expired, tapi berhasil!")
	}
}

func TestSubGroup_AccessControlAndJoinRequests(t *testing.T) {
	sqlStore, store := setupTestSubGroupDB(t)
	defer sqlStore.Close()
	db := sqlStore.DB()

	// 1. Setup users: creator, memberA, memberB, outsider
	creator, _ := store.Register("ac_creator", "Creator", "Pass123!")
	memberA, _ := store.Register("ac_member_a", "Member A", "Pass123!")
	memberB, _ := store.Register("ac_member_b", "Member B", "Pass123!")
	outsider, _ := store.Register("ac_outsider", "Outsider", "Pass123!")

	// 2. Parent group with creator, memberA, memberB
	parent, err := store.CreateGroup("Parent Group", "Desc", "", creator.ID, "parent_ac", true, []string{memberA.ID, memberB.ID})
	if err != nil {
		t.Fatalf("Gagal membuat parent group: %v", err)
	}

	// 3. Create 1 Public sub-group and 1 Private sub-group
	pubSub, err := store.CreateSubGroup(parent.ID, "Topik Terbuka", "Publik", creator.ID, "7_days", true)
	if err != nil {
		t.Fatalf("Gagal buat public subgrup: %v", err)
	}
	if !pubSub.IsPublic {
		t.Errorf("Ekspektasi pubSub.IsPublic true, dapat false")
	}

	privSub, err := store.CreateSubGroup(parent.ID, "Topik Privat", "Rahasia", creator.ID, "7_days", false)
	if err != nil {
		t.Fatalf("Gagal buat private subgrup: %v", err)
	}
	if privSub.IsPublic {
		t.Errorf("Ekspektasi privSub.IsPublic false, dapat true")
	}

	// 4. Verify discovery: memberA can see both sub-groups in GetActiveSubGroups
	subs, err := store.GetActiveSubGroups(parent.ID, memberA.ID)
	if err != nil {
		t.Fatalf("GetActiveSubGroups gagal: %v", err)
	}
	if len(subs) != 2 {
		t.Fatalf("Ekspektasi 2 subgrup terlihat di parent, dapat: %d", len(subs))
	}

	// 5. MemberA can join Public sub-group directly
	if err := store.JoinSubGroup(pubSub.ID, memberA.ID); err != nil {
		t.Fatalf("MemberA gagal join public subgrup: %v", err)
	}

	// 6. MemberA tries to join Private sub-group directly -> MUST FAIL
	err = store.JoinSubGroup(privSub.ID, memberA.ID)
	if err == nil {
		t.Fatalf("Ekspektasi error direct join private subgrup, tapi berhasil!")
	}
	if !strings.Contains(err.Error(), "privat") {
		t.Errorf("Pesan error tidak memuat kata 'privat': %v", err)
	}

	// 7. Outsider tries to submit join request -> MUST FAIL (not parent member)
	err = store.RequestToJoinSubGroup(privSub.ID, outsider.ID)
	if err == nil {
		t.Fatalf("Ekspektasi outsider gagal request join, tapi berhasil!")
	}

	// 8. MemberA submits join request -> SUCCESS
	err = store.RequestToJoinSubGroup(privSub.ID, memberA.ID)
	if err != nil {
		t.Fatalf("MemberA gagal mengajukan izin join: %v", err)
	}

	// 9. MemberA submits duplicate request -> MUST FAIL (pending)
	err = store.RequestToJoinSubGroup(privSub.ID, memberA.ID)
	if err == nil {
		t.Fatalf("Ekspektasi error duplikat request pending, tapi berhasil!")
	}

	// 10. MemberB (bukan admin) tries to view pending requests -> FORBIDDEN
	_, err = store.GetPendingJoinRequests(privSub.ID, memberB.ID)
	if err == nil {
		t.Fatalf("Ekspektasi member biasa ditolak saat melihat pending requests!")
	}

	// 11. Creator can view pending requests
	reqs, err := store.GetPendingJoinRequests(privSub.ID, creator.ID)
	if err != nil {
		t.Fatalf("Creator gagal ambil pending requests: %v", err)
	}
	if len(reqs) != 1 {
		t.Fatalf("Ekspektasi 1 pending request, dapat: %d", len(reqs))
	}
	if reqs[0].UserID != memberA.ID {
		t.Errorf("User ID pemohon salah: %s vs %s", reqs[0].UserID, memberA.ID)
	}
	// 11.5 Verify GetSubGroupAdmins only includes creator/admin of subgrup
	admins, err := store.GetSubGroupAdmins(privSub.ID)
	if err != nil {
		t.Fatalf("Gagal GetSubGroupAdmins: %v", err)
	}
	if len(admins) != 1 || admins[0] != creator.ID {
		t.Fatalf("Ekspektasi hanya creator subgrup yang ada di admins, dapat: %v", admins)
	}

	// 12. Creator responds to join request (Approve)
	targetUID, err := store.RespondJoinRequest(privSub.ID, reqs[0].ID, creator.ID, true)
	if err != nil {
		t.Fatalf("Creator gagal menyetujui join request: %v", err)
	}
	if targetUID != memberA.ID {
		t.Errorf("Target User ID salah: %s vs %s", targetUID, memberA.ID)
	}

	// 13. Verify MemberA is now a member of privSub
	isMemberNow, err := store.IsUserInConversation(privSub.ID, memberA.ID)
	if err != nil || !isMemberNow {
		t.Fatalf("Ekspektasi memberA sudah menjadi anggota privSub setelah approved, dapat: %v (err: %v)", isMemberNow, err)
	}

	// 14. Testing Auto-Purge on Expired sub-groups:
	// MemberB requests to join privSub (re-open a request)
	// MemberB is not a member yet:
	err = store.RequestToJoinSubGroup(privSub.ID, memberB.ID)
	if err != nil {
		t.Fatalf("MemberB gagal mengajukan izin join: %v", err)
	}
	// Verify row exists in conversation_join_requests
	var countBefore int
	_ = db.QueryRow(`SELECT COUNT(*) FROM conversation_join_requests WHERE conversation_id = ?`, privSub.ID).Scan(&countBefore)
	if countBefore == 0 {
		t.Fatalf("Ekspektasi ada baris di conversation_join_requests!")
	}

	// Expire privSub by modifying expires_at to past
	pastTime := time.Now().UTC().Add(-10 * time.Minute)
	_, _ = db.Exec(`UPDATE conversations SET expires_at = ? WHERE id = ?`, pastTime, privSub.ID)

	// Run ExpireSubGroupsBatch
	affected, err := store.ExpireSubGroupsBatch()
	if err != nil {
		t.Fatalf("ExpireSubGroupsBatch error: %v", err)
	}
	if affected == 0 {
		t.Fatalf("Ekspektasi minimal 1 subgrup ter-expire!")
	}

	// Verify conversation_join_requests for privSub has been completely purged!
	var countAfter int
	_ = db.QueryRow(`SELECT COUNT(*) FROM conversation_join_requests WHERE conversation_id = ?`, privSub.ID).Scan(&countAfter)
	if countAfter != 0 {
		t.Errorf("Ekspektasi conversation_join_requests telah dihapus tuntas, tapi tersisa: %d baris", countAfter)
	}
}

