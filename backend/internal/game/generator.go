package game

import (
	"math/rand/v2"
	"time"
)

const (
	// maxGenerateRestarts membatasi berapa kali mulai ulang dari peta acak baru.
	maxGenerateRestarts = 200
	// maxRefineSteps membatasi langkah perbaikan lokal per peta awal.
	maxRefineSteps = 4000
	// solutionCountCap membatasi penghitungan solusi saat perbaikan (cukup untuk
	// membandingkan "lebih banyak/sedikit" tanpa menghitung semuanya).
	solutionCountCap = 64
	// minRegionSize mencegah wilayah satu-dua sel yang membocorkan letak bintang sejak awal.
	minRegionSize = 3
	// balancedGrowthPercent: peluang tiap langkah tumbuh memilih wilayah terkecil (bukan acak murni),
	// supaya ukuran wilayah lebih seimbang dan tidak ada satu wilayah raksasa.
	balancedGrowthPercent = 75
)

// SizeForDate menentukan ukuran grid dari hari dalam minggu (UTC):
// Senin-Selasa 6, Rabu-Kamis 7, Jumat-Sabtu 8, Minggu 9.
func SizeForDate(date time.Time) int {
	switch date.UTC().Weekday() {
	case time.Monday, time.Tuesday:
		return 6
	case time.Wednesday, time.Thursday:
		return 7
	case time.Friday, time.Saturday:
		return 8
	default:
		return 9
	}
}

// SeedForDate menurunkan seed deterministik dari tanggal kalender UTC.
func SeedForDate(date time.Time) int64 {
	y, m, d := date.UTC().Date()
	return int64(y)*10000 + int64(m)*100 + int64(d)
}

// GenerateForDate membuat puzzle harian: ukuran dan seed ditentukan tanggal,
// sehingga semua pengguna (dan semua pemanggilan) mendapat puzzle yang sama.
func GenerateForDate(date time.Time) (*Puzzle, error) {
	return Generate(SizeForDate(date), SeedForDate(date))
}

// Generate membuat puzzle ukuran size dari seed. Hasilnya deterministik untuk
// pasangan (size, seed) yang sama dan dijamin memiliki tepat satu solusi.
func Generate(size int, seed int64) (*Puzzle, error) {
	if size < MinGridSize || size > MaxGridSize {
		return nil, ErrInvalidSize
	}
	rng := rand.New(rand.NewPCG(uint64(seed), 0x57555a5a47524944)) // "WUZZGRID"

	for range maxGenerateRestarts {
		stars := randomStars(rng, size)
		regions := growRegions(rng, size, stars)
		if refineToUnique(rng, size, regions, stars) && smallestRegion(size, regions) >= minRegionSize {
			return &Puzzle{Size: size, Regions: regions, Solution: stars, Seed: seed}, nil
		}
	}
	return nil, ErrGenerationFailed
}

// refineToUnique memperbaiki peta secara lokal: memindahkan satu sel perbatasan
// ke wilayah tetangganya (sel bintang tidak dipindah, wilayah harus tetap
// terhubung) dan menerima perubahan selama jumlah solusi tidak bertambah.
// Mengembalikan true bila akhirnya tepat satu solusi (yaitu penempatan stars).
func refineToUnique(rng *rand.Rand, size int, regions [][]int, stars []int) bool {
	isStar := func(r, c int) bool { return stars[r] == c }
	count := countSolutions(size, regions, solutionCountCap)
	dirs := [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
	sizes := regionSizes(size, regions)

	for step := 0; step < maxRefineSteps && count > 1; step++ {
		r, c := rng.IntN(size), rng.IntN(size)
		if isStar(r, c) {
			continue
		}
		d := dirs[rng.IntN(len(dirs))]
		nr, nc := r+d[0], c+d[1]
		if nr < 0 || nc < 0 || nr >= size || nc >= size || regions[nr][nc] == regions[r][c] {
			continue
		}
		old := regions[r][c]
		if sizes[old] <= minRegionSize {
			continue // memindahkan sel ini membuat wilayah asalnya terlalu kecil
		}
		regions[r][c] = regions[nr][nc]
		if !gridIsValid(size, regions) {
			regions[r][c] = old
			continue
		}
		next := countSolutions(size, regions, solutionCountCap)
		if next > count {
			regions[r][c] = old
			continue
		}
		sizes[old]--
		sizes[regions[r][c]]++
		count = next
	}
	return count == 1
}

// gridIsValid hanya dipakai pembuat: semua wilayah masih ada dan terhubung.
func gridIsValid(size int, regions [][]int) bool {
	return validateGrid(size, regions) == nil
}

// randomStars memilih penempatan bintang sah (satu per baris/kolom, tidak
// bersentuhan) lewat backtracking dengan urutan kolom acak.
func randomStars(rng *rand.Rand, size int) []int {
	cols := make([]int, size)
	used := make([]bool, size)
	var place func(row int) bool
	place = func(row int) bool {
		if row == size {
			return true
		}
		for _, c := range rng.Perm(size) {
			if used[c] || (row > 0 && abs(c-cols[row-1]) <= 1) {
				continue
			}
			cols[row] = c
			used[c] = true
			if place(row + 1) {
				return true
			}
			used[c] = false
		}
		return false
	}
	place(0)
	return cols
}

// growRegions menumbuhkan size wilayah terhubung dari sel bintang. Tiap langkah
// memilih sel kosong acak yang bertetangga dengan wilayah, lalu menggabungkannya
// ke salah satu tetangganya, sehingga wilayah selalu terhubung.
func growRegions(rng *rand.Rand, size int, stars []int) [][]int {
	regions := make([][]int, size)
	for r := range regions {
		regions[r] = make([]int, size)
		for c := range regions[r] {
			regions[r][c] = -1
		}
	}
	ids := rng.Perm(size)
	sizes := make([]int, size)
	for r, c := range stars {
		regions[r][c] = ids[r]
		sizes[ids[r]] = 1
	}

	dirs := [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
	for remaining := size*size - size; remaining > 0; remaining-- {
		type cand struct{ r, c, region int }
		var cands []cand
		for r := range size {
			for c := range size {
				if regions[r][c] != -1 {
					continue
				}
				for _, d := range dirs {
					nr, nc := r+d[0], c+d[1]
					if nr < 0 || nc < 0 || nr >= size || nc >= size || regions[nr][nc] == -1 {
						continue
					}
					cands = append(cands, cand{r, c, regions[nr][nc]})
				}
			}
		}
		if rng.IntN(100) < balancedGrowthPercent {
			smallest := cands[0].region
			for _, cd := range cands {
				if sizes[cd.region] < sizes[smallest] {
					smallest = cd.region
				}
			}
			kept := cands[:0:0]
			for _, cd := range cands {
				if sizes[cd.region] == sizes[smallest] {
					kept = append(kept, cd)
				}
			}
			cands = kept
		}
		pick := cands[rng.IntN(len(cands))]
		regions[pick.r][pick.c] = pick.region
		sizes[pick.region]++
	}
	return regions
}

// regionSizes menghitung jumlah sel tiap wilayah (indeks = nomor wilayah).
func regionSizes(size int, regions [][]int) []int {
	sizes := make([]int, size)
	for _, row := range regions {
		for _, id := range row {
			sizes[id]++
		}
	}
	return sizes
}

// smallestRegion mengembalikan jumlah sel wilayah terkecil.
func smallestRegion(size int, regions [][]int) int {
	smallest := size * size
	for _, n := range regionSizes(size, regions) {
		if n < smallest {
			smallest = n
		}
	}
	return smallest
}
