// Package orphanreport membandingkan isi bucket R2 dengan semua rujukan URL media di database dan melaporkan objek
// yang tampak yatim. HANYA-BACA: tidak ada fungsi hapus di sini maupun di alat pemanggilnya (cmd/orphanreport). Hasilnya
// dipakai manusia untuk memutuskan apakah sapu bucket (A3 langkah 3) layak dan aman.
package orphanreport

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/storage"
)

// Lister adalah bagian R2Storage yang dibutuhkan laporan (daftar objek + pemetaan URL ke kunci).
type Lister interface {
	ListObjects(ctx context.Context, prefix, token string, maxKeys int) (*storage.ListPage, error)
	KeyFromURL(fileURL string) (string, bool)
}

// Refs adalah himpunan kunci objek bucket yang dirujuk database, dipisah menurut sumbernya.
type Refs struct {
	Used     map[string]bool // dirujuk pesan, foto profil, avatar grup, atau postingan Feed
	Queued   map[string]bool // sudah ada di media_purge_queue (akan dihapus PurgeWorker)
	Ticketed map[string]bool // punya tiket unggah (akan dinilai penyapu unggahan yatim)
}

func newRefs() *Refs {
	return &Refs{Used: map[string]bool{}, Queued: map[string]bool{}, Ticketed: map[string]bool{}}
}

// add memasukkan satu URL (beserta thumbnail turunannya bila video) ke himpunan.
func add(set map[string]bool, l Lister, rawURL string) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return
	}
	if key, ok := l.KeyFromURL(rawURL); ok {
		set[key] = true
	}
	if thumb, ok := storage.VideoThumbnailURL(rawURL); ok {
		if key, ok := l.KeyFromURL(thumb); ok {
			set[key] = true
		}
	}
}

func readStrings(ctx context.Context, tx *sql.Tx, query string, fn func(string)) error {
	rows, err := tx.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("%s: %w", query, err)
	}
	defer rows.Close()
	for rows.Next() {
		var s sql.NullString
		if err := rows.Scan(&s); err != nil {
			return err
		}
		if s.Valid {
			fn(s.String)
		}
	}
	return rows.Err()
}

// LoadReferences membaca semua tabel yang menyimpan URL media. Seluruhnya SELECT di dalam transaksi hanya-baca bila
// driver mendukung (readOnlyTx=true; Postgres mendukung, SQLite uji tidak).
func LoadReferences(ctx context.Context, db *sql.DB, l Lister, readOnlyTx bool) (*Refs, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: readOnlyTx})
	if err != nil {
		return nil, fmt.Errorf("gagal memulai transaksi hanya-baca: %w", err)
	}
	defer tx.Rollback()

	refs := newRefs()
	simple := []struct {
		q   string
		set map[string]bool
	}{
		{`SELECT media_url FROM messages WHERE media_url IS NOT NULL AND media_url <> ''`, refs.Used},
		{`SELECT avatar_url FROM users WHERE avatar_url IS NOT NULL AND avatar_url <> ''`, refs.Used},
		{`SELECT avatar_url FROM conversations WHERE avatar_url IS NOT NULL AND avatar_url <> ''`, refs.Used},
		{`SELECT media_url FROM media_purge_queue`, refs.Queued},
		{`SELECT public_url FROM upload_tickets`, refs.Ticketed},
	}
	for _, s := range simple {
		set := s.set
		if err := readStrings(ctx, tx, s.q, func(u string) { add(set, l, u) }); err != nil {
			return nil, err
		}
	}
	// media_urls postingan Feed berupa array JSON.
	if err := readStrings(ctx, tx, `SELECT media_urls FROM feed_posts WHERE media_urls IS NOT NULL AND media_urls <> ''`, func(raw string) {
		var urls []string
		if json.Unmarshal([]byte(raw), &urls) != nil {
			// Format tak terduga: anggap seluruh teks sebagai satu URL agar aman (lebih banyak yang dianggap terpakai).
			add(refs.Used, l, raw)
			return
		}
		for _, u := range urls {
			add(refs.Used, l, u)
		}
	}); err != nil {
		return nil, err
	}
	return refs, nil
}

// Group mengumpulkan hitungan dan ukuran.
type Group struct {
	Count int
	Bytes int64
}

func (g *Group) add(size int64) { g.Count++; g.Bytes += size }

// Candidate adalah satu objek yang tampak yatim.
type Candidate struct {
	Key          string
	Size         int64
	LastModified time.Time
}

// Report adalah hasil analisis.
type Report struct {
	Scanned   int
	Truncated bool // pemindaian dihentikan di MaxObjects

	Used, Queued, Young, Ticketed, Orphan Group

	OrphanByPrefix map[string]*Group // "video/", "<tenant>/", atau "(root)"
	OrphanByAge    map[string]*Group // "3-7 hari", "7-30 hari", ">30 hari"
	Samples        []Candidate       // contoh kandidat (terlama dulu), maks Options.Sample
}

// Options mengatur analisis.
type Options struct {
	MinAge     time.Duration // objek lebih muda dari ini tidak dianggap (bawaan 72 jam)
	Prefix     string        // batasi pemindaian ke awalan ini
	MaxObjects int           // batas pengaman jumlah objek yang dipindai (bawaan 500.000)
	Sample     int           // jumlah contoh yang disimpan (bawaan 10)
	Now        func() time.Time
	// OnCandidate (opsional) dipanggil untuk SETIAP kandidat yatim, mis. untuk menulis CSV.
	OnCandidate func(Candidate)
}

func prefixGroup(key string) string {
	if strings.HasPrefix(key, storage.VideoKeyPrefix) {
		return storage.VideoKeyPrefix
	}
	if i := strings.Index(key, "/"); i > 0 {
		return key[:i+1]
	}
	return "(root)"
}

func ageBucket(age time.Duration) string {
	switch {
	case age > 30*24*time.Hour:
		return ">30 hari"
	case age > 7*24*time.Hour:
		return "7-30 hari"
	default:
		return "3-7 hari"
	}
}

// Analyze memindai bucket halaman demi halaman dan mengelompokkan tiap objek. Urutan penilaian: terpakai, sudah
// diantre hapus, terlalu baru, bertiket, lalu sisanya kandidat yatim.
func Analyze(ctx context.Context, l Lister, refs *Refs, opt Options) (*Report, error) {
	if opt.MinAge <= 0 {
		opt.MinAge = 72 * time.Hour
	}
	if opt.MaxObjects <= 0 {
		opt.MaxObjects = 500000
	}
	if opt.Sample <= 0 {
		opt.Sample = 10
	}
	if opt.Now == nil {
		opt.Now = time.Now
	}
	now := opt.Now()
	rep := &Report{OrphanByPrefix: map[string]*Group{}, OrphanByAge: map[string]*Group{}}

	token := ""
	for {
		page, err := l.ListObjects(ctx, opt.Prefix, token, 1000)
		if err != nil {
			return rep, err
		}
		for _, o := range page.Objects {
			if rep.Scanned >= opt.MaxObjects {
				rep.Truncated = true
				return rep, nil
			}
			rep.Scanned++
			age := now.Sub(o.LastModified)
			switch {
			case refs.Used[o.Key]:
				rep.Used.add(o.Size)
			case refs.Queued[o.Key]:
				rep.Queued.add(o.Size)
			case age < opt.MinAge:
				rep.Young.add(o.Size)
			case refs.Ticketed[o.Key]:
				rep.Ticketed.add(o.Size)
			default:
				rep.Orphan.add(o.Size)
				pg := prefixGroup(o.Key)
				if rep.OrphanByPrefix[pg] == nil {
					rep.OrphanByPrefix[pg] = &Group{}
				}
				rep.OrphanByPrefix[pg].add(o.Size)
				ab := ageBucket(age)
				if rep.OrphanByAge[ab] == nil {
					rep.OrphanByAge[ab] = &Group{}
				}
				rep.OrphanByAge[ab].add(o.Size)
				c := Candidate{Key: o.Key, Size: o.Size, LastModified: o.LastModified}
				if opt.OnCandidate != nil {
					opt.OnCandidate(c)
				}
				rep.Samples = append(rep.Samples, c)
			}
		}
		if page.NextToken == "" {
			break
		}
		token = page.NextToken
	}
	sort.Slice(rep.Samples, func(i, j int) bool { return rep.Samples[i].LastModified.Before(rep.Samples[j].LastModified) })
	if len(rep.Samples) > opt.Sample {
		rep.Samples = rep.Samples[:opt.Sample]
	}
	return rep, nil
}

func human(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(b)/float64(div), "KMGTPE"[exp])
}

func line(w io.Writer, label string, g Group) {
	fmt.Fprintf(w, "  %-34s %8d objek  %10s\n", label, g.Count, human(g.Bytes))
}

// Write mencetak laporan yang mudah dibaca.
func (r *Report) Write(w io.Writer, minAge time.Duration) {
	fmt.Fprintf(w, "== Laporan objek bucket (hanya-baca; tidak ada yang dihapus) ==\n")
	fmt.Fprintf(w, "Dipindai: %d objek", r.Scanned)
	if r.Truncated {
		fmt.Fprintf(w, "  (DIHENTIKAN di batas -max-objects; hasil tidak lengkap)")
	}
	fmt.Fprintf(w, "\n\n")
	line(w, "Dipakai (pesan/avatar/Feed)", r.Used)
	line(w, "Sudah diantre hapus", r.Queued)
	line(w, fmt.Sprintf("Terlalu baru (< %d jam), diabaikan", int(minAge.Hours())), r.Young)
	line(w, "Bertiket (dinilai penyapu)", r.Ticketed)
	line(w, "KANDIDAT YATIM", r.Orphan)
	if r.Orphan.Count > 0 {
		fmt.Fprintf(w, "\nKandidat yatim menurut awalan kunci:\n")
		for _, k := range sortedKeys(r.OrphanByPrefix) {
			line(w, k, *r.OrphanByPrefix[k])
		}
		fmt.Fprintf(w, "\nKandidat yatim menurut umur:\n")
		for _, k := range sortedKeys(r.OrphanByAge) {
			line(w, k, *r.OrphanByAge[k])
		}
		fmt.Fprintf(w, "\nContoh kandidat tertua (cek manual sebelum percaya):\n")
		for _, c := range r.Samples {
			fmt.Fprintf(w, "  %s  %10s  %s\n", c.LastModified.UTC().Format("2006-01-02 15:04"), human(c.Size), c.Key)
		}
	}
	fmt.Fprintf(w, "\nCatatan: \"kandidat\" = tidak dirujuk tabel mana pun yang dikenal alat ini. Bila contohnya ternyata masih\n"+
		"dipakai di tempat lain, pemeriksaan rujukan tidak lengkap dan sapu bucket TIDAK boleh dijalankan.\n")
}

func sortedKeys(m map[string]*Group) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
