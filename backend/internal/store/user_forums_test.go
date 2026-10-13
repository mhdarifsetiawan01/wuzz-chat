package store_test

import (
	"context"
	"testing"
	"time"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// "Forum saya": hanya topik tempat user menjadi anggota, aktif lebih dulu, peran per topik benar,
// dan terisolasi per tenant (termasuk ID user yang sengaja dicampur lintas tenant).
func TestGetUserForums_MembershipRolesActiveAndTenantIsolation(t *testing.T) {
	ms := openMessageStore(t, "forums.db")
	us := store.NewSQLUserStore(ms.DB(), ms.DriverName())
	gs := store.NewSQLGroupStore(ms.DB(), ms.DriverName())

	def := tenantshared.WithTenant(context.Background(), "default")
	acme := tenantshared.WithTenant(context.Background(), "acme")

	owner, err := us.RegisterWithContext(def, "forum_owner", "Owner", "pass12345")
	if err != nil {
		t.Fatalf("register owner: %v", err)
	}
	member, err := us.RegisterWithContext(def, "forum_member", "Member", "pass12345")
	if err != nil {
		t.Fatalf("register member: %v", err)
	}
	outsider, err := us.RegisterWithContext(def, "forum_outsider", "Outsider", "pass12345")
	if err != nil {
		t.Fatalf("register outsider: %v", err)
	}
	acmeUser, err := us.RegisterWithContext(acme, "forum_acme", "Acme", "pass12345")
	if err != nil {
		t.Fatalf("register acme: %v", err)
	}

	parent, err := gs.CreateGroupWithContext(def, "Grup Induk", "", "", owner.ID, "", true, []string{member.ID})
	if err != nil {
		t.Fatalf("create parent: %v", err)
	}
	acmeParent, err := gs.CreateGroupWithContext(acme, "Grup Acme", "", "", acmeUser.ID, "", true, nil)
	if err != nil {
		t.Fatalf("create acme parent: %v", err)
	}
	acmeSub, err := gs.CreateSubGroupWithContext(acme, acmeParent.ID, "Topik Acme", "", acmeUser.ID, "7_days", true)
	if err != nil {
		t.Fatalf("create acme sub: %v", err)
	}

	active, err := gs.CreateSubGroupWithContext(def, parent.ID, "Topik Aktif", "", owner.ID, "7_days", true)
	if err != nil {
		t.Fatalf("create active sub: %v", err)
	}
	ended, err := gs.CreateSubGroupWithContext(def, parent.ID, "Topik Berakhir", "", owner.ID, "7_days", true)
	if err != nil {
		t.Fatalf("create ended sub: %v", err)
	}
	if err := gs.ExpireSubGroupNow(ended.ID); err != nil {
		t.Fatalf("expire: %v", err)
	}
	time.Sleep(10 * time.Millisecond)
	if err := gs.JoinSubGroup(active.ID, member.ID); err != nil {
		t.Fatalf("member join active: %v", err)
	}

	// Pembuat: dua topik, aktif lebih dulu, peran creator, grup induk terisi.
	got, err := gs.GetUserForumsWithContext(def, owner.ID)
	if err != nil {
		t.Fatalf("owner forums: %v", err)
	}
	if len(got) != 2 || got[0].ID != active.ID || got[1].ID != ended.ID {
		t.Fatalf("owner: urutan/isi salah: %+v", got)
	}
	if !got[0].IsActive || got[1].IsActive || got[0].RemainingSeconds <= 0 || got[1].RemainingSeconds != 0 {
		t.Fatalf("owner: status aktif salah: %+v", got)
	}
	if got[0].MyRole != "creator" || got[0].ParentID != parent.ID || got[0].ParentTitle != "Grup Induk" || got[0].MemberCount != 2 {
		t.Fatalf("owner: metadata salah: %+v", got[0])
	}

	// Anggota biasa hanya melihat topik yang ia ikuti (bukan topik lain di grup induk yang sama).
	got, err = gs.GetUserForumsWithContext(def, member.ID)
	if err != nil {
		t.Fatalf("member forums: %v", err)
	}
	if len(got) != 1 || got[0].ID != active.ID || got[0].MyRole != "member" {
		t.Fatalf("member: harus hanya topik aktif sebagai member: %+v", got)
	}

	// Bukan anggota apa pun: kosong (bukan error).
	got, err = gs.GetUserForumsWithContext(def, outsider.ID)
	if err != nil || len(got) != 0 {
		t.Fatalf("outsider: want kosong, got %+v err=%v", got, err)
	}

	// Keluar dari grup induk: topik tak lagi terlihat meski baris keanggotaan topik masih ada.
	if err := gs.RemoveGroupMember(parent.ID, owner.ID, member.ID); err != nil {
		t.Fatalf("remove member: %v", err)
	}
	got, _ = gs.GetUserForumsWithContext(def, member.ID)
	if len(got) != 0 {
		t.Fatalf("mantan anggota grup induk tidak boleh melihat topik: %+v", got)
	}

	// Isolasi tenant: tiap tenant hanya melihat forumnya sendiri.
	got, err = gs.GetUserForumsWithContext(acme, acmeUser.ID)
	if err != nil || len(got) != 1 || got[0].ID != acmeSub.ID {
		t.Fatalf("acme: want hanya topik acme, got %+v err=%v", got, err)
	}
	// Context default untuk user acme memakai tenant asli user (sama seperti daftar obrolan).
	got, _ = gs.GetUserForumsWithContext(def, acmeUser.ID)
	if len(got) != 1 || got[0].ID != acmeSub.ID {
		t.Fatalf("acme via context default: %+v", got)
	}
	// ID user default dipaksa lewat context acme (dan sebaliknya): tidak boleh bocor.
	got, _ = gs.GetUserForumsWithContext(acme, owner.ID)
	if len(got) != 0 {
		t.Fatalf("bocor lintas tenant (owner via acme): %+v", got)
	}
	got, _ = gs.GetUserForumsWithContext(tenantshared.WithTenant(context.Background(), "lain"), acmeUser.ID)
	if len(got) != 0 {
		t.Fatalf("bocor lintas tenant (acmeUser via tenant lain): %+v", got)
	}
}

// Bendera has_approved_memory menandai topik yang memorinya sudah disetujui, dan hanya dalam tenant yang sama.
func TestGetUserForums_HasApprovedMemoryFlag(t *testing.T) {
	ms := openMessageStore(t, "forums_mem.db")
	us := store.NewSQLUserStore(ms.DB(), ms.DriverName())
	gs := store.NewSQLGroupStore(ms.DB(), ms.DriverName())
	def := tenantshared.WithTenant(context.Background(), "default")

	owner, err := us.RegisterWithContext(def, "mem_owner", "Owner", "pass12345")
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	parent, err := gs.CreateGroupWithContext(def, "Induk", "", "", owner.ID, "", true, nil)
	if err != nil {
		t.Fatalf("parent: %v", err)
	}
	withMem, _ := gs.CreateSubGroupWithContext(def, parent.ID, "Dengan Memori", "", owner.ID, "7_days", true)
	noMem, _ := gs.CreateSubGroupWithContext(def, parent.ID, "Tanpa Memori", "", owner.ID, "7_days", true)

	insert := `INSERT INTO approved_memories (id, tenant_id, draft_id, forum_id, group_id, approved_by, approved_at, snapshot_summary, created_at)
		VALUES (?, 'default', ?, ?, ?, ?, ?, 'ringkasan', ?)`
	if ms.DriverName() == "postgres" {
		insert = `INSERT INTO approved_memories (id, tenant_id, draft_id, forum_id, group_id, approved_by, approved_at, snapshot_summary, created_at)
		VALUES ($1, 'default', $2, $3, $4, $5, $6, 'ringkasan', $7)`
	}
	now := time.Now().UTC()
	if _, err := ms.DB().Exec(insert, "mem_1", "draft_1", withMem.ID, parent.ID, owner.ID, now, now); err != nil {
		t.Fatalf("insert memori: %v", err)
	}

	got, err := gs.GetUserForumsWithContext(def, owner.ID)
	if err != nil || len(got) != 2 {
		t.Fatalf("want 2 forum, got %+v err=%v", got, err)
	}
	flags := map[string]bool{}
	for _, f := range got {
		flags[f.ID] = f.HasApprovedMemory
	}
	if !flags[withMem.ID] || flags[noMem.ID] {
		t.Fatalf("bendera memori salah: %+v", flags)
	}
}
