# Backlog: Masa Berlaku Token & Cache Lokal Saat Sesi Habis

> Dibuat 2026-10-05 dari diskusi auth. **Status: Tahap 1–3 diterapkan di `dev` (belum di-commit/deploy); lihat bagian 7.** Seluruh temuan di bawah sudah diverifikasi di kode
> kecuali yang ditandai **(belum diverifikasi)**.

## 1. Masalah

1. **JWT 7 hari tetap, tanpa perpanjangan.** `backend/internal/auth/jwt.go:69` (`time.Now().Add(7 * 24 * time.Hour)`).
   Tidak ada refresh token / sliding renewal. Pengguna yang aktif tiap hari tetap terlogout di hari ke-7.
2. **Mobile menghapus cache lokal saat 401.** `mobile/src/context/AuthContext.tsx:268-277` memanggil
   `clearLocalAccountData` (`clearUserCache` + `clearFeedPosts`) untuk token kedaluwarsa. Padahal itu bukan logout
   sukarela, dan kunci E2EE sengaja dipertahankan.
3. **Dampak (2)**: riwayat harus diunduh ulang (50 pesan terakhir per room lewat `joinRoom` tanpa `since`, sisanya
   lewat REST `getMessages(..., before)` saat scroll). Pesan yang sudah dihapus di server (hapus oleh pengirim, TTL
   subgroup) hilang permanen dari HP. Pesan optimistic berstatus `sending` yang hanya ada di `local_messages` ikut
   terhapus tanpa tanda.
4. Web: `frontend/lib/api.ts:46` hanya menghapus token & profil di `localStorage`, redirect ke `/login?expired=1`.
   Cache pesan web (`messageCache.ts`) tidak ikut dihapus pada 401 **(belum diverifikasi penuh)**.

## 2. Rancangan

### Tahap 1 — Mobile: jangan hapus cache pada 401 (kecil, tanpa deploy backend)
- Di jalur 401 (`AuthContext.tsx` ±L268) hapus pemanggilan `clearLocalAccountData`; tetap `clearSession()` dan
  `unsubscribeDevice()`.
- Simpan `lastUserId` (mis. `secureStorage.setLastUserId`) saat sesi dibersihkan karena kedaluwarsa.
- Pada `login`/`register` sukses: bila `user.id !== lastUserId` → `clearLocalAccountData(lastUserId)` sebelum memuat
  data akun baru. Bila sama → cache dipakai, `joinRoom` dikirim dengan `since` = pesan terakhir lokal (delta sync, batas
  100) alih-alih 50 pesan terakhir.
- Jalur logout sukarela (`AuthContext.tsx:404`) dan `SESSION_REPLACED` (L215) **tidak diubah**: tetap menghapus.
- Trade-off privasi: setelah token habis, data pesan tetap ada di SQLite HP sampai login berikutnya. Kunci E2EE
  tersimpan di secure storage; data SQLite plaintext (lihat DEC "E2EE Plaintext Preservation") jadi bisa dibaca
  siapa pun yang punya akses ke penyimpanan app. Putuskan dulu apakah ini dapat diterima (Pertanyaan T1).

### Tahap 2 — Backend: sliding renewal
- Endpoint baru `POST /api/auth/refresh` (di balik `RequireJWT`, `backend/internal/api/auth_handler.go` +
  `AuthService.RefreshToken`).
  - Syarat: token belum kedaluwarsa & tidak di-revoke, sisa masa berlaku < 50% (≈3,5 hari), sesi (`sessions.jti`) masih
    ada, device_id di klaim cocok.
  - Hasil: token baru (jti baru, klaim sama, exp +7 hari), `CreateSession` baru, jti lama **tidak langsung di-revoke**
    (biarkan habis alami, menghindari request in-flight gagal) — tetapi sesi lama dihapus bila sudah tergantikan.
  - **Batas absolut**: klaim baru `auth_time` (waktu login awal) disalin ke token pengganti; tolak refresh bila
    `now - auth_time > 90 hari`. Mencegah token hidup selamanya.
  - Wajib lolos `IsUserRevokedBefore` (ganti password mencabut semua), sehingga `iat` token baru harus > waktu revoke
    hanya bila memang dikeluarkan sesudahnya; refresh tidak boleh menghidupkan sesi yang sudah dicabut.
- Pertahankan kuota 2 perangkat: refresh tidak menambah perangkat (device_id sama).
- Rate limit endpoint (mis. 10/menit/user lewat `shared/ratelimit`).

### Tahap 3 — Klien memakai refresh
- Mobile: panggil refresh saat app dibuka/foreground bila token tersisa < 50% (decode `exp`/`iat` lokal), simpan token
  baru di `secureStorage`, sambungkan ulang WebSocket dengan token baru (`websocketClient.connect(newToken, deviceId)`).
  Gagal jaringan → abaikan, coba lagi nanti (jangan logout).
- Web: sama, di `frontend/lib/api.ts` (satu kali per sesi/hari, dengan `AbortController`), perbarui
  `wuzz_auth_token` dan token di CacheStorage yang dipakai service worker (`pushNotification.ts` ±L289) **(belum
  diverifikasi cara sinkronnya)**.
- Koneksi WebSocket yang sudah terbuka tidak diputus saat token lama kedaluwarsa; cek apakah `ws/handler.go:81`
  hanya memvalidasi saat handshake **(belum diverifikasi)** — bila ya, sesi WS panjang aman, tetapi reconnect
  memerlukan token valid.

### Alternatif yang ditolak
- Hanya menaikkan TTL ke 30 hari: paling murah, tetapi jendela pencurian token ikut melebar dan masalah (2) tetap ada.
  Bisa dipakai sebagai tambal sulam bila Tahap 2–3 ditunda (ubah satu konstanta + `service.go:292,334,397`).
- Refresh token terpisah (access pendek + refresh panjang di tabel baru): lebih rapi untuk keamanan, tetapi migrasi
  skema + perubahan di web/mobile jauh lebih besar; tidak sebanding untuk skala saat ini.

## 3. Berkas yang terdampak
- Backend: `internal/auth/jwt.go`, `internal/authz/service.go` (+ konstanta 7 hari yang tersebar di L292, L334, L397),
  `internal/authz/repository.go` & `infra/sql_repository.go`, `internal/api/auth_handler.go`, `internal/app/router.go`,
  `docs/domains/AUTH_SESSION.md`, `docs/openapi.yaml`, `docs/BACKEND_API.md`.
- Mobile: `src/context/AuthContext.tsx`, `src/api/auth.ts`, `src/services/secureStorage*`, `src/services/websocket.ts`.
- Web: `frontend/lib/api.ts`, `frontend/lib/pushNotification.ts`.

## 4. Pengujian
- Go: tabel test `RefreshToken` — sisa > 50% ditolak/no-op, sisa < 50% sukses, token revoked, user-revoked-before,
  device_id beda, melewati batas 90 hari, jti lama tetap valid sampai exp. `go test -race ./...`.
- Mobile: `npx tsc --noEmit`; skenario manual — token kedaluwarsa lalu login akun sama (cache utuh, delta sync) vs akun
  beda (cache dihapus).
- Web: `npm run build`.
- Deploy backend hanya dengan izin eksplisit (`ssh wuzz-vps ./deploy-chat.sh`). Mobile baru terdampak setelah APK baru;
  versi lama tetap bekerja (endpoint refresh bersifat tambahan).

## 5. Urutan & risiko
1. Tahap 1 (mobile saja) — risiko rendah, nilai tertinggi untuk kasus kedaluwarsa. Bisa dirilis terpisah.
2. Tahap 2 lalu 3 — deploy backend dulu, baru rilis klien.
- Risiko utama: refresh yang salah bisa menghidupkan sesi yang seharusnya dicabut (logout/ganti password/remote logout).
  Wajib dites di jalur revoke. Risiko kedua: konstanta 7 hari tersebar di tiga tempat `service.go`; samakan dengan
  satu konstanta bersama.

## 6. Pertanyaan terbuka untuk pemilik
- **T1**: Apakah data pesan plaintext boleh tertinggal di HP setelah token kedaluwarsa (Tahap 1)?
- **T2**: Batas absolut sesi: 90 hari cukup, atau mau lebih pendek/panjang?
- **T3**: Apakah mau mengerjakan Tahap 1 saja dulu, atau langsung seluruhnya?

## 7. Status Implementasi (2026-10-05)
Diterapkan sesuai rencana (T1 diterima, T2 = 90 hari, T3 = semua tahap), dengan penyimpangan berikut:
- **Delta sync `since` tidak dipakai.** `joinRoom` mobile tidak pernah mengirim `since`; riwayat 50 pesan terakhir dari
  server digabung dengan cache lewat `historyMerge`/`reconcileHistory`, jadi cache yang dipertahankan sudah cukup.
- **Tanpa `AuthLimiter` pada `/api/auth/refresh`.** Bucket itu milik login/register per IP; berbagi NAT akan memblokir
  login. Endpoint murah dan wajib JWT sah.
- **Mobile**: jalur 401 menyimpan `expired_user_id` (secureStorage) alih-alih menghapus cache; `purgeStaleAccountData`
  di `login`/`register` menghapus cache akun lama hanya bila akun berbeda. Refresh otomatis di `AuthContext`
  (saat sesi aktif + AppState `active`), memakai `shouldRefreshToken` (`src/utils/jwt.ts`) dan
  `websocketClient.updateToken` (tanpa memutus koneksi berjalan).
- **Web**: efek refresh di `lib/auth-context.tsx` (saat dibuka + `visibilitychange`); `/api/auth/refresh` dikecualikan
  dari auto-logout 401 di `apiRequest`. Token baru ditulis ke `localStorage` dan CacheStorage service worker.
- **Backend**: `auth.TokenLifetime/RefreshWindow/MaxSessionAge`, klaim `auth_time`, `AuthService.RefreshToken`,
  `AuthHandler.Refresh`, rute `/api/auth/refresh`; konstanta 7 hari di `service.go` disatukan ke `auth.TokenLifetime`.
  Test: `internal/authz/refresh_test.go`, `internal/api/auth_refresh_test.go`.
- **Perilaku yang perlu diketahui**: refresh kedua dengan token LAMA (mis. respons refresh pertama hilang di jaringan)
  ditolak 401 karena record sesi lama sudah dicabut. Klien mengabaikan kegagalan refresh, token lama tetap valid
  sampai kedaluwarsanya, jadi tidak ada logout paksa; hanya perpanjangan tertunda sampai login berikutnya.
- Belum diuji manual di perangkat (kedaluwarsa nyata butuh 3,5+ hari); logika waktu diuji unit (Go) dan skrip Node
  (`shouldRefreshToken`).

### Revisi angka (2026-10-05)
Disesuaikan dengan perilaku Telegram/WhatsApp (sesi bertahan lama selama aktif): `TokenLifetime` 7 → **30 hari**,
`RefreshWindow` otomatis 15 hari (50%), `MaxSessionAge` 90 → **365 hari**. Angka "7 hari / 3,5 hari / 90 hari" di
bagian 2–6 di atas adalah rancangan awal. `backend/internal/api/openapi.yaml` (salinan yang di-embed) kini disinkronkan
dari `docs/openapi.yaml` (sebelumnya basi: belum ada endpoint refresh dan masih menyebut Fly.io).
