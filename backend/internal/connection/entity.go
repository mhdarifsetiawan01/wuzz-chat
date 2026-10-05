package connection

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ConnectionStatus mendefinisikan status siklus hidup relasi pertemanan (Finite State Machine).
type ConnectionStatus string

const (
	StatusNone     ConnectionStatus = "none"     // Belum ada relasi
	StatusPending  ConnectionStatus = "pending"  // Menunggu konfirmasi penerima
	StatusAccepted ConnectionStatus = "accepted" // Sah berteman (Connected)
	StatusDeclined ConnectionStatus = "declined" // Ditolak, dalam masa cooldown
	StatusBlocked  ConnectionStatus = "blocked"  // Pemblokiran interaksi
)

// SourceType mendefinisikan asal muasal inisiasi relasi koneksi.
type SourceType string

const (
	SourceInAppRequest SourceType = "in_app_request" // Permintaan langsung dari antarmuka aplikasi
	SourcePhoneContact SourceType = "phone_contact" // Pencocokan kontak buku telepon
)

// UserConnection merepresentasikan baris entitas pada tabel user_connections.
type UserConnection struct {
	ID          string           `json:"id"`
	TenantID    string           `json:"tenant_id"`
	RequesterID string           `json:"requester_id"`
	ReceiverID  string           `json:"receiver_id"`
	Status      ConnectionStatus `json:"status"`
	SourceType  SourceType       `json:"source_type"`
	CreatedAt   time.Time        `json:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at"`
}

// FriendItem merepresentasikan profil teman terhubung hasil proyeksi INNER JOIN dengan performa tinggi.
type FriendItem struct {
	ID               string    `json:"id"`
	Username         string    `json:"username"`
	DisplayName      string    `json:"display_name"`
	AvatarURL        string    `json:"avatar_url"`
	StatusMessage    string    `json:"status_message"`
	Bio              string    `json:"bio"`
	Role             string    `json:"role"`
	IsVerified       bool      `json:"is_verified"`
	IsPrivateAccount bool      `json:"is_private_account"`
	ConnectionID     string    `json:"connection_id"`
	ConnectedAt      time.Time `json:"connected_at"`
}

// PendingRequestItem merepresentasikan permintaan pertemanan yang sedang menunggu respon (masuk atau keluar).
type PendingRequestItem struct {
	ID              string           `json:"id"`
	RequesterID     string           `json:"requester_id"`
	ReceiverID      string           `json:"receiver_id"`
	Direction       string           `json:"direction"` // "incoming" (harus direspon) atau "outgoing" (menunggu persetujuan)
	Status          ConnectionStatus `json:"status"`
	SourceType      SourceType       `json:"source_type"`
	PeerID          string           `json:"peer_id"`
	PeerUsername    string           `json:"peer_username"`
	PeerDisplayName string           `json:"peer_display_name"`
	PeerAvatarURL   string           `json:"peer_avatar_url"`
	PeerIsVerified  bool             `json:"peer_is_verified"`
	CreatedAt       time.Time        `json:"created_at"`
	UpdatedAt       time.Time        `json:"updated_at"`
}

// FriendsListResponse merepresentasikan respon pagination cursor untuk daftar teman.
type FriendsListResponse struct {
	Friends    []*FriendItem `json:"friends"`
	NextCursor string        `json:"next_cursor,omitempty"`
	HasMore    bool          `json:"has_more"`
}

// ConnectionStatusResponse merepresentasikan respon pengecekan status relasi dengan target user.
type ConnectionStatusResponse struct {
	Status           ConnectionStatus `json:"status"`
	Direction        string           `json:"direction,omitempty"` // "incoming", "outgoing", atau ""
	ConnectionID     string           `json:"connection_id,omitempty"`
	IsPrivateAccount bool             `json:"is_private_account"`
	CanMessage       bool             `json:"can_message"`
	CanCall          bool             `json:"can_call"`
	// BlockedByMe true bila pemanggil yang memblokir target; BlockedByThem true bila sebaliknya.
	BlockedByMe   bool `json:"blocked_by_me,omitempty"`
	BlockedByThem bool `json:"blocked_by_them,omitempty"`
}

// EncodeCursor mengonversi timestamp nanosecond dan connection ID ke format string opaque Base64 URL-safe.
func EncodeCursor(t time.Time, id string) string {
	raw := fmt.Sprintf("%d:%s", t.UTC().UnixNano(), id)
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

// DecodeCursor membaca cursor Base64 kembali menjadi timestamp UTC dan connection ID.
func DecodeCursor(cursorStr string) (time.Time, string, error) {
	if strings.TrimSpace(cursorStr) == "" {
		return time.Time{}, "", nil
	}
	bytes, err := base64.RawURLEncoding.DecodeString(cursorStr)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("cursor tidak valid: %w", err)
	}
	parts := strings.SplitN(string(bytes), ":", 2)
	if len(parts) != 2 {
		return time.Time{}, "", fmt.Errorf("format cursor tidak dikenali")
	}
	nano, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("timestamp cursor tidak valid: %w", err)
	}
	return time.Unix(0, nano).UTC(), parts[1], nil
}
