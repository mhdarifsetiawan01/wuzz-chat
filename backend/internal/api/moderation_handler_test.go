package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/api"
	"github.com/bms-del112/wuzz-chat/internal/auth"
	"github.com/bms-del112/wuzz-chat/internal/authz"
	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/bms-del112/wuzz-chat/internal/testutil/pgtest"
)

type modEnv struct {
	t          *testing.T
	driver     string
	sqlStore   *store.SQLMessageStore
	users      *store.SQLUserStore
	tokens     *store.SQLTokenStore
	reports    *store.SQLReportStore
	mod        *store.SQLModerationStore
	suspension *authz.SuspensionPolicy
	handler    *api.ModerationHandler
	auth       *api.AuthHandler

	mu     sync.Mutex
	kicked []string
}

func newModEnv(t *testing.T) *modEnv {
	t.Helper()
	// PostgreSQL bila PG_TEST_ADMIN_DSN diisi (bentuk produksi), selain itu SQLite sementara.
	driver, target := "sqlite", filepath.Join(t.TempDir(), "mod.db")
	if dsn, ok := pgtest.NewDSN(t); ok {
		driver, target = "postgres", dsn
	}
	sqlStore, err := store.NewSQLMessageStore(driver, target)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { auth.SetTokenChecker(nil); sqlStore.Close() })
	if driver == "postgres" {
		pgtest.ProductionShape(t, sqlStore.DB())
	}
	e := &modEnv{t: t, driver: driver, sqlStore: sqlStore}
	e.users = store.NewSQLUserStore(sqlStore.DB(), driver)
	e.tokens = store.NewSQLTokenStore(sqlStore.DB(), driver)
	auth.SetTokenChecker(e.tokens)
	if e.reports, err = store.NewSQLReportStore(sqlStore.DB(), driver); err != nil {
		t.Fatal(err)
	}
	if e.mod, err = store.NewSQLModerationStore(sqlStore.DB(), driver); err != nil {
		t.Fatal(err)
	}
	e.suspension = authz.NewSuspensionPolicy(e.mod)
	e.handler = api.NewModerationHandler(e.mod, e.suspension)
	e.handler.SetSessionControl(func(userID, reason string) {
		e.mu.Lock()
		e.kicked = append(e.kicked, userID+"|"+reason)
		e.mu.Unlock()
	})
	e.auth = api.NewAuthHandler(e.users)
	e.auth.SetTokenStore(e.tokens)
	e.auth.SetSessionStore(store.NewSQLSessionStore(sqlStore.DB(), driver))
	e.auth.SetSuspension(e.suspension)
	return e
}

// rb mengubah placeholder ? menjadi $n untuk PostgreSQL.
func (e *modEnv) rb(q string) string {
	if e.driver != "postgres" {
		return q
	}
	var b strings.Builder
	n := 0
	for _, r := range q {
		if r == '?' {
			n++
			b.WriteString("$" + strconv.Itoa(n))
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func (e *modEnv) exec(q string, args ...any) {
	e.t.Helper()
	if _, err := e.sqlStore.DB().Exec(e.rb(q), args...); err != nil {
		e.t.Fatalf("exec %q: %v", q, err)
	}
}

func (e *modEnv) user(name string) *store.User {
	e.t.Helper()
	u, err := e.users.Register(name, name, "password123")
	if err != nil {
		e.t.Fatal(err)
	}
	return u
}

func (e *modEnv) token(u *store.User, tenant, role string) string {
	e.t.Helper()
	tok, _, err := auth.GenerateSessionTokenWithRole(u.ID, u.Username, u.DisplayName, tenant, "dev_"+u.ID, role)
	if err != nil {
		e.t.Fatal(err)
	}
	return tok
}

func (e *modEnv) report(reporter *store.User, targetType, targetID, targetUser, reason, evidence string) string {
	e.t.Helper()
	r := &store.ContentReport{TenantID: "default", ReporterID: reporter.ID, TargetType: targetType, TargetID: targetID, TargetUserID: targetUser, Reason: reason, Evidence: evidence}
	if err := e.reports.Create(context.Background(), r); err != nil {
		e.t.Fatal(err)
	}
	return r.ID
}

func (e *modEnv) post(id, owner, content string) {
	now := time.Now().UTC()
	e.exec(`INSERT INTO feed_posts (id, tenant_id, user_id, content, created_at, updated_at, comments_count) VALUES (?, 'default', ?, ?, ?, ?, 0)`, id, owner, content, now, now)
}

func (e *modEnv) comment(id, postID, owner, content string) {
	e.exec(`INSERT INTO feed_comments (id, tenant_id, post_id, user_id, content, created_at) VALUES (?, 'default', ?, ?, ?, ?)`, id, postID, owner, content, time.Now().UTC())
	e.exec(`UPDATE feed_posts SET comments_count = comments_count + 1 WHERE id = ?`, postID)
}

func (e *modEnv) message(id, room, from string, e2ee bool, content string) {
	e.exec(`INSERT INTO conversations (id, tenant_id, type, is_e2ee, created_at, updated_at) VALUES (?, 'default', 'group', ?, ?, ?)
		ON CONFLICT(id) DO NOTHING`, room, e2ee, time.Now().UTC(), time.Now().UTC())
	e.exec(`INSERT INTO messages (id, room_id, from_id, from_nickname, to_id, content, created_at) VALUES (?, ?, ?, 'x', ?, ?, ?)`, id, room, from, room, content, time.Now().UTC())
}

func (e *modEnv) call(method, path, body, tok string, fn http.HandlerFunc) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewReader([]byte(body)))
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	w := httptest.NewRecorder()
	auth.RequireJWT()(fn).ServeHTTP(w, req)
	return w
}

func (e *modEnv) action(tok, reportID, action, note string) *httptest.ResponseRecorder {
	b, _ := json.Marshal(map[string]string{"action": action, "note": note})
	return e.call(http.MethodPost, "/api/admin/reports/"+reportID+"/action", string(b), tok, e.handler.HandleReportItem)
}

func (e *modEnv) auditActions(reportID string) []string {
	rows, err := e.sqlStore.DB().Query(e.rb(`SELECT action FROM moderation_actions WHERE report_id = ? ORDER BY created_at`), reportID)
	if err != nil {
		e.t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var a string
		_ = rows.Scan(&a)
		out = append(out, a)
	}
	return out
}

func TestModeration_AccessControl(t *testing.T) {
	e := newModEnv(t)
	reporter, victim := e.user("rep"), e.user("victim")
	id := e.report(reporter, "user", victim.ID, victim.ID, "spam", "")
	userTok := e.token(reporter, "default", "user")

	if w := e.call(http.MethodGet, "/api/admin/reports", "", "", e.handler.HandleReports); w.Code != http.StatusUnauthorized {
		t.Fatalf("tanpa token: want 401, got %d", w.Code)
	}
	if w := e.call(http.MethodGet, "/api/admin/reports", "", userTok, e.handler.HandleReports); w.Code != http.StatusForbidden {
		t.Fatalf("user biasa list: want 403, got %d", w.Code)
	}
	if w := e.call(http.MethodGet, "/api/admin/reports/"+id, "", userTok, e.handler.HandleReportItem); w.Code != http.StatusForbidden {
		t.Fatalf("user biasa detail: want 403, got %d", w.Code)
	}
	if w := e.action(userTok, id, "dismiss", ""); w.Code != http.StatusForbidden {
		t.Fatalf("user biasa aksi: want 403, got %d", w.Code)
	}
	if w := e.call(http.MethodPost, "/api/admin/users/"+victim.ID+"/unsuspend", "{}", userTok, e.handler.HandleUser); w.Code != http.StatusForbidden {
		t.Fatalf("user biasa unsuspend: want 403, got %d", w.Code)
	}
	// Peran lama yang tidak lagi diakui ("admin", "superadmin") tidak boleh lolos.
	for _, role := range []string{"admin", "superadmin", "user", ""} {
		if w := e.call(http.MethodGet, "/api/admin/reports", "", e.token(reporter, "default", role), e.handler.HandleReports); w.Code != http.StatusForbidden {
			t.Fatalf("peran %q: want 403, got %d", role, w.Code)
		}
	}
	// Tidak ada efek samping dari percobaan yang ditolak.
	if got := e.auditActions(id); len(got) != 0 {
		t.Fatalf("percobaan ditolak tidak boleh tercatat sebagai aksi: %v", got)
	}
}

func TestModeration_ListPriorityFiltersAndTenantIsolation(t *testing.T) {
	e := newModEnv(t)
	rep, victim := e.user("rep"), e.user("victim")
	other := e.user("rep2")
	e.report(rep, "post", "p_spam", victim.ID, "spam", "")
	time.Sleep(5 * time.Millisecond)
	sexual := e.report(rep, "post", "p_sexual", victim.ID, "sexual", "")
	time.Sleep(5 * time.Millisecond)
	e.report(other, "post", "p_spam2", victim.ID, "spam", "newest")
	// Laporan tenant lain.
	foreign := &store.ContentReport{TenantID: "other", ReporterID: rep.ID, TargetType: "post", TargetID: "p_foreign", Reason: "illegal"}
	if err := e.reports.Create(context.Background(), foreign); err != nil {
		t.Fatal(err)
	}
	tok := e.token(rep, "default", "wuzz_moderator")

	w := e.call(http.MethodGet, "/api/admin/reports", "", tok, e.handler.HandleReports)
	if w.Code != http.StatusOK {
		t.Fatalf("list: %d %s", w.Code, w.Body.String())
	}
	var out struct {
		Reports []store.ContentReport `json:"reports"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if len(out.Reports) != 3 {
		t.Fatalf("hanya tenant sendiri (3), got %d", len(out.Reports))
	}
	if out.Reports[0].ID != sexual {
		t.Fatalf("laporan seksual harus paling atas, got %+v", out.Reports[0])
	}
	for _, r := range out.Reports {
		if r.TargetID == "p_foreign" {
			t.Fatal("laporan tenant lain bocor")
		}
		if r.Evidence != "" || r.ReporterID != "" || r.Details != "" {
			t.Fatalf("daftar tidak boleh memuat bukti/pelapor: %+v", r)
		}
	}
	// Filter alasan dan validasi parameter.
	w = e.call(http.MethodGet, "/api/admin/reports?reason=sexual", "", tok, e.handler.HandleReports)
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if len(out.Reports) != 1 {
		t.Fatalf("filter alasan: want 1, got %d", len(out.Reports))
	}
	if w := e.call(http.MethodGet, "/api/admin/reports?reason=bogus", "", tok, e.handler.HandleReports); w.Code != http.StatusBadRequest {
		t.Fatalf("alasan tak valid: want 400, got %d", w.Code)
	}
	if w := e.call(http.MethodGet, "/api/admin/reports?status=x", "", tok, e.handler.HandleReports); w.Code != http.StatusBadRequest {
		t.Fatalf("status tak valid: want 400, got %d", w.Code)
	}

	// Moderator tenant lain: tidak melihat dan tidak bisa menindak laporan tenant default.
	foreignTok := e.token(rep, "other", "wuzz_moderator")
	if w := e.call(http.MethodGet, "/api/admin/reports/"+sexual, "", foreignTok, e.handler.HandleReportItem); w.Code != http.StatusNotFound {
		t.Fatalf("detail lintas tenant: want 404, got %d", w.Code)
	}
	if w := e.action(foreignTok, sexual, "dismiss", ""); w.Code != http.StatusNotFound {
		t.Fatalf("aksi lintas tenant: want 404, got %d", w.Code)
	}
	if got, _ := e.reports.List(context.Background(), "default", "open", 10); len(got) != 3 {
		t.Fatalf("laporan tidak boleh berubah, got %d terbuka", len(got))
	}
}

func TestModeration_DetailContentByTargetType(t *testing.T) {
	e := newModEnv(t)
	rep, author := e.user("rep"), e.user("author")
	tok := e.token(rep, "default", "wuzz_admin")

	e.post("p1", author.ID, "isi postingan <script>alert(1)</script>")
	e.message("m_group", "room_group", author.ID, false, "pesan grup terbaca")
	e.message("m_dm", "room_dm", author.ID, true, "SANDI-RAHASIA-E2EE")

	get := func(id string) store.ReportDetail {
		w := e.call(http.MethodGet, "/api/admin/reports/"+id, "", tok, e.handler.HandleReportItem)
		if w.Code != http.StatusOK {
			t.Fatalf("detail: %d %s", w.Code, w.Body.String())
		}
		var d store.ReportDetail
		_ = json.Unmarshal(w.Body.Bytes(), &d)
		return d
	}

	post := get(e.report(rep, "post", "p1", author.ID, "spam", ""))
	if !post.Content.Available || !strings.Contains(post.Content.Text, "isi postingan") {
		t.Fatalf("post harus terbaca: %+v", post.Content)
	}
	grp := get(e.report(rep, "message", "m_group", author.ID, "harassment", ""))
	if !grp.Content.Available || grp.Content.Text != "pesan grup terbaca" {
		t.Fatalf("pesan grup harus terbaca: %+v", grp.Content)
	}
	dm := get(e.report(rep, "message", "m_dm", author.ID, "harassment", "bukti dari pelapor"))
	if dm.Content.Available || dm.Content.Text != "" || strings.Contains(dm.Content.Note+dm.Content.AuthorID, "SANDI") {
		t.Fatalf("DM E2EE tidak boleh menampilkan isi: %+v", dm.Content)
	}
	if dm.Report.Evidence != "bukti dari pelapor" || !strings.Contains(dm.Content.Note, "tidak dapat diverifikasi") {
		t.Fatalf("DM harus menampilkan bukti pelapor dengan label jelas: %+v", dm)
	}
	gone := get(e.report(rep, "post", "p_sudah_dihapus", author.ID, "spam", "bukti tersisa"))
	if gone.Content.Available || gone.Report.Evidence != "bukti tersisa" {
		t.Fatalf("konten terhapus: tampilkan catatan, simpan bukti: %+v", gone)
	}
	if w := e.call(http.MethodGet, "/api/admin/reports/rpt_tidak_ada", "", tok, e.handler.HandleReportItem); w.Code != http.StatusNotFound {
		t.Fatalf("laporan tak ada: want 404, got %d", w.Code)
	}
	// Laporan lain pada target yang sama ikut tampil.
	other := e.user("rep2")
	e.report(other, "post", "p1", author.ID, "hate", "")
	again := get(post.Report.ID)
	if len(again.Related) != 1 {
		t.Fatalf("laporan terkait: want 1, got %d", len(again.Related))
	}
}

func TestModeration_Actions(t *testing.T) {
	e := newModEnv(t)
	rep, author, mod2 := e.user("rep"), e.user("author"), e.user("mod2")
	e.exec(`UPDATE users SET system_role = 'wuzz_moderator' WHERE id = ?`, mod2.ID)
	modUser := e.user("modx")
	tok := e.token(modUser, "default", "wuzz_moderator")

	// dismiss dan resolve menutup laporan dan tercatat.
	r1 := e.report(rep, "post", "px", author.ID, "spam", "")
	if w := e.action(tok, r1, "dismiss", ""); w.Code != http.StatusOK {
		t.Fatalf("dismiss: %d %s", w.Code, w.Body.String())
	}
	if got := e.auditActions(r1); len(got) != 1 || got[0] != "dismiss" {
		t.Fatalf("audit dismiss: %v", got)
	}
	if open, _ := e.reports.List(context.Background(), "default", "open", 10); len(open) != 0 {
		t.Fatalf("laporan harus tertutup, masih terbuka %d", len(open))
	}
	if w := e.action(tok, r1, "reopen", ""); w.Code != http.StatusOK {
		t.Fatalf("reopen: %d", w.Code)
	}
	if w := e.action(tok, r1, "bukan_aksi", ""); w.Code != http.StatusBadRequest {
		t.Fatalf("aksi tak dikenal: want 400, got %d", w.Code)
	}

	// hapus konten wajib berisi catatan; menghapus post beserta komentarnya.
	e.post("p_del", author.ID, "buruk")
	e.comment("c1", "p_del", rep.ID, "komentar")
	r2 := e.report(rep, "post", "p_del", author.ID, "illegal", "")
	if w := e.action(tok, r2, "delete_content", "  "); w.Code != http.StatusBadRequest {
		t.Fatalf("tanpa catatan: want 400, got %d", w.Code)
	}
	if w := e.action(tok, r2, "delete_content", "melanggar kebijakan"); w.Code != http.StatusOK {
		t.Fatalf("delete_content: %d %s", w.Code, w.Body.String())
	}
	var n int
	_ = e.sqlStore.DB().QueryRow(`SELECT COUNT(*) FROM feed_posts WHERE id = 'p_del'`).Scan(&n)
	var nc int
	_ = e.sqlStore.DB().QueryRow(`SELECT COUNT(*) FROM feed_comments WHERE post_id = 'p_del'`).Scan(&nc)
	if n != 0 || nc != 0 {
		t.Fatalf("post dan komentar harus terhapus: posts=%d comments=%d", n, nc)
	}
	// Diulang (konten sudah hilang) tetap sukses, tidak error.
	if w := e.action(tok, r2, "delete_content", "ulang"); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"content_already_gone":true`) {
		t.Fatalf("idempoten: %d %s", w.Code, w.Body.String())
	}

	// hapus komentar mengurangi hitungan di post.
	e.post("p_keep", author.ID, "baik")
	e.comment("c_bad", "p_keep", author.ID, "kasar")
	e.comment("c_ok", "p_keep", author.ID, "ramah")
	r3 := e.report(rep, "comment", "c_bad", author.ID, "harassment", "")
	if w := e.action(tok, r3, "delete_content", "kasar"); w.Code != http.StatusOK {
		t.Fatalf("hapus komentar: %d %s", w.Code, w.Body.String())
	}
	var cnt int
	_ = e.sqlStore.DB().QueryRow(`SELECT comments_count FROM feed_posts WHERE id = 'p_keep'`).Scan(&cnt)
	if cnt != 1 {
		t.Fatalf("comments_count harus 1, got %d", cnt)
	}

	// pesan grup ditandai terhapus; DM E2EE ditolak (pakai tangguhkan akun).
	e.message("m_g", "room_g", author.ID, false, "kasar")
	e.message("m_e", "room_e", author.ID, true, "sandi")
	rg := e.report(rep, "message", "m_g", author.ID, "harassment", "")
	if w := e.action(tok, rg, "delete_content", "kasar"); w.Code != http.StatusOK {
		t.Fatalf("hapus pesan grup: %d %s", w.Code, w.Body.String())
	}
	var del bool
	_ = e.sqlStore.DB().QueryRow(`SELECT is_deleted FROM messages WHERE id = 'm_g'`).Scan(&del)
	if !del {
		t.Fatal("pesan grup harus ditandai terhapus")
	}
	re := e.report(rep, "message", "m_e", author.ID, "harassment", "bukti")
	if w := e.action(tok, re, "delete_content", "x"); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("DM E2EE tidak bisa dihapus lewat alat: want 422, got %d", w.Code)
	}
	if got := e.auditActions(re); len(got) != 0 {
		t.Fatalf("aksi gagal tidak boleh tercatat: %v", got)
	}
	var s string
	_ = e.sqlStore.DB().QueryRow(`SELECT content FROM messages WHERE id = 'm_e'`).Scan(&s)
	if s != "sandi" {
		t.Fatal("isi DM tidak boleh disentuh")
	}

	// hapus konten pada laporan profil tidak berlaku.
	ru := e.report(rep, "user", author.ID, author.ID, "spam", "")
	if w := e.action(tok, ru, "delete_content", "x"); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("hapus konten pada profil: want 422, got %d", w.Code)
	}

	// tangguhkan: catatan wajib; staf dan diri sendiri dilindungi.
	rs := e.report(rep, "post", "px2", author.ID, "sexual", "")
	if w := e.action(tok, rs, "suspend_user", ""); w.Code != http.StatusBadRequest {
		t.Fatalf("tangguh tanpa catatan: want 400, got %d", w.Code)
	}
	rstaff := e.report(rep, "user", mod2.ID, mod2.ID, "spam", "")
	if w := e.action(tok, rstaff, "suspend_user", "uji"); w.Code != http.StatusForbidden {
		t.Fatalf("staf tidak boleh ditangguhkan: want 403, got %d", w.Code)
	}
	rself := e.report(rep, "user", modUser.ID, modUser.ID, "spam", "")
	if w := e.action(tok, rself, "suspend_user", "uji"); w.Code != http.StatusForbidden {
		t.Fatalf("diri sendiri tidak boleh ditangguhkan: want 403, got %d", w.Code)
	}
	if sus, _ := e.mod.IsSuspended(context.Background(), mod2.ID); sus {
		t.Fatal("staf tidak boleh tertangguh")
	}
}

func TestModeration_SuspendEnforcedEverywhereAndReversible(t *testing.T) {
	e := newModEnv(t)
	rep := e.user("rep")
	// Akun yang akan ditangguhkan lewat registrasi nyata (punya sesi dan perangkat).
	regBody, _ := json.Marshal(api.RegisterRequest{Username: "pelanggar", DisplayName: "P", Password: "supersecret123", DeviceID: "dev_p"})
	wReg := httptest.NewRecorder()
	e.auth.Register(wReg, httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(regBody)))
	if wReg.Code != http.StatusCreated {
		t.Fatalf("register: %d %s", wReg.Code, wReg.Body.String())
	}
	var reg api.AuthResponse
	_ = json.Unmarshal(wReg.Body.Bytes(), &reg)
	victim, _ := e.users.GetUserByUsername("pelanggar")
	modUser := e.user("modx")
	tok := e.token(modUser, "default", "wuzz_moderator")

	// Sebelum ditangguhkan: token berfungsi lewat middleware.
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mw := api.NewSuspensionMiddleware(e.suspension).Middleware(next)
	do := func(method, path, token string) int {
		req := httptest.NewRequest(method, path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		mw.ServeHTTP(w, req)
		return w.Code
	}
	if c := do(http.MethodGet, "/api/feed", reg.Token); c != http.StatusNoContent {
		t.Fatalf("sebelum tangguh: want 204, got %d", c)
	}

	// Pencabutan token massal membandingkan iat dengan waktu cabut dalam detik; beri jeda agar token pasti lebih lama.
	time.Sleep(1100 * time.Millisecond)

	// Tangguhkan lewat laporan.
	id := e.report(rep, "user", victim.ID, victim.ID, "sexual", "")
	if w := e.action(tok, id, "suspend_user", "konten ilegal"); w.Code != http.StatusOK {
		t.Fatalf("suspend: %d %s", w.Code, w.Body.String())
	}
	if got := e.auditActions(id); len(got) != 1 || got[0] != "suspend_user" {
		t.Fatalf("audit: %v", got)
	}
	e.mu.Lock()
	kicked := append([]string(nil), e.kicked...)
	e.mu.Unlock()
	if len(kicked) != 1 || !strings.HasPrefix(kicked[0], victim.ID+"|ACCOUNT_SUSPENDED") {
		t.Fatalf("koneksi WS harus diputus: %v", kicked)
	}

	// 1) Middleware: rute biasa ditolak, hak hapus akun dan logout tetap terbuka.
	if c := do(http.MethodGet, "/api/feed", reg.Token); c != http.StatusForbidden {
		t.Fatalf("rute biasa: want 403, got %d", c)
	}
	if c := do(http.MethodDelete, "/api/auth/me", reg.Token); c != http.StatusNoContent {
		t.Fatalf("hapus akun harus tetap boleh: got %d", c)
	}
	if c := do(http.MethodPost, "/api/auth/logout", reg.Token); c != http.StatusNoContent {
		t.Fatalf("logout harus tetap boleh: got %d", c)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/feed", nil)
	req.Header.Set("Authorization", "Bearer "+reg.Token)
	w := httptest.NewRecorder()
	mw.ServeHTTP(w, req)
	if !strings.Contains(w.Body.String(), "ACCOUNT_SUSPENDED") {
		t.Fatalf("kode galat harus ACCOUNT_SUSPENDED: %s", w.Body.String())
	}

	// 2) Token SENGAJA tidak dicabut (akun ditangguhkan tetap berhak keluar, melihat status, dan menghapus akun; semuanya
	// lewat RequireJWT). Refresh ditolak oleh layanan, bukan oleh pencabutan token.
	reqOld := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", nil)
	reqOld.Header.Set("Authorization", "Bearer "+reg.Token)
	wOld := httptest.NewRecorder()
	auth.RequireJWT()(http.HandlerFunc(e.auth.Refresh)).ServeHTTP(wOld, reqOld)
	if wOld.Code != http.StatusForbidden || !strings.Contains(wOld.Body.String(), "ACCOUNT_SUSPENDED") {
		t.Fatalf("refresh akun ditangguhkan: want 403 ACCOUNT_SUSPENDED, got %d %s", wOld.Code, wOld.Body.String())
	}

	// 2b) Rantai produksi (SuspensionMiddleware di luar, RequireJWT di dalam): hak hapus akun, /me, dan logout HARUS tetap
	// terjangkau dengan token yang sama; rute lain ditolak. Dulu penangguhan mencabut token sehingga ketiganya 401.
	reached := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	chain := api.NewSuspensionMiddleware(e.suspension).Middleware(auth.RequireJWT()(reached))
	through := func(method, path string) int {
		req := httptest.NewRequest(method, path, nil)
		req.Header.Set("Authorization", "Bearer "+reg.Token)
		w := httptest.NewRecorder()
		chain.ServeHTTP(w, req)
		return w.Code
	}
	for _, tc := range []struct{ method, path string }{
		{http.MethodDelete, "/api/auth/me"}, {http.MethodGet, "/api/auth/me"}, {http.MethodPost, "/api/auth/logout"},
	} {
		if c := through(tc.method, tc.path); c != http.StatusNoContent {
			t.Fatalf("%s %s harus tetap terjangkau oleh akun ditangguhkan, got %d", tc.method, tc.path, c)
		}
	}
	if c := through(http.MethodGet, "/api/feed"); c != http.StatusForbidden {
		t.Fatalf("rute biasa harus 403, got %d", c)
	}
	// /me yang sebenarnya memberi tahu klien lewat flag (dasar layar "akun ditangguhkan" saat aplikasi dibuka).
	wMe := httptest.NewRecorder()
	reqMe := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	reqMe.Header.Set("Authorization", "Bearer "+reg.Token)
	api.NewSuspensionMiddleware(e.suspension).Middleware(auth.RequireJWT()(http.HandlerFunc(e.auth.Me))).ServeHTTP(wMe, reqMe)
	if wMe.Code != http.StatusOK || !strings.Contains(wMe.Body.String(), `"account_suspended":true`) {
		t.Fatalf("/me akun ditangguhkan: want 200 dengan account_suspended, got %d %s", wMe.Code, wMe.Body.String())
	}

	// 3) Login: password benar ditolak 403 ACCOUNT_SUSPENDED; password salah tetap 401 (status tidak bocor).
	login := func(pw string) *httptest.ResponseRecorder {
		b, _ := json.Marshal(api.LoginRequest{Username: "pelanggar", Password: pw, DeviceID: "dev_p2"})
		w := httptest.NewRecorder()
		e.auth.Login(w, httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(b)))
		return w
	}
	if w := login("supersecret123"); w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "ACCOUNT_SUSPENDED") {
		t.Fatalf("login tertangguh: want 403 ACCOUNT_SUSPENDED, got %d %s", w.Code, w.Body.String())
	}
	if w := login("salah-salah"); w.Code != http.StatusUnauthorized {
		t.Fatalf("password salah: want 401, got %d", w.Code)
	}

	// 4) Data tidak dihapus (beda dengan hapus akun).
	if u, err := e.users.GetUserByID(victim.ID); err != nil || u == nil {
		t.Fatal("akun tidak boleh terhapus")
	}

	// 5) Dipulihkan: login berhasil lagi; dicatat.
	b, _ := json.Marshal(map[string]string{"note": "banding diterima"})
	if w := e.call(http.MethodPost, "/api/admin/users/"+victim.ID+"/unsuspend", string(b), tok, e.handler.HandleUser); w.Code != http.StatusOK {
		t.Fatalf("unsuspend: %d %s", w.Code, w.Body.String())
	}
	if w := login("supersecret123"); w.Code != http.StatusOK {
		t.Fatalf("login setelah pulih: want 200, got %d %s", w.Code, w.Body.String())
	}
	// Token lama (tidak pernah dicabut) langsung berlaku lagi tanpa login ulang.
	if c := through(http.MethodGet, "/api/feed"); c != http.StatusNoContent {
		t.Fatalf("setelah dipulihkan token lama harus berlaku lagi, got %d", c)
	}
	var unsus int
	_ = e.sqlStore.DB().QueryRow(e.rb(`SELECT COUNT(*) FROM moderation_actions WHERE action = 'unsuspend_user' AND target_user_id = ? AND note = 'banding diterima'`), victim.ID).Scan(&unsus)
	if unsus != 1 {
		t.Fatalf("pemulihan harus tercatat, got %d", unsus)
	}
	// Moderator tenant lain tidak bisa memulihkan akun ini.
	foreign := e.token(modUser, "other", "wuzz_moderator")
	if w := e.call(http.MethodPost, "/api/admin/users/"+victim.ID+"/unsuspend", "{}", foreign, e.handler.HandleUser); w.Code != http.StatusNotFound {
		t.Fatalf("unsuspend lintas tenant: want 404, got %d", w.Code)
	}
}

func TestSuspensionPolicy_FailsOpenAndCaches(t *testing.T) {
	p := authz.NewSuspensionPolicy(failingLookup{})
	if p.IsSuspended(context.Background(), "u1") {
		t.Fatal("galat database harus gagal terbuka (tidak ditangguhkan)")
	}
	var nilPolicy *authz.SuspensionPolicy
	if nilPolicy.IsSuspended(context.Background(), "u1") {
		t.Fatal("kebijakan nil tidak boleh menangguhkan")
	}
	nilPolicy.Invalidate("u1") // tidak boleh panik
}

type failingLookup struct{}

func (failingLookup) IsSuspended(context.Context, string) (bool, error) {
	return true, context.DeadlineExceeded
}

// GET /api/auth/me memberi tahu klien bahwa akun ditangguhkan, supaya aplikasi langsung menampilkan layar khusus.
func TestAuthMe_ReportsAccountSuspended(t *testing.T) {
	e := newModEnv(t)
	u := e.user("tersangka")
	tok := e.token(u, "default", "user")
	me := func() map[string]any {
		w := e.call(http.MethodGet, "/api/auth/me", "", tok, e.auth.Me)
		if w.Code != http.StatusOK {
			t.Fatalf("me: %d %s", w.Code, w.Body.String())
		}
		var m map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &m)
		return m
	}
	if _, has := me()["account_suspended"]; has {
		t.Fatal("akun normal tidak boleh membawa account_suspended")
	}
	e.exec(`UPDATE users SET suspended_at = CURRENT_TIMESTAMP WHERE id = ?`, u.ID)
	e.suspension.Invalidate(u.ID)
	if me()["account_suspended"] != true {
		t.Fatalf("akun ditangguhkan harus membawa account_suspended=true: %v", me())
	}
	e.exec(`UPDATE users SET suspended_at = NULL WHERE id = ?`, u.ID)
	e.suspension.Invalidate(u.ID)
	if _, has := me()["account_suspended"]; has {
		t.Fatal("setelah dipulihkan flag harus hilang")
	}
}
