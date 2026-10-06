package app

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/notify"
	"github.com/bms-del112/wuzz-chat/internal/shared/config"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type recordingNotifier struct {
	mu     sync.Mutex
	events []notify.Event
}

func (r *recordingNotifier) Enqueue(ev notify.Event) {
	r.mu.Lock()
	r.events = append(r.events, ev)
	r.mu.Unlock()
}
func (r *recordingNotifier) SendTest(context.Context) ([]notify.TestResult, error) {
	return []notify.TestResult{{Channel: "fake", OK: true}}, nil
}

func newModerationApp(t *testing.T, cfg config.Config) (*Application, http.Handler) {
	t.Helper()
	t.Setenv("DATABASE_URL", filepath.Join(t.TempDir(), "mod_routes.db"))
	t.Setenv("DB_DRIVER", "")
	cfg.Port, cfg.CORSAllowedOrigins, cfg.JWTSecret = "8080", "*", "test_secret"
	cfg.UploadDir, cfg.MediaRetentionDays, cfg.AuthRateLimitIP, cfg.AuthRateLimitUser = t.TempDir(), 7, 100, 100
	app, err := New(&cfg)
	if err != nil {
		t.Fatalf("gagal membuat aplikasi: %v", err)
	}
	t.Cleanup(func() { app.Close() })
	return app, app.setupRouter()
}

func roleToken(t *testing.T, id, role string) string {
	t.Helper()
	tok, _, err := auth.GenerateSessionTokenWithRole(id, id, id, "default", "", role)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

// staffToken membuat akun sungguhan, mengangkatnya di DATABASE (sumber kebenaran peran), lalu menerbitkan token berperan
// itu. Peran di token saja tidak cukup: server memverifikasinya ke database.
func staffToken(t *testing.T, app *Application, h http.Handler, username, role string) string {
	t.Helper()
	rr := call(h, http.MethodPost, "/api/auth/register", "", `{"username":"`+username+`","display_name":"S","password":"password123","device_id":"d_`+username+`"}`)
	if rr.Code != http.StatusCreated {
		t.Fatalf("register %s: %d %s", username, rr.Code, rr.Body.String())
	}
	var res struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &res)
	if res.User.ID == "" {
		t.Fatalf("id user tidak ditemukan di respons: %s", rr.Body.String())
	}
	db := app.MessageStore.(*store.SQLMessageStore).DB()
	if _, err := db.Exec(`UPDATE users SET system_role = ? WHERE id = ?`, role, res.User.ID); err != nil {
		t.Fatal(err)
	}
	return roleToken(t, res.User.ID, role)
}

func TestModerationRoutes_WiredAndProtected(t *testing.T) {
	app, h := newModerationApp(t, config.Config{})
	if app.ModerationHandler == nil || app.Suspension == nil {
		t.Fatal("alat moderasi dan kebijakan penangguhan harus terpasang")
	}
	if app.Notifier != nil {
		t.Fatal("tanpa MODERATION_NOTIFY tidak boleh ada dispatcher")
	}
	user, mod := roleToken(t, "u1", "user"), staffToken(t, app, h, "mod_one", "wuzz_moderator")

	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/api/admin/reports"},
		{http.MethodGet, "/api/admin/reports/rpt_x"},
		{http.MethodPost, "/api/admin/reports/rpt_x/action"},
		{http.MethodPost, "/api/admin/users/u9/unsuspend"},
		{http.MethodPost, "/api/admin/notify/test"},
		{http.MethodGet, "/api/admin/staff"},
		{http.MethodGet, "/api/admin/staff/lookup?username=x"},
		{http.MethodPost, "/api/admin/staff/u9/grant"},
	} {
		if rr := call(h, tc.method, tc.path, "", `{}`); rr.Code != http.StatusUnauthorized {
			t.Errorf("%s %s tanpa token: want 401, got %d", tc.method, tc.path, rr.Code)
		}
		if rr := call(h, tc.method, tc.path, user, `{}`); rr.Code != http.StatusForbidden {
			t.Errorf("%s %s user biasa: want 403, got %d", tc.method, tc.path, rr.Code)
		}
	}
	if rr := call(h, http.MethodGet, "/api/admin/reports", mod, ""); rr.Code != http.StatusOK {
		t.Fatalf("moderator list: %d %s", rr.Code, rr.Body.String())
	}
	if rr := call(h, http.MethodGet, "/api/admin/reports/rpt_tak_ada", mod, ""); rr.Code != http.StatusNotFound {
		t.Fatalf("detail tak ada: want 404, got %d", rr.Code)
	}
	// Pengelolaan staf: moderator biasa ditolak, hanya wuzz_admin (diverifikasi ke database) yang boleh.
	if rr := call(h, http.MethodGet, "/api/admin/staff", mod, ""); rr.Code != http.StatusForbidden {
		t.Fatalf("moderator mengelola staf: want 403, got %d", rr.Code)
	}
	admin := staffToken(t, app, h, "boss_one", "wuzz_admin")
	rr := call(h, http.MethodGet, "/api/admin/staff", admin, "")
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"boss_one"`) || !strings.Contains(rr.Body.String(), `"mod_one"`) {
		t.Fatalf("admin melihat daftar staf: %d %s", rr.Code, rr.Body.String())
	}
	// Notifikasi belum dikonfigurasi: tes dijawab 503, bukan galat server.
	if rr := call(h, http.MethodPost, "/api/admin/notify/test", mod, ""); rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("tes tanpa konfigurasi: want 503, got %d", rr.Code)
	}
}

func TestModerationRoutes_NotifierWiredFromConfig(t *testing.T) {
	// Kredensial palsu: tidak ada laporan dibuat di tes ini, jadi tidak ada panggilan jaringan ke Telegram.
	app, h := newModerationApp(t, config.Config{
		ModerationNotify: []string{"telegram"}, TelegramBotToken: "1:fake", TelegramChatID: "1", ModerationAdminURL: "https://x/admin",
	})
	if app.Notifier == nil || strings.Join(app.Notifier.Channels(), ",") != "telegram" {
		t.Fatalf("dispatcher Telegram harus terpasang dari config, got %v", app.Notifier.Channels())
	}

	// Ganti dengan perekam agar tidak menyentuh jaringan, lalu buktikan laporan lewat router memicu pemberitahuan.
	rec := &recordingNotifier{}
	app.ReportHandler.SetNotifier(rec)
	app.ModerationHandler.SetNotifier(rec)

	user, mod := roleToken(t, "u1", "user"), staffToken(t, app, h, "mod_one", "wuzz_moderator")
	body := `{"target_type":"post","target_id":"p1","reason":"illegal"}`
	if rr := call(h, http.MethodPost, "/api/reports", user, body); rr.Code != http.StatusCreated {
		t.Fatalf("buat laporan: %d %s", rr.Code, rr.Body.String())
	}
	if rr := call(h, http.MethodPost, "/api/reports", user, body); rr.Code != http.StatusCreated {
		t.Fatalf("laporan ganda: %d", rr.Code)
	}
	rec.mu.Lock()
	n, first := len(rec.events), notify.Event{}
	if n > 0 {
		first = rec.events[0]
	}
	rec.mu.Unlock()
	if n != 1 || first.Reason != "illegal" || !first.HighPriority || first.TargetType != "post" {
		t.Fatalf("tepat 1 pemberitahuan (duplikat diabaikan): n=%d %+v", n, first)
	}

	rr := call(h, http.MethodPost, "/api/admin/notify/test", mod, "")
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"channel":"fake"`) {
		t.Fatalf("tes notifikasi: %d %s", rr.Code, rr.Body.String())
	}
	// Pembatas tes: 5 per jam per akun, sisanya 429 (tidak bisa dipakai membanjiri chat moderator).
	var limited bool
	for i := 0; i < 8; i++ {
		if call(h, http.MethodPost, "/api/admin/notify/test", mod, "").Code == http.StatusTooManyRequests {
			limited = true
			break
		}
	}
	if !limited {
		t.Fatal("endpoint tes notifikasi harus dibatasi")
	}
}
