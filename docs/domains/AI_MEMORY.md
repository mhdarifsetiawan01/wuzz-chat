# 🤖 Domain: Group Memory AI (`AI_MEMORY`)

Dokumen ini adalah spesifikasi definitif untuk domain **Group Memory AI (Forum Intelligence & Knowledge Archival)** pada Wuzz Chat.

---

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
4. **LLM Extraction**: `AIService` (Google Gemini) memproses prompt terstruktur dengan schema JSON ketat dan confidence score (0.00–1.00).
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

---

## 💻📱 5. Antarmuka Pengguna (Web & Mobile)
- **Review Drawer**: `GroupMemoryReviewDrawer.tsx` (edit judul, kategori, ringkasan, dan kutipan bukti dalam satu layar modal).
- **Knowledge List**: `GroupMemoryListModal.tsx` (pencarian arsip memori dan filter tag kategori).
