package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/shared/config"
	"github.com/bms-del112/wuzz-chat/internal/testutil/pgtest"
)

// Tes ini merakit aplikasi UTUH (New + setupRouter) supaya pengkabelan gerbang grup dan kuota AI pada jalur
// "akhiri forum manual" terbukti benar. Tes tingkat paket merakit objeknya sendiri dan tidak menangkap wiring yang salah.

type wiredApp struct {
	t *testing.T
	h http.Handler
}

func newWiredApp(t *testing.T, mutate func(*config.Config)) *wiredApp {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "wiring.db")
	if pg, ok := pgtest.NewDSN(t); ok {
		dsn = pg
		prepareProductionShape(t, pg)
	}
	t.Setenv("DATABASE_URL", dsn)
	t.Setenv("DB_DRIVER", "")
	t.Setenv("AI_PROVIDER", "mock")

	cfg := &config.Config{
		Port: "8080", CORSAllowedOrigins: "*", JWTSecret: "test_secret", UploadDir: t.TempDir(),
		MediaRetentionDays: 7, AuthRateLimitIP: 1000, AuthRateLimitUser: 1000,
	}
	mutate(cfg)
	a, err := New(cfg)
	if err != nil {
		t.Fatalf("gagal membuat aplikasi: %v", err)
	}
	t.Cleanup(func() { a.Close() })
	return &wiredApp{t: t, h: a.setupRouter()}
}

func (w *wiredApp) call(method, path, token, body string) (int, map[string]any) {
	w.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.RemoteAddr = "10.1.1.1:5555"
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rr := httptest.NewRecorder()
	w.h.ServeHTTP(rr, req)
	var m map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &m)
	return rr.Code, m
}

func (w *wiredApp) register(username string) string {
	w.t.Helper()
	code, m := w.call(http.MethodPost, "/api/auth/register", "",
		`{"username":"`+username+`","display_name":"`+username+`","password":"Uji12345!aa","device_id":"dev_`+username+`","platform":"web"}`)
	tok, _ := m["token"].(string)
	if code != http.StatusOK && code != http.StatusCreated || tok == "" {
		w.t.Fatalf("register %s: %d %v", username, code, m)
	}
	return tok
}

// endForum membuat satu forum 7 hari lalu mengakhirinya manual; mengembalikan (forumID, hasil memori, pesan).
func (w *wiredApp) endForum(tok, groupID, title string) (string, string, string) {
	w.t.Helper()
	code, m := w.call(http.MethodPost, "/api/groups/"+groupID+"/subgroups", tok, `{"title":"`+title+`","duration":"7_days"}`)
	sub, _ := m["subgroup"].(map[string]any)
	id, _ := sub["id"].(string)
	if code != http.StatusCreated || id == "" {
		w.t.Fatalf("buat forum %q: %d %v", title, code, m)
	}
	code, m = w.call(http.MethodPost, "/api/groups/"+groupID+"/subgroups/"+id+"/expire", tok, "")
	if code != http.StatusOK {
		w.t.Fatalf("akhiri forum %q: %d %v", title, code, m)
	}
	mem, _ := m["memory"].(string)
	msg, _ := m["message"].(string)
	return id, mem, msg
}

func (w *wiredApp) group(tok, title string) string {
	w.t.Helper()
	code, m := w.call(http.MethodPost, "/api/groups", tok, `{"title":"`+title+`","is_public":true}`)
	g, _ := m["group"].(map[string]any)
	id, _ := g["id"].(string)
	if code != http.StatusCreated || id == "" {
		w.t.Fatalf("buat grup: %d %v", code, m)
	}
	return id
}

func (w *wiredApp) memoryStateOf(tok, forumID string) string {
	w.t.Helper()
	_, m := w.call(http.MethodGet, "/api/forums/mine", tok, "")
	forums, _ := m["forums"].([]any)
	for _, f := range forums {
		row := f.(map[string]any)
		if row["id"] == forumID {
			s, _ := row["memory_state"].(string)
			return s
		}
	}
	w.t.Fatalf("forum %s tidak ada di Forum Saya", forumID)
	return ""
}

func TestWiring_ManualEndRespectsMonthlyAIQuota(t *testing.T) {
	w := newWiredApp(t, func(c *config.Config) { c.MemoryEnabledGroups = "*"; c.MemoryQuotaEnabled = true })
	tok := w.register("kuota_wiring")
	g := w.group(tok, "Grup Kuota Wiring")

	for i, title := range []string{"Satu", "Dua"} {
		if _, mem, _ := w.endForum(tok, g, title); mem != "queued" {
			t.Fatalf("forum %d (dalam kuota Free = 2) harus queued, dapat %q", i+1, mem)
		}
	}
	id3, mem, msg := w.endForum(tok, g, "Tiga")
	if mem != "quota_exceeded" || !strings.Contains(msg, "kuota") || strings.Contains(msg, "antrean memori telah dibuat") {
		t.Fatalf("forum ke-3 harus quota_exceeded dengan pesan jujur: %q %q", mem, msg)
	}
	if got := w.memoryStateOf(tok, id3); got != "quota_exceeded" {
		t.Fatalf("Forum Saya harus menjelaskan kuota habis, dapat %q", got)
	}
	_, st := w.call(http.MethodGet, "/api/me/entitlement", tok, "")
	if ai, _ := st["ai"].(map[string]any); ai["used"].(float64) != 2 {
		t.Fatalf("pemakaian harus 2 (forum ke-3 tidak memakai kuota): %v", st["ai"])
	}
}

func TestWiring_ManualEndRespectsGroupWhitelistAndWorkerSwitch(t *testing.T) {
	cases := map[string]func(*config.Config){
		"whitelist kosong":        func(c *config.Config) { c.MemoryEnabledGroups = "" },
		"grup di luar whitelist":  func(c *config.Config) { c.MemoryEnabledGroups = "grp_lain" },
		"worker memori dimatikan": func(c *config.Config) { c.MemoryEnabledGroups = "*"; c.MemoryWorkerDisabled = true },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			w := newWiredApp(t, mutate)
			tok := w.register("gerbang_wiring")
			g := w.group(tok, "Grup Gerbang")
			id, mem, msg := w.endForum(tok, g, "Satu")
			if mem != "not_queued" || strings.Contains(msg, "antrean memori telah dibuat") {
				t.Fatalf("tanpa izin AI Memory tidak boleh ada antrean: %q %q", mem, msg)
			}
			if got := w.memoryStateOf(tok, id); got == "processing" {
				t.Fatalf("forum tidak boleh berstatus processing tanpa job yang sah")
			}
		})
	}
}
