# Implementation Plan — Milestone 5: AI Memory Context Tenant Scoping

## 1. Executive Overview
Milestone 5 memastikan AI Memory Engine pada WuzzChat terisolasi secara menyeluruh antar-organisasi (multi-tenant). Seluruh data memori—mulai dari antrean job ekstraksi, riwayat percakapan yang diakses AI via `ContextSource`, tinjauan draf oleh admin grup, hingga memori terpublikasi yang siap dikonsumsi anggota—wajib dibatasi strictly oleh `tenant_id`.

## 2. Target Modified & Created Files
1. **Entities & DTOs**:
   - `backend/internal/memory/entity.go`: Tambahkan `TenantID string` pada `MemoryJob`, `MemoryDraft`, `ApprovedMemory`, dan perbarui fungsi konversi mapper (`ToDomainJob`, `ToStoreJob`, `ToDomainDraft`, `ToStoreDraft`, `ToDomainApprovedMemory`, `ToStoreApprovedMemory`).
   - `backend/internal/store/memory_store.go`: Tambahkan `TenantID string` pada `ForumMemoryJob`, `MemoryDraft`, `ApprovedMemory`.
   - `backend/internal/store/group_store.go` & `backend/internal/store/sql_group_store.go`: Tambahkan `TenantID string` pada `GroupDetails` dan scan `COALESCE(tenant_id, 'default')` di `GetGroupDetails`.

2. **Storage & Queue Layer Isolation**:
   - `backend/internal/store/memory_store.go`:
     - Perbarui `GetPendingJobs`: filter `tenant_id` dari context dan tambahkan `FOR UPDATE SKIP LOCKED` pada driver PostgreSQL.
     - Perbarui `ClaimJob`: sertakan filter `AND tenant_id = $X` agar worker tenant lain gagal mengklaim job.
     - Perbarui `GetJobByID`, `GetJobByForumID`, `CompleteJob`, `FailJob` agar menyertakan filter `tenant_id`.
     - Perbarui `GetDraftByID`, `GetDraftByForumID`, `GetDraftsByGroupID` agar menyertakan filter `tenant_id`.
     - Perbarui `GetArtifactsByDraftID`, `GetArtifactByID`, `UpdateArtifact`, `RemoveJourneyLite` agar tervalidasi dengan `tenant_id` draft terkait.
     - Perbarui `ApproveDraft`, `RejectDraft`, `RecordReviewAction`, `GetReviewActions` agar menyertakan filter `tenant_id`.
     - Perbarui `GetApprovedMemoryByID`, `GetApprovedMemoryByForumID`, `GetApprovedMemoriesByGroupID` agar menyertakan filter `tenant_id`.

3. **ContextSource Scoping**:
   - `backend/internal/group/infra/forum_context_source.go`:
     - `GetMessages`: Ekstrak `tenant_id` dari context, validasi bahwa `contextID` (forum/percakapan) beroperasi di tenant yang sama sebelum mengembalikan riwayat pesan.
     - `GetContextMeta`: Ekstrak `tenant_id` dari context, validasi kepemilikan tenant terhadap forum/grup.
     - `GetAuthorizedViewers`: Verifikasi viewer dan forum dalam cakupan tenant yang sama.

4. **Service & Reviewer Permission Gate**:
   - `backend/internal/memory/service.go`:
     - Tambahkan validasi tenant pada seluruh alur review draf: `ListDrafts`, `GetDraftDetail`, `UpdateArtifactContent`, `RemoveJourneyLite`, `ApproveDraft`, `RejectDraft`.
     - Tolak seketika dengan `ErrUnauthorizedAccess` jika admin mencoba mereview draf dari tenant lain.
     - Perbarui `GetGroupMemories` dan `GetApprovedMemoryDetail` untuk menjamin anggota hanya dapat mengakses memori tenant mereka sendiri.

5. **Worker Tenant Context Propagation**:
   - `backend/internal/worker/memory_worker.go`:
     - Izinkan worker beroperasi dengan scope tenant tertentu (`SetTenantID` / `tenantID`).
     - Pada `processSingleJob`, bungkus context pemrosesan job dengan `tenantshared.WithTenant(ctx, job.TenantID)` sebelum memanggil `processor.ProcessMemoryJob` dan `CompleteJob`.

6. **Comprehensive Automated Isolation Tests**:
   - `backend/internal/memory/memory_tenant_isolation_test.go`:
     - Test 1: Worker Isolation (`GetPendingJobs` & `ClaimJob` tidak dapat disentuh lintas tenant).
     - Test 2: Draft Review Security Gate (Admin Tenant A dilarang approve/reject/edit draf Tenant B).
     - Test 3: Retrieval & View Scoping (Anggota Tenant A dilarang membaca memori Tenant B).
     - Test 4: ContextSource Boundary Check (Riwayat pesan dan metadata tidak bocor lintas tenant).

## 3. Verification Strategy
1. Unit testing: `go test -v ./internal/memory/...`
2. Store testing: `go test -v ./internal/store -run TestMemoryStore_.*`
3. Worker testing: `go test -v ./internal/worker -run TestMemoryWorker_.*`
4. Complete Backend Suite: `go test -v ./...`
5. Frontend Build Gate: `npm run build` di direktori `frontend/`
