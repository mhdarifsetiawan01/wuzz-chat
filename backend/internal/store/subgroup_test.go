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
	_, err = store.CreateSubGroup(parentGroup.ID, "Topik Ilegal Outsider", "Desc", outsider.ID, "7_days")
	if err == nil {
		t.Fatalf("Ekspektasi error saat outsider membuat subgrup, tapi berhasil!")
	}

	// 4. Uji Durasi Invalid (Hanya boleh 7_days atau 30_days)
	_, err = store.CreateSubGroup(parentGroup.ID, "Topik Durasi Ngawur", "Desc", creator.ID, "999_years")
	if err == nil {
		t.Fatalf("Ekspektasi error saat durasi tidak valid, tapi berhasil!")
	}

	// 5. Creator membuat subgrup valid durasi default 1 minggu (7_days)
	sub7, err := store.CreateSubGroup(parentGroup.ID, "Diskusi Sprint 1 Minggu", "Fokus sprint", creator.ID, "7_days")
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

	// 6. Member grup utama membuat subgrup valid durasi 1 bulan (30_days)
	sub30, err := store.CreateSubGroup(parentGroup.ID, "Diskusi Roadmap 1 Bulan", "Perencanaan", member.ID, "30_days")
	if err != nil {
		t.Fatalf("Gagal membuat subgrup 30 hari: %v", err)
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
