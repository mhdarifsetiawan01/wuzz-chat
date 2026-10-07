package messaging_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/messaging"
)

// Riwayat dan keanggotaan diambil bersamaan; isi pesan tidak boleh bocor tanpa keanggotaan terbukti.
type secretHistoryRepo struct{ *mockMessageRepo }

func (r secretHistoryRepo) GetRoomHistoryForUser(roomID, userID string, limit int) ([]messaging.Message, error) {
	return []messaging.Message{{ID: "m1", RoomID: roomID, Content: "rahasia"}}, nil
}

func (r secretHistoryRepo) GetRoomHistoryBefore(roomID, userID string, before time.Time, limit int) ([]messaging.Message, error) {
	return r.GetRoomHistoryForUser(roomID, userID, limit)
}

type gateConvRepo struct {
	*mockConvRepo
	member bool
	err    error
}

func (c gateConvRepo) IsUserInConversation(conversationID, userID string) (bool, error) {
	return c.member, c.err
}

func TestMessageService_HistoryGate(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name    string
		member  bool
		memErr  error
		wantErr bool
	}{
		{"anggota mendapat riwayat", true, nil, false},
		{"bukan anggota ditolak tanpa data", false, nil, true},
		{"galat pemeriksaan ditolak tanpa data", true, errors.New("db down"), true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := messaging.NewMessageService(
				secretHistoryRepo{newMockMessageRepo()},
				gateConvRepo{newMockConvRepo(), tc.member, tc.memErr},
				nil, nil,
			)
			for label, fetch := range map[string]func() ([]messaging.Message, error){
				"history": func() ([]messaging.Message, error) { return svc.GetRoomHistory(ctx, "room-x", "u1", 50) },
				"before":  func() ([]messaging.Message, error) { return svc.GetRoomHistoryBefore(ctx, "room-x", "u1", time.Now(), 50) },
			} {
				msgs, err := fetch()
				if tc.wantErr {
					if err == nil || len(msgs) != 0 {
						t.Fatalf("%s: harus ditolak tanpa data, got err=%v msgs=%v", label, err, msgs)
					}
					continue
				}
				if err != nil || len(msgs) != 1 || msgs[0].Content != "rahasia" {
					t.Fatalf("%s: anggota harus mendapat riwayat, got err=%v msgs=%v", label, err, msgs)
				}
			}
		})
	}
}
