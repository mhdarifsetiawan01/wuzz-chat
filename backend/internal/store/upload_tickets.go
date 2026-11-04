package store

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
)

// Mode penyapu unggahan yatim (env UPLOAD_ORPHAN_SWEEP).
const (
	OrphanSweepOff = "off"  // tidak menyapu (bawaan); tiket tetap dicatat
	OrphanSweepDry = "dry"  // hanya mencatat di log apa yang AKAN dihapus
	OrphanSweepOn  = "true" // mengantrekan unggahan yatim ke media_purge_queue
)

// ParseOrphanSweepMode menormalkan nilai env; nilai tidak dikenal = off (gagal tertutup, tidak menghapus apa pun).
func ParseOrphanSweepMode(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "dry", "dry-run", "dryrun":
		return OrphanSweepDry
	case "true", "1", "on", "yes":
		return OrphanSweepOn
	default:
		return OrphanSweepOff
	}
}

// UploadTicketStore mencatat tiket unggah (signed URL) yang diterbitkan server. Server tidak melihat isi unggahan
// langsung ke storage, jadi catatan ini satu-satunya cara mengetahui berkas mana yang pernah dibuat tetapi tidak
// pernah dipakai (mis. posting dibatalkan, aplikasi ditutup di tengah jalan).
type UploadTicketStore struct {
	db         *sql.DB
	driverName string
}

// NewUploadTicketStore membuat store; tabelnya dibuat oleh migrasi SQLMessageStore.
func NewUploadTicketStore(db *sql.DB, driverName string) *UploadTicketStore {
	return &UploadTicketStore{db: db, driverName: driverName}
}

func (s *UploadTicketStore) rebind(q string) string {
	if s.driverName != "postgres" {
		return q
	}
	var b strings.Builder
	n := 0
	for _, c := range q {
		if c == '?' {
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteRune(c)
	}
	return b.String()
}

// Record mencatat tiket (idempoten). Best-effort: galat hanya dicatat di log supaya penerbitan tiket tidak gagal.
func (s *UploadTicketStore) Record(ctx context.Context, publicURL, tenantID, userID, purpose string) {
	if s == nil || s.db == nil || strings.TrimSpace(publicURL) == "" {
		return
	}
	if tenantID == "" {
		tenantID = "default"
	}
	if len(purpose) > 16 {
		purpose = purpose[:16]
	}
	_, err := s.db.ExecContext(ctx, s.rebind(`INSERT INTO upload_tickets (public_url, tenant_id, user_id, purpose, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(public_url) DO NOTHING`),
		publicURL, tenantID, userID, purpose, time.Now().UTC())
	if err != nil {
		log.Printf("⚠️ [UploadTicket] Gagal mencatat tiket %s: %v", publicURL, err)
	}
}

// listOlderThan mengambil tiket yang lebih tua dari cutoff (paling lama dulu).
func (s *UploadTicketStore) listOlderThan(ctx context.Context, cutoff time.Time, limit int) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, s.rebind(`SELECT public_url FROM upload_tickets WHERE created_at < ? ORDER BY created_at LIMIT ?`), cutoff, limit)
	if err != nil {
		return nil, fmt.Errorf("gagal membaca tiket unggah: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *UploadTicketStore) remove(ctx context.Context, publicURL string) error {
	_, err := s.db.ExecContext(ctx, s.rebind(`DELETE FROM upload_tickets WHERE public_url = ?`), publicURL)
	return err
}

const (
	orphanSweepBatch      = 200
	orphanSweepMaxBatches = 5
)

// UploadOrphanSweeper menyapu tiket yang sudah cukup tua: bila berkasnya dipakai, tiket dibuang; bila tidak dipakai
// sama sekali, berkas diantrekan untuk dihapus (mode "true") atau hanya dicatat (mode "dry").
//
// Pagar keselamatan: umur minimum (bawaan 72 jam, tidak boleh < 24 jam) memberi waktu bagi pengiriman yang tertunda;
// hanya URL milik storage (owns) yang disentuh; pemeriksaan rujukan sama dengan MediaReleaser; galat membaca rujukan =
// tiket dipertahankan.
type UploadOrphanSweeper struct {
	tickets  *UploadTicketStore
	releaser *MediaReleaser
	mode     string
	minAge   time.Duration
	now      func() time.Time
}

// NewUploadOrphanSweeper membuat penyapu. mode "off" atau dependensi nil membuat Sweep tidak melakukan apa-apa.
func NewUploadOrphanSweeper(tickets *UploadTicketStore, releaser *MediaReleaser, mode string, minAge time.Duration) *UploadOrphanSweeper {
	if minAge < 24*time.Hour {
		minAge = 24 * time.Hour
	}
	return &UploadOrphanSweeper{tickets: tickets, releaser: releaser, mode: ParseOrphanSweepMode(mode), minAge: minAge, now: time.Now}
}

// Sweep menjalankan satu siklus. Mencatat SATU baris ringkasan, hanya bila ada pekerjaan.
func (w *UploadOrphanSweeper) Sweep(ctx context.Context) {
	if w == nil || w.tickets == nil || w.releaser == nil || w.releaser.db == nil || w.mode == OrphanSweepOff {
		return
	}
	cutoff := w.now().UTC().Add(-w.minAge)
	var used, orphan, foreign, skipped int
	var sample []string
	defer func() {
		if used+orphan+foreign+skipped > 0 {
			log.Printf("🧹 [UploadSweep] mode=%s: %d terpakai (tiket dibuang), %d yatim, %d bukan milik storage (tiket dibuang), %d dilewati karena galat; contoh yatim: %v",
				w.mode, used, orphan, foreign, skipped, sample)
		}
	}()
	for i := 0; i < orphanSweepMaxBatches; i++ {
		urls, err := w.tickets.listOlderThan(ctx, cutoff, orphanSweepBatch)
		if err != nil {
			log.Printf("⚠️ [UploadSweep] %v", err)
			return
		}
		if len(urls) == 0 {
			return
		}
		progressed := 0
		for _, u := range urls {
			if w.releaser.owns == nil || !w.releaser.owns(u) {
				foreign++
				if err := w.tickets.remove(ctx, u); err != nil {
					log.Printf("⚠️ [UploadSweep] Gagal membuang tiket %s: %v", u, err)
				} else {
					progressed++
				}
				continue
			}
			referenced, err := w.releaser.stillReferenced(ctx, u)
			if err != nil {
				skipped++
				log.Printf("⚠️ [UploadSweep] Gagal memeriksa rujukan %s, tiket dipertahankan: %v", u, err)
				continue
			}
			if referenced {
				used++
				if err := w.tickets.remove(ctx, u); err != nil {
					log.Printf("⚠️ [UploadSweep] Gagal membuang tiket %s: %v", u, err)
				} else {
					progressed++
				}
				continue
			}
			orphan++
			if len(sample) < 3 {
				sample = append(sample, u)
			}
			if w.mode != OrphanSweepOn {
				continue // dry: tiket dibiarkan agar bisa dibandingkan lagi
			}
			if err := w.releaser.queue.Enqueue(ctx, u); err != nil {
				orphan--
				skipped++
				log.Printf("⚠️ [UploadSweep] Gagal mengantrekan %s: %v", u, err)
				continue
			}
			if err := w.tickets.remove(ctx, u); err != nil {
				log.Printf("⚠️ [UploadSweep] Gagal membuang tiket %s: %v", u, err)
			} else {
				progressed++
			}
		}
		// Batch yang tidak menghasilkan kemajuan (mode dry, atau semua galat) akan terbaca ulang: berhenti.
		if progressed == 0 || len(urls) < orphanSweepBatch {
			return
		}
	}
}
