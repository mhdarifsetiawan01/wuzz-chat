# 🤖 Domain: Group Memory AI (`AI_MEMORY`)

Dokumen ini adalah spesifikasi definitif untuk domain **Group Memory AI (Forum Intelligence & Knowledge Archival)** pada Wuzz Chat.

---

> **Status produksi (13 Okt 2026): UJI TERBATAS, AKTIF HANYA UNTUK GRUP WHITELIST.** Di VPS `MEMORY_WORKER_ENABLED=true` dan `MEMORY_ENABLED_GROUPS=<ID grup "tester wuzzchat">` (file `~/wuzz-chat/backend/.env`, dipakai lewat `env_file` docker compose; setelah mengubah jalankan `docker compose up -d`, bukan `restart`). Grup lain: tidak ada job dibuat, tidak ada teks dikirim ke Groq, tombol Memori di mobile tersembunyi. Saklar global `MEMORY_WORKER_ENABLED=false` tetap memutus semuanya (`jobStore` nil di `wire.go`). `/privacy` bagian 3-4 dan `/terms` bagian 5 sudah diubah ke "uji terbatas" (tanggal berlaku 13 Okt 2026). Naskah toko Play TETAP tidak boleh menyebut AI Memory. Alur uji end-to-end TERBUKTI di produksi 13 Okt 2026: akhiri topik dari mobile → job dibuat dalam 2 dtk → Groq (`qwen/qwen3.8-27b`) ~4 dtk → draf 5 artefak → review di HP → setujui (HTTP 200, push FCM ke 4 perangkat).

> **Whitelist per grup (12-13 Okt 2026, SUDAH di `main` dan dideploy ke VPS):** env `MEMORY_ENABLED_GROUPS` membatasi AI Memory ke grup induk tertentu. **Kosong = tidak ada grup** (fail-closed), `*` = semua grup (whitelist dimatikan), `id1,id2` = hanya grup tersebut. Satu gerbang di `store.GatedMemoryStore`: `CreateJob` menolak grup di luar daftar (`ErrMemoryNotEnabled`, jadi TTL worker, tutup topik manual, dan worker semuanya tercakup), `GetPendingJobs` hanya mengembalikan job grup yang diizinkan (job lama non-whitelist tetap `QUEUED`, tidak diproses), `ClaimJob` menolak job non-whitelist. `MEMORY_WORKER_ENABLED=false` tetap saklar mati global. Handler: list/detail/setujui/tolak/sunting draf ditolak 403 untuk grup di luar daftar; **membaca arsip yang sudah disetujui dan menghapus tidak dikunci gerbang**. `GET /api/groups/{id}` menambah `memory_enabled` (mobile menyembunyikan tombol Memori bila bukan `true`). Cara membuka untuk semua: set `MEMORY_ENABLED_GROUPS=*` lalu restart (periksa antrean job lama dulu). Tahap uji terbatas ini tetap memerlukan pembaruan `/privacy` bagian 3-4 ketika worker dinyalakan, dan grup uji harus privat dengan anggota yang tahu/setuju.

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **Prinsip Human-in-the-Loop**:
   - > *"AI captures. Humans validate. Wuzz remembers."*
   - AI **DILARANG KERAS** mempublikasikan memori langsung ke arsip publik tanpa persetujuan Admin/Moderator.
   - Seluruh output LLM disimpan sebagai *Draft* berstatus `DRAFT` (menunggu tinjauan admin).
2. **Kutipan Bukti Otentik (*Strict Citation Evidence*)**:
   - Setiap butir keputusan atau fakta yang disimpulkan oleh AI wajib menyertakan kutipan teks asli dari pesan anggota (`quote_text`) beserta `message_id`.
3. **Isolasi Privasi (Hanya Forum Publik)**:
   - Ekstraksi AI **HANYA** berjalan pada ruang diskusi terbuka atau topik forum (`sub_*`).
   - AI **DILARANG** membaca percakapan pribadi 1-on-1 (Direct Message) yang terenkripsi E2EE.

---

## 🏛️ 2. Pipeline Ekstraksi 7 Tahap (M1–M7)

```text
[Forum Diskusi] ➔ [1. Enqueue Job] ➔ [2. Worker SKIP LOCKED] ➔ [3. ContextSource] 
                ➔ [4. LLM Extraction] ➔ [5. Memory Draft] ➔ [6. Admin Review] ➔ [7. Knowledge Archive]
```

1. **Enqueue Job**: Job ekstraksi dimasukkan ke tabel `forum_memory_jobs` saat topik kedaluwarsa atau dipicu on-demand.
2. **Worker Non-Blocking**: Goroutine backend Go mem-polling antrean via `SELECT ... FOR UPDATE SKIP LOCKED` untuk mencegah race condition antar-node.
3. **Context Ingestion**: `ContextSource` mengambil riwayat pesan terotorisasi.
4. **LLM Extraction**: `AIService` (produksi memakai Groq, model dari env; `GeminiProvider` tersedia sebagai alternatif) memproses prompt terstruktur dengan schema JSON ketat dan confidence score (0.00–1.00).
5. **Review Suite**: Admin meninjau draft di drawer UI (<30 detik one-click approval / edit / reject).
6. **Knowledge Archive**: Keputusan yang disetujui dipublikasikan ke `approved_memories` untuk dibaca seluruh anggota.

---

## 🗄️ 3. Skema Basis Data (7 Tabel Relasional)

Sumber kebenaran: DDL di `backend/internal/store/sql.go` (blok "Group Memory AI"); konstanta status di `store/memory_store.go`. Semua status dan tipe memakai **huruf besar**. Disinkronkan dengan DDL pada 21 Oktober 2026 (dokumen lama memuat nama kolom dan status yang tidak ada).

- `forum_memory_jobs`: `id` (PK), `tenant_id`, `forum_id` (**UNIQUE**: satu job per forum), `group_id`, `status` (`QUEUED` default / `PROCESSING` / `COMPLETED` / `FAILED` / `SKIPPED`), `attempt_count`, `max_attempts` (default 3), `is_terminal_fail`, `last_error`, `message_count`, `created_at`, `started_at`, `completed_at`, `next_retry_at`. `SKIPPED` (`last_error = quota_exceeded`, `is_terminal_fail = true`) = forum berakhir tanpa ringkasan karena kuota habis; tidak pernah diantre dan tidak dihitung sebagai pemakaian kuota. Indeks: `(status, next_retry_at)`, `forum_id`, `group_id`, `tenant_id`.
- `memory_drafts`: `id`, `tenant_id`, `job_id` (**UNIQUE**), `forum_id`, `group_id`, `status` (`DRAFT` default / `APPROVED` / `REJECTED`), `message_count_processed`, `was_truncated`, `truncation_note`, `reviewed_at`, `reviewed_by`, `rejection_reason`, `created_at`. Indeks: `forum_id`, `(group_id, status)`, `reviewed_by`, `tenant_id`.
- `memory_artifacts`: `id`, `draft_id`, `type` (`SUMMARY` / `DECISION` / `JOURNEY_LITE`), `content` (teks yang dapat diedit admin), `ai_original_content` (keluaran AI asli, tidak berubah), `confidence` (`HIGH` / `MEDIUM` default / `LOW`), `is_human_edited`, `is_removed`, `position`, `created_at`, `updated_at`.
- `artifact_evidences`: `id`, `artifact_id`, `message_id`, `message_preview` (maks. 255 karakter, cuplikan pesan saat ringkasan dibuat), `message_sender_name`, `message_sent_at`, `created_at`. Bukti menunjuk pesan lewat `message_id`; navigasi ke pesan asli lewat `GET /api/messages?room_id=…&message_id=…`.
- `approved_memories`: `id`, `tenant_id`, `draft_id` (**UNIQUE**), `forum_id` (**UNIQUE**), `group_id`, `approved_by`, `approved_at`, `has_human_edits`, `snapshot_summary`, `snapshot_summary_conf`, `snapshot_decisions` (JSON dalam teks, default `[]`), `snapshot_journey_lite`, `snapshot_journey_conf`, `is_journey_lite_removed`, `created_at`. Cache baca yang tidak berubah: **salinan (snapshot)** isi saat disetujui, bukan referensi ke artefak.
- `memory_review_actions`: log audit append-only. `id`, `draft_id`, `admin_id`, `action` (`APPROVED` / `REJECTED` / `EDITED_SUMMARY` / `EDITED_DECISION` / `REMOVED_JOURNEY_LITE` / `APPROVED_WITH_EDITS`), `artifact_id`, `old_content`, `new_content`, `rejection_reason`, `created_at`.
- `memory_view_events`: statistik baca arsip. `id`, `approved_memory_id`, `forum_id`, `group_id`, `viewer_id`, `viewer_role` (`ADMIN` / `MEMBER` default), `created_at`.

---

## 🔌 4. Kontrak REST API

Sumber kebenaran: `backend/internal/api/memory_handler.go` (dispatcher `RouteMemoryRequest` untuk `/api/memory/…` dan `RouteApprovedMemoryRequest` untuk `/api/memories/…`), rute grup di `api/group_handler.go`, pendaftaran di `app/router.go`. Semua rute wajib login (JWT). Dikoreksi 21 Oktober 2026: versi lama memuat rute yang tidak ada (`POST /api/memory/jobs`, `.../drafts/{id}/action`, `GET /api/memory/approved`).

**Job ekstraksi tidak dibuat lewat REST.** Job dibuat otomatis oleh `SubGroupTTLWorker` saat topik kedaluwarsa, atau oleh `POST /api/groups/{id}/subgroups/{sub_id}/expire` (lihat [`GROUP_FORUM.md`](GROUP_FORUM.md)); keduanya melewati `GatedMemoryStore` (whitelist, lalu kuota).

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `GET` | `/api/memory/drafts?group_id={id}[&status=…]` | Admin/creator grup | Daftar draf grup (`group_id` wajib, jika tidak 400). Gerbang whitelist berlaku |
| `GET` | `/api/memory/drafts/{draft_id}` | Admin/creator grup | Detail draf beserta `artifacts` (masing-masing dengan `evidences`). Gerbang whitelist berlaku |
| `POST` | `/api/memory/drafts/{draft_id}/approve` | Admin/creator grup | Menyetujui dan menerbitkan draf ke `approved_memories`. Respons memuat `approved_memory`. 409 bila draf sudah ditinjau |
| `POST` | `/api/memory/drafts/{draft_id}/approve-with-changes` | Admin/creator grup | Sama, tetapi memaksa `has_human_edits = true`. Pada `approve` biasa penanda itu tetap menjadi `true` bila ada artefak yang diedit atau dihapus |
| `POST` | `/api/memory/drafts/{draft_id}/reject` | Admin/creator grup | Menolak draf. Body JSON `{"reason": "…"}` (opsional di handler). 409 bila sudah ditinjau |
| `PATCH` | `/api/memory/drafts/{draft_id}/artifacts/{artifact_id}` | Admin/creator grup | Mengedit isi artefak. Body `{"content": "…"}`. 409 bila draf sudah divalidasi; 400 bila isi tidak lolos validasi |
| `DELETE` | `/api/memory/drafts/{draft_id}/journey` | Admin/creator grup | Membuang Journey Lite dari draf. 409 bila draf sudah divalidasi |
| `DELETE` | `/api/memory/drafts/{draft_id}` | Admin/creator grup | Menghapus draf beserta artefak, bukti, dan job-nya. **Tidak dikunci gerbang whitelist** (hak hapus data tidak boleh ikut terkunci) |
| `GET` | `/api/groups/{group_id}/memories?limit=&offset=` | Anggota grup | Daftar memori terbit (arsip). `limit` 1-50 (default 20), `offset` ≥ 0 |
| `GET` | `/api/memories/{memory_id}` | Anggota grup | Detail memori terbit. Membaca detail dapat mencatat `memory_view_events` |
| `DELETE` | `/api/memories/{memory_id}` | Admin/creator grup | Menghapus memori terbit beserta draf, artefak, bukti kutipan, catatan baca, dan job asalnya dalam satu transaksi |

Catatan perilaku (diverifikasi dari kode):
- **Penolakan umum:** tanpa token 401; bukan admin/creator pada operasi tinjau 403; draf atau memori tidak ada 404; metode tidak didukung 405.
- **Gerbang whitelist:** semua operasi draf kecuali `DELETE` memeriksa `MEMORY_ENABLED_GROUPS` untuk grup induk draf dan menjawab 403 "AI Memory belum diaktifkan untuk grup ini" bila grup tidak terdaftar. Pemeriksaan itu per **metode HTTP**, bukan per rute, jadi `DELETE .../journey` juga tidak melewatinya (hanya `DELETE` draf yang memang disengaja bebas gerbang). Pembacaan memori **yang sudah terbit** (`/api/groups/{id}/memories`, `/api/memories/{id}`) tidak melewati pemeriksaan itu di handler.
- **Lifecycle per forum** (`memory_state`, `draft_id` untuk admin) tidak ada di rute memori; ada di `GET /api/forums/mine` ([`GROUP_FORUM.md`](GROUP_FORUM.md)). Kuota ringkasan: bagian "Kuota ringkasan per paket" di bawah.

---

## 💻📱 5. Antarmuka Pengguna (Web & Mobile)
- **Review Drawer**: `GroupMemoryReviewDrawer.tsx` (edit judul, kategori, ringkasan, dan kutipan bukti dalam satu layar modal).
- **Knowledge List**: `GroupMemoryListModal.tsx` (pencarian arsip memori dan filter tag kategori).

## Navigasi draf mobile — Paket A (18 Oktober 2026)

`memory_draft_ready` menggunakan `group_id`, `forum_id`, dan `draft_id` untuk membuka GroupInfo → Arsip Memori → draf yang sesuai, termasuk ketukan sebelum navigator siap. Mobile hanya membuka review bila grup `memory_enabled === true` dan viewer admin/creator, lalu memeriksa kecocokan grup/forum/status dari detail draf terotorisasi. Backend tetap menegakkan tenant, role, dan whitelist; payload push bukan bukti hak akses. Draf diputuskan, akses dicabut, atau objek dihapus diberi pesan yang jelas. Tidak ada perubahan pipeline, publikasi, maupun konfigurasi whitelist.

Status verifikasi terbaru: APK pengguna 1.39.1 build 70 lulus akses riwayat forum berakhir/read-only dan pemuatan Arsip Memori. Ketukan FCM nyata warm/background/cold start serta dedup nyata belum terverifikasi karena tidak ada notifikasi aktif/draf pending, dan secara eksplisit ditunda pengguna. Penundaan ini bukan blocker Paket B; jangan menandainya lulus. Deploy dan build APK/AAB sepenuhnya tugas pengguna.

## Forum Completion Loop — Paket B (18 Oktober 2026)

Kontrak `/api/forums/mine` menambah `memory_enabled`, `memory_state`, `parent_role`, `memory_id` dan `draft_id` opsional. Data worker tetap internal; hanya admin/creator induk dalam whitelist menerima ID draf. Anggota menerima `under_review`; non-whitelist menerima `ended` tanpa pintasan AI. API baca arsip lama tetap mengikuti aturan sebelumnya. Tidak ada kolom, job, atau aturan publikasi baru.

Hasil tes dan batas verifikasi: [rencana Forum Completion Loop](../plans/backlog/FORUM_COMPLETION_LOOP.md). Paket B belum diuji di perangkat; uji notifikasi nyata Paket A tetap ditunda pengguna. Deploy/APK dilakukan pengguna; tidak ada perubahan versi atau data produksi.

## Forum Completion Loop — Paket C (19 Oktober 2026, lokal)

`GET /api/messages?room_id=sub_…&message_id=…` memperluas history untuk konteks sumber: maksimal 20 pesan sebelum/sesudah + anchor, berurutan waktu/ID. SQL memeriksa pasangan room/message, tenant user/forum/induk, membership forum dan induk, cutoff history viewer, serta penghapusan viewer/semua. Memori tidak memberikan akses tambahan ke forum privat. Forum berakhir tetap readable; aturan mutasi lama dipertahankan.

Detail/review Memori mobile/web menyediakan **Lihat Pesan Asli**, navigasi forum, scroll/highlight sementara, serta galat sumber tidak tersedia atau coba lagi manual untuk gangguan jaringan. Jendela konteks terpisah dari cache history terbaru; request dibatalkan saat target/sesi berganti dan hasil terlambat diabaikan. Web memakai lifecycle Forum Saya, istilah yang sama, dan gate `memory_enabled`; deep link/notifikasi A dan lifecycle/badge B dipertahankan.

Tes otomatis lulus; Paket C belum diuji di APK/browser interaktif/E2E atau PostgreSQL produksi. Deploy backend/frontend dan APK baru dilakukan pengguna. Rincian kontrak, tes, dan batas verifikasi: [rencana Forum Completion Loop](../plans/backlog/FORUM_COMPLETION_LOOP.md#paket-c--implementasi-lokal-19-oktober-2026). Catatan “Paket B belum diuji di perangkat” di entri historis sebelumnya sudah digantikan oleh hasil HP B pada akhir rencana; badge >0/review B dan notifikasi nyata A tetap belum terverifikasi.

## Kuota ringkasan per paket (21 Oktober 2026)

Rencana dan hasil uji: [`FORUM_MONETIZATION_PLAN.md`](../plans/backlog/FORUM_MONETIZATION_PLAN.md). Ringkasan paket forum ada di [`GROUP_FORUM.md`](GROUP_FORUM.md#paket--batas-forum-monetisasi-21-oktober-2026).

- **Aturan:** Gratis 2 dan Pro 20 ringkasan per **bulan kalender (UTC)**, dimiliki **pembuat forum** (`conversations.created_by`), dihitung dari `forum_memory_jobs` bulan berjalan (job gagal permanen dan `SKIPPED` tidak dihitung). Tanpa tabel counter. Sakelar `MEMORY_QUOTA_ENABLED=true` (default mati), hanya tenant `default`.
- **Titik pemeriksaan tunggal:** `GatedMemoryStore.CreateJob`, urutannya whitelist grup (`MEMORY_ENABLED_GROUPS`) dulu, baru kuota. Jalur TTL worker dan "akhiri manual" harus melewati store yang sama.
- **Wiring (dikoreksi 21 Okt 2026, `fe68ff0`):** sebelumnya `NewMemoryHandler` menerima store mentah dan `GroupHandler.SetMemoryHandler` menimpa store job `ForumService` dengannya, sehingga "akhiri manual" melewati whitelist, `MEMORY_WORKER_ENABLED=false`, dan kuota. `app/wire.go` kini memberi MemoryHandler store ber-gerbang (atau gerbang tertutup bila AI dimatikan). Tes: `internal/app/memory_quota_wiring_test.go` (aplikasi utuh); jangan memverifikasi wiring hanya dengan objek rakitan tes.
- **Kuota habis:** forum tetap berakhir normal; job tidak dibuat tetapi dicatat `SKIPPED`. Respons `.../expire` membawa `memory: "quota_exceeded"` dan pesan jujur; pesan sistem grup menyebut kuota. `GET /api/forums/mine` memberi `memory_state: "quota_exceeded"` hanya bila AI Memory aktif untuk grup (tanpa detail paket); klien menampilkan "Ringkasan tidak dibuat (kuota habis)".
- **Gagal cek kuota (galat database):** job tetap dibuat (fail-open), karena forum yang sudah berakhir tidak dicoba lagi.
- **Batas yang diterima:** pengecekan dan INSERT job tidak atomik; dua forum pembuat yang sama yang berakhir bersamaan tepat di ambang bisa melampaui kuota satu job.

