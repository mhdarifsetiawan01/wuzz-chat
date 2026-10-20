# 💻 Frontend Progress Log — Wuzz Chat

Dokumen ini mencatat seluruh riwayat pengerjaan, status kapabilitas, dan rencana pengembangan pada layer **Web Frontend (Next.js 16)**.

---

## 📊 Status Ringkasan
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript (Turbopack PASS 100% ✅)
- **Design System**: Vanilla CSS Token-First (`frontend/DESIGN.md` & `globals.css` SELESAI ✅)
- **Arsitektur Layout**: Dual-Platform Engine (Desktop 2-Kolom Split & Mobile WhatsApp Single-Screen SELESAI ✅)
- **Kriptografi Client**: Web Crypto API E2EE (ECDH NIST P-256 + AES-256-GCM) & QR Key Migration SELESAI ✅
- **Penyimpanan Offline**: IndexedDB Cache-First Message Cache (`wuzzchat_msg_db` SELESAI ✅)
- **Status Rilis**: Live di Vercel (`https://chat.wuzzhub.id` & `https://wuzz-chat.vercel.app`)

---

## 🏆 Riwayat Fitur & Milestone yang Telah Selesai

### 1. Arsitektur Dual-Platform & Mobile Web Hardening
- [x] **WhatsApp Single-Screen Flow**: Transisi layar penuh di mobile antara Daftar Chat (Home) ⇄ Ruang Obrolan aktif, dengan tombol `← Back` dan dynamic viewport height `100dvh`.
- [x] **Anti-Stale Navigation Guards**:
  - `lastHandledMsgIdRef` di `Sidebar.tsx`: Mencegah pesan lama diproses ulang sebagai unread saat menekan tombol `← Back`.
  - `useModalBackHandler`: Intersepsi event `popstate` browser mobile untuk menutup modal/lightbox tanpa keluar dari ruang obrolan.
  - History stack hardening: Mengganti duplikasi manual history dengan `router.push` tunggal dan `router.replace('/chat')` saat navigasi keluar.
- [x] **Viewport & Keyboard Resilience**:
  - `interactiveWidget: 'resizes-content'` pada viewport metadata untuk mencegah header terdorong keluar layar saat virtual keyboard muncul di Android.

### 2. Standarisasi Design System (Design Debt Batches #3–#7)
- [x] **Token-First Standard**: Penambahan +53 token di `:root` `globals.css` (palet `--wa-*`, aksen tint, error tint, status tint). Eliminasi total raw hex dan literal rgba.
- [x] **Unified Modal Primitives**: Menggantikan 26 kelas modal lama dengan primitive terpadu (`.modal-overlay`, `.modal-card-unified`, `.modal-header-unified`, `.modal-body-unified`, `.modal-footer-unified`).
- [x] **Root-Level React Portals & Z-Index Scale**: Membungkus seluruh modal dengan `createPortal(..., document.body)` dari `react-dom` untuk membebaskan modal dari stacking context jebakan backdrop blur, dan standardisasi skala z-index (`var(--z-modal)` 1000, `var(--z-modal-top)` 1100).
- [x] **Single Source of Truth**: Dokumentasi lengkap di [`frontend/DESIGN.md`](../../frontend/DESIGN.md).

### 3. Kriptografi E2EE, Cache & Session Resilience
- [x] **Zero-Knowledge Background Push**: Service Worker (`sw.js`) mendekripsi pesan E2EE secara lokal di background saat web push tiba menggunakan Web Crypto API + IndexedDB.
- [x] **Cache-First Local Message Store**: Pesan tampil instan 0ms saat room dibuka, write-through cache di 6 titik mutasi, kontinuitas pembacaan pesan lama meski lawan bicara me-reset kunci.
- [x] **Zero-Knowledge QR Key Migration UI**: Modal `DeviceTransferModal.tsx` dengan scanner kamera in-app (`html5-qrcode`), pre-warm permission strategy, native camera intent fallback, dan deep link `/transfer?token=...`.
- [x] **Anti-Infinite Reset Loop & History URL Sanitizer**: Local-first token purge saat logout, batas waktu 30 detik (`AbortController`), loading state UI, dan pembersihan otomatis parameter `?logout=1` via `window.history.replaceState`.

### 4. Group & Forum Topics UI
- [x] **Rebranding Forum & Topik Diskusi**: Breadcrumb interaktif `↖ [Grup Induk] • Forum • X anggota`, tombol cepat `🏛️ Forum`, dan Collapsible Action Menu (`⋮`) di mobile.
- [x] **Multi-User Mention Popover**: Autocomplete `@username` dengan navigasi keyboard dan tap-friendly mobile.
- [x] **Shared Media Hub Group**: Media grup bertahan selama TTL 7 hari tanpa terhapus dini oleh ACK download salah satu anggota.

### 5. WebRTC Voice Calling Resilience
- [x] **Anti-Stale Closure Signaling Handlers (`page.tsx`)**: Mengganti pembacaan state `activeCall` dengan `activeCallRef.current` pada handler WebSocket `call_answer` dan `call_reject`, serta mengisi `activeCallRef.current` secara sinkron saat inisiasi panggilan untuk memastikan transisi layar panggilan keluar dari "Memanggil..." ke layar aktif ("00:01", "00:02"...) terpicu seketika saat penerima mengangkat di mobile.

---

## 🎯 Fokus Berikutnya (What's Next)
- [ ] Penambahan fitur katalog avatar premium di modal Profil Studio.

### Kirim Video di Chat, Tahap 4 web (16 Oktober 2026) — kode selesai di `dev`, belum diuji di browser, backend belum dideploy
- Rencana: `docs/plans/backlog/VIDEO_MESSAGE_R2.md`. Input unggah menerima `video/mp4`, `video/quicktime`, `video/webm` (juga lewat drag-and-drop / `stagedExternalFile`). `lib/videoPrep.ts` memeriksa ukuran (bawaan 25 MB) dan durasi (60 dtk) dari `/api/config` (`max_video_size_mb`, `max_video_duration_seconds`), lalu membuat thumbnail JPEG lewat canvas (≤ 512 KB). Video yang melanggar batas ditandai `invalid` dan tidak bisa dikirim.
- `uploadVideo` (`lib/api.ts`): tiket `?purpose=video`, thumbnail diunggah dulu, video lewat XHR dengan progres (%), langsung ke R2. **Fallback upload lewat VPS dihapus** dari `uploadMedia` (semua jenis media): gagal = galat di bar pratinjau, lampiran tetap ada untuk dicoba lagi.
- `MessageBubble`: `<video controls>` dengan poster dari URL thumbnail turunan (`<kunci>.thumb.jpg`); video tidak diunduh otomatis (`preload="none"`), ACK dikirim saat pertama diputar; pengirim memakai blob IndexedDB. Teks pesan tersemat "Video".
- **Wajib saat memakai R2:** CORS bucket harus mengizinkan origin web untuk `PUT`/`GET`/`HEAD` (header `Content-Type`, `Range`); tanpa itu unggah dari browser gagal.
- Tidak ada kompresi video di web (batas 25 MB ditolak apa adanya). Opsi kelak: ffmpeg.wasm.
- Verifikasi: `npm run build` lulus (0 galat). Belum diuji di browser dengan bucket nyata.

### Monetisasi forum, Fase 4 web (20 Oktober 2026) — kode selesai di `dev`, belum diuji di browser, frontend belum dideploy
- `CreateSubGroupModal` dan `SubGroupListDrawer` mengikuti perilaku mobile: info jatah forum aktif, opsi 1 Bulan dikunci untuk paket Gratis, kuota ringkasan AI, dan pesan akhiri topik sesuai hasil server. Logika dibagi lewat `lib/entitlement.ts` (salinan identik dengan mobile, ubah bersamaan).
- Tes: `npm run build` lulus (0 error), `node scripts/test/entitlement-ui.cjs` lulus. Belum diuji interaktif di browser.
- Belum ada halaman admin web untuk memberi paket; sementara lewat `POST /api/admin/entitlements`.
- (21 Okt 2026) Daftar forum di drawer menampilkan **"Ringkasan tidak dibuat (kuota habis)"** untuk `memory_state: quota_exceeded` (`lib/forumLifecycle.ts`). `npm run build` dan `source-message.cjs` lulus. Belum diuji di browser.

### Halaman admin "Paket" (`/admin/plans`) — 21 Oktober 2026 — kode selesai di `dev`, belum diuji interaktif di browser, frontend belum dideploy
- Khusus `wuzz_admin` (tautan "Paket" di navigasi hanya tampil untuk admin; backend tetap penentu). Cari akun → lihat paket yang berlaku beserta alasannya (belum pernah diberi / dicabut / Pro berakhir), forum aktif, kuota AI bulan ini, dan apakah batas ditegakkan server; **Beri Pro** (hari, 0 = tanpa batas waktu), **Cabut paket** (forum dan memori tidak dihapus).
- Bagian **Pro sementara untuk pengguna lama**: pratinjau dulu (jumlah + contoh username), lalu Terapkan dengan dialog konfirmasi; mengirim `expected_eligible` dan menangani 409 (daftar berubah) dengan meminta pratinjau ulang.
- Logika murni di `lib/adminPlans.ts`, klien di `lib/admin-api.ts`. Tes: `node scripts/test/admin-plans.cjs`, `npx tsc --noEmit`, `npm run build` (0 error; rute `/admin/plans` terdaftar). Belum dijalankan di browser terhadap backend sungguhan.
- (21 Okt 2026) **Uji interaktif `/admin/plans` di Chrome HP (RMX3506) terhadap backend lokal sungguhan** (SQLite sementara, sakelar menyala, AI `mock`; tab diatur lewat remote debugging, tanpa menyentuh data produksi): login admin, cari akun, Beri Pro (dialog, catatan, hasil cocok dengan server), Cabut paket, pratinjau grandfather, Terapkan, jalur 409 (daftar berubah antara pratinjau dan terapkan: pesan tampil, dialog tertutup, tidak ada yang tertulis), sesi bertahan setelah muat ulang. Temuan kosmetik: tombol aksi menempel ke teks (diperbaiki dengan `.adm-actions-top`); kartu `modal-card-unified` agak transparan sehingga teks latar tembus (gaya bersama, tidak diubah); chip navigasi keempat "Paket" terpotong di layar 720 px (dapat digulir). Server dev saat itu memakai `npx next dev -p 3047` karena `npm run dev` (`server.js` kustom) dua kali berturut-turut menjawab 500 `ENOENT .next/dev/required-server-files.json`. **Diselidiki 21 Okt 2026: tidak dapat direproduksi.** `server.js` sesuai pola di dokumentasi Next 16.3.5 (`node_modules/next/dist/docs/01-app/02-guides/custom-server.md`) dan di lima skenario berikut `/admin` dan `/login` menjawab 200 tanpa ENOENT: `.next` bersih; `npm run build` lalu `npm run dev` (dengan dan tanpa folder `.next/dev`); port 3047 dan 3099; `node server.js` dan `npm run dev`; restart setelah `kill -9` tanpa membersihkan `.next`. Tidak ada perubahan kode. Penyebab kejadian awal tidak teridentifikasi; bila terulang, simpan log, dan jalan keluar yang terbukti berhasil saat itu adalah `npx next dev -p 3047` (proxy `/api` lewat `rewrites`; tanpa proxy WebSocket).

### Kosmetik halaman admin (21 Oktober 2026) — kode selesai di `dev`, frontend belum dideploy
- **Navigasi admin:** `.adm-nav` kini `flex-wrap: wrap`; di layar sempit chip keempat ("Paket") turun ke baris kedua dan tidak terpotong (diukur di Chrome HP: lebar 360 px, tanpa overflow horizontal; di 1100 px tetap satu baris).
- **Kartu dialog:** `.modal-card-unified` memakai `--bg-card` (95%, token "Opaque modal/card/banner surface" di DESIGN.md) menggantikan `--bg-surface` (72%) yang membuat teks halaman tembus. Terverifikasi di Chrome HP (dialog "Beri paket Pro?": warna terhitung `rgba(30, 41, 59, 0.95)`; masih ada bayangan teks sangat tipis karena token memang 0,95, bukan 1,0). Berlaku untuk semua pengguna kelas ini: 4 halaman admin dan `DeviceLimitModal` di login (dialog login belum dilihat langsung). `DESIGN.md` diperbarui.
- Tes: `tsc`, `npm run build`, dan tes web lulus.

