package broker

import (
	"context"
	"errors"
	"log"
	"os"
	"sync"
	"time"
)

var (
	// ErrKeyNotFound menandakan kunci tidak ditemukan di cache.
	ErrKeyNotFound = errors.New("key not found")
)

// MessageBroker mendefinisikan kontrak interface untuk Pub/Sub dan Caching antar node backend.
type MessageBroker interface {
	// Publish mengirimkan payload byte ke channel tertentu.
	Publish(ctx context.Context, channel string, payload []byte) error

	// Subscribe mendengarkan event dari channel tertentu dan memanggil handler saat ada pesan baru.
	Subscribe(ctx context.Context, channel string, handler func(channel string, payload []byte)) error

	// Get mengambil nilai string dari cache berdasarkan key.
	Get(ctx context.Context, key string) (string, error)

	// Set menyimpan pasangan key-value string ke cache dengan masa berlaku (TTL).
	Set(ctx context.Context, key string, value string, expiration time.Duration) error

	// Close menutup koneksi broker.
	Close() error
}

// InMemoryBroker adalah implementasi MessageBroker di memori lokal sebagai fallback saat Redis tidak tersedia.
type InMemoryBroker struct {
	mu          sync.RWMutex
	subscribers map[string][]func(channel string, payload []byte)
	cache       map[string]cacheItem
	closed      bool
}

type cacheItem struct {
	value     string
	expiresAt time.Time
}

// NewInMemoryBroker membuat instance InMemoryBroker baru.
func NewInMemoryBroker() *InMemoryBroker {
	return &InMemoryBroker{
		subscribers: make(map[string][]func(channel string, payload []byte)),
		cache:       make(map[string]cacheItem),
	}
}

// Publish mengeksekusi handler lokal yang terdaftar pada channel secara asynchronous.
func (b *InMemoryBroker) Publish(ctx context.Context, channel string, payload []byte) error {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.closed {
		return errors.New("broker is closed")
	}

	handlers, ok := b.subscribers[channel]
	if !ok || len(handlers) == 0 {
		return nil
	}

	// Buat copy payload agar aman dari mutasi
	data := make([]byte, len(payload))
	copy(data, payload)

	for _, h := range handlers {
		go h(channel, data)
	}

	return nil
}

// Subscribe mendaftarkan handler fungsi untuk channel tertentu di memori lokal.
func (b *InMemoryBroker) Subscribe(ctx context.Context, channel string, handler func(channel string, payload []byte)) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed {
		return errors.New("broker is closed")
	}

	b.subscribers[channel] = append(b.subscribers[channel], handler)
	return nil
}

// Get mengambil data dari memory cache jika belum kedaluwarsa.
func (b *InMemoryBroker) Get(ctx context.Context, key string) (string, error) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.closed {
		return "", errors.New("broker is closed")
	}

	item, ok := b.cache[key]
	if !ok {
		return "", ErrKeyNotFound
	}

	if !item.expiresAt.IsZero() && time.Now().After(item.expiresAt) {
		return "", ErrKeyNotFound
	}

	return item.value, nil
}

// Set menyimpan data ke memory cache dengan masa berlaku (TTL).
func (b *InMemoryBroker) Set(ctx context.Context, key string, value string, expiration time.Duration) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed {
		return errors.New("broker is closed")
	}

	var exp time.Time
	if expiration > 0 {
		exp = time.Now().Add(expiration)
	}

	b.cache[key] = cacheItem{
		value:     value,
		expiresAt: exp,
	}

	return nil
}

// Close membersihkan seluruh subscriber dan cache.
func (b *InMemoryBroker) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.closed = true
	b.subscribers = nil
	b.cache = nil
	return nil
}

// NewBrokerFromEnv membuat MessageBroker berdasarkan environment variable REDIS_URL.
// Jika REDIS_URL tidak diisi, otomatis mengembalikan InMemoryBroker (Graceful Fallback).
func NewBrokerFromEnv() (MessageBroker, error) {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Println("ℹ️ REDIS_URL tidak diisi, menggunakan InMemoryBroker (Mode Lokal).")
		return NewInMemoryBroker(), nil
	}

	log.Println("🚀 Menginisialisasi RedisBroker dengan koneksi Redis...")
	broker, err := NewRedisBroker(redisURL)
	if err != nil {
		log.Printf("⚠️ Gagal menghubungkan ke Redis (%v), fallback ke InMemoryBroker.", err)
		return NewInMemoryBroker(), nil
	}

	log.Println("✅ Berhasil terhubung ke Redis Broker (Pub/Sub & Cache aktif).")
	return broker, nil
}
