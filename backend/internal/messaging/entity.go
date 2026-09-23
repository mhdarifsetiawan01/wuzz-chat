// Package messaging mengelola domain pesan, percakapan, dan tanda terima.
// Arsitektur 3-Tier Pragmatic Modular Monolith:
//
//	Transport (api/chat_handler.go, ws/hub.go)
//	   │
//	   ▼
//	Application Service (messaging.MessageService)
//	   │
//	   ▼
//	Domain Layer (messaging.MessageRepository, messaging.ConversationRepository)
//	   ▲
//	   │
//	Infrastructure Adapter (messaging/infra/sql_repository.go) -> store.MessageStore & store.UserStore
package messaging

import (
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// Message merepresentasikan entitas pesan dalam percakapan.
type Message = store.StoredMessage

// PinnedMessage merepresentasikan pesan yang disematkan dalam percakapan.
type PinnedMessage = store.PinnedMessage

// Conversation merepresentasikan obrolan di sidebar/chat list.
type Conversation = store.ConversationItem

// --- Input DTOs untuk Application Service Use Cases ---

// EditMessageInput memuat input untuk mengedit isi pesan.
type EditMessageInput struct {
	MessageID string
	UserID    string
	Content   string
}

// DeleteMessageInput memuat input untuk menghapus pesan.
type DeleteMessageInput struct {
	MessageID         string
	UserID            string
	DeleteForEveryone bool
}

// ForwardMessageInput memuat input untuk meneruskan pesan ke 1-5 percakapan.
type ForwardMessageInput struct {
	SourceMessageID  string
	SenderID         string
	SenderNickname   string
	TargetRoomIDs    []string
	PlaintextContent string
}

// PinMessageInput memuat input untuk menyematkan pesan dalam percakapan.
type PinMessageInput struct {
	ConversationID string
	MessageID      string
	UserID         string
	DurationHours  int
}

// UnpinMessageInput memuat input untuk melepas sematan pesan dalam percakapan.
type UnpinMessageInput struct {
	ConversationID string
	MessageID      string
	UserID         string
}

// UpdateReceiptInput memuat input untuk pembaruan status tanda terima pesan.
type UpdateReceiptInput struct {
	MessageID string
	RoomID    string
	UserID    string
	Status    string
}
