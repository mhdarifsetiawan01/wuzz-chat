package authz

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type fakeRoleLookup struct {
	mu    sync.Mutex
	roles map[string]string
	err   error
	calls int
}

func (f *fakeRoleLookup) SystemRoleOf(_ context.Context, userID string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.err != nil {
		return "", f.err
	}
	if r, ok := f.roles[userID]; ok {
		return r, nil
	}
	return "user", nil
}

func (f *fakeRoleLookup) set(userID, role string) {
	f.mu.Lock()
	f.roles[userID] = role
	f.mu.Unlock()
}

func TestRolePolicy_PlainUsersNeverHitTheDatabase(t *testing.T) {
	f := &fakeRoleLookup{roles: map[string]string{"u1": "wuzz_admin"}}
	p := NewRolePolicy(f)
	for _, tokenRole := range []string{"", "user"} {
		// Walau database mencatat u1 sebagai admin: peran tidak boleh naik tanpa login ulang.
		if got := p.EffectiveSystemRole(context.Background(), "u1", tokenRole); got != tokenRole {
			t.Fatalf("token %q: want %q, got %q", tokenRole, tokenRole, got)
		}
	}
	if f.calls != 0 {
		t.Fatalf("pengguna biasa tidak boleh memicu query, got %d", f.calls)
	}
}

func TestRolePolicy_DatabaseWinsForPrivilegedTokens(t *testing.T) {
	f := &fakeRoleLookup{roles: map[string]string{"m": "wuzz_moderator", "a": "wuzz_admin", "demoted": "user"}}
	p := NewRolePolicy(f)
	ctx := context.Background()
	if got := p.EffectiveSystemRole(ctx, "m", "wuzz_moderator"); got != "wuzz_moderator" {
		t.Fatalf("moderator sah: %q", got)
	}
	if got := p.EffectiveSystemRole(ctx, "demoted", "wuzz_admin"); got != "user" {
		t.Fatalf("token admin tetapi database user harus jadi user, got %q", got)
	}
	if got := p.EffectiveSystemRole(ctx, "a", "wuzz_moderator"); got != "wuzz_admin" {
		t.Fatalf("nilai database berlaku (juga bila berbeda dari token), got %q", got)
	}
	if got := p.EffectiveSystemRole(ctx, "ghost", "wuzz_admin"); got != "user" {
		t.Fatalf("akun tidak ada (terhapus) harus user, got %q", got)
	}
	if got := p.EffectiveSystemRole(ctx, "", "wuzz_admin"); got != "user" {
		t.Fatalf("tanpa user id harus user, got %q", got)
	}
	// Peran lama yang tidak lagi diakui (mis. "admin") ikut diverifikasi, bukan dipercaya.
	if got := p.EffectiveSystemRole(ctx, "m", "superadmin"); got != "wuzz_moderator" {
		t.Fatalf("klaim asing diganti nilai database, got %q", got)
	}
}

func TestRolePolicy_CacheTTLAndInvalidate(t *testing.T) {
	f := &fakeRoleLookup{roles: map[string]string{"m": "wuzz_moderator"}}
	p := NewRolePolicy(f)
	clock := time.Unix(1_000_000, 0)
	p.now = func() time.Time { return clock }
	ctx := context.Background()

	p.EffectiveSystemRole(ctx, "m", "wuzz_moderator")
	p.EffectiveSystemRole(ctx, "m", "wuzz_moderator")
	if f.calls != 1 {
		t.Fatalf("dalam TTL harus dari cache, query=%d", f.calls)
	}

	f.set("m", "user") // dicabut
	if got := p.EffectiveSystemRole(ctx, "m", "wuzz_moderator"); got != "wuzz_moderator" {
		t.Fatalf("masih dalam TTL: cache lama berlaku, got %q", got)
	}
	clock = clock.Add(roleCacheTTL + time.Second)
	if got := p.EffectiveSystemRole(ctx, "m", "wuzz_moderator"); got != "user" {
		t.Fatalf("setelah TTL pencabutan harus berlaku, got %q", got)
	}

	f.set("m", "wuzz_moderator")
	p.Invalidate("m")
	if got := p.EffectiveSystemRole(ctx, "m", "wuzz_moderator"); got != "wuzz_moderator" {
		t.Fatalf("Invalidate harus memaksa baca ulang, got %q", got)
	}
}

func TestRolePolicy_FailsClosedAndRecovers(t *testing.T) {
	f := &fakeRoleLookup{roles: map[string]string{"m": "wuzz_moderator"}, err: errors.New("db down")}
	p := NewRolePolicy(f)
	ctx := context.Background()
	if got := p.EffectiveSystemRole(ctx, "m", "wuzz_moderator"); got != "user" {
		t.Fatalf("galat database harus menurunkan ke user (gagal tertutup), got %q", got)
	}
	f.mu.Lock()
	f.err = nil
	f.mu.Unlock()
	if got := p.EffectiveSystemRole(ctx, "m", "wuzz_moderator"); got != "wuzz_moderator" {
		t.Fatalf("kegagalan tidak boleh di-cache: harus pulih, got %q", got)
	}
}

func TestRolePolicy_NilIsPassThrough(t *testing.T) {
	var p *RolePolicy
	if got := p.EffectiveSystemRole(context.Background(), "u", "wuzz_admin"); got != "wuzz_admin" {
		t.Fatalf("nil: klaim token apa adanya, got %q", got)
	}
	p.Invalidate("u")
	if got := NewRolePolicy(nil).EffectiveSystemRole(context.Background(), "u", "wuzz_admin"); got != "wuzz_admin" {
		t.Fatalf("tanpa lookup: klaim token apa adanya, got %q", got)
	}
}
