package api

import (
	"encoding/json"
	"net/http"
	"sync"
	"testing"

	"github.com/bms-del112/wuzz-chat/internal/notify"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

type recordingNotifier struct {
	mu     sync.Mutex
	events []notify.Event
}

func (r *recordingNotifier) Enqueue(ev notify.Event) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, ev)
}

func TestCreatorApplicationHTTP_PaidOffIs404(t *testing.T) {
	x, _, u, _ := setupStarsHTTP(t, true, false, false)
	if rr := x.do(http.MethodGet, "/api/me/stars/creator-application", u["tamu_sh"], nil, nil); rr.Code != http.StatusNotFound {
		t.Fatalf("grup berbayar mati: want 404, got %d", rr.Code)
	}
}

func TestCreatorApplicationHTTP_Flow(t *testing.T) {
	x, _, u, _ := setupStarsHTTP(t, true, true, false)
	rec := &recordingNotifier{}
	x.stars.SetNotifier(rec)
	path := "/api/me/stars/creator-application"

	rr := x.do(http.MethodGet, path, u["tamu_sh"], nil, nil)
	var st store.CreatorApplicationState
	if rr.Code != http.StatusOK || json.Unmarshal(rr.Body.Bytes(), &st) != nil || !st.CanApply {
		t.Fatalf("status awal: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodPost, path, u["tamu_sh"], map[string]string{"message": "x"}, nil); rr.Code != http.StatusBadRequest {
		t.Fatalf("pesan pendek: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodPost, path, u["tamu_sh"], map[string]string{"message": "Grup diskusi saham harian"}, nil); rr.Code != http.StatusCreated {
		t.Fatalf("ajukan: %d %s", rr.Code, rr.Body.String())
	}
	if len(rec.events) != 1 || rec.events[0].Kind != notify.KindCreatorApplication {
		t.Fatalf("notifikasi: %+v", rec.events)
	}
	if rr := x.do(http.MethodPost, path, u["tamu_sh"], map[string]string{"message": "Grup diskusi saham harian"}, nil); rr.Code != http.StatusConflict {
		t.Fatalf("ajukan dua kali: %d %s", rr.Code, rr.Body.String())
	}

	// Admin: bukan admin ditolak, admin melihat antrean lalu menolak; pemohon kena jeda 429.
	if rr := x.do(http.MethodGet, "/api/admin/stars/creator-applications", u["tamu_sh"], nil, nil); rr.Code != http.StatusForbidden {
		t.Fatalf("bukan admin: %d", rr.Code)
	}
	rr = x.do(http.MethodGet, "/api/admin/stars/creator-applications?status=pending", u["staf_sh"], nil, nil)
	var list struct {
		Applications []store.CreatorApplication `json:"applications"`
	}
	if rr.Code != http.StatusOK || json.Unmarshal(rr.Body.Bytes(), &list) != nil || len(list.Applications) != 1 {
		t.Fatalf("antrean: %d %s", rr.Code, rr.Body.String())
	}
	id := list.Applications[0].ID
	if rr := x.do(http.MethodPost, "/api/admin/stars/creator-applications/"+id+"/decide", u["staf_sh"], map[string]any{"approve": false, "note": "Belum cocok"}, nil); rr.Code != http.StatusOK {
		t.Fatalf("tolak: %d %s", rr.Code, rr.Body.String())
	}
	rr = x.do(http.MethodPost, path, u["tamu_sh"], map[string]string{"message": "Grup diskusi saham harian"}, nil)
	if rr.Code != http.StatusTooManyRequests || rr.Header().Get("Retry-After") == "" {
		t.Fatalf("jeda: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodPost, "/api/admin/stars/creator-applications/"+id+"/decide", u["staf_sh"], map[string]any{"approve": true}, nil); rr.Code != http.StatusConflict {
		t.Fatalf("putuskan ulang: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodPost, "/api/admin/stars/creator-applications/tidak-ada/decide", u["staf_sh"], map[string]any{"approve": true}, nil); rr.Code != http.StatusNotFound {
		t.Fatalf("tidak ada: %d %s", rr.Code, rr.Body.String())
	}

	// Disetujui (pemohon lain) = langsung mitra kreator.
	if rr := x.do(http.MethodPost, path, u["staf_sh"], map[string]string{"message": "Grup kelas desain untuk pemula"}, nil); rr.Code != http.StatusCreated {
		t.Fatalf("ajukan staf: %d %s", rr.Code, rr.Body.String())
	}
	rr = x.do(http.MethodGet, "/api/admin/stars/creator-applications?status=pending", u["staf_sh"], nil, nil)
	_ = json.Unmarshal(rr.Body.Bytes(), &list)
	if rr := x.do(http.MethodPost, "/api/admin/stars/creator-applications/"+list.Applications[0].ID+"/decide", u["staf_sh"], map[string]any{"approve": true}, nil); rr.Code != http.StatusOK {
		t.Fatalf("setujui: %d %s", rr.Code, rr.Body.String())
	}
	rr = x.do(http.MethodGet, path, u["staf_sh"], nil, nil)
	if json.Unmarshal(rr.Body.Bytes(), &st) != nil || !st.IsCreator {
		t.Fatalf("setelah disetujui: %s", rr.Body.String())
	}
}

func TestAdminPurchasesHTTP(t *testing.T) {
	x, _, u, _ := setupStarsHTTP(t, true, true, false)
	rr := x.do(http.MethodGet, "/api/admin/stars/purchases?include_test=1", u["staf_sh"], nil, nil)
	var res struct {
		Purchases []store.AdminPlayPurchase `json:"purchases"`
		Summary   store.PlayPurchaseSummary `json:"summary"`
	}
	if rr.Code != http.StatusOK || json.Unmarshal(rr.Body.Bytes(), &res) != nil || res.Purchases == nil {
		t.Fatalf("daftar: %d %s", rr.Code, rr.Body.String())
	}
	if rr := x.do(http.MethodGet, "/api/admin/stars/purchases?state=aneh", u["staf_sh"], nil, nil); rr.Code != http.StatusBadRequest {
		t.Fatalf("state aneh: %d", rr.Code)
	}
	if rr := x.do(http.MethodGet, "/api/admin/stars/purchases", u["tamu_sh"], nil, nil); rr.Code != http.StatusForbidden {
		t.Fatalf("bukan admin: %d", rr.Code)
	}
}
