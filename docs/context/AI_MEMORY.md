# 🤖 AI & Memory Domain Context Primer — Wuzz Chat

Dokumen ini adalah acuan konteks utama untuk engine **Group Memory AI** (*Forum Intelligence & Collaborative Group Knowledge*).

---

## 🧠 1. Filosofi & Prinsip Desain
> *"AI captures. Humans validate. Wuzz remembers."*

Engine Group Memory AI dirancang untuk mengekstrak intisari percakapan, keputusan teknis, kesepakatan tugas, atau ringkasan diskusi dari forum topik secara otomatis, tetapi **hanya mempublikasikan artefak ke arsip pengetahuan setelah divalidasi oleh manusia (Admin/Moderator)**.

---

## 🏛️ 2. Arsitektur Pipeline Ekstraksi (Milestone M1–M7)

```text
Forum Percakapan (sub_*)
         │ (Trigger: Topik kedaluwarsa atau event on-demand)
         ▼
[1. Job Enqueue] ➔ Simpan job ke `forum_memory_jobs`
         │
         ▼
[2. Background Worker] ➔ Ambil antrean via PostgreSQL `FOR UPDATE SKIP LOCKED`
         │
         ▼
[3. ContextSource] ➔ Ambil riwayat pesan terotorisasi (`ForumContextSource`)
         │
         ▼
[4. AIService (LLM)] ➔ Gemini / OpenAI / Ollama
         │               (JSON structured prompt, confidence score, evidence quotes)
         ▼
[5. Memory Draft] ➔ Simpan draft ke `memory_drafts` & `memory_artifacts`
         │
         ▼
[6. Admin Review Suite] ➔ UI Drawer di Web & Mobile (<30s One-Click Approval / Edit)
         │
         ├── DISETUJUI (Approved) ➔ Publikasikan ke `approved_memories`
         └── DITOLAK (Rejected)   ➔ Simpan audit log ke `memory_review_actions`
         │
         ▼
[7. Knowledge Viewer] ➔ Anggota forum dapat membaca arsip keputusan di Arsip Forum
```

---

## 📂 3. Peta Modul Kode Group Memory AI

### A. Backend Go (`backend/internal/memory/`)
- `entity.go`: Entitas domain `MemoryDraft`, `MemoryArtifact`, `ArtifactEvidence`, `ApprovedMemory`.
- `context_source.go`: Abstraksi interface `ContextSource` yang memutus keterikatan memori engine dari skema obrolan tertentu.
- `service.go`: `MemoryService` mengorkestrasi pembentukan job, validasi admin, penolakan draft, dan pengambilan arsip publik.
- `repository.go`: Interface `MemoryRepository` untuk akses data persisten.
- `worker/memory_worker.go`: Goroutine latar belakang non-blocking yang mengeksekusi antrean `SKIP LOCKED`.
- `ai_service.go`: Provider LLM (Google Gemini REST API / fallback mock) dengan validasi skema JSON ketat.

### B. REST API Handlers (`backend/internal/api/memory_handler.go`)
- `POST /api/memory/jobs`: Memicu pembuatan job ekstraksi memori.
- `GET /api/memory/drafts`: Mengambil daftar draft pending untuk ditinjau oleh Admin.
- `POST /api/memory/drafts/{id}/action`: Menyetujui atau menolak draft memori.
- `GET /api/memory/approved`: Mengambil daftar memori terverifikasi untuk anggota forum.

### C. Frontend Web (`frontend/`)
- `GroupMemoryReviewDrawer.tsx`: Panel peninjauan draft memori bagi Admin (edit judul, ringkasan, tag, dan kutipan bukti).
- `GroupMemoryListModal.tsx`: Modal pembaca arsip memori forum untuk seluruh anggota.

---

## 🔒 4. Aturan Keamanan & Integritas AI Memory

1. **Human-in-the-Loop Enforced**: AI **DILARANG** mempublikasikan memori langsung ke `approved_memories` tanpa persetujuan Admin (`status = 'approved'`).
2. **Strict Citation Evidence**: Setiap fakta atau keputusan yang dihasilkan AI wajib memiliki rujukan kutipan pesan asli (`artifact_evidences.quote_text` dan `message_id`).
3. **Fail-Closed Privacy**:
   - AI Memory **HANYA** berjalan pada ruang diskusi publik atau forum topik (`sub_*`).
   - AI Memory **DILARANG KERAS** membaca atau memproses ruang percakapan Direct Message (1-on-1) yang terenkripsi E2EE.

---

## 🗺️ 5. Referensi Dokumen Lengkap
- Spesifikasi domain: [`docs/domains/AI_MEMORY.md`](../domains/AI_MEMORY.md)
