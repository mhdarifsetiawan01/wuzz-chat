package store

import "strings"

// SubGroupDurationDays menerjemahkan nilai durasi dari klien menjadi jumlah hari masa aktif forum: 7 atau 30.
// ok=false bila nilainya tidak dikenal. Ini SATU-SATUNYA daftar durasi yang diterima; service (validasi awal) dan store
// (penghitungan expires_at) sama-sama memakainya agar keduanya tidak bisa berbeda lagi. Nilai kosong berarti default 7 hari.
func SubGroupDurationDays(duration string) (days int, ok bool) {
	switch strings.ToLower(strings.TrimSpace(duration)) {
	case "30_days", "30d", "1_month", "month":
		return 30, true
	case "7_days", "7d", "1_week", "week", "":
		return 7, true
	}
	return 0, false
}
