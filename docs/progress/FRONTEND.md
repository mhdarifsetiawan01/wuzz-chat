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
