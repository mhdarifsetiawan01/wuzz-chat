// orphanreport: laporan HANYA-BACA berkas yatim di bucket R2 (A3 langkah 3). Tidak menghapus apa pun; tidak ada kode
// hapus yang dipanggil. Dijalankan manual oleh pemilik kredensial.
//
// Ia TIDAK membaca berkas .env; berikan lewat lingkungan shell. Contoh (di VPS atau mesin yang boleh mengakses DB):
//
//	cd backend
//	set -a; source .env; set +a      # hati-hati: .env lokal = DATABASE PRODUKSI, itu memang maksudnya di sini
//	go run ./cmd/orphanreport -csv /tmp/kandidat.csv
//
// Koneksi DB dibuka dalam transaksi READ ONLY dan hanya menjalankan SELECT; tidak ada migrasi.
package main

import (
	"context"
	"database/sql"
	"encoding/csv"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
	_ "modernc.org/sqlite"

	"github.com/bms-del112/wuzz-chat/internal/orphanreport"
	"github.com/bms-del112/wuzz-chat/internal/storage"
)

func main() {
	var (
		minAge     = flag.Int("min-age-hours", 72, "objek lebih muda dari ini diabaikan")
		prefix     = flag.String("prefix", "", "batasi pemindaian ke awalan kunci ini")
		maxObjects = flag.Int("max-objects", 500000, "batas pengaman jumlah objek yang dipindai")
		sample     = flag.Int("sample", 10, "jumlah contoh kandidat yang dicetak")
		csvPath    = flag.String("csv", "", "tulis SEMUA kandidat ke berkas CSV ini (kunci, ukuran, waktu ubah)")
		dbDriver   = flag.String("db-driver", "", "postgres atau sqlite (bawaan: tebak dari DATABASE_URL)")
		dsn        = flag.String("db", os.Getenv("DATABASE_URL"), "DSN database (bawaan: env DATABASE_URL)")
	)
	flag.Parse()

	if *dsn == "" {
		fatal("DATABASE_URL kosong (atau berikan -db)")
	}
	driver := *dbDriver
	if driver == "" {
		if strings.HasPrefix(*dsn, "postgres://") || strings.HasPrefix(*dsn, "postgresql://") || strings.Contains(*dsn, "host=") {
			driver = "postgres"
		} else {
			driver = "sqlite"
		}
	}

	r2, err := storage.NewR2Storage(storage.R2Config{
		AccountID:       os.Getenv("R2_ACCOUNT_ID"),
		AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
		Bucket:          os.Getenv("R2_BUCKET"),
		PublicBaseURL:   os.Getenv("R2_PUBLIC_BASE_URL"),
		Endpoint:        os.Getenv("R2_ENDPOINT"),
	})
	if err != nil {
		fatal("%v", err)
	}

	db, err := sql.Open(driver, *dsn)
	if err != nil {
		fatal("gagal membuka database: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(2)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	fmt.Fprintf(os.Stderr, "Membaca rujukan dari database (%s, transaksi hanya-baca)...\n", driver)
	refs, err := orphanreport.LoadReferences(ctx, db, r2, driver == "postgres")
	if err != nil {
		fatal("%v", err)
	}
	fmt.Fprintf(os.Stderr, "Rujukan: %d dipakai, %d diantre hapus, %d bertiket. Memindai bucket...\n",
		len(refs.Used), len(refs.Queued), len(refs.Ticketed))

	opt := orphanreport.Options{
		MinAge:     time.Duration(*minAge) * time.Hour,
		Prefix:     *prefix,
		MaxObjects: *maxObjects,
		Sample:     *sample,
	}
	var cw *csv.Writer
	if *csvPath != "" {
		f, err := os.OpenFile(*csvPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
		if err != nil {
			fatal("gagal membuat CSV: %v", err)
		}
		defer f.Close()
		cw = csv.NewWriter(f)
		_ = cw.Write([]string{"key", "size_bytes", "last_modified_utc"})
		opt.OnCandidate = func(c orphanreport.Candidate) {
			_ = cw.Write([]string{c.Key, fmt.Sprint(c.Size), c.LastModified.UTC().Format(time.RFC3339)})
		}
	}

	rep, err := orphanreport.Analyze(ctx, r2, refs, opt)
	if cw != nil {
		cw.Flush()
	}
	if err != nil {
		fatal("pemindaian gagal: %v", err)
	}
	rep.Write(os.Stdout, opt.MinAge)
	if *csvPath != "" {
		fmt.Printf("\nDaftar lengkap kandidat: %s\n", *csvPath)
	}
}

func fatal(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "orphanreport: "+format+"\n", a...)
	os.Exit(1)
}
