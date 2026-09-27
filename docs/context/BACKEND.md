# ⚙️ Backend Domain Context Primer — Wuzz Chat

Dokumen ini adalah acuan konteks utama untuk pengembangan, perbaikan bug, refactoring, dan penambahan fitur pada layer **Backend (Golang)**.

---

## 🛠️ 1. Tech Stack & Environment
- **Bahasa**: Golang (Go 1.26+)
- **Arsitektur**: Modular Monolith (Domain-Driven Design / Clean Architecture)
- **Database**: PostgreSQL (Supabase Pooler) dengan fallback SQLite (ModernC pure Go, WAL mode + Busy Timeout 5s)
- **Real-Time & Pub/Sub**: WebSocket (`gorilla/websocket`), Upstash Redis TLS (`rediss://...`) dengan In-Memory fallback broker
- **Push Notification**: FCM v1 (HTTP v1 API OAuth2 Google ADC) & W3C Web Push (VAPID RFC 8292 via `SherClockHolmes/webpush-go`)
- **Live Deployment**: Fly.io (`https://wuzz-chat-backend.fly.dev`, WS: `wss://wuzz-chat-backend.fly.dev/ws`)

---

## 🏛️ 2. Struktur Modul Modular Monolith (`backend/internal/`)

```text
backend/
├── main.go                     # Slim entrypoint (55 baris, graceful shutdown)
└── internal/
    ├── app/
    │   ├── wire.go             # Dependency Injection & orchestrator container
    │   └── router.go           # Modular HTTP route registration
    ├── shared/config/          # Sentralisasi konfigurasi env & runtime
    ├── authz/                  # DOMAIN 1: Autentikasi & Identitas
    │   ├── entity.go           # User, Session, Device, Credentials
    │   ├── service.go          # Use cases login, register, password change, device limits
    │   ├── repository.go       # Interface AuthRepository
    │   └── worker/             # Background token/session cleanup
    ├── messaging/              # DOMAIN 2: Perpesanan & Chat Realtime
    │   ├── entity.go           # Message, Conversation, Receipt, Reaction
    │   ├── service.go          # Edit, delete, forward, pin/unpin, search, history
    │   ├── repository.go       # Interface MessageRepository
    │   └── infra/              # SQL Message Repository Adapter
    ├── group/                  # DOMAIN 3: Grup & Forum Topik
    │   ├── entity.go           # Group, SubGroup, JoinRequest, RBAC
    │   ├── service.go          # GroupService & ForumService
    │   ├── repository.go       # Interface GroupRepository
    │   └── worker/ttl_worker.go # SubGroupTTLWorker (auto-expire & auto-purge)
    ├── memory/                 # DOMAIN 4: Group Memory AI Engine
    │   ├── entity.go           # MemoryDraft, Artifact, Evidence
    │   ├── service.go          # MemoryService & Extraction Orchestrator
    │   ├── context_source.go   # Abstraksi ContextSource
    │   └── worker/             # PostgreSQL SKIP LOCKED Queue Worker
    ├── ws/                     # LAYER REAL-TIME: WebSocket Hub
    │   ├── hub.go              # Broadcast fanout O(M), membership cache, session kicks
    │   ├── client.go           # Read/Write pump, rate limiter, Targeted History Routing
    │   └── cluster.go          # Redis Pub/Sub cluster events (session_kick, device_kick)
    ├── push/                   # LAYER NOTIFIKASI: Pluggable Push Providers
    │   ├── push.go             # Interface PushProvider & Dispatcher
    │   ├── fcm.go              # FCMv1PushProvider (Silent Data-Only payload)
    │   └── webpush.go          # VAPIDWebPushProvider (RFC 8292)
    ├── api/                    # THIN TRANSPORT HANDLERS (HTTP Controllers)
    │   ├── auth_handler.go     # /api/auth/*
    │   ├── message_handler.go  # /api/messages/*, /api/conversations/*
    │   ├── group_handler.go    # /api/groups/*
    │   ├── memory_handler.go   # /api/memory/*
    │   └── media_handler.go    # /api/media/*, Store-and-Forward ACK
    └── store/                  # DATABASE ACCESS LAYER
        ├── sql.go              # DB init & idempotent non-destructive migrations
        ├── user_store.go       # SQLUserStore (Credential & device queries)
        └── sql_group_store.go  # SQLGroupStore (Legacy group access)
```

---

## 🔒 3. Aturan & Konvensi Wajib Backend

1. **Thin Transport Pattern**:
   - Handler di `backend/internal/api/` **HANYA** bertugas: parsing request JSON/param, validasi format, memanggil `Service`, dan serialisasi response JSON.
   - Dilarang menuliskan query SQL langsung di dalam file handler.
2. **Keamanan & Otorisasi**:
   - **Anti-BOLA/IDOR**: Validasi keanggotaan room (`isAuthorizedForRoom`) pada setiap request pesan atau frame WebSocket.
   - **Anti-SSRF**: Socket-level IP pinning pada scraper link preview (memblokir 14 subnet IP privat).
   - **Zero-Knowledge E2EE**: Server tidak pernah mendekripsi atau menyimpan plaintext pesan 1-on-1.
3. **Resilience & Jaringan Lambat**:
   - Berikan jeda flush minimal 500ms dan write deadline minimal 1000ms pada event pemutusan sesi (`SESSION_REPLACED`, Close Code 4001).
   - Deduplikasi pesan berbasis in-memory TTL 2 menit (`IsDuplicateAndRecord`) dengan presisi nanodetik.
4. **Targeted Multi-Device History Routing**:
   - Riwayat chat (`sendRoomHistory`) wajib dikirimkan langsung ke soket perangkat yang meminta (`c.send`), bukan disebar ke seluruh soket user untuk mencegah balapan antar-perangkat.

---

## 🧪 4. Testing & Verifikasi Backend
Jalankan seluruh test suite dari root proyek:
```bash
cd backend && go test -v ./...
```
Pastikan seluruh unit & integration test lolos 100% tanpa race condition (`go test -race ./...`).

---

## ⚠️ 5. Peringatan Deployment Fly.io
Setiap kali ada perubahan pada direktori `backend/`:
1. AI wajib menyertakan peringatan deployment ke pengguna.
2. Deployment dieksekusi via `fly deploy --remote-only` hanya setelah persetujuan eksplisit.
3. Verifikasi ketersediaan server dengan `curl -sI https://wuzz-chat-backend.fly.dev/health` (harus HTTP 200 OK).
