package game

// validateGrid memeriksa ukuran dan bentuk peta wilayah: persegi, nomor wilayah
// 0..size-1, setiap nomor dipakai, dan setiap wilayah terhubung (4 arah).
func validateGrid(size int, regions [][]int) error {
	if size < MinGridSize || size > MaxGridSize {
		return ErrInvalidSize
	}
	if len(regions) != size {
		return ErrInvalidRegions
	}
	count := make([]int, size)
	for _, row := range regions {
		if len(row) != size {
			return ErrInvalidRegions
		}
		for _, id := range row {
			if id < 0 || id >= size {
				return ErrInvalidRegions
			}
			count[id]++
		}
	}
	for id := 0; id < size; id++ {
		if count[id] == 0 {
			return ErrInvalidRegions
		}
	}
	if !regionsConnected(size, regions, count) {
		return ErrInvalidRegions
	}
	return nil
}

// regionsConnected memastikan tiap wilayah membentuk satu komponen terhubung.
func regionsConnected(size int, regions [][]int, count []int) bool {
	seen := make([][]bool, size)
	for i := range seen {
		seen[i] = make([]bool, size)
	}
	visited := make([]int, size)
	dirs := [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
	started := make([]bool, size)
	for r := 0; r < size; r++ {
		for c := 0; c < size; c++ {
			id := regions[r][c]
			if started[id] {
				continue
			}
			started[id] = true
			stack := [][2]int{{r, c}}
			seen[r][c] = true
			for len(stack) > 0 {
				cur := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				visited[id]++
				for _, d := range dirs {
					nr, nc := cur[0]+d[0], cur[1]+d[1]
					if nr < 0 || nc < 0 || nr >= size || nc >= size || seen[nr][nc] || regions[nr][nc] != id {
						continue
					}
					seen[nr][nc] = true
					stack = append(stack, [2]int{nr, nc})
				}
			}
		}
	}
	for id := 0; id < size; id++ {
		if visited[id] != count[id] {
			return false
		}
	}
	return true
}

// CountSolutions menghitung solusi sah sampai batas limit (berhenti dini).
// Puzzle sah bila hasilnya tepat 1. Aturan: tepat satu bintang per baris, kolom,
// dan wilayah; dua bintang tidak boleh bersentuhan, termasuk secara diagonal.
func CountSolutions(size int, regions [][]int, limit int) (int, error) {
	if err := validateGrid(size, regions); err != nil {
		return 0, err
	}
	return countSolutions(size, regions, limit), nil
}

// Solve mengembalikan satu solusi (kolom per baris) atau nil bila tidak ada.
func Solve(size int, regions [][]int) ([]int, error) {
	if err := validateGrid(size, regions); err != nil {
		return nil, err
	}
	var found []int
	s := newSearch(size, regions, 1)
	s.onSolution = func(cols []int) { found = append([]int(nil), cols...) }
	s.run(0)
	return found, nil
}

type search struct {
	size       int
	regions    [][]int
	limit      int
	count      int
	cols       []int
	colUsed    []bool
	regionUsed []bool
	onSolution func(cols []int)
}

func newSearch(size int, regions [][]int, limit int) *search {
	return &search{
		size:       size,
		regions:    regions,
		limit:      limit,
		cols:       make([]int, size),
		colUsed:    make([]bool, size),
		regionUsed: make([]bool, size),
	}
}

func countSolutions(size int, regions [][]int, limit int) int {
	s := newSearch(size, regions, limit)
	s.run(0)
	return s.count
}

// run mencoba menaruh bintang baris demi baris. Karena baris berurutan, aturan
// "tidak bersentuhan" cukup diperiksa terhadap kolom pada baris sebelumnya.
func (s *search) run(row int) {
	if s.count >= s.limit {
		return
	}
	if row == s.size {
		s.count++
		if s.onSolution != nil {
			s.onSolution(s.cols)
		}
		return
	}
	for c := 0; c < s.size; c++ {
		if s.colUsed[c] {
			continue
		}
		if row > 0 && abs(c-s.cols[row-1]) <= 1 {
			continue
		}
		region := s.regions[row][c]
		if s.regionUsed[region] {
			continue
		}
		s.cols[row] = c
		s.colUsed[c] = true
		s.regionUsed[region] = true
		s.run(row + 1)
		s.colUsed[c] = false
		s.regionUsed[region] = false
		if s.count >= s.limit {
			return
		}
	}
}

// CheckPlacement memeriksa jawaban pemain terhadap aturan (bukan terhadap solusi
// tersimpan). Mengembalikan solved=true hanya bila semua baris terisi dan sah.
// Placement tidak sah secara struktur (panjang salah, kolom di luar grid)
// menghasilkan ErrInvalidPlacement.
func CheckPlacement(size int, regions [][]int, p Placement) (solved bool, err error) {
	if size < MinGridSize || size > MaxGridSize || len(regions) != size {
		return false, ErrInvalidSize
	}
	if len(p) != size {
		return false, ErrInvalidPlacement
	}
	colUsed := make([]bool, size)
	regionUsed := make([]bool, size)
	filled := 0
	for r, c := range p {
		if c == NoStar {
			continue
		}
		if c < 0 || c >= size {
			return false, ErrInvalidPlacement
		}
		filled++
		region := regions[r][c]
		if colUsed[c] || regionUsed[region] {
			return false, nil
		}
		if r > 0 && p[r-1] != NoStar && abs(c-p[r-1]) <= 1 {
			return false, nil
		}
		colUsed[c] = true
		regionUsed[region] = true
	}
	return filled == size, nil
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
