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
**Tanggal**: 2026-09-19 · **Status**: Rencana aktif · **Ref**: `frontend/.design-qa/reports/design-debt.md` §Suggested Batch Fixes

- **Selesai**: #1 hex→token (M8.6) · #2 warna status + #6 hapus `page.module.css` (M8.7).
- **#3** — token baru + konsolidasi tint `rgba()`: `--text-on-accent` (`#ffffff` 45×), `--color-verified` (`#38bdf8` 14×), tint aksen/error; petakan palet WhatsApp-web (`#111b21/#1f2c34/#e9edef/#8696a0/#cbd5e1`) ke token atau jadikan pengecualian terdokumentasi.
- **#4** — ekstraksi inline style 5 file top-offender (`DeviceTransferModal`, `ProfileModal`, `SubGroupListDrawer`, `CreateGroupModal`, `GroupInfoDrawer`) ke kelas CSS bertoken.
- **#5** — unifikasi modal/backdrop ke satu primitive + z-index scale (hapus `99999`).
- **#7** — buat `DESIGN.md` (skill `design-system-capture`) agar audit sadar-token dan Canvas viewer DESIGN.md aktif.
- **Sampingan** — 5 token `var()` dangling pre-existing (`--border-focus`, `--bg-input`, `--bg-surface-hover`, `--transition-normal`, `--shadow-lg`): petakan ke token yang ada atau definisikan ulang.
