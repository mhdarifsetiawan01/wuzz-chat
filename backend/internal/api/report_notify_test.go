package api_test

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/notify"
)

type fakeReportNotifier struct {
	mu     sync.Mutex
	events []notify.Event
}

func (f *fakeReportNotifier) Enqueue(ev notify.Event) {
	f.mu.Lock()
	f.events = append(f.events, ev)
	f.mu.Unlock()
}

func (f *fakeReportNotifier) all() []notify.Event {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]notify.Event(nil), f.events...)
}

func TestReportHandler_NotifiesOnNewReportOnly(t *testing.T) {
	e := newModEnv(t)
	h := api.NewReportHandler(e.reports)
	fn := &fakeReportNotifier{}
	h.SetNotifier(fn)
	a, b := e.user("a"), e.user("b")
	ta, tb := e.token(a, "default", "user"), e.token(b, "default", "user")
	post := func(tok, body string) int {
		return e.call(http.MethodPost, "/api/reports", body, tok, h.Handle).Code
	}

	body := `{"target_type":"post","target_id":"p1","target_user_id":"u_x","reason":"illegal","details":"RAHASIA-DETAIL","evidence":"RAHASIA-BUKTI"}`
	if c := post(ta, body); c != http.StatusCreated {
		t.Fatalf("laporan pertama: %d", c)
	}
	evs := fn.all()
	if len(evs) != 1 {
		t.Fatalf("laporan baru harus memicu 1 pemberitahuan, got %d", len(evs))
	}
	ev := evs[0]
	if ev.Kind != notify.KindReport || ev.TargetType != "post" || ev.Reason != "illegal" || !ev.HighPriority || ev.ReportCount != 1 || ev.ReportID == "" {
		t.Fatalf("event salah: %+v", ev)
	}
	// Pesan yang akan dikirim tidak boleh memuat konten/bukti/ID pengguna.
	text := notify.FormatText(ev)
	for _, secret := range []string{"RAHASIA-DETAIL", "RAHASIA-BUKTI", "u_x", "p1"} {
		if strings.Contains(text, secret) {
			t.Fatalf("pesan notifikasi membocorkan %q: %s", secret, text)
		}
	}

	// Pelapor yang sama melapor lagi: duplikat, tidak ada pemberitahuan baru, respons tetap 201.
	if c := post(ta, body); c != http.StatusCreated {
		t.Fatalf("duplikat: %d", c)
	}
	if len(fn.all()) != 1 {
		t.Fatalf("duplikat tidak boleh memicu pemberitahuan, got %d", len(fn.all()))
	}

	// Pelapor lain pada target yang sama: pemberitahuan baru dengan jumlah laporan 2, biasa (bukan prioritas).
	if c := post(tb, `{"target_type":"post","target_id":"p1","reason":"spam"}`); c != http.StatusCreated {
		t.Fatalf("pelapor kedua: %d", c)
	}
	evs = fn.all()
	if len(evs) != 2 || evs[1].ReportCount != 2 || evs[1].HighPriority {
		t.Fatalf("pelapor kedua: %+v", evs)
	}

	// Validasi gagal tidak memicu pemberitahuan.
	if c := post(ta, `{"target_type":"post","target_id":"p9","reason":"bogus"}`); c != http.StatusBadRequest {
		t.Fatalf("validasi: %d", c)
	}
	if len(fn.all()) != 2 {
		t.Fatal("laporan tidak valid tidak boleh memicu pemberitahuan")
	}
}

func TestReportHandler_NoNotifierIsFine(t *testing.T) {
	e := newModEnv(t)
	h := api.NewReportHandler(e.reports)
	a := e.user("a")
	if c := e.call(http.MethodPost, "/api/reports", `{"target_type":"post","target_id":"p1","reason":"spam"}`, e.token(a, "default", "user"), h.Handle).Code; c != http.StatusCreated {
		t.Fatalf("tanpa notifier: %d", c)
	}
}

type fakeTester struct {
	res []notify.TestResult
	err error
}

func (f fakeTester) SendTest(context.Context) ([]notify.TestResult, error) { return f.res, f.err }

func TestModeration_NotifyTestEndpoint(t *testing.T) {
	e := newModEnv(t)
	user, mod := e.user("u"), e.user("m")
	userTok, modTok := e.token(user, "default", "user"), e.token(mod, "default", "wuzz_moderator")
	do := func(method, tok string) (int, string) {
		w := e.call(method, "/api/admin/notify/test", "", tok, e.handler.HandleNotifyTest)
		return w.Code, w.Body.String()
	}
	if c, _ := do(http.MethodPost, ""); c != http.StatusUnauthorized {
		t.Fatalf("tanpa token: %d", c)
	}
	if c, _ := do(http.MethodPost, userTok); c != http.StatusForbidden {
		t.Fatalf("user biasa: want 403, got %d", c)
	}
	if c, _ := do(http.MethodGet, modTok); c != http.StatusMethodNotAllowed {
		t.Fatalf("GET: %d", c)
	}
	if c, _ := do(http.MethodPost, modTok); c != http.StatusServiceUnavailable {
		t.Fatalf("tanpa notifier: want 503, got %d", c)
	}
	e.handler.SetNotifier(fakeTester{err: notify.ErrNoChannels})
	if c, _ := do(http.MethodPost, modTok); c != http.StatusServiceUnavailable {
		t.Fatalf("tanpa saluran: want 503, got %d", c)
	}
	e.handler.SetNotifier(fakeTester{res: []notify.TestResult{{Channel: "telegram", OK: false, Error: "telegram: ditolak (400): chat not found"}}})
	c, body := do(http.MethodPost, modTok)
	if c != http.StatusOK || !strings.Contains(body, `"channel":"telegram"`) || !strings.Contains(body, "chat not found") {
		t.Fatalf("hasil uji: %d %s", c, body)
	}
}
