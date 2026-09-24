package messaging_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/messaging"
	"github.com/bms-del112/wuzz-chat/internal/ws"
)

// --- Mock Implementations ---

type mockMessageRepo struct {
	messages       map[string]*messaging.Message
	pinnedMessages map[string][]messaging.PinnedMessage
	editErr        error
	deleteErr      error
	forwardErr     error
	pinErr         error
	unpinErr       error
}

func newMockMessageRepo() *mockMessageRepo {
	return &mockMessageRepo{
		messages:       make(map[string]*messaging.Message),
		pinnedMessages: make(map[string][]messaging.PinnedMessage),
	}
}

func (m *mockMessageRepo) SaveMessage(msg messaging.Message) error {
	m.messages[msg.ID] = &msg
	return nil
}

func (m *mockMessageRepo) GetMessageByID(msgID string) (*messaging.Message, error) {
	msg, ok := m.messages[msgID]
	if !ok {
		return nil, errors.New("pesan tidak ditemukan")
	}
	return msg, nil
}

func (m *mockMessageRepo) DeleteMessage(msgID, userID string, deleteForEveryone bool) (*messaging.Message, error) {
	if m.deleteErr != nil {
		return nil, m.deleteErr
	}
	msg, ok := m.messages[msgID]
	if !ok {
		return nil, errors.New("pesan tidak ditemukan")
	}
	msg.IsDeleted = true
	return msg, nil
}

func (m *mockMessageRepo) EditMessage(msgID, userID, newContent string) (*messaging.Message, error) {
	if m.editErr != nil {
		return nil, m.editErr
	}
	msg, ok := m.messages[msgID]
	if !ok {
		return nil, errors.New("pesan tidak ditemukan")
	}
	now := time.Now().UTC()
	msg.Content = newContent
	msg.IsEdited = true
	msg.EditedAt = &now
	return msg, nil
}

func (m *mockMessageRepo) ForwardMessage(srcMsgID, senderID, senderNickname string, targetRoomIDs []string, plaintextContent string) ([]messaging.Message, error) {
	if m.forwardErr != nil {
		return nil, m.forwardErr
	}
	var res []messaging.Message
	for _, roomID := range targetRoomIDs {
		res = append(res, messaging.Message{
			ID:          "fwd-" + roomID,
			RoomID:      roomID,
			FromID:      senderID,
			Nickname:    senderNickname,
			Content:     plaintextContent,
			IsForwarded: true,
			Timestamp:   time.Now().UTC(),
		})
	}
	return res, nil
}

func (m *mockMessageRepo) UpdateMessageStatus(msgID string, status string) error {
	return nil
}

func (m *mockMessageRepo) ToggleReaction(msgID, emoji, userID string) (string, error) {
	return "added", nil
}

func (m *mockMessageRepo) MarkRoomMessagesAsRead(roomID, excludeUserID string) error {
	return nil
}

func (m *mockMessageRepo) MarkUserMessagesAsDelivered(userID string) ([]string, error) {
	return []string{}, nil
}

func (m *mockMessageRepo) GetRoomHistory(roomID string, limit int) ([]messaging.Message, error) {
	return []messaging.Message{}, nil
}

func (m *mockMessageRepo) GetRoomHistoryForUser(roomID, userID string, limit int) ([]messaging.Message, error) {
	return []messaging.Message{}, nil
}

func (m *mockMessageRepo) GetRoomHistorySince(roomID, userID string, since time.Time, limit int) ([]messaging.Message, error) {
	return []messaging.Message{}, nil
}

func (m *mockMessageRepo) PinMessage(convID, msgID, userID string, durationHours int) (*messaging.PinnedMessage, error) {
	if m.pinErr != nil {
		return nil, m.pinErr
	}
	pin := &messaging.PinnedMessage{
		ID:             "pin-1",
		ConversationID: convID,
		MessageID:      msgID,
		PinnedBy:       userID,
		PinnedAt:       time.Now().UTC(),
	}
	m.pinnedMessages[convID] = append(m.pinnedMessages[convID], *pin)
	return pin, nil
}

func (m *mockMessageRepo) UnpinMessage(convID, msgID string) error {
	if m.unpinErr != nil {
		return m.unpinErr
	}
	delete(m.pinnedMessages, convID)
	return nil
}

func (m *mockMessageRepo) GetPinnedMessages(convID string) ([]messaging.PinnedMessage, error) {
	return m.pinnedMessages[convID], nil
}

func (m *mockMessageRepo) SearchMessages(roomID, userID, query string, limit int) ([]messaging.Message, error) {
	return []messaging.Message{}, nil
}

type mockConvRepo struct {
	allowedRooms  map[string]bool
	conversations []messaging.Conversation
	directRoomID  string
}

func newMockConvRepo() *mockConvRepo {
	return &mockConvRepo{
		allowedRooms: make(map[string]bool),
		directRoomID: "direct-room-123",
	}
}

func (c *mockConvRepo) GetOrCreateDirectConversation(userA, userB string) (string, error) {
	return c.directRoomID, nil
}

func (c *mockConvRepo) GetOrCreateDirectConversationWithContext(ctx context.Context, userA, userB string) (string, error) {
	return c.directRoomID, nil
}

func (c *mockConvRepo) GetUserConversations(userID string) ([]messaging.Conversation, error) {
	return c.conversations, nil
}

func (c *mockConvRepo) GetUserConversationsWithContext(ctx context.Context, userID string) ([]messaging.Conversation, error) {
	return c.conversations, nil
}

func (c *mockConvRepo) PinConversation(conversationID, userID string) error {
	return nil
}

func (c *mockConvRepo) UnpinConversation(conversationID, userID string) error {
	return nil
}

func (c *mockConvRepo) ClearConversation(conversationID, userID string) error {
	return nil
}

func (c *mockConvRepo) GetConversationMemberUsernames(conversationID string) ([]string, error) {
	return []string{"alice", "bob"}, nil
}

func (c *mockConvRepo) IsUserInConversation(conversationID, userID string) (bool, error) {
	if allowed, ok := c.allowedRooms[conversationID]; ok {
		return allowed, nil
	}
	return true, nil // default allowed
}

func (c *mockConvRepo) IsConversationExpired(conversationID string) bool {
	return false
}

type mockUserLookup struct {
	nickname string
}

func (u *mockUserLookup) GetUserNickname(userID string) (string, error) {
	return u.nickname, nil
}

type mockBroadcaster struct {
	events []ws.Message
}

func (b *mockBroadcaster) BroadcastRoom(roomID string, msg ws.Message, senderID string) {
	b.events = append(b.events, msg)
}

// --- Test Cases ---

func TestMessageService_EditMessage(t *testing.T) {
	ctx := context.Background()
	msgRepo := newMockMessageRepo()
	convRepo := newMockConvRepo()
	broadcaster := &mockBroadcaster{}
	svc := messaging.NewMessageService(msgRepo, convRepo, &mockUserLookup{nickname: "Alice"}, broadcaster)

	msgRepo.messages["msg-1"] = &messaging.Message{
		ID:      "msg-1",
		RoomID:  "room-1",
		FromID:  "user-1",
		Content: "Halo dunia",
	}

	// 1. Gagal jika content kosong
	_, err := svc.EditMessage(ctx, messaging.EditMessageInput{
		MessageID: "msg-1",
		UserID:    "user-1",
		Content:   "   ",
	})
	if err == nil {
		t.Fatal("harus mengembalikan error jika content kosong")
	}

	// 2. Sukses edit pesan dan broadcast
	updated, err := svc.EditMessage(ctx, messaging.EditMessageInput{
		MessageID: "msg-1",
		UserID:    "user-1",
		Content:   "Halo Wuzz Chat",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updated.Content != "Halo Wuzz Chat" {
		t.Fatalf("expected updated content 'Halo Wuzz Chat', got '%s'", updated.Content)
	}
	if len(broadcaster.events) != 1 {
		t.Fatalf("expected 1 broadcast event, got %d", len(broadcaster.events))
	}
	if broadcaster.events[0].Type != ws.TypeMessageEdited {
		t.Fatalf("expected event type %s, got %s", ws.TypeMessageEdited, broadcaster.events[0].Type)
	}
}

func TestMessageService_DeleteMessage(t *testing.T) {
	ctx := context.Background()
	msgRepo := newMockMessageRepo()
	convRepo := newMockConvRepo()
	broadcaster := &mockBroadcaster{}
	svc := messaging.NewMessageService(msgRepo, convRepo, nil, broadcaster)

	msgRepo.messages["msg-del"] = &messaging.Message{
		ID:      "msg-del",
		RoomID:  "room-1",
		FromID:  "user-1",
		Content: "Rahasia",
	}

	// Delete for everyone harus broadcast
	deleted, err := svc.DeleteMessage(ctx, messaging.DeleteMessageInput{
		MessageID:         "msg-del",
		UserID:            "user-1",
		DeleteForEveryone: true,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !deleted.IsDeleted {
		t.Fatal("expected IsDeleted to be true")
	}
	if len(broadcaster.events) != 1 {
		t.Fatalf("expected 1 broadcast event, got %d", len(broadcaster.events))
	}
	if broadcaster.events[0].Type != ws.TypeMessageDeleted {
		t.Fatalf("expected event type %s, got %s", ws.TypeMessageDeleted, broadcaster.events[0].Type)
	}
}

func TestMessageService_ForwardMessage(t *testing.T) {
	ctx := context.Background()
	msgRepo := newMockMessageRepo()
	convRepo := newMockConvRepo()
	broadcaster := &mockBroadcaster{}
	svc := messaging.NewMessageService(msgRepo, convRepo, &mockUserLookup{nickname: "Alice"}, broadcaster)

	// Gagal jika target rooms kosong
	_, err := svc.ForwardMessage(ctx, messaging.ForwardMessageInput{
		SourceMessageID: "msg-src",
		SenderID:        "user-1",
		TargetRoomIDs:   []string{},
	})
	if err == nil {
		t.Fatal("harus error jika target_room_ids kosong")
	}

	// Gagal jika target rooms > 5
	_, err = svc.ForwardMessage(ctx, messaging.ForwardMessageInput{
		SourceMessageID: "msg-src",
		SenderID:        "user-1",
		TargetRoomIDs:   []string{"r1", "r2", "r3", "r4", "r5", "r6"},
	})
	if err == nil {
		t.Fatal("harus error jika target_room_ids > 5")
	}

	// Gagal jika user bukan anggota salah satu room
	convRepo.allowedRooms["room-restricted"] = false
	_, err = svc.ForwardMessage(ctx, messaging.ForwardMessageInput{
		SourceMessageID: "msg-src",
		SenderID:        "user-1",
		TargetRoomIDs:   []string{"room-restricted"},
	})
	if err == nil {
		t.Fatal("harus error jika user bukan anggota room target")
	}

	// Sukses meneruskan ke 2 room
	convRepo.allowedRooms["room-ok-1"] = true
	convRepo.allowedRooms["room-ok-2"] = true
	res, err := svc.ForwardMessage(ctx, messaging.ForwardMessageInput{
		SourceMessageID:  "msg-src",
		SenderID:         "user-1",
		TargetRoomIDs:    []string{"room-ok-1", "room-ok-2"},
		PlaintextContent: "Forwarded note",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res) != 2 {
		t.Fatalf("expected 2 forwarded messages, got %d", len(res))
	}
	if len(broadcaster.events) != 2 {
		t.Fatalf("expected 2 broadcast events, got %d", len(broadcaster.events))
	}
}

func TestMessageService_PinAndUnpin(t *testing.T) {
	ctx := context.Background()
	msgRepo := newMockMessageRepo()
	convRepo := newMockConvRepo()
	broadcaster := &mockBroadcaster{}
	svc := messaging.NewMessageService(msgRepo, convRepo, nil, broadcaster)

	// Pin message
	pin, err := svc.PinMessage(ctx, messaging.PinMessageInput{
		ConversationID: "room-pin",
		MessageID:      "msg-pin",
		UserID:         "user-1",
		DurationHours:  24,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pin.MessageID != "msg-pin" {
		t.Fatalf("expected pinned messageID 'msg-pin', got '%s'", pin.MessageID)
	}
	if len(broadcaster.events) != 1 || broadcaster.events[0].Type != ws.TypeMessagePinned {
		t.Fatal("expected TypeMessagePinned event")
	}

	// Unpin message
	err = svc.UnpinMessage(ctx, messaging.UnpinMessageInput{
		ConversationID: "room-pin",
		MessageID:      "msg-pin",
		UserID:         "user-1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(broadcaster.events) != 2 || broadcaster.events[1].Type != ws.TypeMessageUnpinned {
		t.Fatal("expected TypeMessageUnpinned event")
	}
}

func TestMessageService_UpdateReceipt(t *testing.T) {
	ctx := context.Background()
	msgRepo := newMockMessageRepo()
	convRepo := newMockConvRepo()
	broadcaster := &mockBroadcaster{}
	svc := messaging.NewMessageService(msgRepo, convRepo, nil, broadcaster)

	// Status invalid
	err := svc.UpdateReceipt(ctx, messaging.UpdateReceiptInput{
		RoomID: "room-1",
		Status: "invalid_status",
	})
	if err == nil {
		t.Fatal("expected error for invalid status")
	}

	// Valid read receipt
	err = svc.UpdateReceipt(ctx, messaging.UpdateReceiptInput{
		MessageID: "msg-123",
		RoomID:    "room-1",
		UserID:    "user-1",
		Status:    "read",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(broadcaster.events) != 1 || broadcaster.events[0].Type != ws.TypeReceipt {
		t.Fatal("expected TypeReceipt event")
	}
}

func TestMessageService_SaveIncomingMessage(t *testing.T) {
	ctx := context.Background()
	msgRepo := newMockMessageRepo()
	svc := messaging.NewMessageService(msgRepo, nil, nil, nil)

	// Validasi ID kosong
	err := svc.SaveIncomingMessage(ctx, messaging.Message{
		RoomID:  "room-1",
		FromID:  "user-1",
		Content: "Hello",
	})
	if err == nil {
		t.Fatal("expected error for empty ID")
	}

	// Validasi Room kosong
	err = svc.SaveIncomingMessage(ctx, messaging.Message{
		ID:      "msg-1",
		FromID:  "user-1",
		Content: "Hello",
	})
	if err == nil {
		t.Fatal("expected error for empty RoomID")
	}

	// Validasi Konten kosong
	err = svc.SaveIncomingMessage(ctx, messaging.Message{
		ID:     "msg-1",
		RoomID: "room-1",
		FromID: "user-1",
	})
	if err == nil {
		t.Fatal("expected error for empty Content and MediaURL")
	}

	// Simpan sukses
	err = svc.SaveIncomingMessage(ctx, messaging.Message{
		ID:      "msg-1",
		RoomID:  "room-1",
		FromID:  "user-1",
		Content: "Hello World",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	saved, err := msgRepo.GetMessageByID("msg-1")
	if err != nil || saved.Content != "Hello World" {
		t.Fatalf("expected message saved in repository")
	}
}

func TestMessageService_ToggleReactionAndHistory(t *testing.T) {
	ctx := context.Background()
	msgRepo := newMockMessageRepo()
	svc := messaging.NewMessageService(msgRepo, nil, nil, nil)

	// Toggle reaction valid
	action, err := svc.ToggleReaction(ctx, "msg-1", "👍", "user-1")
	if err != nil || action != "added" {
		t.Fatalf("unexpected toggle reaction error: %v", err)
	}

	// GetRoomHistory
	hist, err := svc.GetRoomHistory(ctx, "room-1", "user-1", 50)
	if err != nil || hist == nil {
		t.Fatalf("unexpected get room history error: %v", err)
	}

	// GetRoomHistorySince
	histSince, err := svc.GetRoomHistorySince(ctx, "room-1", "user-1", time.Now().Add(-1*time.Hour), 50)
	if err != nil || histSince == nil {
		t.Fatalf("unexpected get room history since error: %v", err)
	}

	// MarkUserMessagesAsDelivered & Read
	_, err = svc.MarkUserMessagesAsDelivered(ctx, "user-1")
	if err != nil {
		t.Fatalf("unexpected mark delivered error: %v", err)
	}

	err = svc.MarkRoomMessagesAsRead(ctx, "room-1", "user-1")
	if err != nil {
		t.Fatalf("unexpected mark read error: %v", err)
	}
}

