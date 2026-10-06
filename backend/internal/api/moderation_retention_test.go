package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

func (e *modEnv) reportRow(id string) (status string, evidence, details string, closedAt, purgedAt *time.Time, hold bool) {
	var c, p *time.Time
	err := e.sqlStore.DB().QueryRow(e.rb(`SELECT status, evidence, details, closed_at, evidence_purged_at, evidence_hold FROM content_reports WHERE id = ?`), id).
		Scan(&status, &evidence, &details, &c, &p, &hold)
	if err != nil {
		e.t.Fatalf("baca laporan %s: %v", id, err)
	}
	return status, evidence, details, c, p, hold
}

func (e *modEnv) backdate(id string, closedDaysAgo, createdDaysAgo int) {
	closed := time.Now().UTC().AddDate(0, 0, -closedDaysAgo)
	created := time.Now().UTC().AddDate(0, 0, -createdDaysAgo)
	e.exec(`UPDATE content_reports SET closed_at = ?, created_at = ? WHERE id = ?`, closed, created, id)
}

func (e *modEnv) mkReport(reporter *store.User, target, evidence, details string) string {
	r := &store.ContentReport{TenantID: "default", ReporterID: reporter.ID, TargetType: "post", TargetID: target, Reason: "spam", Evidence: evidence, Details: details}
	if err := e.reports.Create(context.Background(), r); err != nil {
		e.t.Fatal(err)
	}
	return r.ID
}

func TestRetention_ClosedAtFollowsStatus(t *testing.T) {
	e := newModEnv(t)
	rep, mod := e.user("rep"), e.user("mod")
	tok := e.token(mod, "default", "wuzz_moderator")
	id := e.mkReport(rep, "p1", "bukti", "rincian")
	if _, _, _, c, _, _ := e.reportRow(id); c != nil {
		t.Fatal("laporan terbuka tidak boleh punya closed_at")
	}
	if w := e.action(tok, id, "dismiss", ""); w.Code != http.StatusOK {
		t.Fatalf("dismiss: %d", w.Code)
	}
	if _, _, _, c, _, _ := e.reportRow(id); c == nil || time.Since(*c) > time.Minute {
		t.Fatalf("closed_at harus terisi saat ditutup: %v", c)
	}
	if w := e.action(tok, id, "reopen", ""); w.Code != http.StatusOK {
		t.Fatal("reopen")
	}
	if st, _, _, c, _, _ := e.reportRow(id); st != "open" || c != nil {
		t.Fatalf("dibuka kembali: closed_at harus kosong, got %v %v", st, c)
	}
	// Jalur lama (PATCH /api/reports/{id}) juga mengisi closed_at.
	h := api.NewReportHandler(e.reports)
	if w := e.call(http.MethodPatch, "/api/reports/"+id, `{"status":"resolved"}`, tok, h.HandleItem); w.Code != http.StatusOK {
		t.Fatalf("patch: %d", w.Code)
	}
	if _, _, _, c, _, _ := e.reportRow(id); c == nil {
		t.Fatal("PATCH lama juga harus mengisi closed_at")
	}
}

func TestRetention_PurgeMatrix(t *testing.T) {
	e := newModEnv(t)
	rep := e.user("rep")
	ctx := context.Background()
	cutoff := time.Now().UTC().AddDate(0, 0, -90)

	mk := func(target, status string, closedAgo, createdAgo int, evidence, details string, hold bool) string {
		id := e.mkReport(rep, target, evidence, details)
		e.exec(`UPDATE content_reports SET status = ?, evidence_hold = ? WHERE id = ?`, status, hold, id)
		e.backdate(id, closedAgo, createdAgo)
		if status == "open" {
			e.exec(`UPDATE content_reports SET closed_at = NULL WHERE id = ?`, id)
		}
		return id
	}
	old := mk("a", "resolved", 120, 200, "BUKTI-LAMA", "RINCIAN-LAMA", false)
	recent := mk("b", "dismissed", 10, 200, "bukti baru", "rincian baru", false) // dibuat lama, tetapi baru ditutup
	open := mk("c", "open", 0, 400, "masih dibahas", "x", false)                 // terbuka tidak pernah dibersihkan
	held := mk("d", "resolved", 300, 400, "BUKTI-DITAHAN", "r", true)            // ditahan
	empty := mk("e", "resolved", 300, 400, "", "", false)                        // tidak ada teks untuk dibersihkan
	// Laporan lama tanpa closed_at (sebelum fitur ini): memakai created_at.
	legacy := mk("f", "resolved", 0, 150, "BUKTI-LEGACY", "", false)
	e.exec(`UPDATE content_reports SET closed_at = NULL WHERE id = ?`, legacy)

	n, err := e.mod.PurgeExpiredEvidence(ctx, cutoff)
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("hanya old dan legacy yang dibersihkan, got %d", n)
	}
	for _, id := range []string{old, legacy} {
		_, ev, det, _, purged, _ := e.reportRow(id)
		if ev != "" || det != "" || purged == nil {
			t.Fatalf("%s harus dibersihkan: ev=%q det=%q purged=%v", id, ev, det, purged)
		}
	}
	// Metadata laporan tetap.
	var reason, target, status string
	_ = e.sqlStore.DB().QueryRow(e.rb(`SELECT reason, target_id, status FROM content_reports WHERE id = ?`), old).Scan(&reason, &target, &status)
	if reason != "spam" || target != "a" || status != "resolved" {
		t.Fatalf("metadata laporan tidak boleh berubah: %s %s %s", reason, target, status)
	}
	for name, id := range map[string]string{"baru ditutup": recent, "terbuka": open, "ditahan": held} {
		if _, ev, _, _, purged, _ := e.reportRow(id); ev == "" || purged != nil {
			t.Fatalf("%s tidak boleh dibersihkan", name)
		}
	}
	if _, _, _, _, purged, _ := e.reportRow(empty); purged != nil {
		t.Fatal("laporan tanpa teks tidak perlu ditandai dibersihkan")
	}
	// Idempoten: putaran kedua tidak membersihkan apa pun.
	if n, _ := e.mod.PurgeExpiredEvidence(ctx, cutoff); n != 0 {
		t.Fatalf("putaran kedua harus 0, got %d", n)
	}
	// Membuka kembali laporan yang bukti-nya sudah bersih tetap diizinkan, tetapi tidak menghidupkan bukti.
}

func TestRetention_HoldAndReleaseEvidence(t *testing.T) {
	e := newModEnv(t)
	rep, mod := e.user("rep"), e.user("mod")
	tok := e.token(mod, "default", "wuzz_moderator")
	id := e.mkReport(rep, "p1", "bukti penting", "r")
	if w := e.action(tok, id, "dismiss", ""); w.Code != http.StatusOK {
		t.Fatal("dismiss")
	}
	if w := e.action(tok, id, "hold_evidence", ""); w.Code != http.StatusBadRequest {
		t.Fatalf("tahan tanpa catatan: want 400, got %d", w.Code)
	}
	if w := e.action(tok, id, "hold_evidence", "mungkin diteruskan ke pihak berwenang"); w.Code != http.StatusOK {
		t.Fatalf("tahan: %d %s", w.Code, w.Body.String())
	}
	st, _, _, _, _, hold := e.reportRow(id)
	if !hold || st != "dismissed" {
		t.Fatalf("tahan tidak boleh mengubah status: hold=%v status=%s", hold, st)
	}
	e.backdate(id, 200, 300)
	if n, _ := e.mod.PurgeExpiredEvidence(context.Background(), time.Now().AddDate(0, 0, -90)); n != 0 {
		t.Fatal("bukti yang ditahan tidak boleh dibersihkan")
	}
	if w := e.action(tok, id, "release_evidence", "tidak jadi diteruskan"); w.Code != http.StatusOK {
		t.Fatal("lepas")
	}
	if n, _ := e.mod.PurgeExpiredEvidence(context.Background(), time.Now().AddDate(0, 0, -90)); n != 1 {
		t.Fatalf("setelah dilepas bukti lama dibersihkan, got %d", n)
	}
	// Bukti sudah bersih: tidak ada lagi yang bisa ditahan.
	if w := e.action(tok, id, "hold_evidence", "terlambat"); w.Code != http.StatusConflict {
		t.Fatalf("menahan bukti yang sudah dihapus: want 409, got %d", w.Code)
	}
	if got := e.auditActions(id); strings.Join(got, ",") != "dismiss,hold_evidence,release_evidence" {
		t.Fatalf("audit: %v", got)
	}
}

func TestRetention_DetailShowsExpiryAndFlags(t *testing.T) {
	e := newModEnv(t)
	rep, mod := e.user("rep"), e.user("mod")
	tok := e.token(mod, "default", "wuzz_moderator")
	e.handler.SetEvidenceRetention(90)
	get := func(id string) map[string]any {
		w := e.call(http.MethodGet, "/api/admin/reports/"+id, "", tok, e.handler.HandleReportItem)
		if w.Code != http.StatusOK {
			t.Fatalf("detail: %d %s", w.Code, w.Body.String())
		}
		var m map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &m)
		return m
	}
	open := e.mkReport(rep, "o", "b", "r")
	if _, has := get(open)["evidence_expires_at"]; has {
		t.Fatal("laporan terbuka tidak punya jadwal hapus")
	}
	closed := e.mkReport(rep, "c", "b", "r")
	e.action(tok, closed, "dismiss", "")
	exp, has := get(closed)["evidence_expires_at"].(string)
	if !has {
		t.Fatal("laporan ditutup harus punya evidence_expires_at")
	}
	at, _ := time.Parse(time.RFC3339, exp)
	if d := time.Until(at); d < 89*24*time.Hour || d > 91*24*time.Hour {
		t.Fatalf("jadwal harus ±90 hari, got %s", d)
	}
	e.action(tok, closed, "hold_evidence", "tahan")
	m := get(closed)
	if _, has := m["evidence_expires_at"]; has {
		t.Fatal("ditahan: tidak ada jadwal hapus")
	}
	if rp, _ := m["report"].(map[string]any); rp["evidence_hold"] != true {
		t.Fatalf("evidence_hold harus true: %v", rp)
	}
	e.handler.SetEvidenceRetention(0)
	if _, has := get(closed)["evidence_expires_at"]; has {
		t.Fatal("retensi dimatikan: tidak ada jadwal")
	}
	// Setelah dibersihkan, detail menandai waktu pembersihan.
	purged := e.mkReport(rep, "p", "b", "r")
	e.action(tok, purged, "dismiss", "")
	e.backdate(purged, 100, 100)
	_, _ = e.mod.PurgeExpiredEvidence(context.Background(), time.Now().AddDate(0, 0, -90))
	if rp, _ := get(purged)["report"].(map[string]any); rp["evidence_purged_at"] == nil || rp["evidence"] != nil && rp["evidence"] != "" {
		t.Fatalf("laporan dibersihkan: evidence_purged_at harus ada dan bukti kosong: %v", rp)
	}
}

func TestModeration_GroupMessageDeleteBroadcastsAndTombstones(t *testing.T) {
	e := newModEnv(t)
	rep, author, mod := e.user("rep"), e.user("author"), e.user("mod")
	tok := e.token(mod, "default", "wuzz_moderator")
	var mu sync.Mutex
	var got []store.DeletedMessage
	e.handler.SetMessageDeletedHook(func(dm store.DeletedMessage) {
		mu.Lock()
		got = append(got, dm)
		mu.Unlock()
	})
	e.message("m_bad", "room_pub", author.ID, false, "isi buruk")
	e.exec(`UPDATE messages SET media_url = 'https://x/file.jpg', file_name = 'file.jpg' WHERE id = 'm_bad'`)
	e.exec(`INSERT INTO pinned_messages (id, conversation_id, message_id, pinned_by, pinned_at) VALUES ('pin1', 'room_pub', 'm_bad', ?, ?)`, author.ID, time.Now().UTC())
	id := e.report(rep, "message", "m_bad", author.ID, "harassment", "")
	if w := e.action(tok, id, "delete_content", "melanggar"); w.Code != http.StatusOK {
		t.Fatalf("delete: %d %s", w.Code, w.Body.String())
	}
	var content, media string
	var pins int
	_ = e.sqlStore.DB().QueryRow(`SELECT content, media_url FROM messages WHERE id = 'm_bad'`).Scan(&content, &media)
	_ = e.sqlStore.DB().QueryRow(`SELECT COUNT(*) FROM pinned_messages WHERE message_id = 'm_bad'`).Scan(&pins)
	if content != "🚫 Pesan ini telah dihapus" || media != "" || pins != 0 {
		t.Fatalf("isi harus dikosongkan, media dibuang, pin dilepas: %q %q pins=%d", content, media, pins)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(got) != 1 || got[0].RoomID != "room_pub" || got[0].MessageID != "m_bad" || got[0].TenantID != "default" {
		t.Fatalf("siaran penghapusan harus terkirim sekali: %+v", got)
	}
}

func TestModeration_NoBroadcastWhenNothingDeleted(t *testing.T) {
	e := newModEnv(t)
	rep, author, mod := e.user("rep"), e.user("author"), e.user("mod")
	tok := e.token(mod, "default", "wuzz_moderator")
	calls := 0
	e.handler.SetMessageDeletedHook(func(store.DeletedMessage) { calls++ })
	e.message("m_dm", "room_e2ee", author.ID, true, "sandi")
	if w := e.action(tok, e.report(rep, "message", "m_dm", author.ID, "harassment", "b"), "delete_content", "x"); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("E2EE: want 422, got %d", w.Code)
	}
	if w := e.action(tok, e.report(rep, "message", "m_tidak_ada", author.ID, "harassment", "b"), "delete_content", "x"); w.Code != http.StatusOK {
		t.Fatalf("pesan sudah tidak ada: want 200, got %d", w.Code)
	}
	if calls != 0 {
		t.Fatalf("tanpa penghapusan nyata tidak ada siaran, got %d", calls)
	}
}
