package broker

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestInMemoryBroker_PubSub(t *testing.T) {
	b := NewInMemoryBroker()
	defer b.Close()

	ctx := context.Background()
	channel := "test:channel"
	testPayload := []byte(`{"event":"hello","count":42}`)

	var receivedData []byte
	var wg sync.WaitGroup
	wg.Add(1)

	err := b.Subscribe(ctx, channel, func(ch string, payload []byte) {
		if ch == channel {
			receivedData = payload
			wg.Done()
		}
	})
	if err != nil {
		t.Fatalf("Subscribe failed: %v", err)
	}

	err = b.Publish(ctx, channel, testPayload)
	if err != nil {
		t.Fatalf("Publish failed: %v", err)
	}

	wg.Wait()

	if string(receivedData) != string(testPayload) {
		t.Errorf("Expected received data '%s', got '%s'", string(testPayload), string(receivedData))
	}
}

func TestInMemoryBroker_Cache(t *testing.T) {
	b := NewInMemoryBroker()
	defer b.Close()

	ctx := context.Background()
	key := "test:key"
	val := "hello-world"

	// 1. Get non-existent
	_, err := b.Get(ctx, key)
	if err != ErrKeyNotFound {
		t.Errorf("Expected ErrKeyNotFound, got %v", err)
	}

	// 2. Set with TTL
	err = b.Set(ctx, key, val, 50*time.Millisecond)
	if err != nil {
		t.Fatalf("Set failed: %v", err)
	}

	// 3. Get immediately
	retrieved, err := b.Get(ctx, key)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if retrieved != val {
		t.Errorf("Expected '%s', got '%s'", val, retrieved)
	}

	// 4. Wait for expiration
	time.Sleep(60 * time.Millisecond)
	_, err = b.Get(ctx, key)
	if err != ErrKeyNotFound {
		t.Errorf("Expected ErrKeyNotFound after expiration, got %v", err)
	}
}

func TestRedisBroker_Integration(t *testing.T) {
	redisURL := "rediss://default:gQAAAAAAAdJlAAIgcDI1ZmNjN2QxMmRhZGI0YzY2YTExMjZjNjdkNTBiMDdhOA@exotic-walleye-119397.upstash.io:6379"

	b, err := NewRedisBroker(redisURL)
	if err != nil {
		t.Skipf("Skipping Redis integration test: %v", err)
	}
	defer b.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	channel := "test:upstash:channel"
	testPayload := []byte(`{"status":"online","ping":"pong"}`)

	var receivedData []byte
	var wg sync.WaitGroup
	wg.Add(1)

	err = b.Subscribe(ctx, channel, func(ch string, payload []byte) {
		if ch == channel {
			receivedData = payload
			wg.Done()
		}
	})
	if err != nil {
		t.Fatalf("Subscribe failed: %v", err)
	}

	// Give subscription a moment to propagate in Upstash
	time.Sleep(200 * time.Millisecond)

	err = b.Publish(ctx, channel, testPayload)
	if err != nil {
		t.Fatalf("Publish failed: %v", err)
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		if string(receivedData) != string(testPayload) {
			t.Errorf("Expected '%s', got '%s'", string(testPayload), string(receivedData))
		}
	case <-time.After(5 * time.Second):
		t.Fatalf("Timed out waiting for Upstash Pub/Sub message")
	}

	// Test Cache on Upstash
	testKey := "test:wuzz:cache"
	testVal := "wuzz-scale-ok"
	err = b.Set(ctx, testKey, testVal, 10*time.Second)
	if err != nil {
		t.Fatalf("Set failed: %v", err)
	}

	val, err := b.Get(ctx, testKey)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if val != testVal {
		t.Errorf("Expected '%s', got '%s'", testVal, val)
	}
}

