package push

import (
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestAllowedRecipients(t *testing.T) {
	s := &Service{}
	in := []string{"a", "b", "c"}

	// Tanpa filter: semua penerima lolos apa adanya.
	if got := s.allowedRecipients(in); !reflect.DeepEqual(got, in) {
		t.Fatalf("tanpa filter harus apa adanya, dapat %v", got)
	}

	// Dengan filter: hanya yang diizinkan (akun beku tidak menerima notifikasi).
	s.SetRecipientFilter(func(ids []string) []string {
		var out []string
		for _, id := range ids {
			if id != "b" {
				out = append(out, id)
			}
		}
		return out
	})
	if got := s.allowedRecipients(in); !reflect.DeepEqual(got, []string{"a", "c"}) {
		t.Fatalf("filter harus membuang b, dapat %v", got)
	}

	// Filter bisa dicabut kembali.
	s.SetRecipientFilter(nil)
	if got := s.allowedRecipients(in); !reflect.DeepEqual(got, in) {
		t.Fatalf("setelah filter dicabut harus apa adanya, dapat %v", got)
	}
}

// Semua jalur pengiriman push harus melewati filter: tidak boleh ada pemanggilan langsung yang melewatinya.
func TestPushService_AllRecipientLookupsAreFiltered(t *testing.T) {
	src, err := os.ReadFile("push.go")
	if err != nil {
		t.Fatal(err)
	}
	code := string(src)
	total := strings.Count(code, "GetPushSubscriptionsForRecipients(")
	filtered := strings.Count(code, "GetPushSubscriptionsForRecipients(s.allowedRecipients(")
	if total == 0 || total != filtered {
		t.Fatalf("setiap GetPushSubscriptionsForRecipients harus memakai s.allowedRecipients: total=%d terfilter=%d", total, filtered)
	}
}
