package ws

import (
	"testing"
	"time"

	"github.com/bms-del112/wuzz-chat/internal/store"
	"github.com/google/uuid"
)

// TestClient_MessageAckDispatch memverifikasi bahwa pengiriman pesan dengan request_id
// menghasilkan paket balasan TypeAck dengan request_id yang cocok.
func TestClient_MessageAckDispatch(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	h := NewHub(cs, ms)

	c := &Client{
		hub:      h,
		ID:       uuid.New().String(),
		Nickname: "Alice",
		RoomID:   "room-ack-test",
		send:     make(chan Message, 20),
	}

	h.Register(c)
	h.JoinRoom(c, "room-ack-test")

	// Drain event room_users
	for len(c.send) > 0 {
		<-c.send
	}

	reqID := "req-custom-uuid-123"
	msg := Message{
		ID:        "msg-ack-1",
		RequestID: reqID,
		Type:      TypeMessage,
		Room:      "room-ack-test",
		Content:   "Halo, ini pesan dengan ACK!",
	}

	c.onMessage(msg)

	// Harapkan 2 pesan pada c.send:
	// 1. TypeReceipt
	// 2. TypeAck dengan RequestID == reqID
	var gotReceipt, gotAck bool
	var ackMsg Message

	timeout := time.After(500 * time.Millisecond)
	for i := 0; i < 2; i++ {
		select {
		case m := <-c.send:
			if m.Type == TypeReceipt {
				gotReceipt = true
				if m.RequestID != reqID {
					t.Errorf("Receipt request_id tidak cocok: got %s, want %s", m.RequestID, reqID)
				}
			} else if m.Type == TypeAck {
				gotAck = true
				ackMsg = m
			}
		case <-timeout:
			t.Fatalf("Timeout menunggu balasan ACK/Receipt (gotReceipt=%v, gotAck=%v)", gotReceipt, gotAck)
		}
	}

	if !gotReceipt {
		t.Errorf("Klien tidak menerima TypeReceipt")
	}
	if !gotAck {
		t.Fatalf("Klien tidak menerima TypeAck")
	}
	if ackMsg.RequestID != reqID {
		t.Errorf("RequestID pada ACK salah: got %s, want %s", ackMsg.RequestID, reqID)
	}
	if ackMsg.Status != "ok" {
		t.Errorf("Status pada ACK bukan 'ok': got %s", ackMsg.Status)
	}
}

// TestHub_ServerSideIdempotency memverifikasi bahwa pengiriman pesan duplikat (ID sama)
// dicegah dari broadcast ke penerima, namun pengirim tetap mendapatkan ACK/receipt.
func TestHub_ServerSideIdempotency(t *testing.T) {
	cs := store.NewMemoryClientStore()
	ms := store.NewMemoryMessageStore()
	h := NewHub(cs, ms)

	sender := &Client{
		hub:      h,
		ID:       "sender-uuid",
		Nickname: "Sender",
		RoomID:   "room-idemp-test",
		send:     make(chan Message, 20),
	}
	receiver := &Client{
		hub:      h,
		ID:       "receiver-uuid",
		Nickname: "Receiver",
		RoomID:   "room-idemp-test",
		send:     make(chan Message, 20),
	}

	h.Register(sender)
	h.Register(receiver)
	h.JoinRoom(sender, "room-idemp-test")
	h.JoinRoom(receiver, "room-idemp-test")

	// Drain join events
	for len(receiver.send) > 0 {
		<-receiver.send
	}
	for len(sender.send) > 0 {
		<-sender.send
	}

	msgID := "msg-unique-456"

	// 1. Pengiriman Pertama
	msg1 := Message{
		ID:        msgID,
		RequestID: "req-first",
		Type:      TypeMessage,
		Room:      "room-idemp-test",
		Content:   "Pesan pertama",
	}
	sender.onMessage(msg1)

	// Receiver harus menerima pesan pertama
	select {
	case received := <-receiver.send:
		if received.ID != msgID {
			t.Errorf("Receiver menerima ID salah: got %s, want %s", received.ID, msgID)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("Receiver tidak menerima broadcast pesan pertama")
	}

	// Drain send channel sender dari ACK/receipt pesan pertama
DrainLoop:
	for {
		select {
		case <-sender.send:
		default:
			break DrainLoop
		}
	}

	// 2. Pengiriman Kedua (Resend Pesan yang Sama karena reconnect)
	msg2 := Message{
		ID:        msgID,
		RequestID: "req-second-resend",
		Type:      TypeMessage,
		Room:      "room-idemp-test",
		Content:   "Pesan pertama",
	}
	sender.onMessage(msg2)

	// Receiver TIDAK BOLEH menerima pesan kedua (duplikat dicegah)
	select {
	case dup := <-receiver.send:
		t.Fatalf("BUG DUPLIKAT: Receiver menerima broadcast pesan duplikat! %+v", dup)
	case <-time.After(100 * time.Millisecond):
		// Sukses: tidak ada broadcast duplikat
	}

	// Sender HARUS tetap menerima ACK/receipt untuk req-second-resend agar client tahu pesannya sudah sampai
	var senderGotAck bool
	timeout := time.After(200 * time.Millisecond)
SenderLoop:
	for {
		select {
		case m := <-sender.send:
			if m.Type == TypeAck && m.RequestID == "req-second-resend" {
				senderGotAck = true
				break SenderLoop
			}
		case <-timeout:
			break SenderLoop
		}
	}

	if !senderGotAck {
		t.Errorf("Sender tidak menerima ACK balasan pada pengiriman ulang pesan duplikat")
	}
}

// TestHub_IdempotencyTTL memverifikasi mekanisme TTL pada cache dedup
func TestHub_IdempotencyTTL(t *testing.T) {
	h := NewHub(nil, nil)

	testID := "test-msg-ttl"

	// Call 1: Belum pernah ada
	if dup := h.IsDuplicateAndRecord(testID, 50*time.Millisecond); dup {
		t.Errorf("Panggilan pertama seharusnya bukan duplikat")
	}

	// Call 2: Segera setelah call 1 (masih dalam TTL)
	if dup := h.IsDuplicateAndRecord(testID, 50*time.Millisecond); !dup {
		t.Errorf("Panggilan kedua seharusnya terdeteksi sebagai duplikat")
	}

	// Tunggu sampai TTL kedaluwarsa
	time.Sleep(60 * time.Millisecond)

	// Call 3: Setelah TTL expired
	if dup := h.IsDuplicateAndRecord(testID, 50*time.Millisecond); dup {
		t.Errorf("Panggilan ketiga setelah TTL kedaluwarsa tidak boleh dianggap duplikat")
	}
}
