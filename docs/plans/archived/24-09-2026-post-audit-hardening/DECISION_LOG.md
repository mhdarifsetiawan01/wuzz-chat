# Decision Log — Modular Monolith Hardening

## DEC-016: Strategi Pembersihan Handlers (Eliminasi Dual-Path Debt Tanpa Mengubah Kontrak REST)
- **Konteks:** Handler HTTP di `internal/api/` memiliki percabangan ganda: jika service != nil maka panggil service, jika nil maka jalankan implementasi legacy store langsung (mencapai ribuan baris).
- **Keputusan:** Menghapus seluruh cabang fallback legacy di Milestone 1, karena seluruh dependency injection di `internal/app/wire.go` sudah 100% menggunakan Application Services. Kontrak HTTP REST (endpoint URL, parameter JSON request/response, HTTP status code) tetap 100% identik dan tidak berubah sedikit pun.
- **Dampak:** Kode handler menyusut drastis, lebih mudah dibaca dan diuji oleh programmer level apapun, serta mencegah bug tidak terduga akibat eksekusi cabang kode lama.

## DEC-017: Pemisahan Milestone Bertahap (Pragmatic Step-by-Step)
- **Konteks:** Pengguna meminta pengerjaan dilakukan per milestone secara bertahap dan tidak sekaligus.
- **Keputusan:** Pekerjaan dipecah menjadi 3 Milestone atomik:
  1. Milestone 1: Pembersihan Handlers (HTTP Layer)
  2. Milestone 2: Decoupling Realtime Message Ingestion (WebSocket Layer)
  3. Milestone 3: Mobile Gateway Readiness (Platform & Push Layer)
  Setiap milestone harus lulus tes mandiri dan mendapat persetujuan sebelum lanjut ke milestone berikutnya.

## DEC-018: Realtime Message Ingestion Decoupling & Go Circular Dependency Prevention
- **Konteks:** `internal/messaging/service.go` sudah mengimpor `internal/ws` untuk `MessageBroadcaster`. Jika `internal/ws` mengimpor `internal/messaging` secara langsung, Go compiler akan menolak kompilasi dengan error `import cycle not allowed`.
- **Keputusan:** Di `internal/ws/hub.go`, didefinisikan interface decoupling `RealtimeMessageManager` menggunakan tipe `store.StoredMessage` (yang dialiaskan oleh `messaging.Message`). Adapter `SQLMessagingRepository` dari `internal/messaging/infra` secara implisit memenuhi interface ini dan disuntikkan ke `Hub` via `hub.SetMessageManager(messagingRepo)` di `internal/app/wire.go`.
- **Dampak:** Zero circular dependency, arsitektur realtime WebSocket ter-decouple rapi, dan seluruh akses database pesan di `client.go` serta `hub.go` terpusat melalui domain interface yang thread-safe.

## DEC-019: Mobile Device Platform Resolution & Pluggable Push Provider Architecture
- **Konteks:** Klien web browser mendeteksi nama perangkat melalui User-Agent, namun klien mobile (React Native / Flutter) tidak selalu menyertakan User-Agent browser dan membutuhkan pencatatan platform eksplisit (`android`/`ios`). Selain itu, notifikasi sebelumnya hanya mengasumsikan Web Push VAPID browser dan belum modular untuk FCM v1 / APNs native mobile tokens.
- **Keputusan:**
  1. Tambahkan parameter `Platform` (`web`, `android`, `ios`) pada `RegisterInput`, `LoginInput`, serta parsing request HTTP (mendukung body JSON dan header `X-Device-Platform` dengan auto-detection fallback dari User-Agent).
  2. Implementasikan abstraksi `PushProvider` interface di `internal/push/push.go` yang memisahkan `VAPIDWebPushProvider` (standard Web Push RFC 8291/8292) dan `FCMv1PushProvider` (Firebase Cloud Messaging HTTP v1 scaffolding).
  3. `push.Service` secara cerdas merutekan pengiriman: endpoint URL web diarahkan ke VAPID provider, sedangkan native device token dialirkan ke FCM provider.
- **Dampak:** Backend WuzzChat kini 100% siap dikonsumsi oleh aplikasi mobile React Native tanpa merusak klien Web browser eksisting (*zero breaking changes*).


