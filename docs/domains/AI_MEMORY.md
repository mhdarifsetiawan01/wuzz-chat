# 🤖 Domain: Group Memory AI (`AI_MEMORY`)

Dokumen ini adalah spesifikasi definitif untuk domain **Group Memory AI (Forum Intelligence & Knowledge Archival)** pada Wuzz Chat.

---

> **Status produksi (8 Okt 2026): DIJEDA.** Saklar `MEMORY_WORKER_ENABLED=false` (`backend/.env`, `config.MemoryWorkerDisabled`) memutus seluruh jalur: job tidak dibuat saat topik forum kedaluwarsa/ditutup (`jobStore` nil di `wire.go`), `MemoryJobWorker` tidak dibuat, dan tidak ada teks yang dikirim ke penyedia LLM. Handler baca/setujui draf tetap hidup. Alasan: aplikasi mobile belum punya tampilan AI Memory, jadi teks pengguna tidak perlu dikirim ke pihak ketiga. Default kode tetap aktif (env kosong atau `true`). **Mengaktifkan kembali** berarti: pastikan tampilan mobile ada, perbarui `/privacy` bagian 3-4 (hapus "saat ini dinonaktifkan"), `LEGAL_EFFECTIVE_DATE`, Data Safety, dan naskah toko, baru set `MEMORY_WORKER_ENABLED=true` dan restart. Job yang tertunda sebelum jeda tidak diproses selama dijeda.

> **Whitelist per grup (12 Okt 2026, kode di `dev`, belum dideploy):** env `MEMORY_ENABLED_GROUPS` membatasi AI Memory ke grup induk tertentu. **Kosong = tidak ada grup** (fail-closed), `*` = semua grup (whitelist dimatikan), `id1,id2` = hanya grup tersebut. Satu gerbang di `store.GatedMemoryStore`: `CreateJob` menolak grup di luar daftar (`ErrMemoryNotEnabled`, jadi TTL worker, tutup topik manual, dan worker semuanya tercakup), `GetPendingJobs` hanya mengembalikan job grup yang diizinkan (job lama non-whitelist tetap `QUEUED`, tidak diproses), `ClaimJob` menolak job non-whitelist. `MEMORY_WORKER_ENABLED=false` tetap saklar mati global. Handler: list/detail/setujui/tolak/sunting draf ditolak 403 untuk grup di luar daftar; **membaca arsip yang sudah disetujui dan menghapus tidak dikunci gerbang**. `GET /api/groups/{id}` menambah `memory_enabled` (mobile menyembunyikan tombol Memori bila bukan `true`). Cara membuka untuk semua: set `MEMORY_ENABLED_GROUPS=*` lalu restart (periksa antrean job lama dulu). Tahap uji terbatas ini tetap memerlukan pembaruan `/privacy` bagian 3-4 ketika worker dinyalakan, dan grup uji harus privat dengan anggota yang tahu/setuju.

## 📋 1. Aturan Bisnis & Invarian (*Business Invariants*)

1. **Prinsip Human-in-the-Loop**:
   - > *"AI captures. Humans validate. Wuzz remembers."*
   - AI **DILARANG KERAS** mempublikasikan memori langsung ke arsip publik tanpa persetujuan Admin/Moderator.
   - Seluruh output LLM disimpan sebagai *Draft* berstatus `pending_review`.
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

- `forum_memory_jobs`: `id`, `conversation_id`, `status` (`pending`/`processing`/`completed`/`failed`), `error_message`.
- `memory_drafts`: `id`, `job_id`, `conversation_id`, `status` (`pending_review`/`approved`/`rejected`), `confidence_score`.
- `memory_artifacts`: `id`, `draft_id`, `category` (`decision`/`action_item`/`summary`/`insight`), `title`, `content`, `tags`.
- `artifact_evidences`: `id`, `artifact_id`, `message_id`, `quote_text`, `author_id`.
- `approved_memories`: `id`, `artifact_id`, `conversation_id`, `approved_by`, `published_at`.
- `memory_review_actions`: Log audit persetujuan / penolakan draft beserta alasan.
- `memory_view_events`: Statistik pembacaan arsip oleh anggota forum.

---

## 🔌 4. Kontrak REST API

| Method | Endpoint | Akses | Keterangan |
|---|---|---|---|
| `POST` | `/api/memory/jobs` | Admin | Memicu job ekstraksi memori |
| `GET` | `/api/memory/drafts` | Admin | Mengambil daftar draft pending |
| `POST` | `/api/memory/drafts/{id}/action` | Admin | Menyetujui (`approve`) atau menolak (`reject`) draft |
| `GET` | `/api/memory/approved` | Member | Mengambil daftar arsip memori forum |
| `DELETE` | `/api/memory/drafts/{id}` | Admin/creator grup | Menghapus draf beserta artefak, bukti, dan job (tidak dikunci gerbang whitelist) |
| `DELETE` | `/api/memories/{id}` | Admin/creator grup | Menghapus memori terbit beserta draf, artefak, bukti kutipan, catatan baca, dan job asalnya dalam satu transaksi. Log audit dipertahankan tanpa isi (old/new content dikosongkan) + baris `DELETED`. Topik yang sama dapat diringkas ulang bila job baru dibuat |

---

## 💻📱 5. Antarmuka Pengguna (Web & Mobile)
- **Review Drawer**: `GroupMemoryReviewDrawer.tsx` (edit judul, kategori, ringkasan, dan kutipan bukti dalam satu layar modal).
- **Knowledge List**: `GroupMemoryListModal.tsx` (pencarian arsip memori dan filter tag kategori).
