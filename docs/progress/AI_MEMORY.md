# 🤖 AI & Memory Progress Log — Wuzz Chat

Dokumen ini mencatat seluruh riwayat pengerjaan, status kapabilitas, dan rencana pengembangan pada engine **Group Memory AI** (*Forum Intelligence & Collaborative Group Knowledge*).

---

## 📊 Status Ringkasan
- **Prinsip**: *"AI captures. Humans validate. Wuzz remembers."*
- **Spesifikasi Domain**: [`docs/domains/AI_MEMORY.md`](../domains/AI_MEMORY.md) (SELESAI ✅)
- **Pipeline Ekstraksi**: Milestones M1 s/d M7 SELESAI PENUH ✅
- **Engine Worker**: PostgreSQL `FOR UPDATE SKIP LOCKED` non-blocking queue SELESAI ✅
- **Provider LLM**: Google Gemini API via `AIService` dengan validasi skema JSON ketat SELESAI ✅
- **Antarmuka Admin**: One-Click Review Drawer (<30s approval) di Web SELESAI ✅

---

## 🏆 Riwayat Fitur & Milestone yang Telah Selesai

### 1. Fondasi Data & Queue Worker (M1 & M2)
- [x] **M1: Data Model 7 Tabel Relasional**:
  - `forum_memory_jobs`, `memory_drafts`, `memory_artifacts`, `artifact_evidences`, `approved_memories`, `memory_review_actions`, `memory_view_events`.
- [x] **M2: PostgreSQL Skip-Locked Queue Worker**:
  - Goroutine worker non-blocking di backend Go yang mem-polling job menggunakan klausa atomic `SELECT ... FOR UPDATE SKIP LOCKED` untuk menjamin eksekusi paralel aman tanpa duplikasi.

### 2. Abstraksi Konteks & Integrasi LLM (M3 & M4)
- [x] **M3: Abstraksi ContextSource**:
  - Memisahkan engine memori dari skema obrolan konkret via interface `ContextSource` (`context_source.go`), diimplementasikan oleh `ForumContextSource` di domain group.
- [x] **M4: AIService Provider & Prompt Sanitizer**:
  - Integrasi Gemini API dengan sanitasi prompt, penegakan output format JSON terstruktur, confidence scoring (0.00–1.00), dan ekstraksi kutipan bukti (*evidence quotes*) dari pesan asli.

### 3. Review Suite, Knowledge Viewer & UX Polish (M5 s/d M7)
- [x] **M5: Admin Review Suite**:
  - UI Drawer modern di frontend web (`GroupMemoryReviewDrawer.tsx`) yang memungkinkan Admin menyetujui, mengedit artefak, atau menolak draft dalam waktu <30 detik.
- [x] **M6: Member Knowledge Viewer**:
  - Antarmuka penampil arsip pengetahuan terverifikasi bagi anggota forum (`GroupMemoryListModal.tsx`) dengan filter tag dan pencarian teks.
- [x] **M7: Polish & Header Collision Fix**:
  - Perbaikan bug toast review memori yang sebelumnya menabrak sticky header di layar mobile, distandarisasi menggunakan class `.in-app-toast-banner` dengan *safe header offset*.

---

## 🎯 Fokus Berikutnya (What's Next)
- [ ] Ringkasan memori *on-demand* pada topik forum yang sedang aktif (sebelum waktu kedaluwarsa berakhir).
- [ ] Integrasi provider fallback model lokal via Ollama.
