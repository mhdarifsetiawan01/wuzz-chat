# Implementation Plan: Milestone 2 — Job Queue & Expiry Trigger

## 🎯 Objective
Mengotomatisasi pembuatan job saat forum mencapai batas waktu kedaluwarsa, dan membangun daemon worker background Go untuk memproses antrean `forum_memory_jobs` secara aman, non-blocking, dan toleran terhadap kegagalan.

## 📦 Scope of Work

### 1. Expiry Trigger Integration (`SubGroupTTLWorker`)
- Modifikasi atau perluas `ExpireSubGroupsBatch` agar mengembalikan ID forum-forum dan `parent_id` (grup) yang baru saja kedaluwarsa.
- Panggil `memoryStore.CreateJob(ctx, forumID, groupID)` untuk setiap forum yang beralih status ke `'expired'`.
- Tambahkan idempotency guard agar forum yang sudah memiliki job tidak memicu duplikasi job (`ErrJobAlreadyExists` ditangani secara elegan).

### 2. MemoryJobWorker Daemon (`backend/internal/worker/memory_worker.go`)
- Background worker dengan goroutine ticker (default interval: 10-15 detik).
- Polling `GetPendingJobs`: mengambil job berstatus `QUEUED` yang siap diproses (`next_retry_at IS NULL OR next_retry_at <= NOW()`).
- Klaim atomik job (`ClaimJob`) untuk mencegah konflik antar-worker (multi-instance/multi-node safety).
- Validasi data forum dan hitung jumlah pesan (`messageCount`).
- Siapkan ekstensi interface pemrosesan AI (processor hook) yang akan diinjeksi oleh Milestone 3 (AI Service Integration).
- Penanganan failure & retry scheduling dengan exponential backoff.

### 3. Service Lifecycle di `backend/main.go`
- Inisialisasi dan jalankan `MemoryJobWorker` secara concurrent bersama daemon worker lainnya saat server start.
- Penutupan anggun (*graceful shutdown*) saat server menerima signal interrupt.

### 4. Verification Plan
- Unit test di `backend/internal/worker/memory_worker_test.go`:
  - Test pembuatan job otomatis saat TTL worker expire subgrup.
  - Test worker polling dan klaim job atomik.
  - Test retry handling saat processing gagal.
- Full verification: `go test ./...` dan `npm run build` (100% PASS).
