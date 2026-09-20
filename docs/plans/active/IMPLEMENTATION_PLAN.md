# Implementation Plan: Milestone 5 — Admin Review UI (Frontend Next.js)

## 🎯 Objective
Membangun antarmuka pengguna (UI/UX) bagi Admin/Creator grup untuk mereview, menyunting, dan memvalidasi draft memori AI ("AI captures. Humans validate. Wuzz remembers.") sesuai spesifikasi `docs/GROUP_MEMORY_AI_SPEC.md` Bagian 10, Design System `frontend/DESIGN.md`, serta kaidah *Dual-Platform (Mobile & Desktop)*.

## 📦 Scope of Work

### 1. Type Definitions & API Client Helpers (`frontend/lib/types.ts` & `frontend/lib/api.ts`)
- Menambahkan tipe data:
  - `MemoryDraftListItem`, `MemoryDraftDetail`, `MemoryArtifactItem`, `ArtifactEvidenceItem`
  - `ApprovedMemoryItem`, `ApprovedDecisionItem`, `ApprovedEvidenceItem`
- Menambahkan fungsi helper API:
  - `fetchMemoryDrafts(groupId: string): Promise<MemoryDraftListItem[]>`
  - `fetchMemoryDraftDetail(draftId: string): Promise<MemoryDraftDetail>`
  - `approveMemoryDraft(draftId: string, withChanges?: boolean): Promise<any>`
  - `rejectMemoryDraft(draftId: string, reason?: string): Promise<any>`
  - `updateMemoryArtifact(draftId: string, artifactId: string, content: string): Promise<any>`
  - `removeJourneyLite(draftId: string): Promise<any>`

### 2. Komponen Review UI (`frontend/app/chat/memory/`)
- **`MemoryDraftReviewModal.tsx` / `MemoryDraftReviewPage.tsx`**:
  - Tampilan layar penuh responsif (Mobile 100dvh WhatsApp flow & Desktop modal/pane).
  - State management lokal: `draft`, `isEditing`, `editContent`, `isSubmitting`, `isJourneyRemoved`, `confirmRejectOpen`, `rejectionReason`.
- **`DraftReviewHeader`**:
  - Menampilkan judul forum, badge status "Menunggu Review Admin", indikator jumlah pesan terproses, dan tanggal kedaluwarsa.
- **`SummaryReviewCard`**:
  - Badge tingkat keyakinan (HIGH: ● hijau, MEDIUM: ◐ amber, LOW: ○ merah/abu).
  - Teks ringkasan AI dengan tombol [✏ Sunting] inline dan pembatalan sunting.
- **`DecisionReviewCard`**:
  - Nomor butir keputusan & teks keputusan.
  - Evidence list: preview kutipan pesan asli, nama pengirim, timestamp, dan tautan "Lihat pesan asli" (`/chat?room={forumId}&scroll={messageId}`).
  - Mode sunting teks keputusan inline.
- **`JourneyLiteReviewCard`**:
  - Tampilan linimasa perjalanan diskusi (Awalnya... Lalu... Akhirnya...).
  - Tombol [🗑 Hapus dari Memori] dengan dialog konfirmasi agar tidak dimasukkan ke memori permanen.
- **`ReviewActionBar` (Sticky Bottom)**:
  - Tombol aksi utama: `[✅ Setujui & Publikasikan]` (memicu approve atau approve-with-changes secara dinamis).
  - Tombol `[❌ Tolak Draft]` dengan modal input alasan penolakan.
  - Tombol `[Kembali]`.
  - State disabled dan loading spinner untuk proteksi double-submit saat jaringan lambat.

### 3. Entry Point & Integrasi di Chat UI
- Di `SubGroupListDrawer.tsx`:
  - Jika user adalah admin/creator, tampilkan banner/seksi khusus: **"Draft Memori AI Siap Direview"** dengan counter badge saat terdapat draft berstatus pending di grup.
  - Klik pada draft langsung membuka layar `MemoryDraftReviewModal`.
- WebSocket Listener di `page.tsx`:
  - Mendengarkan event notifikasi sistem `memory_approved` untuk me-refresh data grup secara optimistik.

### 4. Verification Plan
- **Automated Gate**:
  - `npm run build` di direktori `frontend/` (lolos kompilasi Next.js/Turbopack dengan 0 error TypeScript & 0 error lint).
  - `go test ./...` di direktori `backend/` memastikan seluruh backend test tetap 100% PASS.
- **Dual-Platform Compatibility**:
  - Layout responsive aman dengan `100dvh`, CSS tokens dari `globals.css` (tanpa raw hex colors/magic numbers), dan sticky header/footer.
