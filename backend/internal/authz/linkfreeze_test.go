package authz

import (
	"context"
	"errors"
	"testing"
	"time"
)

// fakeOAuth mengimplementasikan OAuthStore minimal untuk menguji kebijakan pembekuan.
type fakeOAuth struct {
	OAuthStore
	linked map[string]bool
	err    error
	calls  int
}

func (f *fakeOAuth) GetLinkedSubject(_ context.Context, userID, _ string) (string, bool, error) {
	f.calls++
	if f.err != nil {
		return "", false, f.err
	}
	return "sub", f.linked[userID], nil
}

var freezeDeadline = time.Date(2026, 12, 31, 16, 59, 59, 0, time.UTC)

func newPolicy(enabled bool, deadline time.Time, oauth OAuthStore, now time.Time) (*LinkFreezePolicy, *time.Time) {
	clock := now
	p := NewLinkFreezePolicy(enabled, deadline, oauth)
	p.now = func() time.Time { return clock }
	return p, &clock
}

func TestLinkFreeze_NotActiveUntilDeadlineAndSwitch(t *testing.T) {
	f := &fakeOAuth{linked: map[string]bool{}}
	ctx := context.Background()

	// Sebelum tenggat: tidak aktif, dan tidak menyentuh database.
	p, _ := newPolicy(true, freezeDeadline, f, freezeDeadline.Add(-time.Second))
	if p.Active() || p.IsFrozen(ctx, "u1", "default") {
		t.Fatal("sebelum tenggat tidak boleh membekukan")
	}
	if f.calls != 0 {
		t.Fatalf("sebelum tenggat tidak boleh membaca database, dapat %d panggilan", f.calls)
	}

	// Tepat pada tenggat: aktif.
	p, _ = newPolicy(true, freezeDeadline, f, freezeDeadline)
	if !p.Active() || !p.IsFrozen(ctx, "u1", "default") {
		t.Fatal("pada tenggat akun belum tertaut harus dibekukan")
	}

	// Kill switch mati, tanpa tenggat, atau tanpa store: tidak pernah membekukan walau tenggat lewat.
	after := freezeDeadline.Add(24 * time.Hour)
	for name, pol := range map[string]*LinkFreezePolicy{
		"switch mati":   mustPolicy(false, freezeDeadline, f, after),
		"tanpa tenggat": mustPolicy(true, time.Time{}, f, after),
		"tanpa store":   mustPolicy(true, freezeDeadline, nil, after),
	} {
		if pol.Active() || pol.IsFrozen(ctx, "u1", "default") {
			t.Fatalf("%s: tidak boleh membekukan", name)
		}
	}
	var nilPolicy *LinkFreezePolicy
	if nilPolicy.Active() || nilPolicy.IsFrozen(ctx, "u1", "default") {
		t.Fatal("policy nil tidak boleh membekukan dan tidak boleh panik")
	}
	nilPolicy.Invalidate("u1")
}

func mustPolicy(enabled bool, deadline time.Time, oauth OAuthStore, now time.Time) *LinkFreezePolicy {
	p, _ := newPolicy(enabled, deadline, oauth, now)
	return p
}

func TestLinkFreeze_Rules(t *testing.T) {
	f := &fakeOAuth{linked: map[string]bool{"linked": true}}
	p, _ := newPolicy(true, freezeDeadline, f, freezeDeadline.Add(time.Hour))
	ctx := context.Background()

	if p.IsFrozen(ctx, "linked", "default") {
		t.Fatal("akun yang sudah tertaut tidak boleh dibekukan")
	}
	if !p.IsFrozen(ctx, "legacy", "default") {
		t.Fatal("akun belum tertaut harus dibekukan")
	}
	if !p.IsFrozen(ctx, "legacy2", "") {
		t.Fatal("tenant kosong dianggap default dan harus dibekukan")
	}
	if p.IsFrozen(ctx, "legacy", "acme") {
		t.Fatal("tenant non-default tidak boleh dibekukan (tidak bisa memakai Google)")
	}
	if p.IsFrozen(ctx, "", "default") {
		t.Fatal("user kosong tidak boleh dibekukan")
	}
}

func TestLinkFreeze_FailsOpenOnDatabaseError(t *testing.T) {
	f := &fakeOAuth{err: errors.New("db down")}
	p, _ := newPolicy(true, freezeDeadline, f, freezeDeadline.Add(time.Hour))
	if p.IsFrozen(context.Background(), "u1", "default") {
		t.Fatal("galat database harus gagal terbuka (tidak membekukan), agar gangguan tidak mengunci semua pengguna")
	}
	// Galat tidak boleh di-cache: begitu database pulih, status sebenarnya berlaku.
	f.err = nil
	if !p.IsFrozen(context.Background(), "u1", "default") {
		t.Fatal("setelah database pulih, akun belum tertaut harus dibekukan")
	}
}

func TestLinkFreeze_CacheAndInvalidate(t *testing.T) {
	f := &fakeOAuth{linked: map[string]bool{}}
	p, clock := newPolicy(true, freezeDeadline, f, freezeDeadline.Add(time.Hour))
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		if !p.IsFrozen(ctx, "u1", "default") {
			t.Fatal("harus dibekukan")
		}
	}
	if f.calls != 1 {
		t.Fatalf("hasil harus di-cache: 1 panggilan database, dapat %d", f.calls)
	}

	// Akun menautkan Google. Tanpa Invalidate, status lama bertahan sampai cache habis; dengan Invalidate langsung berlaku.
	f.linked["u1"] = true
	if !p.IsFrozen(ctx, "u1", "default") {
		t.Fatal("sebelum cache habis, status lama masih dipakai")
	}
	p.Invalidate("u1")
	if p.IsFrozen(ctx, "u1", "default") {
		t.Fatal("setelah Invalidate, akun yang baru menautkan Google harus langsung bebas")
	}

	// Cache "belum tertaut" pendek (20 dtk): penautan yang terlewat Invalidate tetap cepat berlaku.
	f.linked["u2"] = false
	if !p.IsFrozen(ctx, "u2", "default") {
		t.Fatal("u2 harus dibekukan")
	}
	f.linked["u2"] = true
	*clock = clock.Add(unlinkedCacheTTL + time.Second)
	if p.IsFrozen(ctx, "u2", "default") {
		t.Fatal("setelah TTL singkat, status baru harus dibaca")
	}
}
