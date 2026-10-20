package store

import "testing"

func TestSubGroupDurationDays(t *testing.T) {
	for in, want := range map[string]int{
		"": 7, "7d": 7, "7_days": 7, "1_week": 7, "week": 7, " WEEK ": 7, "7D": 7,
		"30d": 30, "30_days": 30, "1_month": 30, "month": 30, " Month ": 30,
	} {
		if got, ok := SubGroupDurationDays(in); !ok || got != want {
			t.Errorf("%q: want %d, got %d ok=%v", in, want, got, ok)
		}
	}
	// Durasi pendek pernah diterima service tetapi selalu ditolak store; kini ditolak di mana pun.
	for _, in := range []string{"1h", "3h", "6h", "12h", "24h", "3d", "5h", "999_years", "7", "0", "-7d", "7 d", "tujuh"} {
		if got, ok := SubGroupDurationDays(in); ok {
			t.Errorf("%q harus ditolak, dapat %d", in, got)
		}
	}
}
