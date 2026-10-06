package ws

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/gorilla/websocket"
)

func TestKickCloseCode(t *testing.T) {
	cases := map[string]int{
		"ACCOUNT_SUSPENDED: Akun Anda ditangguhkan.":         CloseCodeSuspended,
		"ACCOUNT_SUSPENDED":                                  CloseCodeSuspended,
		"SESSION_REPLACED: Akun Anda dibuka dari perangkat.": 4001,
		"ACCOUNT_DELETED: Akun telah dihapus.":               4001,
		"":                                                   4001,
		"bukan ACCOUNT_SUSPENDED di awal":                    4001,
	}
	for reason, want := range cases {
		if got := kickCloseCode(reason); got != want {
			t.Errorf("kickCloseCode(%q) = %d, want %d", reason, got, want)
		}
	}
}

// Menendang akun yang ditangguhkan harus menutup koneksi dengan 4004 (bukan 4001 yang membuat klien menghapus kunci E2EE).
func TestHub_KickUser_SuspendedUsesCode4004(t *testing.T) {
	for _, tc := range []struct {
		reason string
		want   int
	}{
		{"ACCOUNT_SUSPENDED: Akun Anda ditangguhkan.", CloseCodeSuspended},
		{"SESSION_REPLACED: Akun Anda dibuka dari perangkat lain.", 4001},
		{"ACCOUNT_DELETED: Akun telah dihapus.", 4001},
	} {
		hub := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
		server := httptest.NewServer(NewHandler(hub))
		tok, _ := auth.GenerateToken("u-kick", "kick", "Kick")
		c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"?token="+tok+"&device_id=dev-kick", nil)
		if err != nil {
			server.Close()
			t.Fatal(err)
		}
		time.Sleep(100 * time.Millisecond)
		hub.KickClientByUserID("u-kick", "", tc.reason)
		_ = c.SetReadDeadline(time.Now().Add(4 * time.Second))
		var closeErr error
		for {
			if _, _, err := c.ReadMessage(); err != nil {
				closeErr = err
				break
			}
		}
		ce, ok := closeErr.(*websocket.CloseError)
		if !ok || ce.Code != tc.want {
			t.Errorf("alasan %q: harus ditutup dengan kode %d, dapat %v", tc.reason, tc.want, closeErr)
		}
		c.Close()
		server.Close()
	}
}
