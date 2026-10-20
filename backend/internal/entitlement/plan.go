// Package entitlement mendefinisikan paket (plan) pengguna dan batasnya.
//
// Paket bersifat deklaratif dan sengaja tidak disimpan di database: hanya paket per-user (plan, status, masa berlaku)
// yang disimpan di tabel user_entitlements, sedangkan angka batas ada di sini supaya mudah disetel setelah masa uji.
// Tidak ada baris entitlement, entitlement dicabut, atau masa berlaku lewat = paket Free.
package entitlement

import (
	"strings"
	"time"
)

// Paket yang dikenal. Business ditunda (lihat docs/plans/backlog/FORUM_MONETIZATION_PLAN.md).
const (
	PlanFree = "free"
	PlanPro  = "pro"
)

// Status baris entitlement.
const (
	StatusActive  = "active"
	StatusRevoked = "revoked"
)

// Sumber pemberian paket.
const (
	SourceManual      = "manual"
	SourceGrandfather = "grandfather"
)

// DefaultTenant adalah tenant aplikasi publik. Batas paket hanya ditegakkan di tenant ini; tenant B2B belum punya
// paket (Business ditunda) sehingga tidak dibatasi.
const DefaultTenant = "default"

// Limits adalah batas sebuah paket.
type Limits struct {
	MaxActiveForums int   // jumlah forum aktif yang boleh dibuat satu user
	DurationDays    []int // durasi forum yang boleh dipilih
}

var limitsByPlan = map[string]Limits{
	PlanFree: {MaxActiveForums: 1, DurationDays: []int{7}},
	PlanPro:  {MaxActiveForums: 5, DurationDays: []int{7, 30}},
}

// IsValidPlan true bila paket dikenal.
func IsValidPlan(plan string) bool {
	_, ok := limitsByPlan[plan]
	return ok
}

// LimitsFor mengembalikan batas paket; paket tak dikenal diperlakukan Free.
func LimitsFor(plan string) Limits {
	if l, ok := limitsByPlan[plan]; ok {
		return l
	}
	return limitsByPlan[PlanFree]
}

// AllowsDuration true bila paket boleh membuat forum dengan durasi (hari) ini.
func (l Limits) AllowsDuration(days int) bool {
	for _, d := range l.DurationDays {
		if d == days {
			return true
		}
	}
	return false
}

// EffectivePlan menentukan paket yang berlaku: baris tidak ada, dicabut, atau kedaluwarsa = Free.
func EffectivePlan(plan, status string, validUntil *time.Time, now time.Time) string {
	if !IsValidPlan(plan) || strings.TrimSpace(status) != StatusActive {
		return PlanFree
	}
	if validUntil != nil && !validUntil.After(now) {
		return PlanFree
	}
	return plan
}
