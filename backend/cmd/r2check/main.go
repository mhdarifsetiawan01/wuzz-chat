// r2check: uji unggah video ke Cloudflare R2 memakai kode driver yang SAMA dengan server (internal/storage).
// Dijalankan manual oleh pemilik kredensial; tidak pernah mencetak Secret.
//
// Mode langsung (tanpa backend; memakai env R2_*):
//
//	go run ./cmd/r2check -origin https://chat.wuzzhub.id
//
// Mode API (setelah backend dideploy; menguji endpoint tiket + membersihkan bila env R2_* tersedia):
//
//	WUZZ_TOKEN=<JWT akun uji> go run ./cmd/r2check -api https://chat-api.wuzzhub.id
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/storage"
)

var (
	failures int
	client   = &http.Client{Timeout: 60 * time.Second}
)

func pass(name string)         { fmt.Printf("  PASS  %s\n", name) }
func info(name, detail string) { fmt.Printf("  INFO  %s: %s\n", name, detail) }
func warn(name, detail string) { fmt.Printf("  WARN  %s: %s\n", name, detail) }
func fail(name, detail string) { failures++; fmt.Printf("  FAIL  %s: %s\n", name, detail) }
func section(title string)     { fmt.Printf("\n== %s ==\n", title) }
func check(ok bool, name, detail string) {
	if ok {
		pass(name)
	} else {
		fail(name, detail)
	}
}

func randomBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

func put(url string, body []byte, contentType string) (int, string) {
	req, err := http.NewRequest(http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return 0, err.Error()
	}
	req.Header.Set("Content-Type", contentType)
	resp, err := client.Do(req)
	if err != nil {
		return 0, err.Error()
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 400))
	return resp.StatusCode, string(b)
}

func get(url string, hdr map[string]string) (*http.Response, []byte) {
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, []byte(err.Error())
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp, b
}

func main() {
	origin := flag.String("origin", "https://chat.wuzzhub.id", "origin web yang diuji untuk CORS")
	apiBase := flag.String("api", "", "bila diisi, uji endpoint backend (butuh env WUZZ_TOKEN)")
	flag.Parse()

	cfg := storage.R2Config{
		AccountID:       os.Getenv("R2_ACCOUNT_ID"),
		AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
		Bucket:          os.Getenv("R2_BUCKET"),
		PublicBaseURL:   os.Getenv("R2_PUBLIC_BASE_URL"),
		Endpoint:        os.Getenv("R2_ENDPOINT"),
	}
	r2, cfgErr := storage.NewR2Storage(cfg)

	if *apiBase != "" {
		runAPIMode(strings.TrimRight(*apiBase, "/"), r2, cfgErr)
	} else {
		if cfgErr != nil {
			fmt.Println("Konfigurasi R2 tidak lengkap:", cfgErr)
			os.Exit(2)
		}
		runDirectMode(r2, *origin)
	}

	fmt.Println()
	if failures > 0 {
		fmt.Printf("HASIL: %d pemeriksaan GAGAL\n", failures)
		os.Exit(1)
	}
	fmt.Println("HASIL: semua pemeriksaan lulus")
}

func runDirectMode(r2 *storage.R2Storage, origin string) {
	ctx := context.Background()
	video := randomBytes(300 * 1024)
	thumb := randomBytes(8 * 1024)

	section("1. Tiket presigned (kode driver yang sama dengan server)")
	vt, err := r2.CreateSignedUploadURLSized(ctx, "r2check.mp4", "video/mp4", int64(len(video)))
	check(err == nil, "tiket video", fmt.Sprint(err))
	if err != nil {
		return
	}
	tt, err := r2.CreateSignedThumbnailURL(ctx, vt.ObjectKey, int64(len(thumb)))
	check(err == nil, "tiket thumbnail", fmt.Sprint(err))
	if err != nil {
		return
	}
	wantThumb, _ := storage.VideoThumbnailURL(vt.PublicURL)
	check(tt.PublicURL == wantThumb, "URL thumbnail = turunan URL video", tt.PublicURL+" != "+wantThumb)

	section("2. Unggah langsung ke R2 (PUT)")
	st, body := put(tt.SignedURL, thumb, "image/jpeg")
	check(st == 200, "PUT thumbnail", fmt.Sprintf("status %d %s", st, body))
	st, body = put(vt.SignedURL, video, "video/mp4")
	check(st == 200, "PUT video (Content-Length ikut ditandatangani)", fmt.Sprintf("status %d %s", st, body))

	section("3. Penegakan tanda tangan")
	bad, _ := r2.CreateSignedUploadURLSized(ctx, "r2check-bad.mp4", "video/mp4", int64(len(video)))
	st, _ = put(bad.SignedURL, append(append([]byte{}, video...), randomBytes(64)...), "video/mp4")
	if st == 403 || st == 400 {
		pass(fmt.Sprintf("ukuran berbeda dari yang ditandatangani ditolak (status %d)", st))
	} else {
		warn("ukuran tidak ditegakkan", fmt.Sprintf("PUT dengan ukuran lebih besar mendapat status %d; batas 25 MB hanya bergantung validasi klien/tiket", st))
	}
	bad2, _ := r2.CreateSignedUploadURLSized(ctx, "r2check-bad2.mp4", "video/mp4", int64(len(video)))
	st, _ = put(bad2.SignedURL, video, "application/octet-stream")
	check(st == 403 || st == 400, "Content-Type berbeda ditolak", fmt.Sprintf("status %d (harus 403/400)", st))
	_ = r2.Delete(ctx, bad.PublicURL)
	_ = r2.Delete(ctx, bad2.PublicURL)

	section("4. Pembacaan lewat domain publik")
	resp, data := get(vt.PublicURL, nil)
	if resp == nil {
		fail("GET video", string(data))
	} else {
		check(resp.StatusCode == 200, "GET video publik", fmt.Sprintf("status %d", resp.StatusCode))
		check(bytes.Equal(data, video), "isi video sama dengan yang diunggah", fmt.Sprintf("%d byte diterima", len(data)))
		check(strings.HasPrefix(resp.Header.Get("Content-Type"), "video/mp4"), "Content-Type video/mp4", resp.Header.Get("Content-Type"))
	}
	resp, data = get(vt.PublicURL, map[string]string{"Range": "bytes=0-99"})
	if resp == nil {
		fail("Range request", string(data))
	} else {
		check(resp.StatusCode == 206 && len(data) == 100, "Range bytes=0-99 -> 206 (pemutar bisa memutar bertahap)", fmt.Sprintf("status %d, %d byte", resp.StatusCode, len(data)))
	}
	resp, data = get(tt.PublicURL, nil)
	if resp == nil {
		fail("GET thumbnail", string(data))
	} else {
		check(resp.StatusCode == 200 && bytes.Equal(data, thumb), "GET thumbnail publik", fmt.Sprintf("status %d, %d byte", resp.StatusCode, len(data)))
	}

	section("5. CORS untuk origin " + origin)
	resp, _ = get(vt.PublicURL, map[string]string{"Origin": origin})
	if resp != nil {
		acao := resp.Header.Get("Access-Control-Allow-Origin")
		check(acao == origin || acao == "*", "GET dari origin web diizinkan", "Access-Control-Allow-Origin="+acao)
	}
	pre, _ := http.NewRequest(http.MethodOptions, vt.SignedURL, nil)
	pre.Header.Set("Origin", origin)
	pre.Header.Set("Access-Control-Request-Method", "PUT")
	pre.Header.Set("Access-Control-Request-Headers", "content-type")
	if pr, perr := client.Do(pre); perr != nil {
		fail("preflight PUT", perr.Error())
	} else {
		pr.Body.Close()
		acao := pr.Header.Get("Access-Control-Allow-Origin")
		check((pr.StatusCode == 200 || pr.StatusCode == 204) && (acao == origin || acao == "*"),
			"preflight PUT dari origin web diizinkan",
			fmt.Sprintf("status %d, Access-Control-Allow-Origin=%q (periksa CORS Policy bucket)", pr.StatusCode, acao))
	}

	section("6. Hapus (kode PurgeWorker) dan verifikasi")
	check(r2.Delete(ctx, vt.PublicURL) == nil, "Delete video", "gagal")
	check(r2.Delete(ctx, tt.PublicURL) == nil, "Delete thumbnail", "gagal")
	resp, _ = get(fmt.Sprintf("%s?nocache=%d", vt.PublicURL, time.Now().UnixNano()), nil)
	if resp == nil {
		fail("GET setelah hapus", "tidak ada respons")
	} else {
		check(resp.StatusCode == 404, "video sudah tidak ada di bucket (cache-buster)", fmt.Sprintf("status %d", resp.StatusCode))
	}
	resp, _ = get(vt.PublicURL, nil)
	if resp != nil && resp.StatusCode == 200 {
		warn("salinan di cache CDN", "URL asli masih 200 setelah dihapus: cache edge Cloudflare masih menyimpan salinannya. Atur Cache Rule/TTL pendek untuk media.wuzzhub.id bila retensi 1 hari harus berlaku ketat")
	} else if resp != nil {
		info("cache CDN", fmt.Sprintf("URL asli setelah hapus: status %d", resp.StatusCode))
	}
}

type ticket struct {
	SignedURL      string `json:"signed_url"`
	PublicURL      string `json:"public_url"`
	ThumbSignedURL string `json:"thumb_signed_url"`
	ThumbPublicURL string `json:"thumb_public_url"`
	Error          string `json:"error"`
}

func runAPIMode(api string, r2 *storage.R2Storage, cfgErr error) {
	token := os.Getenv("WUZZ_TOKEN")
	if token == "" {
		fmt.Println("Mode -api membutuhkan env WUZZ_TOKEN (JWT akun uji).")
		os.Exit(2)
	}
	video := randomBytes(200 * 1024)
	thumb := randomBytes(6 * 1024)

	section("1. /api/config")
	resp, data := get(api+"/api/config", nil)
	if resp == nil || resp.StatusCode != 200 {
		fail("GET /api/config", string(data))
	} else {
		var c map[string]any
		_ = json.Unmarshal(data, &c)
		info("storage_driver", fmt.Sprint(c["storage_driver"]))
		check(c["max_video_size_mb"] != nil && c["max_video_duration_seconds"] != nil, "batas video disajikan (backend baru sudah dideploy)", string(data))
	}

	section("2. Tiket video lewat backend")
	body, _ := json.Marshal(map[string]any{"file_name": "r2check.mp4", "file_size": len(video), "mime_type": "video/mp4", "thumb_size": len(thumb)})
	req, _ := http.NewRequest(http.MethodPost, api+"/api/media/signed-upload-url?purpose=video", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	tr, err := client.Do(req)
	if err != nil {
		fail("POST signed-upload-url", err.Error())
		return
	}
	raw, _ := io.ReadAll(tr.Body)
	tr.Body.Close()
	var t ticket
	_ = json.Unmarshal(raw, &t)
	check(tr.StatusCode == 200 && t.SignedURL != "" && t.ThumbSignedURL != "", "tiket video + thumbnail diterbitkan", fmt.Sprintf("status %d %s", tr.StatusCode, string(raw)))
	if t.SignedURL == "" || t.ThumbSignedURL == "" {
		return
	}

	section("3. Unggah dan baca")
	st, b := put(t.ThumbSignedURL, thumb, "image/jpeg")
	check(st == 200, "PUT thumbnail", fmt.Sprintf("status %d %s", st, b))
	st, b = put(t.SignedURL, video, "video/mp4")
	check(st == 200, "PUT video", fmt.Sprintf("status %d %s", st, b))
	g, gd := get(t.PublicURL, nil)
	check(g != nil && g.StatusCode == 200 && bytes.Equal(gd, video), "GET video publik sama dengan yang diunggah", "")

	section("4. Aturan tanpa fallback VPS")
	rq, _ := http.NewRequest(http.MethodPost, api+"/api/media/upload", strings.NewReader("x"))
	rq.Header.Set("Authorization", "Bearer "+token)
	ur, uerr := client.Do(rq)
	if uerr != nil {
		fail("POST /api/media/upload", uerr.Error())
	} else {
		ur.Body.Close()
		if ur.StatusCode == 410 {
			pass("/api/media/upload ditolak 410 (driver r2 aktif)")
		} else {
			info("/api/media/upload", fmt.Sprintf("status %d (410 diharapkan setelah STORAGE_DRIVER=r2)", ur.StatusCode))
		}
	}

	section("5. Pembersihan")
	if cfgErr != nil || r2 == nil {
		warn("pembersihan", "env R2_* tidak lengkap; hapus objek r2check-* secara manual dari bucket")
		return
	}
	ctx := context.Background()
	check(r2.Delete(ctx, t.PublicURL) == nil, "Delete video uji", "gagal")
	check(r2.Delete(ctx, t.ThumbPublicURL) == nil, "Delete thumbnail uji", "gagal")
}
