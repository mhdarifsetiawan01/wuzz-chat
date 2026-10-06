// Package notify mengirim pemberitahuan moderasi (laporan baru) ke saluran luar seperti Telegram.
//
// Prinsip yang tidak boleh dilanggar:
//   - Pesan HANYA berisi metadata (jenis target, alasan, jumlah laporan) dan tautan ke halaman moderator. Tidak pernah
//     isi pesan/postingan, bukti pelapor, username, atau ID pengguna: saluran luar adalah pihak ketiga dan laporan bisa
//     menyangkut konten yang tidak boleh tersalin (mis. keselamatan anak).
//   - Pengiriman berjalan di latar belakang; gagal kirim tidak pernah menggagalkan pembuatan laporan.
//   - Saluran bersifat pluggable: cukup implementasikan Notifier (Telegram sekarang; email/webhook nanti).
package notify

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Kind adalah jenis peristiwa pemberitahuan.
type Kind string

const (
	KindReport Kind = "report" // satu laporan baru
	KindDigest Kind = "digest" // ringkasan laporan biasa yang tidak dikirim satu per satu
	KindTest   Kind = "test"   // uji konfigurasi saluran
)

// Event adalah isi pemberitahuan. Sengaja tanpa field konten pengguna.
type Event struct {
	Kind         Kind
	ReportID     string
	TargetType   string
	Reason       string
	HighPriority bool
	ReportCount  int       // jumlah laporan pada target yang sama, termasuk yang baru
	DigestCount  int       // jumlah laporan biasa yang diringkas (KindDigest)
	URL          string    // tautan ke halaman moderator; diisi Dispatcher
	At           time.Time // waktu peristiwa
}

// Notifier adalah satu saluran pengiriman.
type Notifier interface {
	// Name dipakai untuk log dan hasil uji (mis. "telegram").
	Name() string
	// Notify mengirim satu peristiwa. Kembalikan *PermanentError bila percobaan ulang percuma (token/chat salah),
	// *RetryAfterError bila penyedia meminta menunggu, error lain dianggap sementara.
	Notify(ctx context.Context, ev Event) error
}

// PermanentError menandai kegagalan yang tidak akan sembuh dengan mengulang.
type PermanentError struct{ Err error }

func (e *PermanentError) Error() string { return e.Err.Error() }
func (e *PermanentError) Unwrap() error { return e.Err }

// RetryAfterError menandai penyedia meminta menunggu (mis. HTTP 429).
type RetryAfterError struct {
	After time.Duration
	Err   error
}

func (e *RetryAfterError) Error() string { return e.Err.Error() }
func (e *RetryAfterError) Unwrap() error { return e.Err }

var reasonLabel = map[string]string{
	"spam": "Spam", "harassment": "Pelecehan", "hate": "Ujaran kebencian", "sexual": "Konten seksual",
	"violence": "Kekerasan", "illegal": "Ilegal", "impersonation": "Peniruan identitas", "other": "Lainnya",
}

var targetLabel = map[string]string{
	"message": "Pesan", "user": "Profil", "post": "Postingan", "comment": "Komentar", "group": "Grup",
}

// IsHighPriority menentukan alasan yang harus diberitahukan langsung (selaras dengan urutan di halaman moderator).
func IsHighPriority(reason string) bool { return reason == "sexual" || reason == "illegal" }

// FormatText menyusun teks polos (tanpa markup, sehingga tidak ada celah injeksi) yang sama untuk semua saluran.
func FormatText(ev Event) string {
	var b strings.Builder
	switch ev.Kind {
	case KindDigest:
		fmt.Fprintf(&b, "📋 Ringkasan laporan\n%d laporan biasa baru masuk dan tidak diberitahukan satu per satu.", ev.DigestCount)
	case KindTest:
		b.WriteString("✅ Tes notifikasi moderasi Wuzz Chat\nSaluran ini berfungsi. Laporan baru akan muncul di sini.")
	default:
		if ev.HighPriority {
			b.WriteString("🚨 Laporan PRIORITAS baru\n")
		} else {
			b.WriteString("🚩 Laporan baru\n")
		}
		fmt.Fprintf(&b, "Jenis: %s\nAlasan: %s", label(targetLabel, ev.TargetType), label(reasonLabel, ev.Reason))
		if ev.ReportCount > 1 {
			fmt.Fprintf(&b, "\nLaporan pada target ini: %d", ev.ReportCount)
		}
	}
	if ev.URL != "" {
		fmt.Fprintf(&b, "\nTinjau: %s", ev.URL)
	}
	return b.String()
}

func label(m map[string]string, k string) string {
	if v, ok := m[k]; ok {
		return v
	}
	return "Lainnya"
}

// ErrNoChannels dikembalikan SendTest bila tidak ada saluran yang aktif.
var ErrNoChannels = errors.New("tidak ada saluran notifikasi yang aktif")
