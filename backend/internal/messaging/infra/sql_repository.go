// Package infra menyediakan adapter infrastruktur untuk domain messaging.
// Menerapkan Strangler Fig Pattern dengan mengadaptasi store.MessageStore dan store.UserStore
// yang sudah ada tanpa melakukan perubahan skema database atau query SQL baru.
package infra

import (
	"context"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/messaging"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// SQLMessagingRepository mengimplementasikan messaging.MessageRepository,
// messaging.ConversationRepository, dan messaging.UserLookupRepository.
type SQLMessagingRepository struct {
	msgStore  store.MessageStore
	userStore store.UserStore
}

// NewSQLMessagingRepository membuat adapter repository baru.
func NewSQLMessagingRepository(ms store.MessageStore, us store.UserStore) *SQLMessagingRepository {
	return &SQLMessagingRepository{
		msgStore:  ms,
		userStore: us,
	}
}

// --- Implementasi MessageRepository ---

func (r *SQLMessagingRepository) SaveMessage(msg messaging.Message) error {
	return r.msgStore.Save(msg)
}

func (r *SQLMessagingRepository) Save(msg messaging.Message) error {
	return r.msgStore.Save(msg)
}

func (r *SQLMessagingRepository) GetMessageByID(msgID string) (*messaging.Message, error) {
	return r.msgStore.GetMessageByID(msgID)
}

func (r *SQLMessagingRepository) DeleteMessage(msgID, userID string, deleteForEveryone bool) (*messaging.Message, error) {
	return r.msgStore.DeleteMessage(msgID, userID, deleteForEveryone)
}

func (r *SQLMessagingRepository) EditMessage(msgID, userID, newContent string) (*messaging.Message, error) {
	return r.msgStore.EditMessage(msgID, userID, newContent)
}

func (r *SQLMessagingRepository) ForwardMessage(srcMsgID, senderID, senderNickname string, targetRoomIDs []string, plaintextContent string) ([]messaging.Message, error) {
	return r.msgStore.ForwardMessage(srcMsgID, senderID, senderNickname, targetRoomIDs, plaintextContent)
}

func (r *SQLMessagingRepository) UpdateMessageStatus(msgID string, status string) error {
	return r.msgStore.UpdateMessageStatus(msgID, status)
}

func (r *SQLMessagingRepository) ToggleReaction(msgID, emoji, userID string) (string, error) {
	return r.msgStore.ToggleReaction(msgID, emoji, userID)
}

func (r *SQLMessagingRepository) MarkRoomMessagesAsRead(roomID, excludeUserID string) error {
	return r.msgStore.MarkRoomMessagesAsRead(roomID, excludeUserID)
}

func (r *SQLMessagingRepository) MarkUserMessagesAsDelivered(userID string) ([]string, error) {
	return r.msgStore.MarkUserMessagesAsDelivered(userID)
}

func (r *SQLMessagingRepository) GetRoomHistory(roomID string, limit int) ([]messaging.Message, error) {
	return r.msgStore.GetRoomHistory(roomID, limit)
}

func (r *SQLMessagingRepository) GetRoomHistoryForUser(roomID, userID string, limit int) ([]messaging.Message, error) {
	return r.msgStore.GetRoomHistoryForUser(roomID, userID, limit)
}

func (r *SQLMessagingRepository) GetRoomHistorySince(roomID, userID string, since time.Time, limit int) ([]messaging.Message, error) {
	return r.msgStore.GetRoomHistorySince(roomID, userID, since, limit)
}

func (r *SQLMessagingRepository) PinMessage(convID, msgID, userID string, durationHours int) (*messaging.PinnedMessage, error) {
	return r.msgStore.PinMessage(convID, msgID, userID, durationHours)
}

func (r *SQLMessagingRepository) UnpinMessage(convID, msgID string) error {
	return r.msgStore.UnpinMessage(convID, msgID)
}

func (r *SQLMessagingRepository) GetPinnedMessages(convID string) ([]messaging.PinnedMessage, error) {
	return r.msgStore.GetPinnedMessages(convID)
}

func (r *SQLMessagingRepository) SearchMessages(roomID, userID, query string, limit int) ([]messaging.Message, error) {
	return r.msgStore.SearchMessages(roomID, userID, query, limit)
}

// --- Implementasi ConversationRepository ---

func (r *SQLMessagingRepository) GetOrCreateDirectConversation(userA, userB string) (string, error) {
	return r.GetOrCreateDirectConversationWithContext(context.Background(), userA, userB)
}

func (r *SQLMessagingRepository) GetOrCreateDirectConversationWithContext(ctx context.Context, userA, userB string) (string, error) {
	return r.userStore.GetOrCreateDirectConversationWithContext(ctx, userA, userB)
}

func (r *SQLMessagingRepository) GetUserConversations(userID string) ([]messaging.Conversation, error) {
	return r.GetUserConversationsWithContext(context.Background(), userID)
}

func (r *SQLMessagingRepository) GetUserConversationsWithContext(ctx context.Context, userID string) ([]messaging.Conversation, error) {
	return r.userStore.GetUserConversationsWithContext(ctx, userID)
}

func (r *SQLMessagingRepository) PinConversation(conversationID, userID string) error {
	return r.userStore.PinConversation(conversationID, userID)
}

func (r *SQLMessagingRepository) UnpinConversation(conversationID, userID string) error {
	return r.userStore.UnpinConversation(conversationID, userID)
}

func (r *SQLMessagingRepository) ClearConversation(conversationID, userID string) error {
	return r.userStore.ClearConversation(conversationID, userID)
}

func (r *SQLMessagingRepository) GetConversationMemberUsernames(conversationID string) ([]string, error) {
	return r.userStore.GetConversationMemberUsernames(conversationID)
}

func (r *SQLMessagingRepository) IsUserInConversation(conversationID, userID string) (bool, error) {
	return r.userStore.IsUserInConversation(conversationID, userID)
}

func (r *SQLMessagingRepository) IsConversationExpired(conversationID string) bool {
	return r.userStore.IsConversationExpired(conversationID)
}

// --- Implementasi UserLookupRepository ---

func (r *SQLMessagingRepository) GetUserNickname(userID string) (string, error) {
	if r.userStore == nil {
		return "", nil
	}
	u, err := r.userStore.GetUserByID(userID)
	if err != nil || u == nil {
		return "", err
	}
	if u.DisplayName != "" {
		return u.DisplayName, nil
	}
	return u.Username, nil
}
