package ws

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/gorilla/websocket"
)

func TestWebSocketJWTAuthentication(t *testing.T) {
	clientStore := store.NewMemoryClientStore()
	messageStore := store.NewMemoryMessageStore()
	hub := NewHub(clientStore, messageStore)
	handler := NewHandler(hub)

	server := httptest.NewServer(handler)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// 1. Uji koneksi tanpa token -> harus ditolak 401
	t.Run("Reject connection without token", func(t *testing.T) {
		_, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err == nil {
			t.Fatalf("seharusnya gagal dial tanpa token, tetapi berhasil")
		}
		if resp == nil || resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("ekspektasi status 401 Unauthorized, didapat: %v", resp)
		}
	})

	// 2. Uji koneksi dengan token tidak valid -> harus ditolak 401
	t.Run("Reject connection with invalid token", func(t *testing.T) {
		invalidURL := wsURL + "?token=invalid-jwt-token"
		_, resp, err := websocket.DefaultDialer.Dial(invalidURL, nil)
		if err == nil {
			t.Fatalf("seharusnya gagal dial dengan invalid token, tetapi berhasil")
		}
		if resp == nil || resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("ekspektasi status 401 Unauthorized, didapat: %v", resp)
		}
	})

	// 3. Uji koneksi dengan token valid via query param -> harus berhasil
	t.Run("Accept connection with valid token in query param", func(t *testing.T) {
		validToken, err := auth.GenerateToken("user-123", "alice", "Alice Wonderland")
		if err != nil {
			t.Fatalf("gagal generate token: %v", err)
		}

		validURL := wsURL + "?token=" + validToken
		conn, resp, err := websocket.DefaultDialer.Dial(validURL, nil)
		if err != nil {
			t.Fatalf("seharusnya berhasil dial dengan valid token: %v", err)
		}
		defer conn.Close()

		if resp.StatusCode != http.StatusSwitchingProtocols {
			t.Fatalf("ekspektasi status 101 Switching Protocols, didapat: %d", resp.StatusCode)
		}
	})

	// 4. Uji koneksi dengan token valid via Authorization Header -> harus berhasil
	t.Run("Accept connection with valid token in Authorization header", func(t *testing.T) {
		validToken, err := auth.GenerateToken("user-456", "bob", "Bob Builder")
		if err != nil {
			t.Fatalf("gagal generate token: %v", err)
		}

		header := http.Header{}
		header.Set("Authorization", "Bearer "+validToken)

		conn, resp, err := websocket.DefaultDialer.Dial(wsURL, header)
		if err != nil {
			t.Fatalf("seharusnya berhasil dial dengan valid token header: %v", err)
		}
		defer conn.Close()

		if resp.StatusCode != http.StatusSwitchingProtocols {
			t.Fatalf("ekspektasi status 101 Switching Protocols, didapat: %d", resp.StatusCode)
		}
	})
}
