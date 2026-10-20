package entitlement

import (
	"testing"
	"time"
)

func TestEffectivePlan(t *testing.T) {
	now := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	future, past := now.Add(time.Hour), now.Add(-time.Hour)
	cases := []struct {
		name   string
		plan   string
		status string
		until  *time.Time
		want   string
	}{
		{"pro aktif tanpa batas waktu", PlanPro, StatusActive, nil, PlanPro},
		{"pro aktif belum lewat", PlanPro, StatusActive, &future, PlanPro},
		{"pro lewat masa berlaku", PlanPro, StatusActive, &past, PlanFree},
		{"pro tepat jatuh tempo", PlanPro, StatusActive, &now, PlanFree},
		{"pro dicabut", PlanPro, StatusRevoked, nil, PlanFree},
		{"paket tak dikenal", "platinum", StatusActive, nil, PlanFree},
		{"status kosong", PlanPro, "", nil, PlanFree},
	}
	for _, c := range cases {
		if got := EffectivePlan(c.plan, c.status, c.until, now); got != c.want {
			t.Errorf("%s: want %s, got %s", c.name, c.want, got)
		}
	}
}

func TestLimits(t *testing.T) {
	free, pro := LimitsFor(PlanFree), LimitsFor(PlanPro)
	if free.MaxActiveForums != 1 || pro.MaxActiveForums != 5 {
		t.Fatalf("batas forum salah: free=%d pro=%d", free.MaxActiveForums, pro.MaxActiveForums)
	}
	if !free.AllowsDuration(7) || free.AllowsDuration(30) {
		t.Error("Free hanya boleh 7 hari")
	}
	if !pro.AllowsDuration(7) || !pro.AllowsDuration(30) || pro.AllowsDuration(3) {
		t.Error("Pro boleh 7 dan 30 hari saja")
	}
	if LimitsFor("tak-dikenal").MaxActiveForums != free.MaxActiveForums {
		t.Error("paket tak dikenal harus diperlakukan Free")
	}
}

func TestAIQuotaAndPeriod(t *testing.T) {
	if LimitsFor(PlanFree).MonthlyAIJobs != 2 || LimitsFor(PlanPro).MonthlyAIJobs != 20 {
		t.Fatalf("kuota AI salah: free=%d pro=%d", LimitsFor(PlanFree).MonthlyAIJobs, LimitsFor(PlanPro).MonthlyAIJobs)
	}
	mid := time.Date(2026, 12, 31, 23, 59, 59, 0, time.UTC)
	if got := PeriodStart(mid); !got.Equal(time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("PeriodStart salah: %v", got)
	}
	if got := PeriodEnd(mid); !got.Equal(time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("PeriodEnd harus awal bulan berikutnya (lintas tahun): %v", got)
	}
	// Zona waktu lain dinormalkan ke UTC.
	wib := time.FixedZone("WIB", 7*3600)
	if got := PeriodStart(time.Date(2026, 11, 1, 3, 0, 0, 0, wib)); !got.Equal(time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("01 Nov 03:00 WIB masih Oktober UTC: %v", got)
	}
}
