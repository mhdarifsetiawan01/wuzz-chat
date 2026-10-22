# ⚙️ Backend Progress Log — Wuzz Chat

### Forum Completion Loop — daftar forum berakhir (18 Oktober 2026)

- Endpoint subgroups kini mengembalikan forum aktif dan berakhir; status arsip tetap dikecualikan. Nama internal `GetActiveSubGroups` dipertahankan untuk kompatibilitas. Gerbang membership induk tetap berlaku; query mencocokkan tenant forum, induk, dan viewer. Membuka riwayat tetap memerlukan otorisasi forum yang sudah ada.
- Regresi lifecycle store memastikan forum expired tetap terdaftar dengan sisa waktu 0 dan metadata membership, anggota tetap berhak membaca, outsider ditolak, dan child lintas tenant tidak bocor. Tes WS baru memastikan join/history forum berakhir berhasil untuk anggota tetapi kirim baru ditolak dan tidak tersimpan; outsider tidak menerima history. Tes forward terkunci yang sudah ada tetap dipertahankan.
- `go test -v ./...` lulus (tes live provider dengan kredensial tidak tersedia tetap SKIP sesuai suite). Tidak mengubah gate whitelist, worker, push dedup, atau aturan edit/hapus/reaksi.
- Status setelah uji APK 1.39.1 build 70: daftar dari backend yang dipakai APK sudah menampilkan forum berakhir dan Buka Riwayat berhasil. Hash deployment VPS tidak diperiksa langsung. Deploy selanjutnya sepenuhnya dilakukan pengguna; AI hanya menginformasikan bila diperlukan.


### Pencabutan perangkat untuk menu Perangkat Tertaut (18 Oktober 2026)

- `RemoveDevice` memvalidasi kepemilikan sebelum mencabut seluruh sesi perangkat target; sesi wajib berhasil dicabut sebelum perangkat dinonaktifkan. Error pencabutan kini menghasilkan HTTP 500 (503 bila session store tidak tersedia), bukan sukses palsu. Jalur kick WebSocket tetap dipakai.
- Tes integrasi memastikan dua token target tidak dapat mengakses endpoint terproteksi, token pemanggil tetap valid, dan kegagalan revoke mempertahankan target dalam daftar tanpa kick. Seluruh tes backend lulus. Operasi revoke/deactivate belum atomik; penonaktifan gagal setelah revoke dapat diulang.
- Belum deploy. Perlu `ssh deploy@<VPS_IP> ./deploy-chat.sh` setelah izin pengguna; uji dua perangkat nyata masih terbuka.
- `go test -race ./...` lulus pada pengulangan; percobaan pertama mengalami timeout konteks 5 detik di `TestTenantServiceFlow` saat paket berjalan bersamaan, tanpa laporan data race. Tidak ada perubahan kode tenant.

Dokumen ini mencatat seluruh riwayat pengerjaan, status kapabilitas, dan rencana pengembangan pada layer **Backend (Golang)**.

---

## 📊 Status Ringkasan
- **Arsitektur**: Modular Monolith Domain-Driven Design (Fase 1 s/d 6 SELESAI ✅)
- **Post-Audit Hardening**: Milestones 1–3 SELESAI ✅
- **Real-Time Engine**: WebSocket Hub $O(M)$ membership cache + Redis Pub/Sub multi-node sync SELESAI ✅
- **Push Notification Engine**: Pluggable Provider (FCM v1 Silent Data-Only + VAPID Web Push) SELESAI ✅
- **Multi-Device Routing**: Targeted room history socket delivery & trusted device public key protection SELESAI ✅
- **Status Deployment**: Live di VPS (`https://chat-api.wuzzhub.id`, nginx + `deploy-chat.sh`)

---

## 🏆 Riwayat Fitur & Milestone yang Telah Selesai

### 1. Transformasi Modular Monolith DDD (Track B Fase 1–6)
- [x] **Fase 1: Pemisahan GroupStore**: Mengekstrak `SQLGroupStore` mandiri dari `SQLUserStore` dan memutus ketergantungan domain group.
- [x] **Fase 2: Application Service Auth & Identitas**: Mengekstrak `AuthService` (`internal/authz/service.go`) untuk use case login, register, password change, dan batas kuota 2 perangkat.
- [x] **Fase 3: Application Service Messaging & Hub Decoupling**: Domain `internal/messaging/` dengan `MessageService` untuk operasi pesan dan decoupling WebSocket via interface otorisasi room.
- [x] **Fase 4: Group & Forum Service**: Domain `internal/group/` dengan `GroupService` & `ForumService`, migrasi `SubGroupTTLWorker` (auto-purge batch).
- [x] **Fase 5: Memory Engine Generalization**: Abstraksi `ContextSource` di domain `internal/memory/` dan decoupling dari skema obrolan konkret.
- [x] **Fase 6: Slim Main & Centralized Config**: Sentralisasi konfigurasi di `internal/shared/config/`, container orkestrasi `internal/app/wire.go`, modular router `internal/app/router.go`, dan perampingan `main.go` (55 baris).

### 2. Post-Audit Hardening (Milestones 1–3)
- [x] **Milestone 1: Zero-Risk Handler Cleanup**: Menghapus sisa fallback store lama di seluruh controller API (-599 baris), menjadikan handler 100% tipis (*thin transport*).
- [x] **Milestone 2: Realtime Ingestion Decoupling**: Memutus akses langsung WebSocket Hub ke SQL via interface `RealtimeMessageManager`.
- [x] **Milestone 3: Mobile Gateway Readiness**: Menangani header `X-Device-Platform` (`web`, `android`, `ios`), integrasi `PushProvider` dengan perutean otomatis token FCM v1 dan URL VAPID Web Push.

### 3. Skalabilitas & Stabilitas Multi-Device (Terbaru)
- [x] **Targeted WebSocket Room History Routing (`internal/ws/hub.go`, `client.go`)**:
  - Mengalirkan paket riwayat obrolan (`sendRoomHistory`) langsung ke soket perangkat yang meminta (`c.send`), bukan disebar acak ke seluruh soket user.
  - Memastikan skenario multi-device (Laptop Web & HP React Native aktif bersamaan) menerima riwayat lengkap di HP tanpa paket tersasar ke laptop.
- [x] **Proteksi Penimpaan Kunci Publik E2EE (`internal/store/user_store.go`)**:
  - Validasi kunci identik diperbolehkan (reconnect/trusted device).
  - Jika kunci berbeda dan ada perangkat aktif, server menolak dengan HTTP 409 (`ErrKeyConflict`) untuk melindungi dari pembajakan kunci sepihak.
- [x] **Multi-Node Cluster Session Kick via Redis**:
  - Event `session_kick` dan `device_kick` disinkronkan lintas node backend dengan perlindungan Anti-Echo loop node UUID.
- [x] **In-Memory Message Idempotency**:
  - Deduplikasi pesan (TTL 2 menit) berpresisi nanodetik (`UnixNano()`) untuk menangkal duplicate resend dari perangkat seluler.

### 4. Login dengan Google, fase 1 backend (6 Okt 2026, belum dideploy)
- [x] Verifier ID token Google, `SQLOAuthStore` atomik, link token, `AuthService` Google, endpoint `/api/auth/google*`, re-auth Google untuk hapus akun dan reset kunci. Nonaktif sampai `GOOGLE_OAUTH_CLIENT_IDS` diisi. Rencana dan sisa pekerjaan: `docs/plans/backlog/GOOGLE_LOGIN.md`.

### 5. Monetisasi forum, Fase 2: entitlement & batas forum aktif (20 Okt 2026, lokal, belum dideploy)
- [x] Paket `internal/entitlement` (Free: 1 forum aktif, 7 hari; Pro: 5 forum aktif, 7/30 hari), tabel `user_entitlements` + `entitlement_events` (DDL inline `store/sql.go`), `SQLEntitlementStore`.
- [x] Batas ditegakkan di dalam transaksi `SQLGroupStore.CreateSubGroupWithContext` (advisory lock per user di Postgres, mutex di SQLite). Forum aktif = `status active` dan belum lewat `expires_at`. Hanya tenant `default`; tenant B2B tidak dibatasi.
- [x] **Mati secara default**: aktif hanya dengan env `FORUM_LIMITS_ENABLED=true`. Tanpa env ini perilaku pembuatan forum tidak berubah.
- [x] `GET /api/me/entitlement`; admin `GET/POST /api/admin/entitlements` (khusus `wuzz_admin`, ada riwayat). Penolakan: HTTP 403 dengan `code` `forum_limit_reached` / `duration_not_in_plan`.
- [x] **Fase 3 kuota AI (20 Okt 2026, lokal)**: Free 2 / Pro 20 ringkasan per bulan kalender (UTC), dimiliki pembuat forum, dihitung dari `forum_memory_jobs` (job gagal permanen tidak dihitung). Dicek di `GatedMemoryStore.CreateJob` (satu titik untuk TTL worker dan akhiri manual) lewat `SQLEntitlementStore.CheckMemoryJobQuota`; whitelist `MEMORY_ENABLED_GROUPS` tetap lebih dulu. Mati secara default: `MEMORY_QUOTA_ENABLED=true`. Galat database pada cek kuota = job tetap dibuat (fail-open). Respons `.../expire` kini membawa `memory` (`queued`/`quota_exceeded`/`not_queued`) dan pesan jujur; `/api/me/entitlement` memuat blok `ai`.
- [x] **Aksi grandfather (20 Okt 2026, lokal)**: `POST /api/admin/entitlements/grandfather` (khusus `wuzz_admin`, tenant `default`). Memberi Pro sementara (default 60 hari, `source=grandfather`) kepada admin/pembuat grup induk dan pembuat forum yang belum punya baris entitlement apa pun (akun yang diberi manual atau sengaja dicabut dilewati). Aman: tanpa `confirm` hanya pratinjau; penerapan wajib `confirm:true` + `expected_eligible` = jumlah pratinjau (selain itu 409, tidak menulis). Idempotent; ada riwayat di `entitlement_events`. Tidak dijalankan otomatis oleh migrasi.
- [x] **Forum berakhir tanpa ringkasan karena kuota habis kini dijelaskan (21 Okt 2026, lokal)**: saat `GatedMemoryStore.CreateJob` menolak karena kuota, dicatat satu baris `forum_memory_jobs` berstatus `SKIPPED` (`last_error=quota_exceeded`, `is_terminal_fail=true` agar tidak dihitung sebagai pemakaian dan tidak pernah diantre). `GET /api/forums/mine` memberi `memory_state: "quota_exceeded"` hanya bila AI Memory aktif untuk grup (tanpa detail paket); klien lama mengabaikan nilai ini. Percobaan ulang tetap dilaporkan sebagai kuota, bukan galat UNIQUE.
- [x] **Perbaikan wiring jalur "akhiri forum manual" (21 Okt 2026, lokal; ditemukan saat uji lokal terhadap server sungguhan)**: `NewMemoryHandler` menerima `memoryStore` mentah dan `GroupHandler.SetMemoryHandler` menimpa store job milik `ForumService` dengan store mentah itu, sehingga `POST .../subgroups/{id}/expire` melewati gerbang `MEMORY_ENABLED_GROUPS`, sakelar `MEMORY_WORKER_ENABLED=false`, **dan** kuota AI (jalur TTL worker tidak terdampak). Akibat lama: job QUEUED yang tidak pernah diproses (worker menyaring grup non-whitelist, jadi tidak ada teks yang dikirim ke LLM) dan pesan "antrean memori dibuat" yang keliru. `app/wire.go` kini memberi MemoryHandler store ber-gerbang (`jobStore`, atau gerbang tertutup bila AI dimatikan). Tes regresi dengan wiring utuh: `internal/app/memory_quota_wiring_test.go`. Tes tingkat paket tidak menangkap ini karena merakit objeknya sendiri.
- [x] **Durasi forum disatukan (21 Okt 2026, lokal)**: `ForumService.validDurations` menerima `1h`…`3d` padahal `SQLGroupStore` hanya menerima 7 atau 30 hari (durasi pendek selalu 400, teks galat menjanjikan pilihan yang tidak ada). Kini satu fungsi `store.SubGroupDurationDays` dipakai service dan store; teks galat menyebut `7_days`/`30_days` saja. OpenAPI `CreateSubgroupRequest` (sebelumnya `name` + `ttl_minutes`, salah total) diganti sesuai handler (`title`, `description`, `duration`, `is_public`). Dokumen domain dan `.env.example` disinkronkan (dua sakelar paket).
- [x] **Suite backend kini lulus penuh di PostgreSQL (21 Okt 2026, lokal)**: tes lama `TestForumLifecycleJoinsIsolationAndReviewUpdates` gagal di Postgres sejak sebelum monetisasi karena helper `exec` memakai placeholder `?` mentah (Postgres butuh `$n`); kini lewat `rebindPG`. Dua helper kembar di paket tes (`rebindPG` dan `rebindForTest`) disatukan menjadi `rebindPG`. Hasil: `PG_TEST_ADMIN_DSN=... go test ./...` lulus di seluruh paket.
- [x] **Perpanjang masa aktif forum (24 Okt 2026, di `main`, backend dideploy user)**: `POST /api/groups/{id}/subgroups/{subId}/extend` body `{"days":1..3}`. Hanya pembuat forum (`conversations.created_by`) berpaket Pro; maksimal 30 hari total per forum (kolom baru `conversations.extended_days`, auto-migrasi Postgres dan SQLite); forum `expired` atau lewat `expires_at` ditolak dan tidak ada jalur aktifkan ulang (sengaja). Gerbang Pro mengikuti `FORUM_LIMITS_ENABLED` dan hanya tenant `default`. Satu transaksi (`SELECT ... FOR UPDATE` di Postgres) plus UPDATE bersyarat. Kode: `store.ExtendSubGroup` (`sql_group_store_extend.go`), `ForumService.ExtendSubGroup`, `entitlement.ForumExtend*` dan `Limits.CanExtendForum`. `extended_days` ikut di daftar topik. Pesan sistem `subgroup_extended`. Tes: `internal/store/forum_extend_test.go` (10 tes, termasuk konkurensi). **Terbukti di produksi lewat HP (24 Okt)**: Pro diterima (+3 hari, sisa 27), Free ditolak `extend_pro_required`, pesan sistem muncul di chat grup. Batas 30 hari dan penolakan bukan-pembuat hanya terbukti lewat tes otomatis. Rincian: `docs/domains/GROUP_FORUM.md`.
- [x] **Dokumen kontrak REST AI Memory dikoreksi (21 Okt 2026)**: tabel di `docs/domains/AI_MEMORY.md` bagian 4 ditulis ulang dari `api/memory_handler.go`, `api/group_handler.go`, dan `app/router.go`. Rute yang tidak pernah ada dihapus (`POST /api/memory/jobs`, `.../drafts/{id}/action`, `GET /api/memory/approved`); rute nyata ditambahkan (`approve`, `approve-with-changes`, `reject`, `PATCH .../artifacts/{id}`, `DELETE .../journey`, `GET /api/groups/{id}/memories`, `GET /api/memories/{id}`). Dicatat juga bahwa job dibuat otomatis (bukan lewat REST) dan bahwa pemeriksaan whitelist berlaku per metode HTTP.
- [x] **Gerbang whitelist kini mencakup `DELETE .../drafts/{id}/journey` (21 Okt 2026, lokal)**: pengecualian gerbang di `RouteMemoryRequest` dikunci pada metode `DELETE`, sehingga membuang Journey Lite (penyuntingan draf) lolos walau grup di luar whitelist. Kini pengecualian hanya untuk penghapusan draf utuh (`DELETE` + rute dua segmen). Terbukti dengan tes yang gagal pada kondisi lama ("expected 403, got 200"); layar tinjau klien hanya muncul untuk grup yang diizinkan, jadi alur sah tidak terdampak. Dampak sebelum perbaikan rendah (butuh admin grup, draf `DRAFT`, tanpa panggilan AI). Perlu deploy backend untuk berlaku.
- UI admin web untuk memberi paket: `/admin/plans` (lihat docs/progress/FRONTEND.md). Rencana dan keputusan: `docs/plans/backlog/FORUM_MONETIZATION_PLAN.md`.

---

## 🎯 Fokus Berikutnya (What's Next)
- [ ] **Tenant Engine Milestone 1**: Migrasi skema aditif kolom `tenant_id` pada seluruh tabel dan implementasi middleware `X-Tenant-ID`.
