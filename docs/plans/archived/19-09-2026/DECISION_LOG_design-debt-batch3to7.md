# Active Decision Log

> Satu seksi per keputusan teknis. Arsipkan seksi saat keputusan digantikan atau tidak lagi relevan (pindah ke `docs/plans/archived/`).

## D-001 — Kebijakan token-first untuk styling frontend
**Tanggal**: 2026-09-19 · **Status**: Aktif · **Ref**: Milestone 8.6–8.7, `frontend/.design-qa/reports/design-debt.md`

- **Konteks**: Audit design-debt menemukan 200+ hex literal di kode fitur yang menduplikasi nilai token `:root` — perubahan tema harus diedit di puluhan titik.
- **Keputusan**: Kode fitur (`frontend/app/**`, `frontend/lib/**`) wajib memakai `var(--token)` dari `app/globals.css` `:root`. Hex mentah hanya sah di: (1) blok `:root` itu sendiri, dan (2) `lib/avatarColor.ts` (modul palet avatar deterministik). Konteks non-CSS (atribut SVG, `themeColor` meta viewport, opsi QR, array warna JS) terdokumentasi sebagai pengecualian di laporan design-debt.
- **Diterapkan**: batch fix #1 (112 replacement) + #2 (32 replacement) — keduanya lolos build, test, dan verifikasi render/browser.

## D-002 — Semantik warna status dua-peran (merah dan hijau)
**Tanggal**: 2026-09-19 · **Status**: Aktif · **Ref**: Milestone 8.7

- **Konteks**: Merah untuk peran error memakai 5 nilai berbeda (`#f87171/#ef4444/#dc2626/#fc8181/#fca5a5`); hijau untuk sukses/online 3 nilai (`#34d399/#22c55e/#10b981`) — status visual tidak konsisten antar layar.
- **Keputusan** (token di `:root` `app/globals.css`):
  - `--color-error: #f87171` — teks/ikon error di latar gelap.
  - `--color-danger: #ef4444`, `--color-danger-strong: #dc2626` — fill aksi destruktif + varian hover/tekan.
  - `--color-success: #10b981` — konfirmasi sukses & fill afirmatif (tombol Setujui, pesan terkirim).
  - `--color-online: #34d399` — khusus indikator kehadiran.
- **Alasan**: kontras a11y — teks putih di atas `#ef4444` ±3.8:1 vs ±2.8:1 di atas `#f87171` (fill destruktif membutuhkan merah lebih dalam); pemisahan peran "error-text" vs "danger-fill" dan "online" vs "success" mencegah drift ulang.
- **Alternatif ditolak**: memaksa satu merah/hijau untuk semua peran — mengorbankan kontras pada salah satu konteks.

## D-003 — Roadmap design-debt lanjutan (batch #3–#5, #7)
**Tanggal**: 2026-09-19 · **Status**: ✅ Selesai · **Ref**: `frontend/.design-qa/reports/design-debt.md` §Suggested Batch Fixes

- ✅ **#1** — hex→token (M8.6, 112 replacement)
- ✅ **#2** — warna status + **#6** hapus `page.module.css` (M8.7, 32 replacement)
- ✅ **#3** — token baru di `:root`: `--color-verified`, `--text-on-accent`, `--color-cyan-neon`, 10× tint aksen + 5× tint error, palet `--wa-*`, 3 dangling var fix, `--shadow-lg`, `--transition-normal`, z-index scale `--z-*`. Codemod 20 file, `zIndex: 99999` → 0.
- ✅ **#4** — kelas utility CSS 120+ (`u-flex`, `u-gap-*`, `u-text-*`, `u-fw-*`, `btn-ghost`, `drawer-body`, dll) + class helpers `.z-modal/modal-top/dropdown/overlay/critical` di `globals.css`.
- ✅ **#5** — unified modal primitives: `.modal-overlay`, `.modal-card-unified`, `.modal-header-unified`, `.modal-body-unified`, `.modal-footer-unified`, `.modal-danger-zone`, `.modal-confirm-overlay`. Semua `group-modal-backdrop` di 4 file diberi `z-modal` class.
- ✅ **#7** — `frontend/DESIGN.md` dibuat (173 baris, single source of truth design system).
- ✅ **Sampingan** — 5 dangling `var()` dipetakan: `--border-focus` (rgba blue 0.5), `--bg-input`, `--bg-surface-hover`, `--transition-normal` (alias base), `--shadow-lg` (0 8px 32px).

**Build gate**: `npm run build` PASS 3× (setelah #3, #4+#5, final). `go test ./...` 8 paket OK.
