package notify

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ---- pemformatan ----

func TestFormatText_OnlyMetadataAndLink(t *testing.T) {
	got := FormatText(Event{
		Kind: KindReport, ReportID: "rpt_1", TargetType: "post", Reason: "illegal", HighPriority: true,
		ReportCount: 3, URL: "https://chat.example/admin/reports/rpt_1",
	})
	want := "🚨 Laporan PRIORITAS baru\nJenis: Postingan\nAlasan: Ilegal\nLaporan pada target ini: 3\nTinjau: https://chat.example/admin/reports/rpt_1"
	if got != want {
		t.Fatalf("format berubah:\n got: %q\nwant: %q", got, want)
	}
	// Biasa, laporan pertama: tanpa baris jumlah dan tanpa penanda prioritas.
	got = FormatText(Event{Kind: KindReport, TargetType: "user", Reason: "spam", ReportCount: 1})
	if strings.Contains(got, "PRIORITAS") || strings.Contains(got, "Laporan pada target") || !strings.HasPrefix(got, "🚩 Laporan baru") {
		t.Fatalf("laporan biasa salah format: %q", got)
	}
	// Nilai tak dikenal (mis. dari versi baru) tidak boleh dicetak mentah.
	got = FormatText(Event{Kind: KindReport, TargetType: "<script>", Reason: "x"})
	if strings.Contains(got, "<script>") {
		t.Fatalf("nilai tak dikenal tidak boleh diteruskan apa adanya: %q", got)
	}
	if got := FormatText(Event{Kind: KindDigest, DigestCount: 7, URL: "u"}); !strings.Contains(got, "7 laporan biasa") {
		t.Fatalf("digest: %q", got)
	}
	if got := FormatText(Event{Kind: KindTest}); !strings.Contains(got, "Tes notifikasi") {
		t.Fatalf("tes: %q", got)
	}
}

// ---- Telegram ----

func telegramServer(t *testing.T, status int, body string, capture *struct {
	path string
	req  map[string]any
}) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if capture != nil {
			capture.path = r.URL.Path
			raw, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(raw, &capture.req)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
}

func TestTelegram_SendsExpectedRequest(t *testing.T) {
	var got struct {
		path string
		req  map[string]any
	}
	srv := telegramServer(t, 200, `{"ok":true}`, &got)
	defer srv.Close()
	tg := NewTelegram("123:SECRET", "-1001", WithTelegramBaseURL(srv.URL))
	if err := tg.Notify(context.Background(), Event{Kind: KindReport, TargetType: "post", Reason: "spam", URL: "https://x/admin/reports/r"}); err != nil {
		t.Fatal(err)
	}
	if got.path != "/bot123:SECRET/sendMessage" {
		t.Fatalf("path: %s", got.path)
	}
	if got.req["chat_id"] != "-1001" || got.req["disable_web_page_preview"] != true {
		t.Fatalf("payload: %v", got.req)
	}
	if text, _ := got.req["text"].(string); !strings.Contains(text, "https://x/admin/reports/r") {
		t.Fatalf("teks harus memuat tautan: %v", got.req["text"])
	}
	if _, has := got.req["parse_mode"]; has {
		t.Fatal("tidak boleh memakai parse_mode (hindari injeksi markup)")
	}
}

func TestTelegram_ErrorClassification(t *testing.T) {
	cases := []struct {
		name      string
		status    int
		body      string
		permanent bool
		retry     time.Duration
	}{
		{"token salah", 401, `{"ok":false,"description":"Unauthorized"}`, true, 0},
		{"chat tak ditemukan", 400, `{"ok":false,"description":"Bad Request: chat not found"}`, true, 0},
		{"bot diblokir", 403, `{"ok":false,"description":"Forbidden: bot was blocked by the user"}`, true, 0},
		{"dibatasi", 429, `{"ok":false,"description":"Too Many Requests","parameters":{"retry_after":7}}`, false, 7 * time.Second},
		{"server galat", 502, `bad gateway`, false, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := telegramServer(t, c.status, c.body, nil)
			defer srv.Close()
			err := NewTelegram("T0KEN", "1", WithTelegramBaseURL(srv.URL)).Notify(context.Background(), Event{Kind: KindTest})
			if err == nil {
				t.Fatal("harus galat")
			}
			var perm *PermanentError
			if errors.As(err, &perm) != c.permanent {
				t.Fatalf("permanent=%v, got err %v", c.permanent, err)
			}
			var ra *RetryAfterError
			if c.retry > 0 && (!errors.As(err, &ra) || ra.After != c.retry) {
				t.Fatalf("harus RetryAfter %s, got %v", c.retry, err)
			}
		})
	}
}

func TestTelegram_NeverLeaksTokenInErrors(t *testing.T) {
	srv := telegramServer(t, 200, `{"ok":true}`, nil)
	url := srv.URL
	srv.Close() // koneksi ditolak: galat jaringan Go memuat URL penuh (berisi token)
	tg := NewTelegram("999:VERY-SECRET-TOKEN", "1", WithTelegramBaseURL(url))
	err := tg.Notify(context.Background(), Event{Kind: KindTest})
	if err == nil {
		t.Fatal("harus galat")
	}
	if strings.Contains(err.Error(), "VERY-SECRET-TOKEN") {
		t.Fatalf("token bocor di galat: %v", err)
	}
	// Deskripsi dari penyedia yang kebetulan memuat token juga disamarkan.
	srv2 := telegramServer(t, 400, `{"ok":false,"description":"bad token 999:VERY-SECRET-TOKEN"}`, nil)
	defer srv2.Close()
	err = NewTelegram("999:VERY-SECRET-TOKEN", "1", WithTelegramBaseURL(srv2.URL)).Notify(context.Background(), Event{Kind: KindTest})
	if err == nil || strings.Contains(err.Error(), "VERY-SECRET-TOKEN") {
		t.Fatalf("deskripsi harus disamarkan: %v", err)
	}
}

// ---- Dispatcher ----

type fakeNotifier struct {
	name string
	mu   sync.Mutex
	got  []Event
	// failures: urutan hasil per panggilan; habis = sukses.
	results []error
	calls   atomic.Int32
	panicOn bool
}

func (f *fakeNotifier) Name() string { return f.name }
func (f *fakeNotifier) Notify(_ context.Context, ev Event) error {
	f.calls.Add(1)
	if f.panicOn {
		panic("boom")
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.results) > 0 {
		err := f.results[0]
		f.results = f.results[1:]
		if err != nil {
			return err
		}
	}
	f.got = append(f.got, ev)
	return nil
}
func (f *fakeNotifier) events() []Event {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]Event(nil), f.got...)
}

func waitUntil(t *testing.T, cond func() bool, msg string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timeout: %s", msg)
}

func fastOpts(n ...Notifier) Options {
	return Options{Notifiers: n, AdminURL: "https://x/admin/", Backoff: time.Millisecond, NormalBurst: 2, NormalWindow: time.Hour}
}

func TestDispatcher_NilIsSafe(t *testing.T) {
	var d *Dispatcher
	d.Enqueue(Event{})
	d.Start()
	d.Stop()
	if d.Channels() != nil {
		t.Fatal("channels nil")
	}
	if _, err := d.SendTest(context.Background()); !errors.Is(err, ErrNoChannels) {
		t.Fatalf("want ErrNoChannels, got %v", err)
	}
}

func TestDispatcher_DeliversWithLinkAndTimestamp(t *testing.T) {
	f := &fakeNotifier{name: "f"}
	d := NewDispatcher(fastOpts(f))
	d.Start()
	defer d.Stop()
	d.Enqueue(Event{ReportID: "rpt a/b", TargetType: "post", Reason: "spam"})
	waitUntil(t, func() bool { return len(f.events()) == 1 }, "event terkirim")
	ev := f.events()[0]
	if ev.URL != "https://x/admin/reports/rpt%20a%2Fb" {
		t.Fatalf("tautan harus ter-escape: %q", ev.URL)
	}
	if ev.Kind != KindReport || ev.At.IsZero() {
		t.Fatalf("kind/at: %+v", ev)
	}
}

func TestDispatcher_NormalReportsThrottledIntoDigest_PriorityAlwaysSent(t *testing.T) {
	f := &fakeNotifier{name: "f"}
	o := fastOpts(f)
	o.NormalWindow = 80 * time.Millisecond
	d := NewDispatcher(o)
	// Belum Start: antrean menampung; kita periksa keputusan throttle lewat hasil akhir setelah Start.
	for i := 0; i < 5; i++ {
		d.Enqueue(Event{ReportID: "n", TargetType: "post", Reason: "spam"})
	}
	d.Enqueue(Event{ReportID: "p", TargetType: "post", Reason: "illegal", HighPriority: true})
	d.Start()
	defer d.Stop()
	waitUntil(t, func() bool {
		for _, e := range f.events() {
			if e.Kind == KindDigest {
				return true
			}
		}
		return false
	}, "ringkasan terkirim setelah jendela habis")
	var normal, prio, digest int
	for _, e := range f.events() {
		switch {
		case e.Kind == KindDigest:
			digest += e.DigestCount
		case e.HighPriority:
			prio++
		default:
			normal++
		}
	}
	if normal != 2 || prio != 1 || digest != 3 {
		t.Fatalf("normal=%d (want 2) prio=%d (want 1) digest=%d (want 3)", normal, prio, digest)
	}
}

func TestDispatcher_RetriesTransientButNotPermanent(t *testing.T) {
	flaky := &fakeNotifier{name: "flaky", results: []error{errors.New("x"), errors.New("y")}}
	perm := &fakeNotifier{name: "perm", results: []error{&PermanentError{Err: errors.New("token salah")}, nil, nil}}
	ra := &fakeNotifier{name: "ra", results: []error{&RetryAfterError{After: 5 * time.Millisecond, Err: errors.New("429")}}}
	d := NewDispatcher(fastOpts(flaky, perm, ra))
	d.Start()
	defer d.Stop()
	d.Enqueue(Event{HighPriority: true, Reason: "illegal"})
	waitUntil(t, func() bool { return len(flaky.events()) == 1 && len(ra.events()) == 1 }, "flaky dan ra akhirnya terkirim")
	if flaky.calls.Load() != 3 {
		t.Fatalf("flaky: 3 percobaan, got %d", flaky.calls.Load())
	}
	time.Sleep(50 * time.Millisecond)
	if perm.calls.Load() != 1 || len(perm.events()) != 0 {
		t.Fatalf("permanen: tepat 1 percobaan, got %d", perm.calls.Load())
	}
}

func TestDispatcher_FailingChannelDoesNotBlockOthers_PanicContained(t *testing.T) {
	bad := &fakeNotifier{name: "bad", panicOn: true}
	good := &fakeNotifier{name: "good"}
	d := NewDispatcher(fastOpts(bad, good))
	d.Start()
	defer d.Stop()
	d.Enqueue(Event{HighPriority: true, Reason: "sexual"})
	d.Enqueue(Event{HighPriority: true, Reason: "sexual"})
	waitUntil(t, func() bool { return len(good.events()) == 2 }, "saluran sehat tetap menerima walau saluran lain panik")
}

func TestDispatcher_EnqueueNeverBlocksWhenQueueFull(t *testing.T) {
	d := NewDispatcher(Options{Notifiers: []Notifier{&fakeNotifier{name: "f"}}, QueueSize: 1, NormalBurst: 1000})
	done := make(chan struct{})
	go func() {
		for i := 0; i < 50; i++ {
			d.Enqueue(Event{HighPriority: true}) // tidak di-Start: antrean penuh setelah 1
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Enqueue memblokir saat antrean penuh")
	}
}

func TestDispatcher_StopDrainsQueue(t *testing.T) {
	f := &fakeNotifier{name: "f"}
	d := NewDispatcher(fastOpts(f))
	for i := 0; i < 3; i++ {
		d.Enqueue(Event{HighPriority: true, Reason: "illegal"})
	}
	d.Start()
	d.Stop()
	if len(f.events()) != 3 {
		t.Fatalf("sisa antrean harus terkirim saat berhenti, got %d", len(f.events()))
	}
}

func TestDispatcher_SendTestReportsPerChannel(t *testing.T) {
	ok := &fakeNotifier{name: "ok"}
	bad := &fakeNotifier{name: "bad", results: []error{&PermanentError{Err: errors.New("chat not found")}}}
	pan := &fakeNotifier{name: "pan", panicOn: true}
	d := NewDispatcher(fastOpts(ok, bad, pan))
	res, err := d.SendTest(context.Background())
	if err != nil || len(res) != 3 {
		t.Fatalf("res=%v err=%v", res, err)
	}
	by := map[string]TestResult{}
	for _, r := range res {
		by[r.Channel] = r
	}
	if !by["ok"].OK || by["bad"].OK || by["bad"].Error != "chat not found" || by["pan"].OK {
		t.Fatalf("hasil uji salah: %+v", by)
	}
	if ev := ok.events()[0]; ev.Kind != KindTest || ev.URL != "https://x/admin/reports" {
		t.Fatalf("event uji: %+v", ev)
	}
	if bad.calls.Load() != 1 {
		t.Fatal("uji tidak boleh mengulang")
	}
}

// ---- Build ----

func TestBuild(t *testing.T) {
	if Build(Settings{}) != nil {
		t.Fatal("tanpa saluran harus nil")
	}
	if Build(Settings{Channels: []string{"telegram"}, TelegramBotToken: "t"}) != nil {
		t.Fatal("telegram tanpa chat id harus dilewati")
	}
	if Build(Settings{Channels: []string{"fax"}}) != nil {
		t.Fatal("saluran tak dikenal harus dilewati")
	}
	d := Build(Settings{Channels: []string{" Telegram ", "telegram"}, TelegramBotToken: "t", TelegramChatID: "1", AdminURL: "https://x/admin"})
	if d == nil || len(d.Channels()) != 1 || d.Channels()[0] != "telegram" {
		t.Fatalf("telegram valid (tanpa duplikat): %v", d.Channels())
	}
}
