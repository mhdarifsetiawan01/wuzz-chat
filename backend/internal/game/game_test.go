package game

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestSizeForDate(t *testing.T) {
	// 2026-10-26 adalah Senin.
	want := []int{6, 6, 7, 7, 8, 8, 9}
	for i, w := range want {
		d := time.Date(2026, 10, 26+i, 15, 0, 0, 0, time.UTC)
		if got := SizeForDate(d); got != w {
			t.Errorf("%s: ukuran %d, mau %d", d.Weekday(), got, w)
		}
	}
}

func TestSeedForDate_IgnoresTimeOfDay(t *testing.T) {
	a := SeedForDate(time.Date(2026, 10, 25, 0, 0, 1, 0, time.UTC))
	b := SeedForDate(time.Date(2026, 10, 25, 23, 59, 59, 0, time.UTC))
	if a != b || a != 20261025 {
		t.Fatalf("seed %d dan %d, mau 20261025", a, b)
	}
}

func TestGenerate_InvalidSize(t *testing.T) {
	for _, n := range []int{-1, 0, 5, 10} {
		if _, err := Generate(n, 1); !errors.Is(err, ErrInvalidSize) {
			t.Errorf("ukuran %d: err %v, mau ErrInvalidSize", n, err)
		}
	}
}

func TestGenerate_UniqueSolutionAllSizes(t *testing.T) {
	for size := MinGridSize; size <= MaxGridSize; size++ {
		for seed := range int64(20) {
			seed++
			p, err := Generate(size, seed)
			if err != nil {
				t.Fatalf("size %d seed %d: %v", size, seed, err)
			}
			if err := validateGrid(p.Size, p.Regions); err != nil {
				t.Fatalf("size %d seed %d: grid tidak sah: %v", size, seed, err)
			}
			n, err := CountSolutions(p.Size, p.Regions, 5)
			if err != nil || n != 1 {
				t.Fatalf("size %d seed %d: %d solusi (err %v), mau tepat 1", size, seed, n, err)
			}
			got, err := Solve(p.Size, p.Regions)
			if err != nil || !reflect.DeepEqual(got, p.Solution) {
				t.Fatalf("size %d seed %d: penyelesai %v != solusi %v", size, seed, got, p.Solution)
			}
			solved, err := CheckPlacement(p.Size, p.Regions, Placement(p.Solution))
			if err != nil || !solved {
				t.Fatalf("size %d seed %d: solusi sendiri ditolak (err %v)", size, seed, err)
			}
		}
	}
}

func TestGenerate_Deterministic(t *testing.T) {
	for size := MinGridSize; size <= MaxGridSize; size++ {
		a, err := Generate(size, 42)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := Generate(size, 42)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("size %d: dua pemanggilan seed sama menghasilkan puzzle berbeda", size)
		}
		c, _ := Generate(size, 43)
		if reflect.DeepEqual(a.Regions, c.Regions) {
			t.Errorf("size %d: seed berbeda menghasilkan peta sama", size)
		}
	}
}

func TestGenerateForDate_NextFourWeeks(t *testing.T) {
	start := time.Date(2026, 10, 26, 0, 0, 0, 0, time.UTC)
	for i := 0; i < 28; i++ {
		d := start.AddDate(0, 0, i)
		p, err := GenerateForDate(d)
		if err != nil {
			t.Fatalf("%s: %v", d.Format("2006-01-02"), err)
		}
		if p.Size != SizeForDate(d) {
			t.Errorf("%s: ukuran %d, mau %d", d.Format("2006-01-02"), p.Size, SizeForDate(d))
		}
		if n, _ := CountSolutions(p.Size, p.Regions, 2); n != 1 {
			t.Errorf("%s: %d solusi", d.Format("2006-01-02"), n)
		}
	}
}

func TestGenerate_SolutionNeverSerialized(t *testing.T) {
	p, err := Generate(6, 7)
	if err != nil {
		t.Fatal(err)
	}
	if tag, _ := reflect.TypeOf(*p).FieldByName("Solution"); tag.Tag.Get("json") != "-" {
		t.Fatal("Solution harus bertag json:\"-\" agar tidak bocor ke klien")
	}
}

func TestValidateGrid(t *testing.T) {
	good := [][]int{
		{0, 0, 1, 1, 1, 1},
		{0, 2, 2, 1, 1, 1},
		{0, 2, 3, 3, 4, 4},
		{0, 2, 3, 5, 5, 4},
		{0, 2, 3, 5, 5, 4},
		{0, 2, 3, 3, 4, 4},
	}
	if err := validateGrid(6, good); err != nil {
		t.Fatalf("grid sah ditolak: %v", err)
	}

	cases := map[string]struct {
		size int
		g    [][]int
		want error
	}{
		"ukuran kecil": {5, make([][]int, 5), ErrInvalidSize},
		"baris kurang": {6, good[:5], ErrInvalidRegions},
		"id di luar": {6, func() [][]int {
			g := cloneGrid(good)
			g[0][0] = 9
			return g
		}(), ErrInvalidRegions},
		"wilayah hilang": {6, func() [][]int {
			g := cloneGrid(good)
			for r := range g {
				for c := range g[r] {
					if g[r][c] == 5 {
						g[r][c] = 3
					}
				}
			}
			return g
		}(), ErrInvalidRegions},
		"wilayah terputus": {6, func() [][]int {
			g := cloneGrid(good)
			g[5][0] = 4 // sel terpisah dari wilayah 4 lain
			return g
		}(), ErrInvalidRegions},
	}
	for name, tc := range cases {
		if err := validateGrid(tc.size, tc.g); !errors.Is(err, tc.want) {
			t.Errorf("%s: err %v, mau %v", name, err, tc.want)
		}
	}
}

func TestCountSolutions_AmbiguousAndLimit(t *testing.T) {
	// Wilayah berupa 6 baris horizontal: tiap baris otomatis satu wilayah, jadi
	// banyak penempatan sah (tidak unik). Hitungan harus berhenti di limit.
	rows := make([][]int, 6)
	for r := range rows {
		rows[r] = []int{r, r, r, r, r, r}
	}
	if n, err := CountSolutions(6, rows, 2); err != nil || n != 2 {
		t.Fatalf("limit 2: n=%d err=%v, mau 2", n, err)
	}
	full, err := CountSolutions(6, rows, 100000)
	if err != nil || full <= 2 {
		t.Fatalf("tanpa limit efektif: n=%d err=%v, mau > 2", full, err)
	}
}

func TestCountSolutions_NoSolutionGrid(t *testing.T) {
	// Satu wilayah besar (0) memuat hampir semua sel; wilayah 1..5 hanya satu sel
	// di pojok yang sama-sama berdekatan, sehingga tidak ada penempatan sah.
	g := make([][]int, 6)
	for r := range g {
		g[r] = []int{0, 0, 0, 0, 0, 0}
	}
	g[0][0], g[0][1], g[1][0], g[1][1], g[0][2] = 1, 2, 3, 4, 5
	// Wilayah 1..5 ada di pojok kiri-atas; semuanya bersentuhan satu sama lain
	// sehingga lima bintang tidak mungkin tersebar tanpa bersentuhan.
	n, err := CountSolutions(6, g, 10)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("n=%d, mau 0", n)
	}
}

func TestCheckPlacement(t *testing.T) {
	p, err := Generate(7, 99)
	if err != nil {
		t.Fatal(err)
	}
	sol := Placement(p.Solution)

	if ok, err := CheckPlacement(p.Size, p.Regions, sol); !ok || err != nil {
		t.Fatalf("solusi benar: ok=%v err=%v", ok, err)
	}

	partial := append(Placement(nil), sol...)
	partial[3] = NoStar
	if ok, err := CheckPlacement(p.Size, p.Regions, partial); ok || err != nil {
		t.Errorf("belum lengkap: ok=%v err=%v, mau false/nil", ok, err)
	}

	sameCol := append(Placement(nil), sol...)
	sameCol[1] = sameCol[0]
	if ok, _ := CheckPlacement(p.Size, p.Regions, sameCol); ok {
		t.Error("dua bintang sekolom diterima")
	}

	touching := append(Placement(nil), sol...)
	touching[1] = touching[0] + 1
	if touching[1] >= p.Size {
		touching[1] = touching[0] - 1
	}
	if ok, _ := CheckPlacement(p.Size, p.Regions, touching); ok {
		t.Error("bintang bersentuhan diagonal diterima")
	}

	wrongLen := sol[:len(sol)-1]
	if _, err := CheckPlacement(p.Size, p.Regions, wrongLen); !errors.Is(err, ErrInvalidPlacement) {
		t.Errorf("panjang salah: err %v", err)
	}
	outside := append(Placement(nil), sol...)
	outside[0] = p.Size
	if _, err := CheckPlacement(p.Size, p.Regions, outside); !errors.Is(err, ErrInvalidPlacement) {
		t.Errorf("kolom di luar grid: err %v", err)
	}
	negative := append(Placement(nil), sol...)
	negative[0] = -2
	if _, err := CheckPlacement(p.Size, p.Regions, negative); !errors.Is(err, ErrInvalidPlacement) {
		t.Errorf("kolom negatif selain NoStar: err %v", err)
	}
}

func TestCheckPlacement_SameRegionRejected(t *testing.T) {
	p, err := Generate(6, 5)
	if err != nil {
		t.Fatal(err)
	}
	// Cari dua baris tidak berdekatan yang jika dipindah ke wilayah sama melanggar aturan.
	sol := Placement(p.Solution)
	r0Region := p.Regions[0][sol[0]]
	for c := 0; c < p.Size; c++ {
		if p.Regions[3][c] == r0Region && c != sol[3] {
			bad := append(Placement(nil), sol...)
			bad[3] = c
			if ok, _ := CheckPlacement(p.Size, p.Regions, bad); ok {
				t.Fatal("dua bintang satu wilayah diterima")
			}
			return
		}
	}
	t.Skip("tidak ada sel wilayah baris-0 pada baris 3 untuk seed ini")
}

func BenchmarkGenerate9(b *testing.B) {
	i := 0
	for b.Loop() {
		i++
		if _, err := Generate(9, int64(i)); err != nil {
			b.Fatal(err)
		}
	}
}

func cloneGrid(g [][]int) [][]int {
	out := make([][]int, len(g))
	for i := range g {
		out[i] = append([]int(nil), g[i]...)
	}
	return out
}
