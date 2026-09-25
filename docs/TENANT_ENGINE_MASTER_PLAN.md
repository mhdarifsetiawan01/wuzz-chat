# 🏛️ TENANT_ENGINE_MASTER_PLAN.md — Master Blueprint: Evolusi WuzzChat Menjadi Tenant-Aware & Integration-Ready Engine

> **Document Status**: CANONICAL ARCHITECTURAL BLUEPRINT  
> **Date Established**: 2026-09-24  
> **Author**: Principal Software Architect & Product Architect  
> **Target Audience**: AI Agents, System Architects, Core Backend Engineers  
> **Companion Specs**: [`docs/PROJECT_STATE.md`](PROJECT_STATE.md), [`docs/ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/BACKEND_API.md`](BACKEND_API.md), [`docs/MOBILE_INTEGRATION_GUIDE.md`](MOBILE_INTEGRATION_GUIDE.md)

---

## 🎯 1. Executive Summary

WuzzChat saat ini telah beroperasi sebagai **Headless Messaging + AI Memory Engine** mandiri melalui penyelesaian Track B (Modular Monolith Domain-Driven Design) dan Post-Audit Hardening (Milestone 1–3). Backend Go telah terlepas dari dependensi langsung UI Next.js, melayani klien melalui protokol terbuka (REST JSON dan WebSocket RFC 6455), mengabstraksikan gateway push notification multi-platform (VAPID & FCM v1), serta mengisolasi pemrosesan memori AI berbasis *Human-in-the-Loop*.

Dokumen ini mendefinisikan cetak biru komprehensif untuk membawa WuzzChat bertransformasi dari **Single-Tenant Headless Engine** menuju **Tenant-Aware & Integration-Ready Engine** yang siap diintegrasikan secara aman oleh aplikasi pihak ketiga (B2B, SaaS, Mobile App eksternal, atau Dedicated Customer Deployments).

Transformasi ini dieksekusi secara bertahap:
```text
WuzzChat App (Standalone)
        ↓
Headless Engine (Current State)
        ↓
Milestone 0: Codebase & Hub Prerequisite Stabilization
        ↓
Tenant-Aware Engine (Shared DB + tenant_id)
        ↓
External Integration & Headless B2B Gateway (JIT Provisioning & Token Exchange)
        ↓
Multi-Tenant Platform & Dedicated Deployments
        ↓
Future Developer Platform & SDKs
```

---

## 🔍 2. Current Engine State & Precondition Audit (Phase 0)

Berdasarkan audit faktual terhadap basis kode per September 2026:

### A. Identity vs Authentication
- **Temuan**:
  - Kolom `username` pada tabel `users` memiliki batasan unik global: `username VARCHAR(64) UNIQUE NOT NULL` (`internal/store/sql.go:98`).
  - Pencarian kontak (`SearchUsers`) dan pengambilan profil (`GetUserProfile`) di `chat_handler.go` memotong langsung ke `store.UserStore` tanpa melewati Application Service dan tanpa filter batas tenant.
  - Endpoint `GetUserPublicKey` (`chat_handler.go:217`) bersifat publik tanpa autentikasi JWT.
- **Kesimpulan & Status**: **`SELESAI DI MILESTONE 0 (Identity encapsulated in AuthService)`**.
- **Solusi**: Unikitas username akan diubah menjadi komposit `(tenant_id, username)` di Milestone 1. Lookup kontak (`SearchUsers`) dan pengambilan profil publik (`GetUserProfile`, `GetUserPublicKey`) telah berhasil 100% dienkapsulasi ke dalam `authz.AuthService` dan `authz.AuthRepository` pada Milestone 0.

### B. Dependency Direction
- **Temuan**:
  - `messaging/service.go` dan `group/service.go` mengimpor `internal/ws` untuk struct DTO `ws.Message`.
  - `group/service.go` mengimpor `internal/store` untuk interface `MemoryStore`.
- **Kesimpulan**: **`NON-BLOCKER (Future Technical Debt)`**. Hal ini tidak menghalangi kompilasi maupun penyisipan parameter tenant ke method service layer.

### C. Backend API Contract
- **Temuan**: API saat ini belum memiliki prefix versi publik (`/api/v1/*`) dan amplop error belum 100% seragam.
- **Kesimpulan**: **`NEEDS MINOR STABILIZATION`**. Stabilisasi amplop error (RFC 7807) dan alias rute `/api/v1/*` diterapkan sebelum API dibuka ke pihak ketiga.

### D. WebSocket Contract & In-Memory Hub
- **Temuan**:
  - Handshake WebSocket di `internal/ws/handler.go` memvalidasi JWT token dan status aktif `device_id` di database.
  - **Temuan Kritis**: `Hub` di `internal/ws/hub.go` sebelumnya memetakan klien menggunakan `clientsByNick map[string]*Client` berbasis lowercase string username.
- **Kesimpulan & Status**: **`SELESAI DI MILESTONE 0 (Pure UUID Routing)`**. Map `clientsByNick` telah tuntas dihapus dari codebase, dan perutean real-time dialihkan 100% ke User UUID (`userClients[userID][deviceID]`), diverifikasi dengan unit test anti-collision.

---

## 🛡️ 3. Engine Boundary Definition (Phase 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            WUZZCHAT ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  [FRONTEND / CLIENT APPLICATIONS] (OUTSIDE ENGINE)                          │
│  • WuzzChat Next.js Web App (chat.wuzzhub.id)                               │
│  • PWA Service Worker & Offline UI Shell                                    │
│  • Aurora Glassmorphism Design System (DESIGN.md)                           │
│  • Client-Side React 19 State Management & Custom Hooks                     │
│  • Web Crypto Local IndexedDB Key Storage (wuzz_crypto_db)                  │
│  • Third-Party Web / Mobile / Desktop Applications                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ▲ HTTP REST JSON (RFC 7807) & WebSocket RFC 6455                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  [WUZZCHAT HEADLESS & TENANT-AWARE ENGINE] (INSIDE ENGINE)                  │
│  ├── Transport Gateway: REST Router, Auth Middleware, WebSocket Handshake   │
│  ├── Tenant Context Resolver: API Key, Host Header, JWT Tenant Claim        │
│  ├── Core Identity & Session: User, Credential, Device Limit, Token Revoke  │
│  ├── Messaging Core: 1-on-1 Rooms, Receipts, Reactions, Edit/Delete, Pin    │
│  ├── Group & Forum Engine: Persistent Groups, Ephemeral Topics, TTL Worker  │
│  ├── Realtime Orchestrator: Go Hub, Multicast Fanout, Redis Cluster Sync    │
│  ├── Media Buffer Driver: Store-and-Forward Lifecycle, TTL Purge Worker     │
│  ├── Push Gateway Service: Auto-Routing VAPID WebPush & FCM v1 Tokens       │
│  └── AI Memory Engine: SKIP LOCKED Queue, ContextSource, LLM Processor      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏢 4. Tenant Model & Data Isolation (Phase 2 & 6)

### 1. Definisi & Aturan Fundamental
- **Tenant**: Batas administratif dan ruang isolasi data independen (*logical boundary*).
- **Default Tenant**: Seluruh data eksisting WuzzChat otomatis berada di bawah `tenant_default` (`00000000-0000-0000-0000-000000000001`).
- **Tenant-Scoped Identity**: Pengguna terdaftar eksklusif pada satu tenant.
- **Strict Isolation**: Obrolan lintas tenant (*cross-tenant conversations*) dilarang keras.
- **Strategi Terpilih**: **Shared Database dengan kolom `tenant_id` + Composite Index**. Menjamin performa maksimal, kompatibilitas SQLite & PostgreSQL, dan $0 biaya infrastruktur tambahan. Dedicated deployment container disediakan untuk klien enterprise.

### 2. Matriks Isolasi Data

| Domain / Tabel | Klasifikasi | Aturan Isolasi / Filter |
|---|---|---|
| `tenants`, `tenant_api_keys` | GLOBAL | Master data engine |
| `users` | TENANT-SCOPED | `WHERE tenant_id = ?` (Unique per tenant) |
| `user_credentials` | TENANT-SCOPED | Terikat `user_id` |
| `sessions`, `devices` | TENANT-SCOPED | Terikat `user_id` |
| `conversations` | TENANT-SCOPED | `WHERE tenant_id = ?` |
| `conversation_members` | TENANT-SCOPED | Terikat `conversation_id` |
| `messages` | TENANT-SCOPED | `WHERE room_id IN (tenant conv)` |
| `pinned_messages` | TENANT-SCOPED | Terikat `room_id` |
| `forum_memory_jobs` | TENANT-SCOPED | `WHERE tenant_id = ?` |
| `memory_drafts` | TENANT-SCOPED | `WHERE tenant_id = ?` |
| `approved_memories` | TENANT-SCOPED | `WHERE tenant_id = ?` |
| `push_subscriptions` | TENANT-SCOPED | Terikat `user_id` |
| `storage / media files` | TENANT-SCOPED | Path: `/uploads/{tenant_id}/...` |
| `revoked_tokens` (JTI) | GLOBAL / SHARED | Blacklist token UUID |

---

## 🔑 5. External Identity & Authentication Model (Phase 3, 4, 5)

Aplikasi pihak ketiga tidak dipaksa menggunakan autentikasi manual WuzzChat. Sistem menyediakan alur **JIT User Provisioning & Short-Lived Token Exchange**:

```text
[Third-Party Backend] 
        │
        │ 1. POST /api/v1/auth/provision-token
        │    Headers: { X-App-ID: "...", X-App-Secret: "..." }
        │    Body:    { external_user_id: "user_987", display_name: "Andi" }
        ▼
[WuzzChat Engine]
        │
        │ 2. Validasi Tenant & Kredensial
        │ 3. Atomic Upsert User: (tenant_id, external_user_id) -> User UUID
        │ 4. Issue Exchange Token (TTL 60s)
        ▼
[Third-Party Backend] ➔ Kirim Exchange Token ke Client Klien Mereka
        ▼
[Third-Party Client App]
        │
        │ 5. POST /api/v1/auth/exchange
        │    Body: { exchange_token: "...", device_id: "dev_xxx", platform: "android" }
        ▼
[WuzzChat Engine]
        │
        │ 6. Kembalikan Session JWT (memuat claim: tenant_id, user_id, jti)
        │ 7. Client Konek WebSocket: wss://engine/ws?token=<JWT>&device_id=dev_xxx
        ▼
[Established Realtime Session]
```

### Skema Tabel Tenant Baru:
```sql
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(64) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id),
    app_id VARCHAR(64) UNIQUE NOT NULL,
    secret_hash VARCHAR(255) NOT NULL,
    name VARCHAR(128) DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tenant_keys_app ON tenant_api_keys(app_id, is_active);
```

---

## ⚡ 6. Realtime & Memory Engine Tenant Isolation (Phase 7 & 8)

### 1. In-Memory WebSocket Hub
- [x] **Hapus map `clientsByNick`**: Selesai di Milestone 0 (perutean murni berbasis User UUID).
- [x] Setiap struct `Client` menyimpan field `TenantID` (Milestone 4).
- [x] Multicast room broadcast memvalidasi keanggotaan dan kecocokan `TenantID` (Milestone 4).

### 2. Redis Pub/Sub Cluster
- [x] Perbarui struct `ClusterEvent` di [hub.go](file:///home/bms-del112/BMS/personal-project/wuzz-chat/backend/internal/ws/hub.go) dengan field `TenantID string json:"tenant_id"`.
- [x] Listener pada setiap node memeriksa apakah target room/user aktif di instance lokal untuk tenant terkait sebelum melakukan broadcast (Milestone 4).

### 3. AI Memory Engine
- `ContextSource` menerima `ctx` yang memuat `TenantContext`.
- Query worker PostgreSQL `FOR UPDATE SKIP LOCKED` menyertakan `tenant_id`.
- Reviewer draf memori divalidasi harus merupakan admin grup dari tenant yang sama.

---

## 🗺️ 7. Milestone Roadmap

```text
[Milestone 0] Codebase & Hub Prerequisite Stabilization        ==> DONE & DEPLOYED (Sep 2026) ✅
[Milestone 1] Additive Schema Migration & Tenant Registry       ==> DONE & DEPLOYED (Sep 2026) ✅
[Milestone 2] Tenant Context Propagation in Services & Repos    ==> DONE & DEPLOYED (Sep 2026) ✅
[Milestone 3] External Provisioning & B2B Auth Gateway          ==> DONE (Sep 2026) ✅
[Milestone 4] Realtime & Cluster Envelope Tenant Isolation      ==> DONE (Sep 2026) ✅
[Milestone 5] AI Memory Context Tenant Scoping                  ==> DONE (Sep 2026) ✅
[Milestone 6] OpenAPI Contract & Headless Integration Guide     ==> DONE (Sep 2026) ✅
──────────────────────────────────────────────────────────────────────────────
[Milestone 7] Webhooks & Event Subscription Engine             ==> NEXT 🎯
[Milestone 8] Developer Portal, API Keys Self-Serve & Quotas   ==> FUTURE 🔮
[Milestone 9] Official Client SDKs (TypeScript, RN, Flutter)   ==> FUTURE 🔮
```

---

## 🚫 8. What NOT To Build Yet (Anti-Overengineering)

1. ❌ **Billing & Invoicing**: Tidak ada integrasi Stripe/Xendit sebelum produk memiliki basis tenant aktif.
2. ❌ **Self-Service Dev Portal**: Pendaftaran API key tahap awal dilakukan via script admin / CLI seeder.
3. ❌ **Full OAuth2/OIDC Server**: Cukup gunakan App ID + Secret Server-to-Server + Exchange Token.
4. ❌ **Dedicated SDK Repositories**: Dokumentasi kontrak REST JSON dan WebSocket terbuka jauh lebih bernilai di fase awal.
5. ❌ **Microservices Split**: Tetap pertahankan Go Modular Monolith yang sangat efisien, cepat, dan mudah dipelihara.
