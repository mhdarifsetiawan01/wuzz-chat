package messaging

import (
	"time"
)

// MessageRepository mendefinisikan operasi data untuk riwayat pesan, reaksi, dan sematan pesan.
type MessageRepository interface {
	// GetMessageByID mengambil satu pesan berdasarkan ID.
	GetMessageByID(msgID string) (*Message, error)

	// DeleteMessage menghapus pesan (untuk saya saja atau untuk semua orang).
	DeleteMessage(msgID, userID string, deleteForEveryone bool) (*Message, error)

	// EditMessage mengedit isi pesan yang sudah terkirim dalam batas window 15 menit.
	EditMessage(msgID, userID, newContent string) (*Message, error)

	// ForwardMessage meneruskan pesan ke 1 sampai 5 percakapan target.
	ForwardMessage(srcMsgID, senderID, senderNickname string, targetRoomIDs []string, plaintextContent string) ([]Message, error)

	// UpdateMessageStatus memperbarui status tanda terima pesan (sent, delivered, read).
	UpdateMessageStatus(msgID string, status string) error

	// ToggleReaction menambah atau menghapus reaksi emoji user terhadap pesan tertentu.
	ToggleReaction(msgID, emoji, userID string) (string, error)

	// MarkRoomMessagesAsRead menandai semua pesan yang belum dibaca dari lawan bicara menjadi 'read'.
	MarkRoomMessagesAsRead(roomID, excludeUserID string) error

	// MarkUserMessagesAsDelivered menandai semua pesan berstatus 'sent' yang ditujukan ke user menjadi 'delivered'.
	MarkUserMessagesAsDelivered(userID string) ([]string, error)

	// GetRoomHistory mengambil riwayat pesan dalam suatu room/percakapan.
	GetRoomHistory(roomID string, limit int) ([]Message, error)

	// GetRoomHistoryForUser mengambil riwayat pesan yang difilter berdasarkan cleared_at milik userID.
	GetRoomHistoryForUser(roomID, userID string, limit int) ([]Message, error)

	// GetRoomHistorySince mengambil riwayat pesan yang lebih baru dari timestamp `since`.
	GetRoomHistorySince(roomID, userID string, since time.Time, limit int) ([]Message, error)

	// PinMessage menyematkan pesan dalam percakapan (maksimal 3 pesan per percakapan).
	PinMessage(convID, msgID, userID string, durationHours int) (*PinnedMessage, error)

	// UnpinMessage melepas sematan pesan dalam percakapan.
	UnpinMessage(convID, msgID string) error

	// GetPinnedMessages mengambil semua pesan yang disematkan dalam percakapan yang belum kadaluarsa.
	GetPinnedMessages(convID string) ([]PinnedMessage, error)

	// SearchMessages mencari riwayat pesan teks dalam ruang obrolan.
	SearchMessages(roomID, userID, query string, limit int) ([]Message, error)
}

// ConversationRepository mendefinisikan operasi data untuk percakapan dan keanggotaan room.
type ConversationRepository interface {
	// GetOrCreateDirectConversation membuat atau mengembalikan ID percakapan 1-on-1 antar dua user.
	GetOrCreateDirectConversation(userA, userB string) (string, error)

	// GetUserConversations mengambil daftar obrolan aktif milik seorang user.
	GetUserConversations(userID string) ([]Conversation, error)

	// PinConversation menandai percakapan sebagai pinned untuk user tertentu.
	PinConversation(conversationID, userID string) error

	// UnpinConversation melepas tanda pinned percakapan untuk user tertentu.
	UnpinConversation(conversationID, userID string) error

	// ClearConversation mencatat waktu pembersihan percakapan (cleared_at) untuk userID tertentu.
	ClearConversation(conversationID, userID string) error

	// GetConversationMemberUsernames mengambil seluruh username dan display_name anggota dalam suatu percakapan.
	GetConversationMemberUsernames(conversationID string) ([]string, error)

	// IsUserInConversation memeriksa apakah user dengan userID tertentu adalah anggota sah dari conversationID.
	IsUserInConversation(conversationID, userID string) (bool, error)

	// IsConversationExpired memeriksa apakah suatu percakapan / subgrup telah mencapai batas masa aktif.
	IsConversationExpired(conversationID string) bool
}

// UserLookupRepository mendefinisikan operasi pembacaan identitas singkat user untuk resolusi display name.
type UserLookupRepository interface {
	GetUserNickname(userID string) (string, error)
}
