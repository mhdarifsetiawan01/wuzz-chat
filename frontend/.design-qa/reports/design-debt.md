# Design Debt Review — Wuzz Chat Frontend

- Plugin: Qoder **Design Review** v0.1.0 — skill `design-debt-review`
- Target: `frontend/` (Next.js 16 + React 19; styling via `app/globals.css` + inline styles; **tanpa Tailwind, tanpa component library**)
- Tanggal: 2026-09-19
- Otomatisasi: `audit-design-debt.mjs` (53 file dipindai, ter-severe-first) + analisis manual untuk klasifikasi konteks
- Kontrak token: `app/globals.css` `:root` — token layer **ada dan cukup lengkap** (warna, spacing, radius, shadow, transition, font), tetapi banyak di-bypass oleh kode fitur

## Summary

- Hard-coded colors: **152 finding** (semua severity `major`; angka ini hasil cap 1000 finding). Nilai teratas justru **duplikat token yang sudah ada**: `#3b82f6` (= `--accent-500`) 17×, `#ffffff` 16×, `#818cf8` (= `--accent-secondary`) 15×, `#f87171` (= `--color-error`) 13×, `#60a5fa` (= `--accent-400`) 12×, `#fbbf24` (= `--color-warning`) 7×, `#34d399` (= `--color-online`) 5×.
- Arbitrary Tailwind values: **0** — proyek tidak memakai Tailwind, kategori tidak relevan.
- Inline styles: **570** di komponen fitur. Terbanyak: `DeviceTransferModal` 67, `ProfileModal` 62, `SubGroupListDrawer` 61, `CreateGroupModal` 55, `GroupInfoDrawer` 47, `AvatarStudio` 45, `CreateSubGroupModal` 38, `Sidebar` 34, `StatusBar` 30.
- Non-token typography/radius/shadow: **318 `fontSize` inline dalam 34 nilai berbeda** (tidak ada type scale token); **96 `borderRadius` inline dalam 17 nilai** (6 nilai off-scale: 6/10/14/20/4/2px); **28 `boxShadow` inline** (token `--shadow-*` tersedia); **15 `zIndex` inline dalam 11 nilai berbeda** (10 … 1200, hingga `99999`).
- Duplicate component patterns: anatomi modal/backdrop terduplikasi dalam **3 keluarga kelas CSS** (`modal-backdrop*`, `group-modal-*`, `ctx-backdrop`, `forward-modal-*`, `profile-modal-card`, … 26 kelas) **plus 7 file TSX** yang membuat overlay `position: fixed` secara inline.
- Highest-risk files/components: `app/chat/DeviceTransferModal.tsx`, `app/chat/SubGroupListDrawer.tsx`, `app/chat/ProfileModal.tsx`, `app/chat/CreateGroupModal.tsx`, `app/globals.css` (self-drift), `app/chat/MessageBubble.tsx`.

## Findings

### [major] hard-coded-color: nilai token yang sudah ada dipakai ulang sebagai hex literal
- Evidence: `#3b82f6` 17×, `#818cf8` 15×, `#f87171` 13×, `#60a5fa` 12×, `#fbbf24` 7×, `#34d399` 5×, `#93c5fd` 7×, `#94a3b8` 6×, `#f8fafc` 6×
- Affected files/components: `MessageBubble.tsx`, `Sidebar.tsx`, `ProfileModal.tsx`, `DeviceTransferModal.tsx`, `GroupInfoDrawer.tsx`, `SubGroupListDrawer.tsx`, `CreateGroupModal.tsx`, `app/globals.css`
- Observed: hex literal identik dengan nilai `:root` token
- Expected token/component: `var(--accent-500)`, `var(--accent-secondary)`, `var(--color-error)`, `var(--accent-400)`, `var(--color-warning)`, `var(--color-online)`, `var(--accent-300)`, `var(--text-secondary)`, `var(--text-primary)`
- Risk: perubahan tema/dark-mode harus diedit di puluhan titik; brand inconsistency
- Recommended fix: codemod penggantian 1:1 hex → `var(--token)` (lihat *Suggested Batch Fixes* #1)
- Prevention: stylelint aturan "hex hanya boleh di blok `:root`" + gerbang CI audit
- Verification: re-run audit; kategori `hard-coded-color` turun ke ±0

### [major] inline-style: 570 objek `style={{...}}` statis di komponen fitur
- Evidence: mis. `DeviceTransferModal.tsx` L654 `<h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '6px' }}>`, L662–664; 24+ file chat lain
- Affected files/components: seluruh `app/chat/*` (daftar di Summary)
- Observed: nilai visual statis (fontSize, warna, spacing) ditulis inline; sebagian memakai `var(--space-4)` di dalam inline style — sadar token tapi melewati layer kelas CSS
- Expected token/component: kelas CSS di `globals.css`/CSS module yang merujuk token
- Risk: tidak bisa dioverride tema secara terpusat, tidak ikut cache stylesheet, sulit diaudit, menambah ukuran render tree; menabrak SOP dual-platform saat responsif perlu media query
- Recommended fix: ekstraksi bertahap mulai dari 5 file top-offender (lihat batch fix #4)
- Prevention: ESLint `react/forbid-dom-props` (larang prop `style` kecuali whitelist dinamis: progress bar, posisi, warna avatar runtime)
- Verification: hitung ulang `style={{` per file; target < 100 sisanya murni dinamis

### [major] typography-drift: 34 nilai `fontSize` tanpa type scale token
- Evidence: `0.75rem` 48×, `0.85rem` 42×, `0.9rem` 40×, `0.8rem` 37×, `0.875rem` 21×, plus varian mikro `0.825rem`, `0.8125rem`, `0.84rem`, `0.72rem`, `0.78rem`, `0.68rem`, `0.675rem`, `0.6875rem` …
- Affected files/components: seluruh komponen chat (318 kemunculan)
- Observed: tidak ada token `--font-size-*` di `:root`; heading scale hanya di elemen `h1–h4`
- Expected token/component: type scale semantik, mis. `--text-xs` … `--text-3xl`
- Risk: hierarki tipografi tidak konsisten antar layar; varian 0.8/0.8125/0.825/0.84rem nyaris tak terbedakan visual tapi memecah konsistensi
- Recommended fix: definisikan type scale (±7–9 langkah), lalu batch-replace dengan toleransi rounding
- Prevention: stylelint `declaration-property-value-allowed-list` untuk `font-size`
- Verification: inventaris ulang `fontSize:` inline → 0 nilai off-scale

### [major] duplicate-component-pattern: modal/backdrop diimplementasi 3+ cara
- Evidence: `globals.css` memuat 26 kelas modal/overlay dalam 3 keluarga (`modal-backdrop`/`profile-modal-backdrop`, `group-modal-backdrop`/`group-modal-*`, `ctx-backdrop`, plus `forward-modal-*`, `lightbox-overlay`, `call-modal-overlay`, `audio-call-overlay`); 16 pemakaian kelas backdrop di TSX; **7 file** (`ContactProfileModal`, `DeviceConflictModal`, `DeviceTransferModal`, `MessageBubble`, `ProfileModal`, `SafetyNumberModal`, `Sidebar`) juga membuat overlay `position: fixed` inline dengan `zIndex` hardcode (`1100`, `1150`, `1160`, `1200`)
- Affected files/components: semua komponen modal/drawer/context-menu
- Observed: backdrop, card, header, tombol close, footer diulang per modal dengan nama kelas berbeda
- Expected token/component: satu primitive `<Modal>` (atau minimal satu set kelas `.modal-backdrop`/`.modal-card`) + z-index scale token
- Risk: perbaikan a11y (focus trap, `aria-modal`, ESC) harus diulang di semua salinan; z-index war acak (`99999`)
- Recommended fix: lihat batch fix #5
- Prevention: komponen tunggal + checklist review "jangan tambah kelas backdrop baru"
- Verification: jumlah keluarga kelas backdrop = 1; jumlah overlay inline = 0

### [major] hard-coded-color (semantic drift): dua keluarga warna status bersaing
- Evidence: merah error: `--color-error: #f87171` vs `#ef4444` (6 file TSX + 9× di `globals.css`) vs `#dc2626`, `#fc8181`, `#fca5a5`; hijau sukses/online: `--color-online: #34d399` vs `#22c55e` (4 file) vs `#10b981` (3 file)
- Affected files/components: `CreateGroupModal`, `CreateSubGroupModal`, `DeviceTransferModal`, `GroupInfoDrawer`, `ProfileModal`, `SubGroupListDrawer`, `MessageBubble`, `app/transfer/page.tsx`, `globals.css`
- Observed: warna berbeda untuk peran semantik yang sama (error/sukses/online)
- Expected token/component: satu token per peran; tambah `--color-success` bila hijau sukses memang dibutuhkan
- Risk: status visual tidak konsisten; risiko kontras a11y berbeda-beda antar layar
- Recommended fix: standarisasi ke token; buang varian duplikat
- Prevention: stylelint + DESIGN.md mencatat pasangan kontras status
- Verification: grep `#ef4444|#22c55e|#10b981` = 0

### [major] hard-coded-color: `globals.css` melewati token miliknya sendiri di luar `:root`
- Evidence: 111+ hex di bawah baris 96 (luar `:root`): `#ffffff` 31×, `#60a5fa` 10×, `#ef4444` 9×, `#38bdf8` 8×, `#f87171` 7×, `#93c5fd` 7×, `#94a3b8` 6×, `#f8fafc` 6×, `#00f2fe` 4×, `#22c55e` 3×, `#f59e0b` 3× …
- Affected files/components: `app/globals.css` (file token itu sendiri)
- Observed: aturan komponen menulis ulang nilai mentah alih-alih `var(--…)`, plus warna di luar palet (`#00f2fe`, `#38bdf8`, `#dc2626`)
- Expected token/component: `var(--accent-400)` dsb.; token baru untuk aksen sky/cyan bila memang disengaja
- Risk: mengubah tema tetap harus menyentuh 100+ baris; sumber kebenaran ganda di satu file
- Recommended fix: ganti semua hex luar `:root` dengan `var(--token)`; tambah token untuk warna yang memang di luar palet
- Prevention: stylelint `declaration-property-value-allowed-list` (hex hanya di `:root`)
- Verification: re-scan `globals.css` baris > 96 → 0 hex

### [debt] magic-number: radius off-scale + penulisan tidak konsisten
- Evidence: token `--radius-sm/md/lg/xl/full` = 8/12/16/24/9999px; inline: `10px`/`10` 15×, `20`/`20px` 5×, `14px` 2×, `6px` 4×, `4px` 1×, `2px` 1×; nilai tanpa satuan (`borderRadius: 12`) bercampur dengan `'12px'`
- Expected token/component: `var(--radius-*)`; `50%` untuk lingkaran boleh tetap
- Risk: sudut komponen sejenis berbeda-beda (card 10 vs 12 vs 14)
- Recommended fix: map ke token terdekat yang disengaja (10→12; 14→12 atau 16; 20→16 atau tambah `--radius-xl2: 20px` bila disengaja)
- Prevention: inventaris radius di review PR
- Verification: re-scan `borderRadius:` inline → hanya nilai on-scale

### [debt] magic-number: z-index tanpa scale token
- Evidence: 15 `zIndex` inline, 11 nilai: `10, 100, 110, 120×3, 150, 160, 1100×2, 1150, 1160, 1200, 99999×2`
- Expected token/component: z-index scale, mis. `--z-base/-dropdown/-sticky/-modal/-toast/-toast-urgent`
- Risk: stacking order rapuh; `99999` adalah hack "pasti di atas" yang akan kalah dari hack berikutnya
- Recommended fix: definisikan scale lalu ganti; hapus `99999`
- Prevention: stylelint untuk `z-index` nilai bebas
- Verification: grep `zIndex:` → hanya referensi token

### [debt] non-token-shadow: 28 `boxShadow` inline
- Evidence: 28 kemunculan `boxShadow: '…'` di TSX; token `--shadow-sm/md/glow` tersedia
- Expected token/component: `var(--shadow-*)` via kelas CSS
- Risk: elevasi tidak konsisten antar modal/card
- Recommended fix: ganti ke token; tambah varian bila perlu
- Verification: re-scan `boxShadow:` inline

### [minor] undocumented-exception: `app/page.module.css` (starter Next.js) mati dan bertentangan dengan design system
- Evidence: 0 import di seluruh `frontend/**` (dicek via grep); mendefinisikan tema terang `#fafafa/#fff/#000/#666` + token `--text-primary:#000` yang **berlawanan** dengan `globals.css` (`--text-primary:#f8fafc`, dark-first)
- Expected token/component: tidak ada — file harus dihapus
- Risk: token `--text-primary` dsb. ter-shadow dalam scope `.page` bila suatu saat diimpor; membingungkan kontributor
- Recommended fix: hapus `app/page.module.css`
- Prevention: sweep leftover starter saat sprint cleanup
- Verification: build + visual smoke tetap hijau (file tidak terpakai)

### [info] kandidat token baru (bukan pelanggaran, tapi nilai berulang tanpa rumah)
- `#38bdf8` (sky) dipakai untuk badge terverifikasi (`VerifiedBadge.tsx` L74, `SafetyNumberModal`, `Sidebar`, `MessageBubble`) → kandidat `--color-verified`
- `#ffffff` 16× di TSX sebagai teks/ikon di atas gradien aksen → kandidat `--text-on-accent`
- keluarga `rgba(59,130,246, .1/.12/.2/.25/.3/.35)` (±35×) → konsolidasi ke `--bubble-system`, `--accent-glow`, plus 1–2 token tint baru
- `rgba(239,68,68, .15/.25/.3)` (±19×) → token tint error

## Suggested Batch Fixes

1. **Codemod hex → token (quick win, ±90 replacement):** `#3b82f6→var(--accent-500)`, `#60a5fa→var(--accent-400)`, `#93c5fd→var(--accent-300)`, `#818cf8→var(--accent-secondary)`, `#a5b4fc→var(--accent-secondary-soft)`, `#f472b6→var(--accent-tertiary)`, `#fb7185→var(--accent-tertiary-hover)`, `#f87171→var(--color-error)`, `#fbbf24→var(--color-warning)`, `#34d399→var(--color-online)`, `#f8fafc→var(--text-primary)`, `#94a3b8→var(--text-secondary)`, `#64748b→var(--text-muted)`, `#090d16→var(--bg-base)`.
2. **Standarisasi warna status:** pilih satu merah (`--color-error`) dan satu hijau (tambah `--color-success`); hapus `#ef4444/#dc2626/#fc8181/#fca5a5` dan `#22c55e/#10b981`.
3. **Tambah token yang hilang lalu batch-replace:** type scale `--text-xs…--text-3xl`, z-index scale `--z-*`, `--color-verified`, `--text-on-accent`, tint aksen/error.
4. **Ekstraksi inline style 5 file top-offender** (`DeviceTransferModal`, `ProfileModal`, `SubGroupListDrawer`, `CreateGroupModal`, `GroupInfoDrawer`) ke kelas di `globals.css` yang merujuk token; sisakan hanya nilai dinamis.
5. **Unifikasi modal:** satu primitive `<Modal backdrop zIndex>`; migrasikan `group-modal-backdrop`/`ctx-backdrop`/overlay inline ke satu implementasi; normalisasi z-index.
6. **Hapus `app/page.module.css`.**
7. **Buat `DESIGN.md`** (template tersedia di plugin; skill `design-system-capture` bisa menangkap dari `:root` + komponen) supaya audit sadar-token, Canvas viewer DESIGN.md aktif, dan pasangan kontras terdokumentasi.

## Acceptable Exceptions

- `lib/avatarColor.ts` — modul palet (setara file token); raw values wajar di sini.
- `borderRadius: '50%'` untuk lingkaran — idiom umum, setara `--radius-full`.
- Inline style **dinamis** (lebar progress bar/audio, posisi elemen drag, warna avatar runtime) — sah; regex skrip tidak membedakan, klasifikasi manual menunjukkan mayoritas temuan justru statis.
- Border `1px` — di luar jangkauan regex px skrip dan lazim sebagai hairline.

## Coverage Limits

- Laporan otomatis di-cap **1000 finding, semuanya severity `major`** — temuan `minor`/`debt` (px magic number, custom shadow) di bawah cap tidak terhitung penuh; total riil > 1000.
- `DESIGN.md` belum ada → `tokenValues` kosong → severity tidak sadar-token (semua hex dianggap `major`).
- Regex `px` skrip tidak menangkap `1px` dan tidak membedakan unitless React (`borderRadius: 12` = 12px).

## Menjalankan Ulang Audit

```bash
cd frontend
node .design-qa/plugin/design-plugin/skills/design-debt-review/scripts/audit-design-debt.mjs --config design.qa.yaml
node .design-qa/analyze-debt.mjs   # agregasi radius/typography/z-index/warna non-token
```

Dependensi skrip (`fast-glob`, `yaml`) sudah terpasang di `.design-qa/plugin/design-plugin/node_modules`. Skrip browser-based (screenshot, a11y) plugin ini juga butuh `npx playwright install chromium` bila kelak dipakai.

---

## Batch Fix #1 — Hasil Eksekusi (2026-09-19)

**Status: SELESAI & TERVERIFIKASI.** Branch: `feature/design-token-codemod` (dipotong dari `dev`, belum di-commit).

### Yang dilakukan
1. Codemod `.design-qa/codemod-hex-to-token.mjs` (dry-run → review → `--write`): **107 penggantian** hex → `var(--token)` di 14 file — hanya hex yang nilainya PERSIS sama dengan token `:root` (peta divalidasi otomatis terhadap `:root` sebelum eksekusi).
2. Perbaikan manual 5 nilai hex pada ternary multi-baris yang terlewat oleh pemrosesan per-baris (`AvatarStudio.tsx` border, `GroupInfoDrawer.tsx` warna role) → total **112 hex → token**.
3. Cleanup 10 fallback `var()` yang menjadi redundan setelah codemod (`var(--x, var(--x))` → `var(--x)`), termasuk 3 kasus token dangling `--color-soft-azure`/`--accent-color` yang kini langsung memakai token terdefinisi.

### Konteks yang sengaja TIDAK diganti (aman dari codemod)
- Blok `:root` di `globals.css` — layer token, raw value memang sah di sana.
- `themeColor: '#090d16'` di `app/layout.tsx` — meta viewport, bukan CSS (`var()` tidak berlaku).
- Atribut SVG: `stopColor="#60a5fa"` (Sidebar.tsx:668), `stopColor="#3b82f6"` (VerifiedBadge.tsx:49) — atribut SVG tidak mendukung `var()`.
- Array `SENDER_COLORS` di `MessageBubble.tsx:94,97` — konstanta JS, kandidat migrasi terpisah.
- `lib/avatarColor.ts` — modul palet (setara file token).

### Verifikasi
- `npm run build`: **PASS** (Turbopack compiled, TypeScript bersih, 6 route static).
- `go test -v ./...`: **PASS** (exit 0).
- Render ekuivalen terbukti di browser nyata (localhost:3047): fingerprint computed-styles **identik** sebelum/sesudah — `/`: `8045f135`, `/login`: `c43063cc`; screenshot login before/after identik secara visual.
- Audit ulang: total riil hard-coded-color turun **±210 → 98** (−112, persis jumlah replacement; angka 152 di laporan awal adalah potongan cap 1000 finding). Hex duplikat-token di `globals.css` luar `:root` kini **0**.
- Semua `var(--token)` baru diverifikasi ada di `:root`: assert statis di codemod + `varsMissing` browser tidak bertambah.

### Temuan baru — [major] 6 token var() dangling (pre-existing)
Ditemukan saat verifikasi browser: referensi `var(--x)` di stylesheet yang **tidak terdefinisi** di `:root` → deklarasi invalid at computed-value time → propensi jatuh ke nilai initial/inherited (bug senyap):
- `--border-focus`, `--bg-input`, `--bg-surface-hover` (state input/focus/hover)
- `--transition-normal` (kemungkinan maksudnya `--transition-base`)
- `--shadow-lg` (kemungkinan maksudnya `--shadow-md`, atau perlu token baru)
- `--color-success` (belum ada — hijau sukses belum distandarisasi; terkait batch fix #2)

Dua token dangling lain (`--color-soft-azure`, `--accent-color`) sudah hilang lewat cleanup fallback di atas. Saran: grep lokasi pemakaiannya lalu petakan ke token yang ada atau tambahkan token baru.

### Sisa hex non-token (menunggu token baru — batch fix #3)
`#ffffff` (teks di atas aksen → `--text-on-accent`), `#ef4444` vs `--color-error` (drift merah), `#22c55e`/`#10b981` vs `--color-online` (drift hijau; `--color-success`?), `#38bdf8` (badge verified → `--color-verified`), `#f59e0b`, `#00f2fe`, dst.

### Artefak
- `frontend/.design-qa/codemod-hex-to-token.mjs` — codemod dengan validasi peta vs `:root` (aman dijalankan ulang).
- `frontend/.design-qa/reports/codemod-batch1.json` — rinci per file/baris.
- `frontend/.design-qa/before-login.png` / `after-login.png` — pasangan bukti visual valid (before-landing.png ter-race dengan navigasi dan berisi halaman login; halaman landing diverifikasi via fingerprint).
