# Implementation Plan — Multi-Device Media Sharing (24-Hour Grace Period Retention)

## Objectives
1. Mengubah perilaku `AcknowledgeMediaDownload` di backend Golang:
   - Saat klien (Device 1) mengirimkan `POST /api/media/ack` pada pesan DM 1-on-1, server mencatat status `media_status = 'downloaded'`, tetapi mengembalikan `canDelete = false`.
   - File fisik media di Supabase S3 storage tidak lagi dihapus secara seketika (0ms), sehingga Device 2 (Web atau Mobile) yang online belakangan tetap dapat mengunduh berkas tersebut.
2. Mengubah query `GetExpiredMediaMessages` di `SQLMessageStore` dan `MemoryMessageStore`:
   - Memasukkan pesan berstatus `media_status = 'downloaded'` (di samping `'active'`) ke dalam antrean pembersihan berkala `PurgeWorker` jika usianya sudah melewati batas retensi 24 jam (1 hari).
3. Mengonfigurasi `MediaRetentionDays`:
   - Mengatur nilai default `MEDIA_RETENTION_DAYS = 1` (24 jam) di `backend/internal/shared/config/config.go`.
4. Memperbarui dan menyesuaikan test suite:
   - `backend/internal/api/media_handler_test.go`: Menyesuaikan skenario ACK DM di mana file fisik tetap ada setelah ACK pertama (status 'downloaded', bukan 'expired' seketika).
   - `backend/internal/api/chat_and_media_e2e_test.go`: Menyesuaikan asersi file fisik pasca-ACK.
   - `backend/internal/storage/purge_worker_test.go`: Memverifikasi pesan 'downloaded' dan 'active' berusia > 24 jam berhasil dibersihkan dan berstatus 'expired'.

## Target Files
1. `backend/internal/store/sql.go`
2. `backend/internal/store/memory.go`
3. `backend/internal/shared/config/config.go`
4. `backend/internal/shared/config/config_test.go`
5. `backend/internal/api/media_handler_test.go`
6. `backend/internal/api/chat_and_media_e2e_test.go`
7. `backend/internal/storage/purge_worker_test.go`
8. `docs/domains/MEDIA_LIFECYCLE.md` (Tier 1 documentation sync)
9. `docs/BACKEND_API.md` (Tier 1 documentation sync)
