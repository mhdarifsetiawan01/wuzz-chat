# 💻 Frontend Domain Context Primer — Wuzz Chat

Dokumen ini adalah acuan konteks utama untuk pengembangan, perbaikan UI/UX, refactoring komponen, dan penataan style pada layer **Web Frontend (Next.js)**.

---

## 🛠️ 1. Tech Stack & Library
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Vanilla CSS Design Tokens (Strictly NO Tailwind, NO ad-hoc utilities)
- **Kriptografi**: Web Crypto API native (ECDH NIST P-256 + HKDF-SHA256 + AES-256-GCM)
- **Penyimpanan Lokal**: IndexedDB (`wuzz_crypto_db` untuk kunci E2EE, `wuzzchat_msg_db` untuk cache pesan) & `localStorage`
- **Real-Time Client**: Custom WebSocket Client (`frontend/lib/ws-client.ts`) dengan FIFO Outbound Queue
- **Live Deployment**: Vercel (`https://chat.wuzzhub.id` & `https://wuzz-chat.vercel.app`)

---

## 🎨 2. Design System & Token Compliance (`frontend/DESIGN.md`)

Setiap perubahan tampilan **WAJIB** merujuk ke token di `frontend/app/globals.css` dan panduan `frontend/DESIGN.md`:

1. **Token-First Rules**:
   - Gunakan CSS variables: `var(--bg-primary)`, `var(--text-primary)`, `var(--color-accent)`, dll.
   - **DILARANG RAW HEX** di dalam file CSS maupun JSX (misal `#3b82f6` atau `#1e293b`).
   - **DILARANG LITERAL RGBA TINT**: Gunakan token resmi (misal `var(--tint-accent-10)`, `var(--tint-error-10)`).
2. **Unified Z-Index Scale (Anti Magic Number `99999`)**:
   - `var(--z-base)` (0), `var(--z-elevated)` (10), `var(--z-dropdown)` (100)
   - `var(--z-sticky)` (200), `var(--z-banner)` (300)
   - `var(--z-modal)` (1000) / `.z-modal`
   - `var(--z-modal-top)` (1100) / `.z-modal-top` (khusus nested modal seperti DeviceTransfer)
   - `var(--z-toast)` (2000) / `.z-toast`
3. **Unified Modal Primitives**:
   - Seluruh dialog / modal / drawer wajib menggunakan class:
     - Backdrop: `.modal-overlay`
     - Card: `.modal-card-unified`
     - Header: `.modal-header-unified` / Title: `.modal-title-unified`
     - Body: `.modal-body-unified`
     - Footer: `.modal-footer-unified`
   - Bungkus modal dengan `createPortal(..., document.body)` dari `react-dom` agar terbebas dari jebakan stacking context.
4. **Dynamic-Only Inline Styles**:
   - `style={{ ... }}` hanya diizinkan untuk nilai yang benar-benar dihitung dinamis saat runtime (misal persentase progress, warna avatar deterministik `avatarColor.ts`, koordinat drag). Nilai statis wajib menggunakan CSS class.

---

## 📱💻 3. Aturan Arsitektur Dual-Platform (Desktop & Mobile)

Aplikasi memiliki dua mode layout yang wajib berfungsi harmonis:
1. **Desktop / Laptop (Split 2-Column Mode)**:
   - Sidebar chat list dan Chat Window aktif berdampingan di satu layar.
   - Message append live ke timeline via `ADD_MESSAGE`.
2. **Mobile / Handphone (WhatsApp Single-Screen Flow)**:
   - Layar bergantian penuh: **Daftar Chat Fullscreen** ⇄ **Ruang Obrolan Fullscreen**.
   - Transisi via tombol `← Back` (`activeRoomId = ''`).
   - **Anti-Stale Guard**: Gunakan `lastHandledMsgIdRef` agar pesan lama tidak diproses ulang saat navigasi back.
   - **History State Sync**: Reset `state.messages` saat membuka room dan isi dari payload `SET_MESSAGES` server / IndexedDB.
   - **Dynamic Viewport Height**: Gunakan `100dvh` (fallback `100%`) dan `interactiveWidget: 'resizes-content'` pada viewport metadata.
   - **Safe Area Insets**: Wajib sertakan `env(safe-area-inset-bottom)` dan `env(safe-area-inset-top)` pada header/footer mobile.

---

## 📂 4. Peta File Utama Frontend

```text
frontend/
├── app/
│   ├── globals.css         # Single Source of Truth token & utility classes
│   ├── layout.tsx          # Root layout, viewport metadata, service worker init
│   ├── page.tsx            # Entry point chat & redirect logic
│   └── login/page.tsx      # Auth screen (Login/Register, device conflict handling)
├── components/
│   ├── ChatWindow.tsx      # Timeline obrolan, message grouping, quote preview
│   ├── MessageBubble.tsx   # Bubble chat, read receipts, sender color, reactions
│   ├── Sidebar.tsx         # Daftar percakapan, pin chats, search bar, unread badge
│   ├── StatusBar.tsx       # Top bar room, partner info, call button, forum breadcrumb
│   ├── MessageInput.tsx    # Precision chat pill, voice recorder, mention autocomplete
│   └── modals/             # Unified modals (Profile, Group, Transfer, Conflict)
└── lib/
    ├── ws-client.ts        # Client WebSocket dengan reconnect backoff & outbound queue
    ├── crypto.ts           # Web Crypto API NIST P-256 E2EE engine
    ├── messageCache.ts     # IndexedDB write-through message cache (Cache-First)
    └── emojis.ts           # Modular Unicode emoji catalog
```

---

## 🧪 5. Testing & Verifikasi Frontend
Jalankan kompilasi TypeScript dan Turbopack build dari root proyek:
```bash
cd frontend && npm run build
```
Pastikan kompilasi lulus 100% dengan 0 error TypeScript dan 0 lint warning. Tidak perlu live browser testing kecuali diminta eksplisit.
