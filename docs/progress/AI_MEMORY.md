# 🤖 AI & Memory Progress Log — Wuzz Chat

## Forum Completion Loop — Paket B (18 Oktober 2026)

- `GET /api/forums/mine` menambah `parent_role`, `memory_enabled`, `memory_state`, serta `memory_id`/`draft_id` opsional. Status diturunkan dari forum, job, draf, dan Memori; tidak ada migrasi/kolom baru. Satu query join dengan pasangan forum + grup + tenant, membership topik dan induk tetap wajib, batas 300 forum tetap berlaku.
- Lifecycle: aktif → `active`; non-whitelist → `ended`; job QUEUED/PROCESSING → `processing`; DRAFT → `under_review` bagi anggota atau `review_required` + ID draf bagi admin/creator **grup induk**; memori terbit → `published`; penolakan → `rejected` hanya bagi admin/creator; kegagalan → `failed`. Role topik tidak memberikan izin review. Data worker dan ID draf internal tidak diserialisasi.
- Mobile memakai satu snapshot Forum Saya dalam sesi untuk daftar, badge tombol Forum, dan pintasan Perlu Ditinjau. Hitungan hanya mencakup draf yang dapat ditinjau pada forum yang diikuti dalam respons terbatas tersebut, bukan seluruh antrean grup. Tidak ada angka/ID draf pending bagi anggota biasa.
- Pintasan review memakai validasi target Paket A; pintasan memori terbit memakai `memory_id` sehingga tidak bergantung pada halaman pertama arsip. Refresh terjadi saat fokus beranda, foreground, membuka sheet, selesai review/hapus, dan menutup arsip; tanpa polling tambahan. Respons yang dibatalkan/lebih lama serta snapshot sesi lain diabaikan; kegagalan refresh mengosongkan daftar/badge dengan opsi coba lagi agar pekerjaan lama tidak ditampilkan sebagai masih valid.
- Notifikasi/deduplikasi Paket A dan aturan pesan baru/forward/edit/hapus/reaksi tidak diubah. Paket C, pencarian arsip, Lihat Pesan Asli, dan pembukaan whitelist tidak dikerjakan.
- Batas verifikasi: belum diuji pada APK/perangkat nyata untuk Paket B, termasuk perpindahan role/grup lintas perangkat dan tema terang/gelap. Uji ketukan Memori nyata warm/background/cold start serta dedup Paket A tetap ditunda pengguna dan bukan blocker. Tidak membuat/mengubah data produksi, deploy, build APK/AAB, menaikkan versi/build, commit, merge, atau push.
- Penerapan memerlukan deploy backend dan APK baru oleh pengguna. Frontend hanya divalidasi build, tidak diubah.

- **Verifikasi otomatis Paket B:** backend `go test -v ./...` lulus; mobile `npx tsc --noEmit` lulus dan `npm run test:unit` 42/42 berkas lulus; frontend `npm run build` lulus. Tes baru mencakup matriks lifecycle/role/whitelist dan privasi JSON, join lintas tenant/grup, membership, perubahan setelah review, serta pembaruan badge dan pengabaian respons lama/dibatalkan. Endpoint diuji melalui HTTP recorder termasuk whitelist dan persetujuan menjadi `published` tanpa ID draf. Tes live provider tanpa kredensial tetap SKIP. Suite backend dan build frontend memakai izin di luar sandbox setelah pembatasan cache/proses pada percobaan awal. Tidak menguji PostgreSQL produksi atau APK baru.


### Forum Completion Loop — navigasi draf mobile, Paket A (18 Oktober 2026)

- Push `memory_draft_ready` tetap memakai payload backend yang ada; mobile kini membuka Arsip Memori/review berdasarkan ID draf, grup, dan forum. Target menunggu navigator siap, serta memakai deduplikasi response listener/cold start yang sama.
- UI memeriksa `memory_enabled` dan role; API backend tetap otoritas akses/tenant/whitelist. Draf yang sudah disetujui/ditolak tidak dibuka sebagai pending; 403/404/409 ditangani dengan pesan. Tidak menambah job, publikasi otomatis, badge, metadata lifecycle, pencarian, atau navigasi bukti.
- Typecheck dan 41/41 berkas tes mobile lulus, frontend build dan backend suite lulus. APK pengguna 1.39.1 build 70 telah diverifikasi untuk akses forum berakhir/read-only serta pemuatan arsip. Uji ketukan native FCM warm/background/cold start dan dedup nyata tetap belum terverifikasi karena tidak ada notifikasi aktif/draf pending, dan ditunda atas keputusan pengguna. Ini bukan blocker Paket B; tes otomatis navigasi dengan modul native tiruan sudah lulus. Tidak ada perubahan konfigurasi atau data produksi.


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

### 4. Uji Terbatas di Produksi & Mobile (12-13 Oktober 2026)
- [x] **Mobile**: `MemoryArchiveModal` (arsip, detail, tab Perlu Ditinjau, sunting/setujui/tolak, hapus), tombol Memori di info grup hanya bila `memory_enabled`. Daftar arsip: judul = kalimat pertama ringkasan, "Topik: <nama>", titik Baru, penyetuju. Lihat `docs/progress/MOBILE.md`.
- [x] **Whitelist per grup induk** (`MEMORY_ENABLED_GROUPS`: kosong = tidak ada, `*` = semua, `id1,id2`): `store.GatedMemoryStore` di `CreateJob`/`GetPendingJobs`/`ClaimJob`; handler menolak 403 untuk review draf di grup luar daftar; baca arsip dan hapus tidak dikunci. Job lama grup non-whitelist tetap QUEUED. `GET /api/groups/{id}` menambah `memory_enabled`.
- [x] **Hapus**: `DELETE /api/memories/{id}` dan `/api/memory/drafts/{id}` (admin/creator), hapus berantai satu transaksi, audit dipertahankan tanpa isi + baris `DELETED`.
- [x] **Bug diperbaiki**: judul topik selalu "Forum Diskusi" (`GetGroupDetails(subgrup, "")` ditolak gerbang induk → kini `GetGroupSummary`; pemeriksaan tenant `GetMessages`/`GetAuthorizedViewers` kini berlaku untuk subgrup), `approved_by_name` kosong, kontrak JSON mobile (`decisions_count`, `artifact_count`), pesan "memori AI sedang diproses" hanya bila job benar-benar dibuat, forward ke topik berakhir ditolak (403).
- [x] **Mobile akhiri topik**: "Akhiri Topik Sekarang" di daftar Forum + penguncian live di ruang topik (ack/ERROR + polling 30 dtk).
- [x] **Terbukti di produksi 13 Okt 2026** (grup "tester wuzzchat"): lihat bagian status di `docs/domains/AI_MEMORY.md`.

### Catatan temuan / utang teknis
- Latensi: setujui draf 6 dtk, detail draf 3,7 dtk, daftar memori 1,2-1,9 dtk. Kandidat optimasi: kirim push/siaran di latar belakang, kurangi N+1 (`GetContextMeta`/`HasUserViewedMemory` per baris).
- `subgroup_expired` disiarkan ke ruang grup INDUK (bukan ruang topik) dan hanya membawa teks; klien memakai ack/polling.
- Edit/hapus pesan di topik terkunci belum dibatasi (hanya kirim WS dan forward).
- Judul memori dari AI (field `headline` di skema ekstraksi) ditunda; kini memakai kalimat pertama ringkasan.
- Belum diuji dari HP: tombol Hapus Memori dan tampilan detail setelah deploy 13 Okt; lompat ke pesan asal dari kutipan bukti belum ada; ketukan notifikasi push draf belum dipastikan membuka layar review.

## 🎯 Fokus Berikutnya (What's Next)
- [ ] Buka ke semua pengguna: periksa antrean `forum_memory_jobs`, set `MEMORY_ENABLED_GROUPS=*`, tinjau Data Safety, baru sebut di naskah toko.
- [ ] Bubble AI (tanya-jawab atas arsip) DITUNDA; draf desain di memori sesi `ai-bubble-chat-on-hold`.
- [ ] Ringkasan memori *on-demand* pada topik forum yang sedang aktif (sebelum waktu kedaluwarsa berakhir).
- [ ] Integrasi provider fallback model lokal via Ollama.
