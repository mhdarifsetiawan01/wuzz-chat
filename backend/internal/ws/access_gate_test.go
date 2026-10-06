package ws

import (
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/gorilla/websocket"
)

// Koneksi yang sudah terbuka sebelum tenggat harus diputus (kode 4003) begitu akun beku mengirim sesuatu, sedangkan
// akun lain di Hub yang sama tidak terpengaruh.
func TestHub_AccessGate_DisconnectsFrozenAccount(t *testing.T) {
	hub := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())

	var mu sync.Mutex
	frozen := map[string]bool{}
	hub.SetAccessGate(func(userID, tenantID string) bool {
		mu.Lock()
		defer mu.Unlock()
		return !frozen[userID]
	})

	server := httptest.NewServer(NewHandler(hub))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	dial := func(userID, name string) *websocket.Conn {
		tok, err := auth.GenerateToken(userID, name, name)
		if err != nil {
			t.Fatal(err)
		}
		c, _, err := websocket.DefaultDialer.Dial(wsURL+"?token="+tok+"&device_id=dev-"+userID, nil)
		if err != nil {
			t.Fatalf("dial %s: %v", name, err)
		}
		return c
	}
	frozenConn := dial("u-frozen", "frozen")
	defer frozenConn.Close()
	okConn := dial("u-ok", "ok")
	defer okConn.Close()

	// Sebelum dibekukan, keduanya bisa mengirim (tipe tak dikenal dijawab server, bukan diputus).
	for name, c := range map[string]*websocket.Conn{"frozen": frozenConn, "ok": okConn} {
		if err := c.WriteJSON(map[string]any{"type": "typing", "room": "x"}); err != nil {
			t.Fatalf("%s gagal menulis sebelum dibekukan: %v", name, err)
		}
	}

	// Tenggat lewat: akun "frozen" kini beku. Pesan berikutnya memutus koneksinya dengan kode 4003.
	mu.Lock()
	frozen["u-frozen"] = true
	mu.Unlock()
	if err := frozenConn.WriteJSON(map[string]any{"type": "typing", "room": "x"}); err != nil {
		t.Fatalf("menulis ke koneksi beku: %v", err)
	}
	_ = frozenConn.SetReadDeadline(time.Now().Add(3 * time.Second))
	var closeErr error
	for {
		if _, _, err := frozenConn.ReadMessage(); err != nil {
			closeErr = err
			break
		}
	}
	ce, ok := closeErr.(*websocket.CloseError)
	if !ok || ce.Code != CloseCodeLinkRequired || ce.Text != "GOOGLE_LINK_REQUIRED" {
		t.Fatalf("koneksi beku harus ditutup dengan kode %d GOOGLE_LINK_REQUIRED, dapat %v", CloseCodeLinkRequired, closeErr)
	}

	// Akun lain tetap tersambung dan bisa mengirim.
	if err := okConn.WriteJSON(map[string]any{"type": "typing", "room": "x"}); err != nil {
		t.Fatalf("akun lain tidak boleh terpengaruh: %v", err)
	}
	_ = okConn.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	if _, _, err := okConn.ReadMessage(); err != nil {
		if ce, isClose := err.(*websocket.CloseError); isClose {
			t.Fatalf("akun lain tidak boleh diputus: %v", ce)
		}
	}
}

// Tanpa gate terpasang (pembekuan mati) perilaku lama tidak berubah.
func TestHub_AccessGate_NilGateAllowsEverything(t *testing.T) {
	hub := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())
	server := httptest.NewServer(NewHandler(hub))
	defer server.Close()
	tok, _ := auth.GenerateToken("u1", "a", "A")
	c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"?token="+tok+"&device_id=d1", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	if err := c.WriteJSON(map[string]any{"type": "typing", "room": "x"}); err != nil {
		t.Fatal(err)
	}
	_ = c.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	if _, _, err := c.ReadMessage(); err != nil {
		if _, isClose := err.(*websocket.CloseError); isClose {
			t.Fatalf("tanpa gate koneksi tidak boleh diputus: %v", err)
		}
	}
}
