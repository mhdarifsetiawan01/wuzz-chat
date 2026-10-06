package notify

import (
	"log"
	"strings"
)

// Settings adalah konfigurasi dari environment (lihat config.Config).
type Settings struct {
	Channels         []string // mis. ["telegram"]; kosong = tanpa notifikasi
	AdminURL         string
	TelegramBotToken string
	TelegramChatID   string
}

// Build membuat Dispatcher dari konfigurasi. Saluran yang diminta tetapi kurang kredensial dilewati dengan peringatan
// (server tetap jalan). Mengembalikan nil bila tidak ada saluran yang aktif.
func Build(s Settings) *Dispatcher {
	var notifiers []Notifier
	seen := map[string]bool{}
	for _, ch := range s.Channels {
		ch = strings.ToLower(strings.TrimSpace(ch))
		if ch == "" || seen[ch] {
			continue
		}
		seen[ch] = true
		switch ch {
		case "telegram":
			if strings.TrimSpace(s.TelegramBotToken) == "" || strings.TrimSpace(s.TelegramChatID) == "" {
				log.Printf("⚠️ MODERATION_NOTIFY menyebut telegram tetapi TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID belum lengkap; saluran dilewati")
				continue
			}
			notifiers = append(notifiers, NewTelegram(s.TelegramBotToken, s.TelegramChatID))
		default:
			log.Printf("⚠️ MODERATION_NOTIFY: saluran %q tidak dikenal, dilewati", ch)
		}
	}
	if len(notifiers) == 0 {
		return nil
	}
	return NewDispatcher(Options{Notifiers: notifiers, AdminURL: s.AdminURL})
}
