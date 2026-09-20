package push

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/bms-del112/wuzz-chat/internal/store"
)

// Service mengelola pengiriman push notification via standard Web Push (VAPID) dan gateway FCM.
type Service struct {
	vapidPublicKey   string
	vapidPrivateKey  string
	vapidSubject     string
	userStore        store.UserStore
	deliveryCallback func(msgID, roomID, recipientUserID string)
	mu               sync.RWMutex
}

// SetDeliveryCallback menetapkan fungsi callback saat push notification berhasil diterima push service (Delivery ACK).
func (s *Service) SetDeliveryCallback(cb func(msgID, roomID, recipientUserID string)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deliveryCallback = cb
}

// NotificationPayload merepresentasikan struktur payload data JSON yang dikirimkan ke Service Worker.
type NotificationPayload struct {
	Title     string                 `json:"title"`
	Body      string                 `json:"body"`
	Icon      string                 `json:"icon,omitempty"`
	Badge     string                 `json:"badge,omitempty"`
	Tag       string                 `json:"tag,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Timestamp int64                  `json:"timestamp"`
}

// NewService membuat dan menginisialisasi Push Service.
func NewService(userStore store.UserStore) *Service {
	pubKey := strings.TrimSpace(os.Getenv("VAPID_PUBLIC_KEY"))
	privKey := strings.TrimSpace(os.Getenv("VAPID_PRIVATE_KEY"))
	subject := strings.TrimSpace(os.Getenv("VAPID_SUBJECT"))
	if subject == "" {
		subject = "mailto:admin@wuzzhub.id"
	}

	// Jika kunci belum diset di environment (misal saat unit test / dev lokal tanpa .env),
	// generate VAPID keys otomatis untuk sesi lokal saat ini.
	if pubKey == "" || privKey == "" {
		generatedPrivKey, generatedPubKey, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			log.Printf("⚠️ [Push] Gagal generate VAPID keys: %v", err)
		} else {
			pubKey = generatedPubKey
			privKey = generatedPrivKey
			log.Printf("⚠️ [Push] VAPID Keys belum diset di environment. Menggunakan temporary keys (Public: %s...)", safePrefix(pubKey, 16))
		}
	} else {
		log.Printf("🔑 [Push] VAPID Keys berhasil dimuat dari environment (Public: %s...)", safePrefix(pubKey, 16))
	}

	return &Service{
		vapidPublicKey:  pubKey,
		vapidPrivateKey: privKey,
		vapidSubject:    subject,
		userStore:       userStore,
	}
}

// SetUserStore memperbarui referensi UserStore.
func (s *Service) SetUserStore(us store.UserStore) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.userStore = us
}

// VAPIDPublicKey mengembalikan Public Key VAPID untuk dikonsumsi oleh frontend browser.
func (s *Service) VAPIDPublicKey() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.vapidPublicKey
}

// SendWebPush mengirimkan push notification ke satu subscription endpoint.
func (s *Service) SendWebPush(ctx context.Context, sub store.PushSubscription, payload []byte) error {
	if sub.Endpoint == "" || s.vapidPublicKey == "" || s.vapidPrivateKey == "" {
		return nil
	}

	sSubscription := &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys: webpush.Keys{
			P256dh: sub.P256dhKey,
			Auth:   sub.AuthKey,
		},
	}

	resp, err := webpush.SendNotification(payload, sSubscription, &webpush.Options{
		Subscriber:      s.vapidSubject,
		VAPIDPublicKey:  s.vapidPublicKey,
		VAPIDPrivateKey: s.vapidPrivateKey,
		TTL:             86400, // 24 jam
		Urgency:         webpush.UrgencyHigh,
	})

	if err != nil {
		log.Printf("⚠️ [Push] Error kirim notification ke %s: %v", safePrefix(sub.Endpoint, 24), err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("⚠️ [Push] WebPush response code %d for endpoint %s", resp.StatusCode, safePrefix(sub.Endpoint, 32))
		// Jika endpoint sudah kedaluwarsa, unauthorized, atau tidak valid di browser push service (400/401/403/404/410),
		// bersihkan dari database agar tidak membebani pengiriman selanjutnya.
		if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone || resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusUnauthorized {
			s.mu.RLock()
			us := s.userStore
			s.mu.RUnlock()
			if us != nil {
				_ = us.DeletePushSubscription(sub.Endpoint)
				log.Printf("🧹 [Push] Subscription kedaluwarsa/invalid (%d) otomatis dihapus: %s", resp.StatusCode, safePrefix(sub.Endpoint, 32))
			}
		}
	} else {
		log.Printf("🚀 [Push] WebPush sukses terkirim (HTTP %d) ke endpoint: %s", resp.StatusCode, safePrefix(sub.Endpoint, 32))
	}

	return nil
}

// NotifyOfflineRecipients menyaring anggota yang sedang offline dan mengirimkan push notification.
func (s *Service) NotifyOfflineRecipients(
	msgID string,
	roomID string,
	senderID string,
	senderNickname string,
	content string,
	mediaType string,
	onlineUserIDs []string,
	mentions ...[]string,
) {
	s.mu.RLock()
	us := s.userStore
	s.mu.RUnlock()

	if us == nil || roomID == "" {
		return
	}

	// Jalankan dalam goroutine terisolasi agar tidak menghalangi WebSocket event loop
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("❌ [Push] Recovered from panic in NotifyOfflineRecipients: %v", r)
			}
		}()

		// 1. Dapatkan seluruh ID / Username anggota percakapan
		memberUsernames, err := us.GetConversationMemberUsernames(roomID)
		if err != nil {
			log.Printf("⚠️ [Push] Error GetConversationMemberUsernames for room %s: %v", roomID, err)
		}

		// Fallback untuk direct conversation jika formatnya dm_userA_userB dan belum ada di relational table
		if len(memberUsernames) == 0 && strings.HasPrefix(roomID, "dm_") {
			rawParts := strings.TrimPrefix(roomID, "dm_")
			parts := strings.Split(rawParts, "_")
			for _, p := range parts {
				if p != "" {
					memberUsernames = append(memberUsernames, p)
				}
			}
		}

		if len(memberUsernames) == 0 {
			return
		}

		// Buat lookup set untuk sender agar pengirim tidak menerima push notifikasi sendiri
		senderMap := map[string]bool{
			strings.ToLower(senderID):       true,
			strings.ToLower(senderNickname): true,
		}

		// 2. Kumpulkan target user ID penerima (seluruh anggota percakapan selain pengirim)
		var targetUserIDs []string
		for _, memberName := range memberUsernames {
			if memberName == "" || senderMap[strings.ToLower(memberName)] {
				continue
			}

			// Cari profil user untuk mendapatkan UUID jika memberName adalah username
			if user, err := us.GetUserByUsernameOrDisplayName(memberName); err == nil && user != nil {
				if !senderMap[strings.ToLower(user.ID)] {
					targetUserIDs = append(targetUserIDs, user.ID)
				}
			} else {
				targetUserIDs = append(targetUserIDs, memberName)
			}
		}

		if len(targetUserIDs) == 0 {
			return
		}

		// 3. Ambil push subscriptions untuk target user ID
		subs, err := us.GetPushSubscriptionsForRecipients(targetUserIDs)
		if err != nil || len(subs) == 0 {
			return
		}

		// 4. Susun pesan notifikasi yang ramah dan aman
		bodyText := content
		if strings.HasPrefix(content, "e2ee:v1:") {
			bodyText = "🔒 Pesan Baru (Terenkripsi)"
		} else if mediaType != "" {
			switch mediaType {
			case "image":
				bodyText = "📷 Mengirim foto"
			case "audio":
				bodyText = "🎤 Mengirim pesan suara"
			case "document":
				bodyText = "📄 Mengirim dokumen"
			case "video":
				bodyText = "🎥 Mengirim video"
			default:
				bodyText = "📎 Mengirim lampiran"
			}
		} else if len(bodyText) > 120 {
			bodyText = safePrefix(bodyText, 117) + "..."
		}

		title := senderNickname
		if title == "" {
			title = "Wuzz Chat"
		}

		// Ambil public key pengirim untuk mempermudah dekripsi client-side di Service Worker
		var senderPubKey string
		if senderUser, err := us.GetUserByID(senderID); err == nil && senderUser != nil {
			senderPubKey = senderUser.PublicKey
		} else if senderUser, err := us.GetUserByUsernameOrDisplayName(senderNickname); err == nil && senderUser != nil {
			senderPubKey = senderUser.PublicKey
		}

		// Map mention user ID untuk pengecekan cepat (DEC-013: Immutable UUID check)
		mentionMap := make(map[string]bool)
		if len(mentions) > 0 && len(mentions[0]) > 0 {
			for _, mID := range mentions[0] {
				mentionMap[strings.ToLower(strings.TrimSpace(mID))] = true
			}
		}

		payloadObj := NotificationPayload{
			Title: title,
			Body:  bodyText,
			Icon:  "/favicon.ico",
			Badge: "/favicon.ico",
			Tag:   "chat-" + roomID,
			Data: map[string]interface{}{
				"message_id":        msgID,
				"room_id":           roomID,
				"sender_id":         senderID,
				"sender_nickname":   senderNickname,
				"sender_public_key": senderPubKey,
				"encrypted_content": content,
				"media_type":        mediaType,
				"url":               "/chat?room=" + roomID,
			},
			Timestamp: time.Now().UnixMilli(),
		}

		// Payload khusus untuk user yang di-mention
		mentionPayloadObj := payloadObj
		mentionPayloadObj.Title = fmt.Sprintf("🔔 %s menyebut Anda", senderNickname)
		mentionPayloadObj.Tag = "chat-mention-" + roomID
		mentionData := make(map[string]interface{})
		for k, v := range payloadObj.Data {
			mentionData[k] = v
		}
		mentionData["is_mention"] = true
		mentionPayloadObj.Data = mentionData

		regularBytes, err := json.Marshal(payloadObj)
		if err != nil {
			return
		}
		mentionBytes, err := json.Marshal(mentionPayloadObj)
		if err != nil {
			mentionBytes = regularBytes
		}

		// 5. Kirimkan push notification ke setiap subscription
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var wg sync.WaitGroup
		for _, sub := range subs {
			wg.Add(1)
			go func(subscription store.PushSubscription) {
				defer wg.Done()
				bytesToSend := regularBytes
				// DEC-013: Cocokkan UUID subscription dengan UUID mention
				if mentionMap[strings.ToLower(subscription.UserID)] {
					bytesToSend = mentionBytes
				}
				if err := s.SendWebPush(ctx, subscription, bytesToSend); err != nil {
					log.Printf("⚠️ [Push] Gagal mengirim push ke endpoint %s: %v", safePrefix(subscription.Endpoint, 24), err)
				} else {
					s.mu.RLock()
					cb := s.deliveryCallback
					s.mu.RUnlock()
					if cb != nil && msgID != "" {
						cb(msgID, roomID, subscription.UserID)
					}
				}
			}(sub)
		}
		wg.Wait()
	}()
}

// NotifyUsers mengirimkan push notification langsung ke daftar user IDs penerima (misal admin subgrup atau pemohon).
func (s *Service) NotifyUsers(userIDs []string, title, body, tag, url string) {
	if len(userIDs) == 0 {
		return
	}

	s.mu.RLock()
	us := s.userStore
	s.mu.RUnlock()

	if us == nil {
		return
	}

	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("❌ [Push] Recovered from panic in NotifyUsers: %v", r)
			}
		}()

		subs, err := us.GetPushSubscriptionsForRecipients(userIDs)
		if err != nil || len(subs) == 0 {
			return
		}

		payloadObj := NotificationPayload{
			Title: title,
			Body:  body,
			Icon:  "/favicon.ico",
			Badge: "/favicon.ico",
			Tag:   tag,
			Data: map[string]interface{}{
				"url": url,
			},
			Timestamp: time.Now().UnixMilli(),
		}

		payloadBytes, err := json.Marshal(payloadObj)
		if err != nil {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var wg sync.WaitGroup
		for _, sub := range subs {
			wg.Add(1)
			go func(subscription store.PushSubscription) {
				defer wg.Done()
				if err := s.SendWebPush(ctx, subscription, payloadBytes); err != nil {
					log.Printf("⚠️ [Push] Gagal mengirim push NotifyUsers ke endpoint %s: %v", safePrefix(subscription.Endpoint, 24), err)
				}
			}(sub)
		}
		wg.Wait()
	}()
}

// NotifyMemoryEvent mengirimkan Web Push Notification terstruktur untuk event Group Memory AI (Section 11 Spec).
func (s *Service) NotifyMemoryEvent(userIDs []string, title, body, tag string, data map[string]interface{}) {
	if len(userIDs) == 0 {
		return
	}

	s.mu.RLock()
	us := s.userStore
	s.mu.RUnlock()

	if us == nil {
		return
	}

	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("❌ [Push] Recovered from panic in NotifyMemoryEvent: %v", r)
			}
		}()

		subs, err := us.GetPushSubscriptionsForRecipients(userIDs)
		if err != nil || len(subs) == 0 {
			return
		}

		if data == nil {
			data = make(map[string]interface{})
		}
		if _, ok := data["url"]; !ok {
			if deepLink, ok := data["deep_link"].(string); ok {
				data["url"] = deepLink
			} else {
				data["url"] = "/chat"
			}
		}

		payloadObj := NotificationPayload{
			Title:     title,
			Body:      body,
			Icon:      "/favicon.ico",
			Badge:     "/favicon.ico",
			Tag:       tag,
			Data:      data,
			Timestamp: time.Now().UnixMilli(),
		}

		payloadBytes, err := json.Marshal(payloadObj)
		if err != nil {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var wg sync.WaitGroup
		for _, sub := range subs {
			wg.Add(1)
			go func(subscription store.PushSubscription) {
				defer wg.Done()
				if err := s.SendWebPush(ctx, subscription, payloadBytes); err != nil {
					log.Printf("⚠️ [Push] Gagal mengirim push NotifyMemoryEvent ke endpoint %s: %v", safePrefix(subscription.Endpoint, 24), err)
				}
			}(sub)
		}
		wg.Wait()
	}()
}

func safePrefix(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen])
}
