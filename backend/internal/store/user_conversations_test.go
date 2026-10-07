package store_test

import (
	"context"
	"testing"
	"time"

	tenantshared "github.com/bms-del112/wuzz-chat/internal/shared/tenant"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// Daftar obrolan: tenant asli user dicari di dalam kueri utama saat context bertenant "default",
// dan pesan terakhir serta hitungan belum dibaca diambil bersamaan.
func TestGetUserConversations_TenantLookupAndAggregates(t *testing.T) {
	ms := openMessageStore(t, "convs.db")
	us := store.NewSQLUserStore(ms.DB(), ms.DriverName())

	acme := tenantshared.WithTenant(context.Background(), "acme")
	def := tenantshared.WithTenant(context.Background(), "default")

	alice, err := us.RegisterWithContext(acme, "alice_acme", "Alice", "pass12345")
	if err != nil {
		t.Fatalf("register alice: %v", err)
	}
	bob, err := us.RegisterWithContext(acme, "bob_acme", "Bob", "pass12345")
	if err != nil {
		t.Fatalf("register bob: %v", err)
	}
	room, err := us.GetOrCreateDirectConversationWithContext(acme, alice.ID, bob.ID)
	if err != nil {
		t.Fatalf("create dm: %v", err)
	}
	now := time.Now().UTC()
	for i, c := range []string{"satu", "dua", "tiga"} {
		if err := ms.Save(store.StoredMessage{
			ID: "m" + c, RoomID: room, FromID: bob.ID, Nickname: "Bob", ToID: alice.ID,
			Content: c, Timestamp: now.Add(time.Duration(i) * time.Second),
		}); err != nil {
			t.Fatalf("save: %v", err)
		}
	}

	// Context default (seperti token tanpa tenant) dan context acme harus memberi hasil sama.
	for name, ctx := range map[string]context.Context{"default": def, "acme": acme} {
		convs, err := us.GetUserConversationsWithContext(ctx, alice.ID)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if len(convs) != 1 {
			t.Fatalf("%s: want 1 conversation, got %d", name, len(convs))
		}
		c := convs[0]
		if c.ID != room || c.PeerID != bob.ID || c.LastMessage != "tiga" || c.UnreadCount != 3 {
			t.Fatalf("%s: unexpected item %+v", name, c)
		}
	}

	// Pengirim tidak punya pesan belum dibaca.
	convs, _ := us.GetUserConversationsWithContext(def, bob.ID)
	if len(convs) != 1 || convs[0].UnreadCount != 0 || convs[0].LastMessage != "tiga" {
		t.Fatalf("bob: unexpected %+v", convs)
	}

	// User default tetap berfungsi, dan user tak dikenal mendapat daftar kosong.
	d1, _ := us.RegisterWithContext(def, "carol_def", "Carol", "pass12345")
	if got, err := us.GetUserConversationsWithContext(def, d1.ID); err != nil || len(got) != 0 {
		t.Fatalf("carol: err=%v got=%+v", err, got)
	}
	if got, err := us.GetUserConversationsWithContext(def, "tidak-ada"); err != nil || len(got) != 0 {
		t.Fatalf("unknown: err=%v got=%+v", err, got)
	}
}
