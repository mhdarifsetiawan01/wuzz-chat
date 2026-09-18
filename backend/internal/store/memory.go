package store

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"
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
	if msg.Mentions == "" {
		msg.Mentions = "[]"
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

func (s *MemoryMessageStore) ToggleReaction(msgID, emoji, userID string) (string, error) {
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
							if u == userID {
								userExists = true
							} else {
								newUsers = append(newUsers, u)
							}
						}
						if !userExists {
							newUsers = append(newUsers, userID)
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
						Users: []string{userID},
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

func (s *MemoryMessageStore) MarkRoomMessagesAsRead(roomID, excludeUserID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	msgs, ok := s.messages[roomID]
	if !ok {
		return nil
	}
	for i, m := range msgs {
		// Gunakan from_id (UUID) saja sebagai filter primer
		if (excludeUserID == "" || m.FromID != excludeUserID) && m.Status != "read" {
			s.messages[roomID][i].Status = "read"
		}
	}
	return nil
}

func (s *MemoryMessageStore) MarkUserMessagesAsDelivered(userID string) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	roomSet := make(map[string]bool)
	for roomID, msgs := range s.messages {
		for i, m := range msgs {
			// Gunakan from_id (UUID) saja sebagai filter primer
			if m.FromID != userID && m.Status == "sent" {
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

func (s *MemoryMessageStore) GetRoomHistoryForUser(roomID, userID string, limit int) ([]StoredMessage, error) {
	return s.GetRoomHistory(roomID, limit)
}

func (s *MemoryMessageStore) GetRoomHistorySince(roomID, userID string, since time.Time, limit int) ([]StoredMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	msgs, ok := s.messages[roomID]
	if !ok || len(msgs) == 0 {
		return []StoredMessage{}, nil
	}

	if limit <= 0 || limit > 100 {
		limit = 100
	}

	var result []StoredMessage
	for _, m := range msgs {
		if m.Timestamp.After(since) {
			result = append(result, m)
			if len(result) >= limit {
				break
			}
		}
	}

	if result == nil {
		result = []StoredMessage{}
	}

	return result, nil
}

func (s *MemoryMessageStore) GetMessageByID(msgID string) (*StoredMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, msgs := range s.messages {
		for _, m := range msgs {
			if m.ID == msgID {
				msgCopy := m
				return &msgCopy, nil
			}
		}
	}
	return nil, errors.New("pesan tidak ditemukan")
}

func (s *MemoryMessageStore) DeleteMessage(msgID, userID string, deleteForEveryone bool) (*StoredMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for roomID, msgs := range s.messages {
		for i, m := range msgs {
			if m.ID == msgID {
				if deleteForEveryone {
					// Validasi kepemilikan pesan: HANYA berdasarkan from_id (UUID)
					if m.FromID == "" || m.FromID != userID {
						return nil, errors.New("hanya pengirim yang dapat menghapus pesan untuk semua orang")
					}
					// Validasi batas waktu 1 menit (60 detik)
					if time.Since(m.Timestamp) > 60*time.Second {
						return nil, errors.New("pesan sudah lebih dari 1 menit dan tidak dapat dihapus untuk semua orang")
					}

					s.messages[roomID][i].Content = "🚫 Pesan ini telah dihapus"
					s.messages[roomID][i].MediaURL = ""
					s.messages[roomID][i].MediaType = ""
					s.messages[roomID][i].FileName = ""
					s.messages[roomID][i].FileSize = 0
					s.messages[roomID][i].Reactions = "[]"
					s.messages[roomID][i].IsDeleted = true

					res := s.messages[roomID][i]
					return &res, nil
				} else {
					// Hapus untuk saya saja: tambahkan userID ke deleted_for_users
					var deletedUsers []string
					if m.DeletedForUsers != "" && m.DeletedForUsers != "[]" {
						_ = json.Unmarshal([]byte(m.DeletedForUsers), &deletedUsers)
					}
					alreadyDeleted := false
					for _, u := range deletedUsers {
						if u == userID {
							alreadyDeleted = true
							break
						}
					}
					if !alreadyDeleted {
						deletedUsers = append(deletedUsers, userID)
					}
					bytes, _ := json.Marshal(deletedUsers)
					s.messages[roomID][i].DeletedForUsers = string(bytes)
					res := s.messages[roomID][i]
					return &res, nil
				}
			}
		}
	}
	return nil, errors.New("pesan tidak ditemukan")
}

func (s *MemoryMessageStore) AcknowledgeMediaDownload(msgID string) (string, string, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for roomID, msgs := range s.messages {
		for i, m := range msgs {
			if m.ID == msgID {
				if m.MediaURL == "" {
					return "", m.MediaStatus, false, nil
				}
				// Cek apakah pesan berada di dalam grup atau subgrup/forum (Shared Media Hub)
				isGroup := strings.HasPrefix(roomID, "grp_") || strings.HasPrefix(roomID, "sub_")
				if isGroup {
					status := m.MediaStatus
					if status == "" {
						status = "active"
					}
					return m.MediaURL, status, false, nil
				}

				s.messages[roomID][i].MediaStatus = "expired"
				return m.MediaURL, "expired", true, nil
			}
		}
	}
	return "", "", false, nil
}

func (s *MemoryMessageStore) GetExpiredMediaMessages(retentionDays int) ([]StoredMessage, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if retentionDays <= 0 {
		return []StoredMessage{}, nil
	}

	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	var expired []StoredMessage

	for _, msgs := range s.messages {
		for _, m := range msgs {
			if m.MediaURL != "" && (m.MediaStatus == "" || m.MediaStatus == "active") && m.Timestamp.Before(cutoff) {
				expired = append(expired, m)
			}
		}
	}
	return expired, nil
}

func (s *MemoryMessageStore) MarkMediaExpired(msgID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for roomID, msgs := range s.messages {
		for i, m := range msgs {
			if m.ID == msgID {
				s.messages[roomID][i].MediaStatus = "expired"
				return nil
			}
		}
	}
	return nil
}

func (s *MemoryMessageStore) Close() error {
	return nil
}

var _ MessageStore = (*MemoryMessageStore)(nil)
