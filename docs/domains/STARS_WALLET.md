# 💫 Domain: Star & Grup Privat Berbayar (V2 Tahap 2)

> Status (14 Nov 2026): **Tahap 2a backend selesai di `dev`, *tes saja*, semua sakelar mati.** `/admin/stars` web selesai di `dev` (uji ujung-ke-ujung lokal). Mobile selesai dan *terbukti* di HP 14 Nov 2026 dengan sakelar dinyalakan sementara (`docs/progress/MOBILE.md`). Play Billing (Tahap 2b): **backend dan mobile selesai di `dev` 14 Nov 2026, *tes saja*, sakelar `STARS_PLAY_BILLING` mati**; web admin dan uji nyata belum. **Tidak boleh dirilis ke pengguna** sebelum Tahap 0 (hukum, merchant Play, badan usaha) dan deklarasi Play (Financial features, Data Safety) selesai. Desain dan alasan: `docs/plans/backlog/STARS_PAID_GROUPS.md`; prinsip dan kebijakan Play: `docs/plans/backlog/ADS_AND_REWARDS_PLAN.md` bagian 14.

## 1. Aturan bisnis (invarian)

1. **Star hanya bisa dibelanjakan** di Wuzz Chat. Tidak ada transfer antarpengguna, tidak ada penarikan. Star ≠ Poin (rencana iklan).
2. **Buku besar append-only** (`star_ledger`): tidak pernah UPDATE/DELETE; koreksi lewat entri baru (`refund`, `adjustment`). Jenis: `purchase` (2b), `spend`, `refund`, `test_grant`, `adjustment`.
3. **Saldo** (`star_wallets.balance`) = `SUM(star_ledger.delta)`, diperbarui dalam transaksi yang sama, **tidak pernah negatif**: UPDATE bersyarat `balance + delta >= 0` plus `CHECK (balance >= 0)` di database.
4. **Idempoten:** setiap entri punya `idempotency_key` unik. Bayar akses: `spend:<user>:<Idempotency-Key>`; kredit uji: `test_grant:<Idempotency-Key>`; refund: `refund:<spend_id>` (satu pembayaran hanya bisa dikembalikan sekali).
5. **Star diterima kreator disimpan sebagai uang** (`creator_earnings`, satuan minor + mata uang) dengan snapshot `star_value_minor`, `store_fee_pct`, `platform_pct`. Rumus: `gross = harga × star_value_minor`; `bagian = gross × (100 − store_fee) × (100 − platform) / 10000`, dibulatkan ke bawah. Status `pending`; dihitung "tersedia" setelah `available_at` (masa tahan) tanpa worker; `reversed` saat refund; `paid` (Tahap 3).
6. **Mitra kreator** (`paid_group_creators`) diberikan/dicabut manual oleh `wuzz_admin`. Mencabut menonaktifkan semua grup berbayarnya.
7. **Grup berbayar** (`paid_groups`): hanya grup utama **privat**; hanya **pembuat grup** (role `creator`) yang juga mitra aktif yang boleh mengaktifkan dan mengatur harga (K2); harga dalam rentang pengaturan. Grup berbayar **tidak bisa dijadikan publik** (409 `paid_group_public`, K3). Berlaku hanya bila `enabled` **dan** pembuatnya masih mitra aktif.
8. **Tautan undangan grup berbayar** bermode `paid`: pratinjau menampilkan `price_stars` dan `my_balance`; `POST …/join` (approval) ditolak 402 `payment_required`; masuk lewat `POST …/purchase`. Mengubah status berbayar **mereset** tautan aktif (tautan lama berhenti). Pengajuan approval yang masih menunggu tetap bisa diputuskan admin grup.
9. **Bayar akses = satu transaksi**: sisip keanggotaan **lebih dulu** (kunci terhadap pembayaran bersamaan; sudah anggota = tanpa potongan) → `spend` → `creator_earnings` → `paid_group_access`. Harga berbeda dari `expected_price` = 409 `price_changed`. Saldo kurang = 402 `insufficient_stars`. Akses berlaku selama tidak dikeluarkan; masuk lagi = bayar lagi.
10. **Refund hanya manual** oleh `wuzz_admin` (keputusan 14 Nov 2026): Star kembali ke pembeli, `creator_earnings` → `reversed`; keanggotaan tidak diubah. Refund setelah `paid` ditolak (Tahap 3).
11. **Hanya tenant `default`.** Tenant lain: 404 `not_available`.
12. **Hapus akun (K1, usulan menunggu konsultasi hukum):** `star_ledger`, `star_wallets`, `creator_earnings`, `paid_group_access` **dipertahankan** (hanya `user_id`); `paid_groups` ikut dihapus bersama grup.
13. **UI netral:** "Saldo Star", "Riwayat Star", "Star diterima"; jangan "pendapatan", "tarik", "cairkan", dan jangan menyebut metode bayar lain.

14. **Pembelian lewat Google Play (Tahap 2b)**: Star hanya dijual lewat Play Billing. Server memverifikasi setiap token ke Google (`productsv2`): status `PURCHASED`, produk `star_<n>` sesuai paket di pengaturan, satu produk per pembelian, dan `obfuscatedExternalAccountId` = SHA-256 ID pengguna (token akun lain ditolak). Satu token = satu baris `play_purchases` = paling banyak satu kredit (`kind=purchase`, kunci `purchase:<hash token>`). `PENDING` tidak dikreditkan. Pembelian dikonsumsi di Google setelah kredit; gagal = dicoba ulang worker, kredit tidak dibatalkan.
15. **Pembelian dibatalkan Google (voided)**: worker per jam membaca Voided Purchases API (jendela maks 30 hari) dan membalik sekali (`kind=reversal`). Saldo dikurangi paling rendah sampai 0; sisanya menjadi **utang** (`star_debts`). Selama utang > 0, bayar akses grup ditolak 402 `stars_debt`; kredit pembelian berikutnya melunasi utang dulu (`kind=debt_repay`). Bagian kreator tidak dibalik otomatis (K5).

## 2. Sakelar (env, bawaan mati)

`STARS_ENABLED` (dompet, admin), `PAID_GROUPS_ENABLED` (butuh `STARS_ENABLED`), `STARS_PLAY_BILLING` (butuh `STARS_ENABLED` + `PLAY_SERVICE_ACCOUNT_FILE`; pembelian Play dan worker), `STARS_TEST_GRANTS` (butuh `STARS_ENABLED`; **jangan di produksi setelah ada pengguna nyata**). Mati = endpoint 404 seragam, tautan undangan tetap mode approval.

## 3. Angka (tabel `star_settings`, `GET/PUT /api/admin/stars/settings`)

Bawaan sementara (keputusan 14 Nov 2026): 1 Star = Rp100, paket 50/100/500, harga grup 10-5.000 Star, potongan toko 15%, platform 20%, masa tahan 14 hari. Validasi: platform ≤ 90%, potongan toko ≤ 50%, masa tahan ≤ 365 hari.

## 4. Endpoint

Rincian payload: `docs/BACKEND_API.md` 35d. Ringkas: `GET /api/me/stars`, `GET /api/me/stars/received`, `GET|PUT /api/groups/{grp_id}/paid`, `POST /api/invites/{token}/purchase` (header `Idempotency-Key`), `/api/admin/stars/{settings,creators,users/{ref},users/{ref}/test-grant,refund}` (hanya `wuzz_admin`).

## 5. Kode

`store/stars.go` (`StarStore`), integrasi undangan di `store/invite_links.go` (`SetStarStore`, mode `paid`), `api/stars_handler.go`, rute di `api/group_handler.go` / `api/group_invite_handler.go` / `app/router.go`, perakitan `app/wire.go`, `GroupService.SetPaidGroupChecker`. Tes: `store/stars_test.go` (termasuk pembayaran bersamaan; di SQLite sebagian transaksi bersamaan ditolak `SQLITE_BUSY` karena `busy_timeout` hanya terpasang di satu koneksi pool, keterbatasan lama), `api/stars_handler_test.go`. Tahap 2b: `playbilling/` (`token.go` token service account, `client.go` Play Developer API, `service.go` verifikasi/kredit/sapuan), `store/stars_play.go`, `worker/play_billing_worker.go`, perakitan `newPlayBillingService` di `app/wire.go`. Tes: `store/stars_play_test.go` (termasuk token sama bersamaan), `playbilling/*_test.go`, `api/stars_play_handler_test.go`. Mobile 2b: `mobile/src/services/starBilling.ts` (satu-satunya pemakai `expo-iap`; selesaikan transaksi hanya setelah server mengkreditkan). Mobile: `mobile/src/api/stars.ts`, `StarsScreen`, `PaidGroupSection`, mode paid di `InviteScreen` (semua tersembunyi bila endpoint 404).

## 6. Jebakan

- Jalankan uji konkurensi di Postgres (`PG_TEST_ADMIN_DSN`); SQLite tidak mewakili produksi untuk tulis bersamaan.
- `STARS_TEST_GRANTS` membuat Star tanpa uang; tandanya `kind = test_grant`. Jangan pernah dinyalakan bersamaan dengan pengguna nyata.
- Mengubah `star_settings` tidak mengubah baris lama (snapshot), hanya transaksi berikutnya.
