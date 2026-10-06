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

// Koneksi yang sudah terbuka diputus dengan kode 4004 begitu akunnya ditangguhkan moderator dan ia mengirim sesuatu;
// akun lain di Hub yang sama tidak terpengaruh.
func TestHub_SuspensionGate_DisconnectsSuspendedAccount(t *testing.T) {
	hub := NewHub(store.NewMemoryClientStore(), store.NewMemoryMessageStore())

	var mu sync.Mutex
	suspended := map[string]bool{}
	hub.SetSuspensionGate(func(userID string) bool {
		mu.Lock()
		defer mu.Unlock()
		return suspended[userID]
	})

	server := httptest.NewServer(NewHandler(hub))
	defer server.Close()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dial := func(userID string) *websocket.Conn {
		tok, err := auth.GenerateToken(userID, userID, userID)
		if err != nil {
			t.Fatal(err)
		}
		c, _, err := websocket.DefaultDialer.Dial(wsURL+"?token="+tok+"&device_id=dev-"+userID, nil)
		if err != nil {
			t.Fatalf("dial %s: %v", userID, err)
		}
		return c
	}
	bad, good := dial("u-bad"), dial("u-good")
	defer bad.Close()
	defer good.Close()

	ping := map[string]any{"type": "typing", "room": "x"}
	if err := bad.WriteJSON(ping); err != nil {
		t.Fatal(err)
	}

	mu.Lock()
	suspended["u-bad"] = true
	mu.Unlock()
	if err := bad.WriteJSON(ping); err != nil {
		t.Fatal(err)
	}
	_ = bad.SetReadDeadline(time.Now().Add(3 * time.Second))
	var closeErr error
	for {
		if _, _, err := bad.ReadMessage(); err != nil {
			closeErr = err
			break
		}
	}
	ce, ok := closeErr.(*websocket.CloseError)
	if !ok || ce.Code != CloseCodeSuspended || ce.Text != "ACCOUNT_SUSPENDED" {
		t.Fatalf("harus ditutup dengan kode %d ACCOUNT_SUSPENDED, dapat %v", CloseCodeSuspended, closeErr)
	}

	if err := good.WriteJSON(ping); err != nil {
		t.Fatalf("akun lain tidak boleh terpengaruh: %v", err)
	}
	_ = good.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	if _, _, err := good.ReadMessage(); err != nil {
		if _, isClose := err.(*websocket.CloseError); isClose {
			t.Fatalf("akun lain tidak boleh diputus: %v", err)
		}
	}
}
