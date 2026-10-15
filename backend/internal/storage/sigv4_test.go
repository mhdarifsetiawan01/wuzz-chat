package storage

import (
	"strings"
	"testing"
	"time"
)

// Vektor resmi dokumentasi AWS "Authenticating Requests: Using Query Parameters (SigV4)".
func TestPresignURL_AWSDocumentedVector(t *testing.T) {
	got := presignURL(presignParams{
		Method:      "GET",
		Host:        "examplebucket.s3.amazonaws.com",
		Path:        "/test.txt",
		Region:      "us-east-1",
		AccessKeyID: "AKIAIOSFODNN7EXAMPLE",
		SecretKey:   "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		Now:         time.Date(2013, 5, 24, 0, 0, 0, 0, time.UTC),
		Expires:     86400 * time.Second,
	})
	const want = "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
	if !strings.HasSuffix(got, "X-Amz-Signature="+want) {
		t.Fatalf("signature tidak cocok dengan vektor AWS:\n%s", got)
	}
}
