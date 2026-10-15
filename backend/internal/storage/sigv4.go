package storage

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"sort"
	"strconv"
	"strings"
	"time"
)

// presignParams berisi masukan untuk membuat URL presigned AWS Signature V4 (autentikasi lewat query string).
type presignParams struct {
	Method      string // GET, PUT, DELETE
	Host        string // host yang ikut ditandatangani, mis. "<account>.r2.cloudflarestorage.com"
	Path        string // path mentah (belum di-encode), diawali "/", mis. "/bucket/key.mp4"
	Region      string // R2 memakai "auto"
	AccessKeyID string
	SecretKey   string
	Now         time.Time
	Expires     time.Duration     // dibulatkan ke detik, 1 detik s/d 7 hari
	Headers     map[string]string // header tambahan yang ikut ditandatangani (kunci huruf kecil), mis. content-type
}

// presignURL mengembalikan "path?query" lengkap dengan X-Amz-Signature. Payload ditandai UNSIGNED-PAYLOAD
// sehingga isi berkas tidak perlu di-hash oleh klien.
func presignURL(p presignParams) string {
	const service = "s3"
	amzDate := p.Now.UTC().Format("20060102T150405Z")
	date := amzDate[:8]
	scope := date + "/" + p.Region + "/" + service + "/aws4_request"

	headers := map[string]string{"host": p.Host}
	for k, v := range p.Headers {
		headers[strings.ToLower(k)] = strings.TrimSpace(v)
	}
	names := make([]string, 0, len(headers))
	for k := range headers {
		names = append(names, k)
	}
	sort.Strings(names)
	signedHeaders := strings.Join(names, ";")

	var canonHeaders strings.Builder
	for _, k := range names {
		canonHeaders.WriteString(k + ":" + headers[k] + "\n")
	}

	expires := int64(p.Expires / time.Second)
	if expires < 1 {
		expires = 1
	}
	query := map[string]string{
		"X-Amz-Algorithm":     "AWS4-HMAC-SHA256",
		"X-Amz-Credential":    p.AccessKeyID + "/" + scope,
		"X-Amz-Date":          amzDate,
		"X-Amz-Expires":       strconv.FormatInt(expires, 10),
		"X-Amz-SignedHeaders": signedHeaders,
	}
	canonQuery := canonicalQuery(query)
	canonPath := encodePath(p.Path)

	canonicalRequest := strings.Join([]string{
		p.Method,
		canonPath,
		canonQuery,
		canonHeaders.String(),
		signedHeaders,
		"UNSIGNED-PAYLOAD",
	}, "\n")

	hashed := sha256.Sum256([]byte(canonicalRequest))
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		hex.EncodeToString(hashed[:]),
	}, "\n")

	kDate := hmacSHA256([]byte("AWS4"+p.SecretKey), date)
	kRegion := hmacSHA256(kDate, p.Region)
	kService := hmacSHA256(kRegion, service)
	kSigning := hmacSHA256(kService, "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(kSigning, stringToSign))

	return canonPath + "?" + canonQuery + "&X-Amz-Signature=" + signature
}

func hmacSHA256(key []byte, data string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(data))
	return m.Sum(nil)
}

// canonicalQuery mengurutkan parameter berdasarkan nama dan meng-encode kunci/nilai sesuai aturan SigV4.
func canonicalQuery(q map[string]string) string {
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, uriEncode(k, true)+"="+uriEncode(q[k], true))
	}
	return strings.Join(parts, "&")
}

// encodePath meng-encode tiap segmen path namun mempertahankan tanda "/".
func encodePath(path string) string {
	segs := strings.Split(path, "/")
	for i, s := range segs {
		segs[i] = uriEncode(s, true)
	}
	return strings.Join(segs, "/")
}

// uriEncode mengikuti aturan AWS: hanya A-Z a-z 0-9 - _ . ~ yang tidak di-encode.
func uriEncode(s string, encodeSlash bool) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '-', c == '_', c == '.', c == '~':
			b.WriteByte(c)
		case c == '/' && !encodeSlash:
			b.WriteByte(c)
		default:
			b.WriteString("%" + strings.ToUpper(hex.EncodeToString([]byte{c})))
		}
	}
	return b.String()
}
