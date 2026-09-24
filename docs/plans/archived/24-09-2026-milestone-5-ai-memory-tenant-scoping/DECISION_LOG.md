# Decision Log — Milestone 5: AI Memory Context Tenant Scoping

## Architectural & Technical Decisions

### DEC-M5-01: Explicit Tenant Scoping on Memory Storage Operations
- **Context**: Sebelumnya `CreateJob`, `CreateDraftWithArtifacts`, dan `ApproveDraft` sudah menyisipkan kolom `tenant_id` ke dalam database, namun kueri baca (`SELECT`), klaim job (`UPDATE ClaimJob`), penyuntingan artefak, dan pembatalan draf belum memfilter berdasarkan `tenant_id`.
- **Decision**: Menambahkan klausa `AND tenant_id = ?` (atau `$X` pada PostgreSQL) pada seluruh kueri manipulasi data di `SQLMemoryStore`. Menggunakan `tenantshared.MustFromContext(ctx).TenantID()` untuk mengekstrak identitas tenant pemanggil secara konsisten dan aman dari `context.Context`.
- **Consequences**: Mencegah kebocoran data antar-tenant (*data leakage*) secara tuntas di level data access layer (Defense-in-Depth).

### DEC-M5-02: PostgreSQL Row-Level Locking via `FOR UPDATE SKIP LOCKED`
- **Context**: Pada lingkungan multi-tenant dan multi-instance (cluster node), pengambilan antrean pending jobs rentan terhadap race condition jika dua worker berebut job yang sama.
- **Decision**: Menggunakan klausa `FOR UPDATE SKIP LOCKED` pada kueri `GetPendingJobs` untuk PostgreSQL, dipadukan dengan klaim atomik `UPDATE forum_memory_jobs SET status = 'PROCESSING' WHERE id = $X AND tenant_id = $Y AND status = 'QUEUED'`. Untuk SQLite (lingkungan pengujian lokal), tetap mempertahankan pola eksekusi atomik single-writer.
- **Consequences**: Worker dapat memproses job secara paralel tanpa lock contention dan terisolasi strictly per tenant.

### DEC-M5-03: Two-Tier Reviewer Scoping (Service & Storage)
- **Context**: Admin grup yang mereview draft memori (`ApproveDraft`, `RejectDraft`, `UpdateArtifactContent`) harus diverifikasi tidak hanya dari perannya (`admin` / `creator`), tetapi juga apakah draf dan admin berasal dari tenant yang sama.
- **Decision**: Menerapkan pengecekan ganda (Two-Tier Security Gate):
  1. Service layer memvalidasi kecocokan `callerTenantID` dengan `draft.TenantID` dan `groupDetails.TenantID`, melempar `ErrUnauthorizedAccess` jika berbeda.
  2. Repository layer menyertakan filter `tenant_id` pada kueri pembaruan status dan audit log.
- **Consequences**: Perlindungan mutlak terhadap eksploitasi ID draf tebakan (*IDOR attack* lintas tenant).

### DEC-M5-04: Subquery / Join Scoping for `memory_artifacts`
- **Context**: Tabel `memory_artifacts` tidak memiliki kolom `tenant_id` terpisah, melainkan terelasi via `draft_id` ke tabel `memory_drafts` yang memiliki kolom `tenant_id`.
- **Decision**: Pembacaan dan penyuntingan artefak difilter menggunakan `INNER JOIN memory_drafts md ON a.draft_id = md.id WHERE md.tenant_id = $X` atau `WHERE id = $1 AND draft_id IN (SELECT id FROM memory_drafts WHERE tenant_id = $X)`.
- **Consequences**: Integritas data tetap bersih tanpa redundansi denormalisasi kolom di tabel child artefak.

### DEC-M5-05: Background Goroutine Context Decorator for Notifications
- **Context**: Notifikasi pasca-persetujuan draf (`ApproveDraft`) dieksekusi di background goroutine yang menggunakan `context.Background()`. Hal ini dapat menyebabkan hilangnya metadata tenant saat goroutine memanggil `ContextSource.GetContextMeta`.
- **Decision**: Menyelipkan `draftTenant` ke dalam closure goroutine dan merekonstruksi konteks menggunakan `bgCtx := tenantshared.WithTenant(context.Background(), draftTenant)`.
- **Consequences**: Operasi asynchronous di background tetap mempertahankan tenant boundary yang valid.
