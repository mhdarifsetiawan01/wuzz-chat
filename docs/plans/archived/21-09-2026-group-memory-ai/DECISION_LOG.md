# Decision Log

- **DEC-014**: **Group Memory AI Architecture & Domain Model**
  - *Context*: Forum diskusi sementara di dalam grup akan kedaluwarsa sesuai batas TTL (1 minggu / 1 bulan). Konten diskusi berpotensi hilang atau terlupakan.
  - *Decision*: Menerapkan arsitektur "AI captures. Humans validate. Wuzz remembers." dengan memisahkan pipeline pemrosesan ke dalam 7 tabel terisolasi (`forum_memory_jobs`, `memory_drafts`, `memory_artifacts`, `artifact_evidences`, `approved_memories`, `memory_review_actions`, `memory_view_events`).
  - *Rationale*: Isolasi read-model (`approved_memories`) memastikan pembacaan oleh member grup instan tanpa perlu query join yang rumit. Self-contained snapshot pada `artifact_evidences` memastikan bukti keputusan tidak rusak jika pesan asli dihapus.

- **DEC-015**: **Multi-Vendor AI Provider Factory & Push Deep-Linking**
  - *Context*: Menghindari vendor lock-in ke satu provider AI (Gemini), serta memastikan notifikasi push dapat membuka langsung modal review atau memori yang bersangkutan.
  - *Decision*: Menggunakan interface `AIService` dengan Factory Pattern membaca env `AI_PROVIDER` & `AI_MODEL`. Menstandarisasi payload push `deep_link` di Service Worker `sw.js` dan dynamic query param `?openDraft=` / `?openMemory=` di Next.js.
  - *Rationale*: Memungkinkan pergantian vendor AI (Gemini -> OpenAI / Claude / Ollama) tanpa mengubah domain logic, serta memberikan pengalaman UX 1-tap deep-link bagi pengguna mobile/PWA.
