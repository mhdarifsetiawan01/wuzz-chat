package connection

import (
	"context"
	"time"
)

// ConnectionRepository mendefinisikan kontrak persistensi data relasi pertemanan.
// Seluruh operasi mewajibkan konteks tenancy (tenantID) untuk menjamin isolasi data multi-tenant.
type ConnectionRepository interface {
	// CreateRequest menyimpan permintaan koneksi baru ke basis data.
	CreateRequest(ctx context.Context, conn *UserConnection) error

	// FindConnection mencari relasi antara dua user di dalam tenant tertentu (canonical order).
	FindConnection(ctx context.Context, tenantID, userA, userB string) (*UserConnection, error)

	// FindConnectionByID mengambil relasi berdasarkan ID primary key.
	FindConnectionByID(ctx context.Context, tenantID, connID string) (*UserConnection, error)

	// UpdateStatus memperbarui status relasi (pending -> accepted/declined/blocked).
	UpdateStatus(ctx context.Context, tenantID, connID string, status ConnectionStatus) error

	// ResetRequest memperbarui relasi yang declined/expired menjadi pending kembali dengan pengirim baru.
	ResetRequest(ctx context.Context, tenantID, connID, requesterID, receiverID string) error

	// DeleteConnection menghapus relasi pertemanan (unfriend) antar dua pengguna.
	DeleteConnection(ctx context.Context, tenantID, userA, userB string) error

	// CountPendingRequestsReceived menghitung jumlah permintaan pending yang belum direspons oleh target user.
	CountPendingRequestsReceived(ctx context.Context, tenantID, receiverID string) (int, error)

	// CountDailyRequestsSent menghitung jumlah permintaan pertemanan yang dikirim user sejak waktu tertentu.
	CountDailyRequestsSent(ctx context.Context, tenantID, requesterID string, since time.Time) (int, error)

	// ListFriendsCursor mengambil daftar teman berstatus 'accepted' menggunakan cursor seek index (updated_at DESC, id DESC).
	ListFriendsCursor(ctx context.Context, tenantID, userID string, beforeTime time.Time, beforeID string, limit int) ([]*FriendItem, error)

	// ListPendingRequests mengambil daftar permohonan pertemanan pending (incoming atau outgoing).
	ListPendingRequests(ctx context.Context, tenantID, userID, direction string) ([]*PendingRequestItem, error)

	// IsFriend memeriksa apakah userA dan userB berstatus 'accepted' di tenant tertentu.
	IsFriend(ctx context.Context, tenantID, userA, userB string) (bool, error)
}
