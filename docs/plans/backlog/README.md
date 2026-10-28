# Backlog Wuzz Chat — Indeks dan Sisa Pekerjaan

> Diperbarui 28 Okt 2026. Sumber kebenaran sisa pekerjaan untuk sesi AI mana pun. Berkas selesai ada di `../archived/28-10-2026-backlog-selesai/`. Aturan kerja ada di `PROMPT.md`; runbook operasional di `docs/OPERATIONS.md`.
> **Kerjakan hanya yang diminta pengguna.** Memiliki item di sini bukan izin implementasi.

## 1. Berkas aktif

| Berkas | Status | Catatan |
|---|---|---|
| [`ADS_AND_REWARDS_PLAN.md`](ADS_AND_REWARDS_PLAN.md) | Draf. **Belum boleh dieksekusi** | Akun AdMob sudah dibuat dan `app-ads.txt` tayang (28 Okt); SDK iklan baru setelah perintah eksplisit. Setiap fitur baru wajib dicek terhadap rencana ini. |
| [`FORUM_MONETIZATION_PLAN.md`](FORUM_MONETIZATION_PLAN.md) + [`_BACKLOG.md`](FORUM_MONETIZATION_BACKLOG.md) | Live (Free/Pro, Perpanjang forum) | Tenggat 1 Nov dan ±20 Des 2026; bug B1-B10, fitur F1-F8, keputusan produk di berkas backlog. |
| [`GOOGLE_LOGIN.md`](GOOGLE_LOGIN.md) | Fase 1-4 live, fase 5 ditunda | Pembekuan otomatis 30 Okt 2026 23:59:59 WIB. |
| [`VIDEO_MESSAGE_R2.md`](VIDEO_MESSAGE_R2.md) | Tahap 1-4 selesai, web ditunda | Cek bagian 6 (thumbnail lokal dan ACK sekali) sebelum menganggapnya terbuka. |
| [`FORUM_BUBBLE.md`](FORUM_BUBBLE.md) | Tahap 1-2 selesai, tahap 3 ditunda | Tahap 3 butuh desain per-tenant untuk AI Memory. |
| [`MOBILE_LINKED_DEVICES.md`](MOBILE_LINKED_DEVICES.md) | Selesai kecuali audit | Audit akar penyebab inventaris lama/kuota dan target yang sepenuhnya offline masih terbuka. |
| [`FEED_UPLOAD_HARDENING.md`](FEED_UPLOAD_HARDENING.md) | Belum dikerjakan | A1 (kompresi gambar) butuh dependency native, jadi build baru. |
| [`b2b-widget/README.md`](b2b-widget/README.md) | Diskusi, ditunda | Prasyarat audit tenant T1-T6 sudah selesai. |

## 2. Sisa dari rencana yang sudah diarsipkan

**Wuzz Grid (ditutup pengguna 28 Okt 2026; tidak dikejar kecuali dibuka lagi):**
- Belum teruji di HP: notifikasi pengingat benar-benar muncul dan ketukannya membuka game; opsi "sembunyikan dari teman dan grup" dilihat dari akun lain; lencana pembeku saat streak 0; tema gelap kartu pengingat dan papan skor.
- Akun uji sengaja dibiarkan: `@mhdarifsetiawan` (`hide_from_social` ON, pengingat ON, papan publik OFF) dan `@vanyzter` (papan publik ON). Laporan uji "LAPORAN UJI ... abaikan" di `/admin/reports` perlu ditutup pengguna.
- Cara uji pengingat: setelah tengah malam, ubah `GAME_REMINDER_TIME` di env VPS ke sekitar 5 menit ke depan, restart backend, buka aplikasi sekali, tunggu, lalu kembalikan ke `19:00`.

**Moderasi (live):** pencarian laporan per pengguna, UI banding, saluran email, "Tangguhkan lewat username" di Kelola Moderator, notifikasi Telegram dipindah ke grup. Catatan moderator tidak dihapus otomatis (jangan isi data pribadi).

**Token/sesi (live):** konfirmasi log produksi `POST /api/auth/refresh 200` dari aplikasi (UA `WuzzChat-Mobile/<versi>`); cara cek di `docs/OPERATIONS.md`.

**Performa mobile (tuntas):** B3 (opsional, butuh keputusan keamanan) dan D6 (ukur hanya bila riwayat panjang terasa lambat).

**Forum Completion Loop (selesai):** uji notifikasi `memory_draft_ready` nyata (warm/background/cold start) dan dedup ketukan; kasus akses dicabut atau draf dihapus/ditinjau admin lain; pencarian arsip; "Lihat Pesan Asli"; membuka whitelist AI Memory.

## 3. Backlog lain yang belum dimulai (dari serah terima 7 Okt 2026)

- Hardening unggahan Feed (lihat berkas di atas).
- Login Google di web (moderator Google-only belum bisa masuk `/admin`).
- Fase 5 Google: hapus akun tidak aktif (ditunda sengaja; tinjau paling lambat kuartal 2 2027).
- Tutup `POST /api/auth/register` lama setelah klien baru tersebar; hapus kartu "Saya sudah punya akun" setelah masa transisi (`GOOGLE_LOGIN.md` bagian 14.1).
- Latensi kecil opsional: `POST /api/messages/receipt` (3 putaran DB), `POST /api/media/ack` (4 putaran), pemanasan cache tenant/peran/penangguhan saat startup. Konteks: `docs/SECURITY_AND_PERFORMANCE.md`, bagian "Putaran kedua".
- Ide ditunda: bubble chat AI atas memori (RAG), sinkron kontak (biaya OTP, izin `READ_CONTACTS`), multi-tenant B2B/widget, SVG ikon final (ikon mobile masih placeholder; pengguna menggambar sendiri).
- Dokumentasi: audit `docs/openapi.yaml` terhadap handler (satu skema pernah salah total) dan verifikasi ulang dokumen domain terhadap kode (`FORUM_MONETIZATION_BACKLOG.md` B8, B9). Dua salinan OpenAPI sudah berbeda ±136 baris sejak sebelum game.
- Utang tautan dokumen (sudah ada sebelum 28 Okt): `PROGRESS.md`, `SECURITY_AND_PERFORMANCE.md`, `PROJECT_STATE.md`, dan `MOBILE_INTEGRATION_GUIDE.md` memuat tautan `file:///home/...` absolut (hanya jalan di satu mesin); `ARCHITECTURE_AUDIT.md`, `GROUP_MEMORY_AI_SPEC.md`, `HEADLESS_INTEGRATION_GUIDE.md`, `MODULAR_MONOLITH_DDD.md`, dan `mobile/DESIGN.md` dirujuk dari `docs/` dengan jalur relatif yang salah atau berkasnya tidak ada atau bukan di `docs/`. Perbaiki bertahap (ganti ke tautan relatif atau hapus rujukan).
