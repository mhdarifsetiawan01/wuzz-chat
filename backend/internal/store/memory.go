package store

import (
	"encoding/json"
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
	if msg.Reactions == "" {
		msg.Reactions = "[]"
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

func (s *MemoryMessageStore) ToggleReaction(msgID, emoji, userNickname string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for roomID, msgs := range s.messages {
		for i, m := range msgs {
			if m.ID == msgID {
				var items []struct {
					Emoji string   `json:"emoji"`
					Users []string `json:"users"`
					Count int      `json:"count"`
				}
				if m.Reactions != "" {
					_ = json.Unmarshal([]byte(m.Reactions), &items)
				}

				found := false
				var updatedItems []struct {
					Emoji string   `json:"emoji"`
					Users []string `json:"users"`
					Count int      `json:"count"`
				}

				for _, item := range items {
					if item.Emoji == emoji {
						found = true
						userExists := false
						var newUsers []string
						for _, u := range item.Users {
							if strings.EqualFold(u, userNickname) {
								userExists = true
							} else {
								newUsers = append(newUsers, u)
							}
						}
						if !userExists {
							newUsers = append(newUsers, userNickname)
						}
						if len(newUsers) > 0 {
							updatedItems = append(updatedItems, struct {
								Emoji string   `json:"emoji"`
								Users []string `json:"users"`
								Count int      `json:"count"`
							}{
								Emoji: emoji,
								Users: newUsers,
								Count: len(newUsers),
							})
						}
					} else {
						updatedItems = append(updatedItems, item)
					}
				}

				if !found {
					updatedItems = append(updatedItems, struct {
						Emoji string   `json:"emoji"`
						Users []string `json:"users"`
						Count int      `json:"count"`
					}{
						Emoji: emoji,
						Users: []string{userNickname},
						Count: 1,
					})
				}

				b, _ := json.Marshal(updatedItems)
				jsonStr := string(b)
				s.messages[roomID][i].Reactions = jsonStr
				return jsonStr, nil
			}
		}
	}

	return "[]", nil
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

func (s *MemoryMessageStore) MarkUserMessagesAsDelivered(userNickname string) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	roomSet := make(map[string]bool)
	for roomID, msgs := range s.messages {
		for i, m := range msgs {
			if !strings.EqualFold(m.Nickname, userNickname) && m.Status == "sent" {
				s.messages[roomID][i].Status = "delivered"
				roomSet[roomID] = true
			}
		}
	}

	var rooms []string
	for r := range roomSet {
		rooms = append(rooms, r)
	}
	return rooms, nil
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
