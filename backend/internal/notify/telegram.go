package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const telegramAPI = "https://api.telegram.org"

// Telegram mengirim pemberitahuan lewat Bot API (sendMessage).
type Telegram struct {
	token   string
	chatID  string
	baseURL string
	client  *http.Client
}

// TelegramOption mengubah perilaku Telegram (terutama untuk tes).
type TelegramOption func(*Telegram)

// WithTelegramBaseURL mengganti alamat API (tes memakai server lokal).
func WithTelegramBaseURL(u string) TelegramOption {
	return func(t *Telegram) { t.baseURL = strings.TrimRight(u, "/") }
}

func NewTelegram(token, chatID string, opts ...TelegramOption) *Telegram {
	t := &Telegram{
		token: strings.TrimSpace(token), chatID: strings.TrimSpace(chatID), baseURL: telegramAPI,
		client: &http.Client{Timeout: 10 * time.Second},
	}
	for _, o := range opts {
		o(t)
	}
	return t
}

func (t *Telegram) Name() string { return "telegram" }

// redact membuang token bot dari teks galat: Go menyertakan URL penuh (yang memuat token) pada error jaringan.
func (t *Telegram) redact(s string) string {
	if t.token == "" {
		return s
	}
	return strings.ReplaceAll(s, t.token, "***")
}

type telegramResponse struct {
	OK          bool   `json:"ok"`
	Description string `json:"description"`
	Parameters  struct {
		RetryAfter int `json:"retry_after"`
	} `json:"parameters"`
}

func (t *Telegram) Notify(ctx context.Context, ev Event) error {
	body, _ := json.Marshal(map[string]any{
		"chat_id":                  t.chatID,
		"text":                     FormatText(ev),
		"disable_web_page_preview": true,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.baseURL+"/bot"+t.token+"/sendMessage", bytes.NewReader(body))
	if err != nil {
		return &PermanentError{Err: errors.New("telegram: konfigurasi tidak valid")}
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(req)
	if err != nil {
		// Galat jaringan dianggap sementara; token tidak boleh bocor lewat teks galat.
		return fmt.Errorf("telegram: kirim gagal: %s", t.redact(err.Error()))
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	var tr telegramResponse
	_ = json.Unmarshal(raw, &tr)

	switch {
	case resp.StatusCode == http.StatusOK && tr.OK:
		return nil
	case resp.StatusCode == http.StatusTooManyRequests:
		after := time.Duration(tr.Parameters.RetryAfter) * time.Second
		return &RetryAfterError{After: after, Err: fmt.Errorf("telegram: dibatasi (429), tunggu %s", after)}
	case resp.StatusCode >= 500:
		return fmt.Errorf("telegram: server galat (%d)", resp.StatusCode)
	default:
		// 400/401/403/404: token, chat id, atau izin bot salah. Mengulang percuma.
		return &PermanentError{Err: fmt.Errorf("telegram: ditolak (%d): %s", resp.StatusCode, t.redact(tr.Description))}
	}
}
