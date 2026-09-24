package messaging

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/ws"
)

var (
	ErrUnauthorized       = errors.New("unauthorized")
	ErrForbidden          = errors.New("forbidden")
	ErrNotFound           = errors.New("not found")
	ErrBadRequest         = errors.New("bad request")
	ErrMissingMessageID   = errors.New("message_id wajib disertakan")
	ErrEmptyContent       = errors.New("content tidak boleh kosong")
	ErrTargetRoomsEmpty   = errors.New("target_room_ids minimal 1 percakapan")
	ErrTargetRoomsExceed  = errors.New("maksimal meneruskan pesan ke 5 percakapan sekaligus")
	ErrMissingRoomID      = errors.New("room_id wajib disertakan")
	ErrMissingQuery       = errors.New("query pencarian wajib disertakan")
	ErrInvalidStatus      = errors.New("status tanda terima tidak valid")
)

// MessageBroadcaster mendefinisikan interface pengiriman event real-time ke room.
// Struct ws.Hub secara langsung memenuhi interface ini tanpa memerlukan adapter.
type MessageBroadcaster interface {
	BroadcastRoom(roomID string, msg ws.Message, senderID string)
}

// MessageService mengorkestrasi logika bisnis pesan dan percakapan.
type MessageService struct {
	msgRepo     MessageRepository
	convRepo    ConversationRepository
	userRepo    UserLookupRepository
	broadcaster MessageBroadcaster
}

// NewMessageService membuat instance MessageService baru dengan dependensi yang diinjeksi.
func NewMessageService(
	mr MessageRepository,
	cr ConversationRepository,
	ur UserLookupRepository,
	b MessageBroadcaster,
) *MessageService {
	return &MessageService{
		msgRepo:     mr,
		convRepo:    cr,
		userRepo:    ur,
		broadcaster: b,
	}
}

// SetBroadcaster menyuntikkan MessageBroadcaster secara terpisah jika diperlukan.
func (s *MessageService) SetBroadcaster(b MessageBroadcaster) {
	s.broadcaster = b
}

// EditMessage memvalidasi dan mengubah isi pesan teks dalam batas window 15 menit.
func (s *MessageService) EditMessage(ctx context.Context, input EditMessageInput) (*Message, error) {
	msgID := strings.TrimSpace(input.MessageID)
	if msgID == "" {
		return nil, ErrMissingMessageID
	}
	newContent := strings.TrimSpace(input.Content)
	if newContent == "" {
		return nil, ErrEmptyContent
	}

	updatedMsg, err := s.msgRepo.EditMessage(msgID, input.UserID, newContent)
	if err != nil {
		return nil, err
	}

	// Broadcast TypeMessageEdited ke seluruh client di room
	if s.broadcaster != nil && updatedMsg != nil {
		s.broadcaster.BroadcastRoom(updatedMsg.RoomID, ws.Message{
			ID:         updatedMsg.ID,
			Type:       ws.TypeMessageEdited,
			Room:       updatedMsg.RoomID,
			From:       updatedMsg.FromID,
			Content:    updatedMsg.Content,
			NewContent: updatedMsg.Content,
			IsEdited:   true,
			EditedAt:   updatedMsg.EditedAt,
			Timestamp:  time.Now().UTC(),
		}, "")
	}

	return updatedMsg, nil
}

// DeleteMessage menghapus pesan (Delete for Me atau Delete for Everyone).
func (s *MessageService) DeleteMessage(ctx context.Context, input DeleteMessageInput) (*Message, error) {
	msgID := strings.TrimSpace(input.MessageID)
	if msgID == "" {
		return nil, ErrMissingMessageID
	}

	updatedMsg, err := s.msgRepo.DeleteMessage(msgID, input.UserID, input.DeleteForEveryone)
	if err != nil {
		return nil, err
	}

	// Jika delete for everyone, broadcast event pembatalan pesan
	if input.DeleteForEveryone && s.broadcaster != nil && updatedMsg != nil {
		s.broadcaster.BroadcastRoom(updatedMsg.RoomID, ws.Message{
			ID:        updatedMsg.ID,
			Type:      ws.TypeMessageDeleted,
			Room:      updatedMsg.RoomID,
			Content:   "🚫 Pesan ini telah dihapus",
			IsDeleted: true,
			Timestamp: time.Now().UTC(),
		}, "")
	}

	return updatedMsg, nil
}

// ForwardMessage meneruskan pesan ke 1 sampai 5 percakapan target sekaligus.
func (s *MessageService) ForwardMessage(ctx context.Context, input ForwardMessageInput) ([]Message, error) {
	msgID := strings.TrimSpace(input.SourceMessageID)
	if msgID == "" {
		return nil, ErrMissingMessageID
	}
	if len(input.TargetRoomIDs) == 0 {
		return nil, ErrTargetRoomsEmpty
	}
	if len(input.TargetRoomIDs) > 5 {
		return nil, ErrTargetRoomsExceed
	}

	// Validasi bahwa user merupakan anggota sah dari setiap percakapan target
	if s.convRepo != nil {
		for _, roomID := range input.TargetRoomIDs {
			roomID = strings.TrimSpace(roomID)
			if roomID == "" {
				continue
			}
			isMember, err := s.convRepo.IsUserInConversation(roomID, input.SenderID)
			if err != nil || !isMember {
				return nil, fmt.Errorf("Anda bukan anggota percakapan target %s", roomID)
			}
		}
	}

	// Resolusi nickname pengirim jika belum disediakan
	senderNickname := input.SenderNickname
	if senderNickname == "" && s.userRepo != nil {
		if nick, err := s.userRepo.GetUserNickname(input.SenderID); err == nil && nick != "" {
			senderNickname = nick
		}
	}

	forwardedMsgs, err := s.msgRepo.ForwardMessage(msgID, input.SenderID, senderNickname, input.TargetRoomIDs, input.PlaintextContent)
	if err != nil {
		return nil, err
	}

	// Broadcast setiap pesan terusan ke room tujuan
	if s.broadcaster != nil {
		for _, fm := range forwardedMsgs {
			wsMsg := ws.Message{
				ID:          fm.ID,
				Type:        ws.TypeMessage,
				From:        fm.FromID,
				Nickname:    fm.Nickname,
				Room:        fm.RoomID,
				Content:     fm.Content,
				Status:      ws.StatusSent,
				MediaURL:    fm.MediaURL,
				MediaType:   fm.MediaType,
				FileName:    fm.FileName,
				FileSize:    fm.FileSize,
				MediaStatus: fm.MediaStatus,
				IsForwarded: true,
				Timestamp:   fm.Timestamp,
			}
			s.broadcaster.BroadcastRoom(fm.RoomID, wsMsg, input.SenderID)
		}
	}

	return forwardedMsgs, nil
}

// PinMessage menyematkan pesan dalam percakapan (maksimal 3 sematan per room).
func (s *MessageService) PinMessage(ctx context.Context, input PinMessageInput) (*PinnedMessage, error) {
	convID := strings.TrimSpace(input.ConversationID)
	msgID := strings.TrimSpace(input.MessageID)
	if convID == "" || msgID == "" {
		return nil, errors.New("conversation_id dan message_id wajib disertakan")
	}

	if s.convRepo != nil {
		isMember, err := s.convRepo.IsUserInConversation(convID, input.UserID)
		if err != nil || !isMember {
			return nil, errors.New("Anda bukan anggota dari percakapan ini")
		}
	}

	pin, err := s.msgRepo.PinMessage(convID, msgID, input.UserID, input.DurationHours)
	if err != nil {
		return nil, err
	}

	if s.broadcaster != nil {
		s.broadcaster.BroadcastRoom(convID, ws.Message{
			Type:      ws.TypeMessagePinned,
			Room:      convID,
			ID:        msgID,
			Pinned:    pin,
			Timestamp: time.Now().UTC(),
		}, "")
	}

	return pin, nil
}

// UnpinMessage melepas sematan pesan dalam percakapan.
func (s *MessageService) UnpinMessage(ctx context.Context, input UnpinMessageInput) error {
	convID := strings.TrimSpace(input.ConversationID)
	msgID := strings.TrimSpace(input.MessageID)
	if convID == "" || msgID == "" {
		return errors.New("conversation_id dan message_id wajib disertakan")
	}

	if s.convRepo != nil {
		isMember, err := s.convRepo.IsUserInConversation(convID, input.UserID)
		if err != nil || !isMember {
			return errors.New("Anda bukan anggota dari percakapan ini")
		}
	}

	if err := s.msgRepo.UnpinMessage(convID, msgID); err != nil {
		return err
	}

	if s.broadcaster != nil {
		s.broadcaster.BroadcastRoom(convID, ws.Message{
			Type:      ws.TypeMessageUnpinned,
			Room:      convID,
			ID:        msgID,
			Timestamp: time.Now().UTC(),
		}, "")
	}

	return nil
}

// GetPinnedMessages mengambil seluruh pesan aktif yang disematkan dalam percakapan.
func (s *MessageService) GetPinnedMessages(ctx context.Context, conversationID, userID string) ([]PinnedMessage, error) {
	convID := strings.TrimSpace(conversationID)
	if convID == "" {
		return nil, ErrMissingRoomID
	}

	if s.convRepo != nil {
		isMember, err := s.convRepo.IsUserInConversation(convID, userID)
		if err != nil || !isMember {
			return nil, errors.New("Anda bukan anggota dari percakapan ini")
		}
	}

	return s.msgRepo.GetPinnedMessages(convID)
}

// SearchMessages mencari pesan teks dalam ruang obrolan tertentu.
func (s *MessageService) SearchMessages(ctx context.Context, roomID, userID, query string, limit int) ([]Message, error) {
	rID := strings.TrimSpace(roomID)
	q := strings.TrimSpace(query)
	if rID == "" {
		return nil, ErrMissingRoomID
	}
	if q == "" {
		return nil, ErrMissingQuery
	}

	if s.convRepo != nil {
		isMember, err := s.convRepo.IsUserInConversation(rID, userID)
		if err != nil || !isMember {
			return nil, errors.New("Anda bukan anggota dari percakapan ini")
		}
	}

	if limit <= 0 || limit > 100 {
		limit = 50
	}

	return s.msgRepo.SearchMessages(rID, userID, q, limit)
}

// UpdateReceipt memproses pembaruan status tanda terima pesan (delivered / read).
func (s *MessageService) UpdateReceipt(ctx context.Context, input UpdateReceiptInput) error {
	roomID := strings.TrimSpace(input.RoomID)
	status := strings.ToLower(strings.TrimSpace(input.Status))
	if roomID == "" || (status != "delivered" && status != "read") {
		return ErrInvalidStatus
	}

	if s.convRepo != nil {
		isMember, err := s.convRepo.IsUserInConversation(roomID, input.UserID)
		if err != nil || !isMember {
			return errors.New("Akses ditolak: Anda bukan anggota percakapan ini")
		}
	}

	msgID := strings.TrimSpace(input.MessageID)
	if msgID != "" {
		_ = s.msgRepo.UpdateMessageStatus(msgID, status)
	} else if status == "read" {
		_ = s.msgRepo.MarkRoomMessagesAsRead(roomID, input.UserID)
	} else if status == "delivered" {
		_, _ = s.msgRepo.MarkUserMessagesAsDelivered(input.UserID)
	}

	if s.broadcaster != nil {
		s.broadcaster.BroadcastRoom(roomID, ws.Message{
			ID:        msgID,
			Type:      ws.TypeReceipt,
			Room:      roomID,
			Status:    ws.MessageStatus(status),
			Timestamp: time.Now().UTC(),
		}, input.UserID)
	}

	return nil
}

// GetConversations mengembalikan daftar obrolan aktif milik user.
func (s *MessageService) GetConversations(ctx context.Context, userID string) ([]Conversation, error) {
	return s.convRepo.GetUserConversations(userID)
}

// StartDirectChat membuat atau mengembalikan ID percakapan 1-on-1 antar dua user.
func (s *MessageService) StartDirectChat(ctx context.Context, user1ID, user2ID string) (string, error) {
	if user2ID == "" {
		return "", errors.New("target_user_id wajib diisi")
	}
	return s.convRepo.GetOrCreateDirectConversation(user1ID, user2ID)
}

// ClearConversation membersihkan riwayat obrolan untuk user yang meminta.
func (s *MessageService) ClearConversation(ctx context.Context, conversationID, userID string) error {
	convID := strings.TrimSpace(conversationID)
	if convID == "" {
		return errors.New("parameter id atau conversation_id wajib diisi")
	}

	if s.convRepo != nil {
		isMember, err := s.convRepo.IsUserInConversation(convID, userID)
		if err != nil || !isMember {
			return errors.New("Akses ditolak: Anda bukan anggota percakapan ini")
		}
	}

	return s.convRepo.ClearConversation(convID, userID)
}

// PinConversation menandai percakapan sebagai pinned di sidebar user.
func (s *MessageService) PinConversation(ctx context.Context, conversationID, userID string) error {
	convID := strings.TrimSpace(conversationID)
	if convID == "" {
		return errors.New("conversation_id wajib disertakan")
	}
	return s.convRepo.PinConversation(convID, userID)
}

// UnpinConversation melepas status pinned percakapan di sidebar user.
func (s *MessageService) UnpinConversation(ctx context.Context, conversationID, userID string) error {
	convID := strings.TrimSpace(conversationID)
	if convID == "" {
		return errors.New("conversation_id wajib disertakan")
	}
	return s.convRepo.UnpinConversation(convID, userID)
}

// SaveIncomingMessage memvalidasi dan menyimpan pesan yang masuk (dari WebSocket / gateway).
func (s *MessageService) SaveIncomingMessage(ctx context.Context, msg Message) error {
	if strings.TrimSpace(msg.ID) == "" {
		return errors.New("message id tidak boleh kosong")
	}
	if strings.TrimSpace(msg.RoomID) == "" {
		return errors.New("room id tidak boleh kosong")
	}
	if strings.TrimSpace(msg.FromID) == "" {
		return errors.New("pengirim (from id) tidak boleh kosong")
	}
	if strings.TrimSpace(msg.Content) == "" && strings.TrimSpace(msg.MediaURL) == "" {
		return errors.New("konten pesan atau lampiran media tidak boleh kosong")
	}
	return s.msgRepo.SaveMessage(msg)
}

// ToggleReaction menambah atau menghapus reaksi emoji user terhadap pesan tertentu.
func (s *MessageService) ToggleReaction(ctx context.Context, msgID, emoji, userID string) (string, error) {
	if strings.TrimSpace(msgID) == "" {
		return "", ErrMissingMessageID
	}
	if strings.TrimSpace(emoji) == "" {
		return "", errors.New("emoji tidak boleh kosong")
	}
	if strings.TrimSpace(userID) == "" {
		return "", ErrUnauthorized
	}
	return s.msgRepo.ToggleReaction(msgID, emoji, userID)
}

// GetRoomHistory mengambil riwayat pesan dalam percakapan yang difilter sesuai batas waktu cleared_at milik user.
func (s *MessageService) GetRoomHistory(ctx context.Context, roomID, userID string, limit int) ([]Message, error) {
	if strings.TrimSpace(roomID) == "" {
		return nil, ErrMissingRoomID
	}
	return s.msgRepo.GetRoomHistoryForUser(roomID, userID, limit)
}

// GetRoomHistorySince mengambil riwayat pesan baru sejak timestamp tertentu (delta offline sync).
func (s *MessageService) GetRoomHistorySince(ctx context.Context, roomID, userID string, since time.Time, limit int) ([]Message, error) {
	if strings.TrimSpace(roomID) == "" {
		return nil, ErrMissingRoomID
	}
	return s.msgRepo.GetRoomHistorySince(roomID, userID, since, limit)
}

// MarkUserMessagesAsDelivered menandai semua pesan 'sent' yang ditujukan ke user menjadi 'delivered'.
func (s *MessageService) MarkUserMessagesAsDelivered(ctx context.Context, userID string) ([]string, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, ErrUnauthorized
	}
	return s.msgRepo.MarkUserMessagesAsDelivered(userID)
}

// MarkRoomMessagesAsRead menandai semua pesan lawan bicara di room menjadi 'read'.
func (s *MessageService) MarkRoomMessagesAsRead(ctx context.Context, roomID, excludeUserID string) error {
	if strings.TrimSpace(roomID) == "" {
		return ErrMissingRoomID
	}
	return s.msgRepo.MarkRoomMessagesAsRead(roomID, excludeUserID)
}

