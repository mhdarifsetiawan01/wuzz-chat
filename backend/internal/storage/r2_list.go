package storage

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

// ObjectInfo adalah satu objek di bucket (hasil ListObjectsV2).
type ObjectInfo struct {
	Key          string
	Size         int64
	LastModified time.Time
}

// ListPage adalah satu halaman hasil daftar objek. NextToken kosong berarti halaman terakhir.
type ListPage struct {
	Objects   []ObjectInfo
	NextToken string
}

type listBucketResult struct {
	IsTruncated           bool   `xml:"IsTruncated"`
	NextContinuationToken string `xml:"NextContinuationToken"`
	Contents              []struct {
		Key          string `xml:"Key"`
		Size         int64  `xml:"Size"`
		LastModified string `xml:"LastModified"`
	} `xml:"Contents"`
}

// KeyFromURL mengembalikan kunci objek bila URL milik bucket ini (awalan R2_PUBLIC_BASE_URL).
func (s *R2Storage) KeyFromURL(fileURL string) (string, bool) { return s.keyFromURL(fileURL) }

// ListObjects mendaftar objek bucket (ListObjectsV2, hanya-baca). prefix boleh kosong; token kosong = halaman pertama;
// maxKeys 1..1000. Dipakai alat laporan (cmd/orphanreport); server tidak memanggilnya.
func (s *R2Storage) ListObjects(ctx context.Context, prefix, token string, maxKeys int) (*ListPage, error) {
	if maxKeys <= 0 || maxKeys > 1000 {
		maxKeys = 1000
	}
	q := map[string]string{"list-type": "2", "max-keys": strconv.Itoa(maxKeys)}
	if prefix != "" {
		q["prefix"] = prefix
	}
	if token != "" {
		q["continuation-token"] = token
	}
	signed := presignURL(presignParams{
		Method:      http.MethodGet,
		Host:        s.host,
		Path:        "/" + s.bucket,
		Region:      "auto",
		AccessKeyID: s.accessKeyID,
		SecretKey:   s.secretKey,
		Now:         s.now(),
		Expires:     time.Minute,
		Query:       q,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.scheme+"://"+s.host+signed, nil)
	if err != nil {
		return nil, fmt.Errorf("gagal membuat request daftar objek R2: %w", err)
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gagal menghubungi R2: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return nil, fmt.Errorf("gagal membaca respons R2: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		if len(body) > 300 {
			body = body[:300]
		}
		return nil, fmt.Errorf("R2 gagal mendaftar objek (status %d): %s", resp.StatusCode, string(body))
	}
	var parsed listBucketResult
	if err := xml.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("respons daftar objek R2 tidak valid: %w", err)
	}
	page := &ListPage{Objects: make([]ObjectInfo, 0, len(parsed.Contents))}
	for _, c := range parsed.Contents {
		lm, _ := time.Parse(time.RFC3339, c.LastModified)
		page.Objects = append(page.Objects, ObjectInfo{Key: c.Key, Size: c.Size, LastModified: lm})
	}
	if parsed.IsTruncated {
		page.NextToken = parsed.NextContinuationToken
	}
	return page, nil
}
