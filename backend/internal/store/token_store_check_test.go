package store_test

import (
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// CheckRevocation menggabungkan tiga pemeriksaan (jti, sesi, pencabutan massal) menjadi satu putaran di PostgreSQL. Semantiknya
// harus IDENTIK dengan IsTokenRevoked + IsUserRevokedBefore di semua driver (dijalankan di SQLite dan, bila PG_TEST_ADMIN_DSN
// diisi, di PostgreSQL).
func TestTokenStore_CheckRevocation_MatchesSequentialSemantics(t *testing.T) {
	ms := openMessageStore(t, "tokcheck.db")
	ts := store.NewSQLTokenStore(ms.DB(), ms.DriverName())
	ss := store.NewSQLSessionStore(ms.DB(), ms.DriverName())

	user, other := "usr_chk", "usr_other"
	issued := time.Now().UTC().Add(-2 * time.Hour)
	check := func(jti, uid string, at time.Time, want auth.RevocationReason, msg string) {
		t.Helper()
		got, err := ts.CheckRevocation(jti, uid, at)
		if err != nil {
			t.Fatalf("%s: galat %v", msg, err)
		}
		if got != want {
			t.Fatalf("%s: want %v, got %v", msg, want, got)
		}
	}

	check("jti_baru", user, issued, auth.NotRevoked, "token biasa")
	check("", user, issued, auth.NotRevoked, "jti kosong tidak mencocokkan apa pun")
	check("jti_baru", "", issued, auth.NotRevoked, "tanpa user id")
	check("jti_baru", user, time.Time{}, auth.NotRevoked, "issuedAt nol")

	// Token dicabut individual (logout).
	if err := ts.RevokeToken("jti_logout", user, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	check("jti_logout", user, issued, auth.TokenRevoked, "token dicabut (revoked_tokens)")
	check("jti_lain", user, issued, auth.NotRevoked, "token lain tidak terpengaruh")

	// Sesi dicabut (perangkat dikeluarkan).
	if err := ss.CreateSession(&store.Session{ID: "jti_sesi", UserID: user, DeviceID: "dev1"}); err != nil {
		t.Fatal(err)
	}
	check("jti_sesi", user, issued, auth.NotRevoked, "sesi aktif")
	if err := ss.RevokeSession("jti_sesi", user); err != nil {
		t.Fatal(err)
	}
	check("jti_sesi", user, issued, auth.TokenRevoked, "sesi dicabut")

	// Pencabutan massal: token terbit sebelum waktu cabut ditolak; yang sesudahnya lolos; akun lain tidak terpengaruh.
	time.Sleep(1100 * time.Millisecond) // resolusi detik pada perbandingan iat
	if err := ts.RevokeAllUserTokens(user); err != nil {
		t.Fatal(err)
	}
	check("jti_baru", user, issued, auth.AllSessionsRevoked, "token terbit sebelum pencabutan massal")
	check("jti_baru", user, time.Now().UTC().Add(2*time.Second), auth.NotRevoked, "token terbit sesudah pencabutan massal")
	check("jti_baru", other, issued, auth.NotRevoked, "akun lain tidak terpengaruh")
	check("jti_baru", user, time.Time{}, auth.NotRevoked, "issuedAt nol melewati pemeriksaan massal")
	// Pencabutan individual didahulukan dari pencabutan massal (pesan yang berbeda di middleware).
	check("jti_logout", user, issued, auth.TokenRevoked, "individual didahulukan dari massal")

	// Jalur cache memori (setelah pencabutan massal terbaca sekali): hasil tetap sama, termasuk token yang dicabut belakangan.
	check("jti_baru", user, issued, auth.AllSessionsRevoked, "ulang dari cache memori")
	if err := ts.RevokeToken("jti_cache", user, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	check("jti_cache", user, time.Now().UTC().Add(2*time.Second), auth.TokenRevoked, "token baru dicabut tetap terdeteksi walau pencabutan massal sudah di-cache")

	// Pencabutan massal kedua memajukan batas waktu (cache diperbarui oleh RevokeAllUserTokens).
	time.Sleep(1100 * time.Millisecond)
	later := time.Now().UTC()
	time.Sleep(1100 * time.Millisecond)
	if err := ts.RevokeAllUserTokens(user); err != nil {
		t.Fatal(err)
	}
	check("jti_baru", user, later, auth.AllSessionsRevoked, "pencabutan massal kedua berlaku untuk token yang tadinya lolos")
}

// Middleware memakai jalur gabungan; hasilnya harus sama dengan jalur dua langkah untuk semua keadaan.
func TestTokenStore_CheckRevocation_SequentialAndCombinedAgree(t *testing.T) {
	ms := openMessageStore(t, "tokcheck2.db")
	ts := store.NewSQLTokenStore(ms.DB(), ms.DriverName())
	user := "usr_agree"
	issued := time.Now().UTC().Add(-time.Hour)
	_ = ts.RevokeToken("jti_x", user, time.Now().Add(time.Hour))
	time.Sleep(1100 * time.Millisecond)
	_ = ts.RevokeAllUserTokens(user)

	for _, tc := range []struct{ jti string }{{"jti_x"}, {"jti_y"}, {""}} {
		combined, err := ts.CheckRevocation(tc.jti, user, issued)
		if err != nil {
			t.Fatal(err)
		}
		var seq auth.RevocationReason
		if tc.jti != "" {
			if r, _ := ts.IsTokenRevoked(tc.jti); r {
				seq = auth.TokenRevoked
			}
		}
		if seq == auth.NotRevoked {
			if r, _ := ts.IsUserRevokedBefore(user, issued); r {
				seq = auth.AllSessionsRevoked
			}
		}
		if combined != seq {
			t.Fatalf("jti=%q: gabungan %v berbeda dari berurutan %v", tc.jti, combined, seq)
		}
	}
}

// Setelah restart server (atau di instans lain) cache memori kosong: pencabutan massal harus dibaca dari database lewat
// query gabungan. Tes lain tidak menjangkau jalur ini karena RevokeAllUserTokens langsung mengisi cache proses yang sama.
func TestTokenStore_CheckRevocation_ReadsUserWideRevocationFromDatabaseWhenCacheIsCold(t *testing.T) {
	ms := openMessageStore(t, "tokcold.db")
	user := "usr_cold"
	issued := time.Now().UTC().Add(-time.Hour)

	writer := store.NewSQLTokenStore(ms.DB(), ms.DriverName())
	time.Sleep(1100 * time.Millisecond)
	if err := writer.RevokeAllUserTokens(user); err != nil {
		t.Fatal(err)
	}

	cold := store.NewSQLTokenStore(ms.DB(), ms.DriverName()) // instans baru: cache kosong
	for i := 0; i < 2; i++ {                                 // putaran ke-2 memakai cache yang terisi dari putaran ke-1
		got, err := cold.CheckRevocation("jti_dingin", user, issued)
		if err != nil || got != auth.AllSessionsRevoked {
			t.Fatalf("putaran %d: pencabutan massal harus terbaca dari database, got %v err=%v", i+1, got, err)
		}
	}
	// Token yang terbit sesudah pencabutan tetap lolos pada instans dingin.
	fresh := store.NewSQLTokenStore(ms.DB(), ms.DriverName())
	if got, err := fresh.CheckRevocation("jti_dingin", user, time.Now().UTC().Add(2*time.Second)); err != nil || got != auth.NotRevoked {
		t.Fatalf("token baru harus lolos, got %v err=%v", got, err)
	}
	// Akun tanpa baris pencabutan: lolos dan tidak ada cache keliru.
	if got, err := fresh.CheckRevocation("jti_x", "usr_bersih", issued); err != nil || got != auth.NotRevoked {
		t.Fatalf("akun tanpa pencabutan: got %v err=%v", got, err)
	}
}
