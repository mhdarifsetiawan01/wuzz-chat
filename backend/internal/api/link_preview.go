package api

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/broker"
)

var (
	ogTitleRegex    = regexp.MustCompile(`(?i)<meta\s+[^>]*(?:property|name)=["'](?:og:title|twitter:title|title)["'][^>]*content=["']([^"']*)["']|<meta\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["'](?:og:title|twitter:title|title)["']`)
	ogDescRegex     = regexp.MustCompile(`(?i)<meta\s+[^>]*(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]*content=["']([^"']*)["']|<meta\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["'](?:og:description|twitter:description|description)["']`)
	ogImageRegex    = regexp.MustCompile(`(?i)<meta\s+[^>]*(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src|image)["'][^>]*content=["']([^"']*)["']|<meta\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src|image)["']`)
	ogSiteNameRegex = regexp.MustCompile(`(?i)<meta\s+[^>]*(?:property|name)=["'](?:og:site_name|site_name)["'][^>]*content=["']([^"']*)["']|<meta\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["'](?:og:site_name|site_name)["']`)
	htmlTitleRegex  = regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)
	faviconRegex    = regexp.MustCompile(`(?i)<link\s+[^>]*rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*href=["']([^"']*)["']|<link\s+[^>]*href=["']([^"']*)["'][^>]*rel=["'](?:shortcut icon|icon|apple-touch-icon)["']`)
)

// LinkPreview merepresentasikan metadata OpenGraph dari sebuah URL.
type LinkPreview struct {
	URL         string `json:"url"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	SiteName    string `json:"site_name,omitempty"`
	Favicon     string `json:"favicon,omitempty"`
}

// LinkPreviewHandler mengelola scraping metadata OpenGraph yang aman dari SSRF & DNS Rebinding.
type LinkPreviewHandler struct {
	broker broker.MessageBroker
	client *http.Client
}

// SetClient menyetel HTTP client kustom (terutama untuk unit test / mocking).
func (h *LinkPreviewHandler) SetClient(c *http.Client) {
	h.client = c
}

// NewLinkPreviewHandler membuat instance LinkPreviewHandler baru dengan safeDialContext.
func NewLinkPreviewHandler(b broker.MessageBroker) *LinkPreviewHandler {
	dialer := &net.Dialer{
		Timeout:   3 * time.Second,
		KeepAlive: 10 * time.Second,
	}

	transport := &http.Transport{
		DialContext:           safeDialContext(dialer),
		TLSHandshakeTimeout:   3 * time.Second,
		ResponseHeaderTimeout: 3 * time.Second,
		DisableKeepAlives:     true,
	}

	return &LinkPreviewHandler{
		broker: b,
		client: &http.Client{
			Transport: transport,
			Timeout:   5 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return errors.New("terlalu banyak redirect (maksimal 3)")
				}
				if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
					return errors.New("skema URL redirect tidak didukung")
				}
				// Validasi keamanan host target redirect (SSRF Protection)
				if err := isSafeHost(req.URL.Hostname()); err != nil {
					return fmt.Errorf("redirect ke host dilarang (%s): %w", req.URL.Hostname(), err)
				}
				return nil
			},
		},
	}
}

// ServeHTTP menangani request GET /api/link-preview?url=...
func (h *LinkPreviewHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rawURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if rawURL == "" {
		http.Error(w, "Query parameter 'url' is required", http.StatusBadRequest)
		return
	}

	// 1. Validasi skema URL
	parsedURL, err := url.Parse(rawURL)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		http.Error(w, "Invalid URL scheme (only http and https allowed)", http.StatusBadRequest)
		return
	}

	// 2. Proteksi SSRF (Server-Side Request Forgery)
	if err := isSafeHost(parsedURL.Hostname()); err != nil {
		http.Error(w, "URL host is not permitted: "+err.Error(), http.StatusForbidden)
		return
	}

	// 3. Cek Cache (Redis / In-Memory)
	cacheKey := "wuzz:preview:" + hashMD5(rawURL)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if h.broker != nil {
		if cachedJSON, err := h.broker.Get(ctx, cacheKey); err == nil && cachedJSON != "" {
			var cachedPreview LinkPreview
			if err := json.Unmarshal([]byte(cachedJSON), &cachedPreview); err == nil && cachedPreview.Title != "" {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("X-Cache", "HIT")
				_, _ = w.Write([]byte(cachedJSON))
				return
			}
		}
	}

	// 4. Scrape metadata dari URL
	preview, err := h.fetchAndExtract(rawURL)
	if err != nil {
		http.Error(w, "Failed to scrape link preview: "+err.Error(), http.StatusBadGateway)
		return
	}

	// 5. Simpan hasil ke Cache hanya jika Title valid (TTL 24 jam)
	previewJSON, err := json.Marshal(preview)
	if err == nil && preview.Title != "" && h.broker != nil {
		_ = h.broker.Set(ctx, cacheKey, string(previewJSON), 24*time.Hour)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	_, _ = w.Write(previewJSON)
}

// fetchAndExtract mengambil metadata OpenGraph / oEmbed dari URL.
func (h *LinkPreviewHandler) fetchAndExtract(targetURL string) (*LinkPreview, error) {
	parsed, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}

	hostLower := strings.ToLower(parsed.Hostname())

	// Dukungan YouTube oEmbed resmi (100% cepat & reliable tanpa terblokir bot-check)
	if strings.Contains(hostLower, "youtube.com") || strings.Contains(hostLower, "youtu.be") {
		if ytPreview, ytErr := h.fetchYouTubeOEmbed(targetURL); ytErr == nil && ytPreview != nil {
			return ytPreview, nil
		}
	}

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, err
	}

	// Gunakan WhatsApp/Facebook Crawler User-Agent yang diakui universal oleh web servers
	req.Header.Set("User-Agent", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9,id;q=0.8")

	resp, err := h.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http fetch error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return nil, fmt.Errorf("remote returned HTTP %d", resp.StatusCode)
	}

	// Batasi pembacaan body maks 512KB untuk mencegah memory exhaustion
	limitReader := io.LimitReader(resp.Body, 512*1024)
	bodyBytes, err := io.ReadAll(limitReader)
	if err != nil {
		return nil, fmt.Errorf("failed to read body: %w", err)
	}

	bodyStr := string(bodyBytes)
	baseURL, _ := url.Parse(targetURL)

	preview := &LinkPreview{
		URL: targetURL,
	}

	// Ekstrak Title (og:title -> <title>)
	if match := extractMatch(ogTitleRegex, bodyStr); match != "" {
		preview.Title = cleanText(match)
	} else if match := extractMatch(htmlTitleRegex, bodyStr); match != "" {
		preview.Title = cleanText(match)
	}

	// Ekstrak Description (og:description -> meta description)
	if match := extractMatch(ogDescRegex, bodyStr); match != "" {
		preview.Description = cleanText(match)
	}

	// Ekstrak Image (og:image)
	if match := extractMatch(ogImageRegex, bodyStr); match != "" {
		preview.Image = resolveRelativeURL(baseURL, cleanText(match))
	}

	// Ekstrak Site Name (og:site_name -> fallback host)
	if match := extractMatch(ogSiteNameRegex, bodyStr); match != "" {
		preview.SiteName = cleanText(match)
	} else if baseURL != nil {
		preview.SiteName = baseURL.Hostname()
	}

	// Ekstrak Favicon
	if match := extractMatch(faviconRegex, bodyStr); match != "" {
		preview.Favicon = resolveRelativeURL(baseURL, cleanText(match))
	} else if baseURL != nil {
		preview.Favicon = fmt.Sprintf("%s://%s/favicon.ico", baseURL.Scheme, baseURL.Host)
	}

	return preview, nil
}

// validateIP memeriksa apakah suatu alamat IP adalah alamat privat/internal/loopback/link-local/metadata/CGNAT.
func validateIP(ip net.IP) error {
	if ip == nil {
		return errors.New("nil IP address")
	}

	// Unwrap IPv4-mapped IPv6 (misal ::ffff:127.0.0.1)
	if ip4 := ip.To4(); ip4 != nil {
		ip = ip4
	}

	if ip.IsLoopback() {
		return errors.New("loopback IP address not allowed (127.0.0.0/8, ::1)")
	}
	if ip.IsPrivate() {
		return errors.New("private IP subnet not allowed (RFC 1918, RFC 4193)")
	}
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return errors.New("link-local IP address not allowed (169.254.0.0/16, fe80::/10)")
	}
	if ip.IsUnspecified() {
		return errors.New("unspecified IP address not allowed (0.0.0.0, ::)")
	}

	// Cloud metadata IP explicit check: 169.254.169.254
	if ip.String() == "169.254.169.254" {
		return errors.New("cloud metadata endpoint not allowed")
	}

	// Carrier-Grade NAT (RFC 6598: 100.64.0.0/10)
	cgnat := net.IPNet{
		IP:   net.ParseIP("100.64.0.0"),
		Mask: net.CIDRMask(10, 32),
	}
	if cgnat.Contains(ip) {
		return errors.New("carrier-grade NAT IP address not allowed (100.64.0.0/10)")
	}

	return nil
}

// safeDialContext membuat DialContext yang memvalidasi setiap IP saat koneksi TCP dibuka
// dan mem-pin koneksi langsung ke IP yang telah diverifikasi untuk mencegah DNS Rebinding / TOCTOU SSRF.
func safeDialContext(dialer *net.Dialer) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}

		hostLower := strings.ToLower(host)
		if hostLower == "localhost" || strings.HasSuffix(hostLower, ".local") {
			return nil, errors.New("localhost/local addresses not allowed")
		}

		// Jika host berupa literal IP
		if ip := net.ParseIP(host); ip != nil {
			if err := validateIP(ip); err != nil {
				return nil, err
			}
			return dialer.DialContext(ctx, network, addr)
		}

		// Lookup IP langsung saat dial
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if err != nil {
			return nil, fmt.Errorf("dns lookup failed: %w", err)
		}
		if len(ips) == 0 {
			return nil, errors.New("no IP address found for host")
		}

		var targetIP net.IP
		for _, ip := range ips {
			if err := validateIP(ip); err != nil {
				return nil, fmt.Errorf("ip %s is forbidden: %w", ip.String(), err)
			}
			if targetIP == nil {
				targetIP = ip
			}
		}

		// PENTING: Sambungkan koneksi ke targetIP yang SUDAH divalidasi (bukan host).
		// Ini mem-pin IP koneksi dan mencegah secondary DNS resolution yang dapat dimanipulasi attacker!
		targetAddr := net.JoinHostPort(targetIP.String(), port)
		return dialer.DialContext(ctx, network, targetAddr)
	}
}

// isSafeHost memeriksa apakah hostname aman dan bukan IP privat/loopback (SSRF guard pre-check).
func isSafeHost(hostname string) error {
	if hostname == "" {
		return errors.New("empty hostname")
	}

	hostLower := strings.ToLower(hostname)
	if hostLower == "localhost" || strings.HasSuffix(hostLower, ".local") {
		return errors.New("localhost/local addresses not allowed")
	}

	if ip := net.ParseIP(hostname); ip != nil {
		return validateIP(ip)
	}

	ips, err := net.LookupIP(hostname)
	if err != nil {
		return fmt.Errorf("dns resolution failed: %w", err)
	}

	for _, ip := range ips {
		if err := validateIP(ip); err != nil {
			return err
		}
	}

	return nil
}

func extractMatch(re *regexp.Regexp, s string) string {
	matches := re.FindStringSubmatch(s)
	if len(matches) == 0 {
		return ""
	}
	for i := 1; i < len(matches); i++ {
		if matches[i] != "" {
			return matches[i]
		}
	}
	return ""
}

func cleanText(s string) string {
	decoded := html.UnescapeString(s)
	return strings.TrimSpace(decoded)
}

func resolveRelativeURL(base *url.URL, target string) string {
	if target == "" || base == nil {
		return target
	}
	parsed, err := url.Parse(target)
	if err != nil {
		return target
	}
	return base.ResolveReference(parsed).String()
}

type youTubeOEmbedResponse struct {
	Title        string `json:"title"`
	AuthorName   string `json:"author_name"`
	ThumbnailURL string `json:"thumbnail_url"`
	ProviderName string `json:"provider_name"`
}

func (h *LinkPreviewHandler) fetchYouTubeOEmbed(targetURL string) (*LinkPreview, error) {
	oembedURL := fmt.Sprintf("https://www.youtube.com/oembed?url=%s&format=json", url.QueryEscape(targetURL))
	req, err := http.NewRequest("GET", oembedURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")

	resp, err := h.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("youtube oembed status %d", resp.StatusCode)
	}

	var yt youTubeOEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&yt); err != nil {
		return nil, err
	}

	if yt.Title == "" {
		return nil, errors.New("empty youtube title")
	}

	desc := yt.AuthorName
	if desc != "" {
		desc = fmt.Sprintf("Video oleh %s di YouTube", desc)
	}

	siteName := yt.ProviderName
	if siteName == "" {
		siteName = "YouTube"
	}

	return &LinkPreview{
		URL:         targetURL,
		Title:       yt.Title,
		Description: desc,
		Image:       yt.ThumbnailURL,
		SiteName:    siteName,
		Favicon:     "https://www.youtube.com/favicon.ico",
	}, nil
}

func hashMD5(s string) string {
	h := md5.Sum([]byte(s))
	return hex.EncodeToString(h[:])
}
