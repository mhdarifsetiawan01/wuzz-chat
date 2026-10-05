package api

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/auth"
)

// IceServer mengikuti bentuk RTCIceServer (urls, username, credential).
type IceServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

// IceServersResponse adalah respons GET /api/calls/ice-servers.
type IceServersResponse struct {
	IceServers []IceServer `json:"ice_servers"`
	TTL        int         `json:"ttl"`
}

// IceHandler membagikan daftar STUN/TURN ke klien yang sudah login. Kredensial TURN bersifat sementara
// (TURN REST API: username = "<kedaluwarsa-unix>:<userID>", credential = base64(HMAC-SHA1(secret, username)))
// sehingga rahasia coturn tidak pernah masuk ke aplikasi dan penyalahgunaan terbatas waktu.
type IceHandler struct {
	secret   string
	turnURLs []string
	stunURLs []string
	ttl      time.Duration
	now      func() time.Time
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// NewIceHandler membuat handler. turnSecret kosong atau turnURLs kosong = tanpa TURN (hanya STUN).
func NewIceHandler(turnSecret, turnURLs, stunURLs string, ttl time.Duration) *IceHandler {
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	return &IceHandler{
		secret:   turnSecret,
		turnURLs: splitCSV(turnURLs),
		stunURLs: splitCSV(stunURLs),
		ttl:      ttl,
		now:      time.Now,
	}
}

// TURNEnabled melaporkan apakah kredensial TURN akan diterbitkan.
func (h *IceHandler) TURNEnabled() bool {
	return h.secret != "" && len(h.turnURLs) > 0
}

func (h *IceHandler) credentialFor(userID string, expires time.Time) (username, credential string) {
	username = strconv.FormatInt(expires.Unix(), 10) + ":" + userID
	mac := hmac.New(sha1.New, []byte(h.secret))
	mac.Write([]byte(username))
	return username, base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// ServeHTTP melayani GET /api/calls/ice-servers (wajib JWT).
func (h *IceHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_, _ = w.Write([]byte(`{"error":"Method tidak diizinkan"}`))
		return
	}
	claims, ok := auth.GetUserFromContext(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"Unauthorized"}`))
		return
	}

	resp := IceServersResponse{IceServers: []IceServer{}, TTL: int(h.ttl.Seconds())}
	if len(h.stunURLs) > 0 {
		resp.IceServers = append(resp.IceServers, IceServer{URLs: h.stunURLs})
	}
	if h.TURNEnabled() {
		user, cred := h.credentialFor(claims.UserID, h.now().Add(h.ttl))
		resp.IceServers = append(resp.IceServers, IceServer{URLs: h.turnURLs, Username: user, Credential: cred})
	}
	_ = json.NewEncoder(w).Encode(resp)
}
