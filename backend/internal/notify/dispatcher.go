package notify

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Options mengatur Dispatcher. Nol/kosong memakai nilai bawaan.
type Options struct {
	Notifiers []Notifier
	// AdminURL adalah alamat dasar halaman moderator, mis. https://chat.wuzzhub.id/admin.
	AdminURL     string
	QueueSize    int           // bawaan 256; antrean penuh = peristiwa dibuang (tidak pernah memblokir)
	Attempts     int           // percobaan per saluran, bawaan 3
	Backoff      time.Duration // jeda dasar antar percobaan (berlipat), bawaan 2 detik
	Timeout      time.Duration // batas satu percobaan, bawaan 15 detik
	NormalBurst  int           // laporan biasa yang dikirim langsung per jendela, bawaan 5
	NormalWindow time.Duration // panjang jendela; sisa laporan biasa diringkas, bawaan 10 menit
}

// Dispatcher menerima peristiwa, memutuskan dikirim langsung atau diringkas, dan mengirim ke semua saluran di
// latar belakang dengan percobaan ulang. Aman dipakai pada nilai nil (tidak melakukan apa pun).
type Dispatcher struct {
	o     Options
	queue chan Event
	stop  chan struct{}
	done  chan struct{}

	mu         sync.Mutex
	burstUsed  int
	suppressed int
	started    bool
}

func NewDispatcher(o Options) *Dispatcher {
	if o.QueueSize <= 0 {
		o.QueueSize = 256
	}
	if o.Attempts <= 0 {
		o.Attempts = 3
	}
	if o.Backoff <= 0 {
		o.Backoff = 2 * time.Second
	}
	if o.Timeout <= 0 {
		o.Timeout = 15 * time.Second
	}
	if o.NormalBurst <= 0 {
		o.NormalBurst = 5
	}
	if o.NormalWindow <= 0 {
		o.NormalWindow = 10 * time.Minute
	}
	return &Dispatcher{o: o, queue: make(chan Event, o.QueueSize), stop: make(chan struct{}), done: make(chan struct{})}
}

// Channels mengembalikan nama saluran aktif.
func (d *Dispatcher) Channels() []string {
	if d == nil {
		return nil
	}
	names := make([]string, 0, len(d.o.Notifiers))
	for _, n := range d.o.Notifiers {
		names = append(names, n.Name())
	}
	return names
}

// Start menjalankan pekerja latar belakang. Aman dipanggil pada nil.
func (d *Dispatcher) Start() {
	if d == nil {
		return
	}
	d.mu.Lock()
	if d.started {
		d.mu.Unlock()
		return
	}
	d.started = true
	d.mu.Unlock()
	go d.loop()
}

// Stop menghentikan pekerja dan mencoba mengirim sisa antrean (maksimal beberapa detik).
func (d *Dispatcher) Stop() {
	if d == nil {
		return
	}
	d.mu.Lock()
	started := d.started
	d.started = false
	d.mu.Unlock()
	if !started {
		return
	}
	close(d.stop)
	select {
	case <-d.done:
	case <-time.After(8 * time.Second):
		log.Printf("⚠️ [Notify] berhenti sebelum antrean tuntas")
	}
}

func (d *Dispatcher) link(ev Event) string {
	base := strings.TrimRight(d.o.AdminURL, "/")
	if base == "" {
		return ""
	}
	if ev.Kind == KindReport && ev.ReportID != "" {
		return base + "/reports/" + url.PathEscape(ev.ReportID)
	}
	return base + "/reports"
}

// Enqueue mendaftarkan satu peristiwa laporan baru. Tidak pernah memblokir dan tidak pernah gagal ke pemanggil.
// Laporan prioritas tinggi selalu dikirim; laporan biasa dibatasi per jendela waktu, sisanya diringkas.
func (d *Dispatcher) Enqueue(ev Event) {
	if d == nil || len(d.o.Notifiers) == 0 {
		return
	}
	if ev.Kind == "" {
		ev.Kind = KindReport
	}
	if ev.Kind == KindReport && !ev.HighPriority {
		d.mu.Lock()
		if d.burstUsed >= d.o.NormalBurst {
			d.suppressed++
			d.mu.Unlock()
			return
		}
		d.burstUsed++
		d.mu.Unlock()
	}
	d.push(ev)
}

func (d *Dispatcher) push(ev Event) {
	ev.URL = d.link(ev)
	if ev.At.IsZero() {
		ev.At = time.Now()
	}
	select {
	case d.queue <- ev:
	default:
		log.Printf("⚠️ [Notify] antrean penuh, peristiwa %s dibuang", ev.Kind)
	}
}

// loop mengirim antrean dan, tiap jendela, membuka kembali kuota laporan biasa serta mengirim ringkasan.
func (d *Dispatcher) loop() {
	defer close(d.done)
	tick := time.NewTicker(d.o.NormalWindow)
	defer tick.Stop()
	for {
		select {
		case ev := <-d.queue:
			d.deliver(ev)
		case <-tick.C:
			d.flushWindow()
		case <-d.stop:
			d.flushWindow()
			for {
				select {
				case ev := <-d.queue:
					d.deliver(ev)
				default:
					return
				}
			}
		}
	}
}

func (d *Dispatcher) flushWindow() {
	d.mu.Lock()
	n := d.suppressed
	d.suppressed, d.burstUsed = 0, 0
	d.mu.Unlock()
	if n > 0 {
		d.push(Event{Kind: KindDigest, DigestCount: n})
	}
}

// deliver mengirim ke semua saluran secara paralel; satu saluran yang lambat/gagal tidak menahan yang lain.
func (d *Dispatcher) deliver(ev Event) {
	var wg sync.WaitGroup
	for _, n := range d.o.Notifiers {
		wg.Add(1)
		go func(n Notifier) {
			defer wg.Done()
			if err := d.sendWithRetry(n, ev); err != nil {
				log.Printf("⚠️ [Notify] %s gagal mengirim %s: %v", n.Name(), ev.Kind, err)
			}
		}(n)
	}
	wg.Wait()
}

func (d *Dispatcher) sendWithRetry(n Notifier, ev Event) (err error) {
	delay := d.o.Backoff
	for attempt := 1; attempt <= d.o.Attempts; attempt++ {
		err = d.once(n, ev)
		if err == nil {
			return nil
		}
		var perm *PermanentError
		if errors.As(err, &perm) || attempt == d.o.Attempts {
			return err
		}
		wait := delay
		var ra *RetryAfterError
		if errors.As(err, &ra) && ra.After > 0 {
			wait = ra.After
			if wait > 30*time.Second {
				wait = 30 * time.Second
			}
		}
		select {
		case <-time.After(wait):
		case <-d.stop:
			// Sedang berhenti: satu percobaan lagi tanpa menunggu, lalu selesai.
			return d.once(n, ev)
		}
		delay *= 2
	}
	return err
}

// once menjalankan satu percobaan dengan batas waktu dan perlindungan panik.
func (d *Dispatcher) once(n Notifier, ev Event) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = &PermanentError{Err: fmt.Errorf("panik di saluran %s: %v", n.Name(), r)}
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), d.o.Timeout)
	defer cancel()
	return n.Notify(ctx, ev)
}

// TestResult adalah hasil uji satu saluran.
type TestResult struct {
	Channel string `json:"channel"`
	OK      bool   `json:"ok"`
	Error   string `json:"error,omitempty"`
}

// SendTest mengirim pesan uji ke setiap saluran SECARA SINKRON (tanpa percobaan ulang) dan melaporkan hasilnya,
// supaya moderator bisa memastikan token dan chat id benar.
func (d *Dispatcher) SendTest(ctx context.Context) ([]TestResult, error) {
	if d == nil || len(d.o.Notifiers) == 0 {
		return nil, ErrNoChannels
	}
	ev := Event{Kind: KindTest, At: time.Now()}
	ev.URL = d.link(ev)
	out := make([]TestResult, len(d.o.Notifiers))
	var wg sync.WaitGroup
	for i, n := range d.o.Notifiers {
		wg.Add(1)
		go func(i int, n Notifier) {
			defer wg.Done()
			cctx, cancel := context.WithTimeout(ctx, d.o.Timeout)
			defer cancel()
			res := TestResult{Channel: n.Name(), OK: true}
			func() {
				defer func() {
					if r := recover(); r != nil {
						res.OK, res.Error = false, "saluran mengalami kesalahan internal"
					}
				}()
				if err := n.Notify(cctx, ev); err != nil {
					res.OK, res.Error = false, err.Error()
				}
			}()
			out[i] = res
		}(i, n)
	}
	wg.Wait()
	return out, nil
}
