// Package game berisi domain game harian Wuzz Grid (puzzle grid logika).
// Berkas pada tahap 1 murni logika: tanpa DB, tanpa jaringan, deterministik.
package game

import "errors"

// ─── Domain Sentinel Errors ──────────────────────────────────────────────────

var (
	ErrInvalidSize      = errors.New("ukuran grid harus antara 6 dan 9")
	ErrInvalidRegions   = errors.New("peta wilayah tidak valid")
	ErrInvalidPlacement = errors.New("penempatan bintang tidak valid")
	ErrGenerationFailed = errors.New("gagal membuat puzzle dengan solusi unik")
)

// ─── Konstanta ───────────────────────────────────────────────────────────────

const (
	MinGridSize = 6
	MaxGridSize = 9

	// NoStar menandai baris yang belum berisi bintang pada Placement.
	NoStar = -1
)

// ─── Domain Models ───────────────────────────────────────────────────────────

// Puzzle adalah satu teka-teki harian. Regions[r][c] berisi nomor wilayah
// (0..Size-1) untuk sel pada baris r, kolom c. Solution[r] adalah kolom bintang
// pada baris r dan TIDAK boleh dikirim ke klien.
type Puzzle struct {
	Size     int     `json:"size"`
	Regions  [][]int `json:"regions"`
	Solution []int   `json:"-"`
	Seed     int64   `json:"seed"`
}

// Placement adalah jawaban pemain: Placement[r] = kolom bintang pada baris r,
// atau NoStar bila baris itu kosong.
type Placement []int
