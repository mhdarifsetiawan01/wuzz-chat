package store

import (
	"strings"
	"sync"
)

// ============================================================
// MemoryClientStore — implementasi ClientStore berbasis in-memory
// ============================================================

type MemoryClientStore struct {
	mu      sync.RWMutex
	clients map[string]ClientRecord
}

func NewMemoryClientStore() *MemoryClientStore {
	return &MemoryClientStore{
		clients: make(map[string]ClientRecord),
	}
}

func (s *MemoryClientStore) Set(record ClientRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clients[record.ID] = record
	return nil
}

func (s *MemoryClientStore) Get(id string) (ClientRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.clients[id]
	return r, ok
}

func (s *MemoryClientStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.clients, id)
	return nil
}

func (s *MemoryClientStore) List() []ClientRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]ClientRecord, 0, len(s.clients))
	for _, r := range s.clients {
		result = append(result, r)
	}
	return result
}

var _ ClientStore = (*MemoryClientStore)(nil)

// ============================================================
// MemoryMessageStore — implementasi MessageStore in-memory
// ============================================================

type MemoryMessageStore struct {
	mu       sync.RWMutex
	messages map[string][]StoredMessage // roomID -> messages
}

func NewMemoryMessageStore() *MemoryMessageStore {
	return &MemoryMessageStore{
		messages: make(map[string][]StoredMessage),
	}
}

func (s *MemoryMessageStore) Save(msg StoredMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if msg.Status == "" {
		msg.Status = "sent"
	}
	s.messages[msg.RoomID] = append(s.messages[msg.RoomID], msg)
	return nil
}

func (s *MemoryMessageStore) UpdateMessageStatus(msgID string, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for roomID, msgs := range s.messages {
		for i, m := range msgs {
			if m.ID == msgID {
				s.messages[roomID][i].Status = status
				return nil
			}
		}
	}
	return nil
}

func (s *MemoryMessageStore) MarkRoomMessagesAsRead(roomID, excludeNickname string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	msgs, ok := s.messages[roomID]
	if !ok {
		return nil
	}
	for i, m := range msgs {
		if !strings.EqualFold(m.Nickname, excludeNickname) && m.Status != "read" {
			s.messages[roomID][i].Status = "read"
		}
	}
	return nil
}

func (s *MemoryMessageStore) GetRoomHistory(roomID string, limit int) ([]StoredMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 50
	}

	msgs, ok := s.messages[roomID]
	if !ok || len(msgs) == 0 {
		return []StoredMessage{}, nil
	}

	// Ambil `limit` pesan terakhir
	start := 0
	if len(msgs) > limit {
		start = len(msgs) - limit
	}

	result := make([]StoredMessage, len(msgs[start:]))
	copy(result, msgs[start:])
	return result, nil
}

func (s *MemoryMessageStore) Close() error {
	return nil
}

var _ MessageStore = (*MemoryMessageStore)(nil)
