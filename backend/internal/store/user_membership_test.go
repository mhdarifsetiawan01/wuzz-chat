package store_test

import (
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/store"
)

// IsUserInConversation memakai satu kueri gabungan; semua cabang keputusan harus tetap sama.
func TestIsUserInConversation_Branches(t *testing.T) {
	ms := openMessageStore(t, "member.db")
	us := store.NewSQLUserStore(ms.DB(), ms.DriverName())
	gs := store.NewSQLGroupStore(ms.DB(), ms.DriverName())

	owner, _ := us.Register("own_member", "Owner", "pass12345")
	mem, _ := us.Register("mem_member", "Member", "pass12345")
	out, _ := us.Register("out_member", "Outsider", "pass12345")

	check := func(name, room, user string, want bool) {
		t.Helper()
		got, err := us.IsUserInConversation(room, user)
		if err != nil {
			t.Fatalf("%s: galat %v", name, err)
		}
		if got != want {
			t.Fatalf("%s: want %v got %v", name, want, got)
		}
	}

	// Kosong -> false; room ad-hoc tak terdaftar -> true; dm_ tak terdaftar -> false.
	check("kosong", "", owner.ID, false)
	check("adhoc", "room-kopi", out.ID, true)
	check("dm tak tersimpan", "dm_tidak_ada", owner.ID, false)

	// Grup: anggota true, bukan anggota false.
	grp, err := gs.CreateGroup("Grup Uji", "", "", owner.ID, "grup_uji_member", true, []string{mem.ID})
	if err != nil {
		t.Fatalf("grup: %v", err)
	}
	check("anggota grup", grp.ID, mem.ID, true)
	check("bukan anggota grup", grp.ID, out.ID, false)

	// Subgrup: anggota subgrup yang keluar dari grup induk kehilangan akses.
	sub, err := gs.CreateSubGroup(grp.ID, "Topik Uji", "", owner.ID, "7_days", true)
	if err != nil {
		t.Fatalf("subgrup: %v", err)
	}
	if err := gs.JoinSubGroup(sub.ID, mem.ID); err != nil {
		t.Fatalf("join subgrup: %v", err)
	}
	check("anggota subgrup", sub.ID, mem.ID, true)
	q := `DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?`
	if ms.DriverName() == "postgres" {
		q = `DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`
	}
	if _, err := ms.DB().Exec(q, grp.ID, mem.ID); err != nil {
		t.Fatalf("hapus dari induk: %v", err)
	}
	check("subgrup tanpa induk", sub.ID, mem.ID, false)
	check("pemilik tetap", sub.ID, owner.ID, true)

	// DM: anggota true, orang luar false.
	dm, _ := us.GetOrCreateDirectConversation(owner.ID, mem.ID)
	check("anggota dm", dm, owner.ID, true)
	check("luar dm", dm, out.ID, false)
}
