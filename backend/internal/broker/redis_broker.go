package broker

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisBroker adalah implementasi MessageBroker menggunakan Redis TCP/TLS (`redis://` atau `rediss://`).
type RedisBroker struct {
	client *redis.Client
	pubsub map[string]*redis.PubSub
	mu     sync.Mutex
	ctx    context.Context
	cancel context.CancelFunc
}

// NewRedisBroker menginisialisasi client Redis dari connection URL string.
func NewRedisBroker(redisURL string) (*RedisBroker, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("invalid redis url: %w", err)
	}

	// Set sane timeout defaults
	opts.DialTimeout = 5 * time.Second
	opts.ReadTimeout = 5 * time.Second
	opts.WriteTimeout = 5 * time.Second
	opts.PoolSize = 10

	rdb := redis.NewClient(opts)

	// Uji koneksi awal dengan PING
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		_ = rdb.Close()
		return nil, fmt.Errorf("ping redis failed: %w", err)
	}

	brokerCtx, brokerCancel := context.WithCancel(context.Background())

	return &RedisBroker{
		client: rdb,
		pubsub: make(map[string]*redis.PubSub),
		ctx:    brokerCtx,
		cancel: brokerCancel,
	}, nil
}

// Publish mengirimkan payload byte ke channel Redis tertentu.
func (r *RedisBroker) Publish(ctx context.Context, channel string, payload []byte) error {
	if r.client == nil {
		return errors.New("redis client not initialized")
	}
	return r.client.Publish(ctx, channel, payload).Err()
}

// Subscribe mendengarkan event dari channel Redis secara background dan memanggil handler.
func (r *RedisBroker) Subscribe(ctx context.Context, channel string, handler func(channel string, payload []byte)) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	pubsub := r.client.Subscribe(r.ctx, channel)

	// Tunggu konfirmasi subscription
	if _, err := pubsub.Receive(ctx); err != nil {
		_ = pubsub.Close()
		return fmt.Errorf("subscribe to channel %s failed: %w", channel, err)
	}

	r.pubsub[channel] = pubsub

	// Jalankan loop pembacaan pesan di goroutine terpisah
	go func() {
		ch := pubsub.Channel()
		for {
			select {
			case <-r.ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				if msg != nil {
					handler(msg.Channel, []byte(msg.Payload))
				}
			}
		}
	}()

	return nil
}

// Get mengambil nilai string dari Redis cache.
func (r *RedisBroker) Get(ctx context.Context, key string) (string, error) {
	val, err := r.client.Get(ctx, key).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return "", ErrKeyNotFound
		}
		return "", err
	}
	return val, nil
}

// Set menyimpan nilai string ke Redis cache dengan masa berlaku (TTL).
func (r *RedisBroker) Set(ctx context.Context, key string, value string, expiration time.Duration) error {
	return r.client.Set(ctx, key, value, expiration).Err()
}

// Close menutup seluruh active pubsub subscriptions dan client Redis.
func (r *RedisBroker) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.cancel()

	for chName, ps := range r.pubsub {
		if err := ps.Close(); err != nil {
			log.Printf("[RedisBroker] error closing pubsub on channel %s: %v", chName, err)
		}
	}
	r.pubsub = make(map[string]*redis.PubSub)

	return r.client.Close()
}
