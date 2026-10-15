package storage

import (
	"path"
	"strings"
)

// VideoKeyPrefix adalah awalan kunci objek video di R2 (video/<uuid>.mp4, atau video/<tenant>/<uuid>.mp4). Thumbnail
// mewarisinya karena kuncinya diturunkan dari kunci video. Aturan lifecycle R2 untuk berkas yatim memakai awalan ini.
const VideoKeyPrefix = "video/"

// MaxThumbnailBytes adalah batas ukuran thumbnail video (JPEG kecil).
const MaxThumbnailBytes int64 = 512 * 1024

// thumbnailSuffix adalah akhiran kunci thumbnail. Thumbnail video TIDAK disimpan di database: kuncinya diturunkan dari
// kunci video (<uuid>.mp4 -> <uuid>.thumb.jpg) sehingga klien dan server menghitungnya dengan aturan yang sama.
const thumbnailSuffix = ".thumb.jpg"

var videoKeyExts = map[string]bool{".mp4": true, ".mov": true, ".m4v": true, ".webm": true}

// ThumbnailKey mengubah kunci objek video menjadi kunci thumbnail-nya.
func ThumbnailKey(videoKey string) string {
	ext := path.Ext(videoKey)
	return strings.TrimSuffix(videoKey, ext) + thumbnailSuffix
}

// VideoThumbnailURL mengembalikan URL thumbnail untuk URL media video; ok=false bila URL bukan video.
func VideoThumbnailURL(mediaURL string) (string, bool) {
	clean := mediaURL
	if i := strings.IndexAny(clean, "?#"); i >= 0 {
		clean = clean[:i]
	}
	ext := strings.ToLower(path.Ext(clean))
	if !videoKeyExts[ext] {
		return "", false
	}
	return strings.TrimSuffix(clean, path.Ext(clean)) + thumbnailSuffix, true
}
