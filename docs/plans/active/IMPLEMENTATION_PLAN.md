# Implementation Plan: Milestone 3 — AI Service Integration & Structured Output

## 🎯 Objective
Mengintegrasikan kapabilitas kecerdasan buatan (LLM) untuk memproses teks diskusi forum kedaluwarsa menjadi artefak terstruktur (Summary, Decisions dengan snapshot Evidence, dan Journey Lite) sesuai spesifikasi di `docs/GROUP_MEMORY_AI_SPEC.md`.

## 📦 Scope of Work

### 1. Package AI & Domain Contract (`backend/internal/ai/service.go`)
- Tipe model input `MemoryGenerationInput`: ForumTitle, GroupTitle, Messages ([]store.StoredMessage), IsTruncated.
- Tipe model output `MemoryGenerationOutput`:
  - `Summary`: Text, Confidence.
  - `Decisions`: List of items dengan Position, Text, Confidence, EvidenceMessageIDs ([]string).
  - `JourneyLite`: Text, Confidence.
- Prompt Engine:
  - System prompt sesuai `docs/GROUP_MEMORY_AI_SPEC.md` Section 5.
  - Boundary ketat `[DATA DISKUSI]` dengan format `[MSG_ID | SENDER_NAME | TIME]: CONTENT`.
  - Anti-prompt injection sanitization.
- JSON Parser & Validator:
  - Ekstraksi blok JSON dari respons LLM.
  - Validasi field wajib dan normalisasi keyakinan (HIGH, MEDIUM, LOW).
- Abstraksi Provider:
  - Interface `AIService`.
  - `MockAIService` (deterministik untuk unit test).
  - `GeminiAIService` / HTTP Client Provider (untuk live backend production via API key).

### 2. Evidence Resolver & Processor Pipeline (`backend/internal/ai/processor.go`)
- Mengimplementasikan `worker.MemoryJobProcessor`.
- Pipeline eksekusi:
  1. Ambil pesan percakapan dari forum (maksimal 1.000 pesan kronologis terurut).
  2. Format data ke `MemoryGenerationInput`.
  3. Panggil `aiService.GenerateMemory(ctx, input)`.
  4. Resolusi Evidence:
     - Cari pesan asli berdasarkan `evidence_message_ids`.
     - Buat snapshot `message_preview` (hingga 200 karakter), `message_sender_name`, dan `message_sent_at`.
  5. Konversi hasil ke `store.MemoryDraft` dan `[]store.MemoryArtifact`.
  6. Simpan secara transaksional ke database via `memoryStore.CreateDraftWithArtifacts`.
  7. Tandai job `CompleteJob` dengan jumlah pesan terproses.

### 3. Server Wiring (`backend/main.go`)
- Inisialisasi `aiService` dari environment (fallback ke mock jika API key belum dikonfigurasi).
- Inisialisasi `MemoryProcessor` dan hubungkan ke `memoryWorker.SetProcessor(processor)`.

### 4. Verification Plan
- Unit test di `backend/internal/ai/service_test.go`:
  - Test pembentukan prompt dan sanitasi data boundary.
  - Test parsing JSON terstruktur & normalisasi confidence.
  - Test resolusi evidence snapshot dari pesan asli.
  - Test penanganan forum kosong / sedikit pesan (< 3 pesan).
  - Test truncating saat > 1.000 pesan.
- Full verification: `go test ./...` dan `npm run build` (100% PASS).
