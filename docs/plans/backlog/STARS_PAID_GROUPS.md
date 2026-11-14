# Star & Grup Privat Berbayar (Wuzz Chat V2, Tahap 2)

> **Status (14 Nov 2026): desain DISETUJUI (termasuk K1-K3). Backend Tahap 2a SELESAI di `dev`** (*tes saja*: SQLite + Postgres 16, termasuk pembayaran bersamaan); semua sakelar mati. `/admin/stars` web selesai di `dev`. **Mobile 2a selesai di `dev` (14 Nov 2026, *tes saja*, butuh build APK; belum diuji di HP).** Belum: Play Billing (2b). Aturan yang berlaku: `docs/domains/STARS_WALLET.md`. Ini Tahap 2 dari Fase 15 (`docs/ROADMAP.md`); prinsip, risiko hukum, dan fakta kebijakan Play ada di `ADS_AND_REWARDS_PLAN.md` bagian 14 dan 14.1 (dokumen ini tidak mengulanginya). Tahap 1 (tautan undangan) selesai: `PRIVATE_GROUP_INVITES.md`.
> **Keputusan pengguna 14 Nov 2026:** grup berbayar **sekali bayar**, akses selama tidak dikeluarkan; **tanpa refund otomatis**, admin Wuzz bisa mengembalikan Star secara manual (entri `refund`); semua angka memakai **nilai sementara** di tabel pengaturan; urutan kerja: bagian yang **tidak bergantung pada Play** dulu (Tahap 2a), Play Billing menyusul (Tahap 2b) setelah profil merchant aktif.
> **Tahap 0 BELUM** (hukum, merchant Play, badan usaha). Karena itu semua sakelar bawaan **mati**, tidak ada UI pembelian, dan **tidak ada yang boleh dirilis ke pengguna** sebelum Tahap 0 dan deklarasi Play (Financial features, Data Safety) selesai.

## 1. Cakupan

**Tahap 2a (dikerjakan sekarang, tanpa Play):**
1. Buku besar Star append-only dan idempoten, dengan saldo per pengguna.
2. Catatan Star yang diterima kreator, disimpan sebagai **nilai uang** (bukan Star), dengan status `pending → available` setelah masa tahan.
3. Program mitra kreator: hak membuat grup berbayar diberikan/dicabut manual oleh `wuzz_admin` lewat `/admin`.
4. Grup berbayar: harga dalam Star; tautan undangan grup berbayar memakai mode `paid` (bayar lalu langsung masuk, atomik).
5. `/admin`: kelola kreator, lihat saldo dan riwayat Star pengguna, **refund manual**, dan **kredit uji** (hanya bila sakelar uji menyala).
6. Mobile: saldo dan riwayat Star, layar undangan berbayar, pengaturan harga grup untuk kreator. Tombol "Beli Star" **tidak ada** di Tahap 2a.

**Tahap 2b (setelah profil merchant Play aktif):** produk Star di Play Console, library billing di mobile, verifikasi pembelian di server (Google Play Developer API), konsumsi pembelian, penanganan pembatalan/refund dari Google (RTDN atau pemeriksaan berkala).

**Bukan Tahap 2:** pembayaran ke kreator, laporan bulanan, maker-checker `wuzz_finance` (Tahap 3); langganan; pencairan di aplikasi (Tahap 3b).

## 2. Angka sementara (tabel `star_settings`, bisa diubah tanpa deploy)

| Kunci | Nilai sementara | Arti |
|---|---|---|
| `star_value_minor` / `currency` | 100 / `IDR` | 1 Star = Rp100 untuk menghitung nilai uang (perlu disesuaikan dengan harga paket Play nanti) |
| `packages` | 50, 100, 500 Star | paket yang akan dijual di Tahap 2b |
| `group_price_min` / `group_price_max` | 10 / 5.000 Star | rentang harga grup yang boleh dipasang kreator |
| `store_fee_pct` | 15 | potongan Google (15% untuk USD 1 juta pertama per tahun) |
| `platform_pct` | 20 | bagian platform dari sisa setelah potongan Google |
| `hold_days` | 14 | masa tahan sebelum Star diterima kreator berstatus `available` |

Rumus bagian kreator per pembelian akses: `gross = harga × star_value_minor`; `kreator = gross × (1 − store_fee_pct) × (1 − platform_pct)`, dibulatkan ke bawah ke satuan minor. **Setiap baris menyimpan snapshot** angka yang dipakai, sehingga perubahan tarif tidak menulis ulang riwayat.

## 3. Model data

**`star_ledger`** (append-only; koreksi lewat entri pembalik, tidak pernah UPDATE/DELETE):

| Kolom | Isi |
|---|---|
| `id`, `tenant_id`, `user_id` | pemilik saldo |
| `delta` | Star bertanda (+ masuk, − keluar), bilangan bulat |
| `kind` | `purchase` (2b), `spend` (bayar akses grup), `refund`, `test_grant`, `adjustment`, `reversal` |
| `idempotency_key` | UNIK. `purchase`: token pembelian Google; `spend`: dari klien (header `Idempotency-Key`) + pengguna; admin: dari formulir |
| `group_id`, `ref_id` | grup terkait / baris lain yang dirujuk (mis. refund → spend) |
| `created_by`, `reason`, `created_at` | pembuat (pengguna atau staf) dan alasan wajib untuk aksi staf |

**`star_wallets`** (`tenant_id`, `user_id`, `balance`, `updated_at`): saldo materialisasi, diperbarui **dalam transaksi yang sama** dengan setiap entri buku besar, dan menjadi baris yang dikunci (`SELECT … FOR UPDATE` di Postgres) agar saldo tidak pernah negatif saat bayar bersamaan. Invarian yang diuji: `balance = SUM(delta)`.

**`creator_earnings`** (Star diterima kreator, dalam uang): `id`, `tenant_id`, `creator_id`, `group_id`, `buyer_id`, `ledger_id` (spend), `stars`, `gross_minor`, `amount_minor`, `currency`, snapshot `star_value_minor`/`store_fee_pct`/`platform_pct`, `status` (`pending`/`available`/`reversed`; `paid` di Tahap 3), `available_at`, `created_at`. Refund sebelum `paid` = baris diubah ke `reversed` **plus** entri jejak; setelah `paid` ditangani Tahap 3.

**`paid_group_creators`**: `tenant_id`, `user_id`, `status` (`active`/`revoked`), `granted_by`, `revoked_by`, `note`, waktu. Hanya tenant `default`.

**`paid_groups`**: `group_id` PK, `creator_id` (penerima; harus creator grup dan mitra aktif), `price_stars`, `enabled`, `updated_by`, waktu. Grup harus privat.

**`paid_group_access`**: `group_id`, `user_id`, `ledger_id`, `stars_paid`, `created_at` (bukti akses dibayar; dasar refund). Dikeluarkan admin grup lalu ingin masuk lagi = bayar lagi (sesuai "akses selama tidak dikeluarkan").

## 4. Alur dan API (semua di belakang sakelar; sakelar mati = 404/403 seragam)

- **Kreator mengatur harga:** `PUT /api/groups/{grp_id}/paid` `{price_stars, enabled}`. Hanya **creator grup** yang juga mitra aktif; grup harus privat; harga dalam rentang. Mengaktifkan berbayar **mereset** tautan undangan ke mode `paid` (tautan approval lama berhenti bekerja). Pengajuan approval yang masih menunggu tidak dihapus; admin grup tetap bisa memutuskannya (masuk tanpa bayar, sama seperti admin menambahkan anggota). Menonaktifkan berbayar mereset tautan kembali ke mode `approval`.
- **Pratinjau undangan** (`GET /api/invites/{token}`) untuk grup berbayar menambah `mode: "paid"`, `price_stars`, `my_balance`.
- **Bayar dan masuk:** `POST /api/invites/{token}/purchase` body `{expected_price}` + header `Idempotency-Key`. Satu transaksi: kunci dompet → cek harga sama dengan `expected_price` (harga berubah = 409 `price_changed`) → cek saldo (kurang = 402 `insufficient_stars`) → `spend` → `creator_earnings` → `paid_group_access` → keanggotaan. Sudah anggota = 200 tanpa potongan. Kunci idempoten yang sama = hasil yang sama tanpa potongan ganda. Laju 10/jam per pengguna.
- **Dompet:** `GET /api/me/stars` (saldo + 50 entri terakhir; istilah UI netral: "Saldo Star", "Riwayat Star"). Kreator: `GET /api/me/stars/received` (ringkasan Star diterima per grup, tanpa kata "pendapatan").
- **Admin (`wuzz_admin` saja di Tahap 2):** `/api/admin/stars/creators` (beri/cabut), `/api/admin/stars/users/{id}` (saldo + riwayat), `POST …/refund` `{spend_ledger_id, reason}` (kembalikan Star pembelian akses, `creator_earnings` → `reversed` bila belum `paid`; keanggotaan tidak diubah otomatis), `POST …/test-grant` `{stars, reason}` (hanya bila `STARS_TEST_GRANTS=true`; ditandai `test_grant` agar tidak tercampur angka nyata), `GET/PUT /api/admin/stars/settings`.

## 5. Sakelar (env, bawaan mati)

| Env | Fungsi |
|---|---|
| `STARS_ENABLED` | Dompet, riwayat, dan endpoint admin Star aktif |
| `PAID_GROUPS_ENABLED` | Kreator boleh mengaktifkan grup berbayar; pembayaran akses lewat tautan |
| `STARS_TEST_GRANTS` | Admin boleh mengkreditkan Star uji. **Jangan nyalakan di produksi** setelah ada pengguna nyata |
| `STARS_PLAY_BILLING` (2b) | Verifikasi pembelian Play |

## 6. Kepatuhan dan jebakan

- Star **hanya bisa dibelanjakan** di Wuzz Chat; tidak ada transfer antarpengguna, tidak ada penarikan. UI tidak menyebut "pendapatan", "tarik", "cairkan", dan tidak menyebut metode bayar lain (kebijakan Play, bagian 14).
- Tidak ada pembelian Star di Tahap 2a; saldo nyata hanya mungkin dari `test_grant` (uji) atau `refund`.
- **Hapus akun:** baris buku besar dan `creator_earnings` adalah catatan keuangan; diusulkan **dipertahankan** dengan `user_id` saja (tanpa nama/profil) dan dikecualikan dari penghapus akun. Perlu dicek terhadap kebijakan privasi dan hasil konsultasi hukum (keputusan terbuka K1).
- Data Safety Play (riwayat pembelian) dan Financial features declaration wajib diperbarui **sebelum** build ber-Star mana pun masuk track Play (gerbang di `OPERATIONS.md`).
- Grup berbayar dihapus pembuatnya: `creator_earnings` tetap ada; refund oleh admin bila perlu.

## 7. Keputusan terbuka (tidak menghambat Tahap 2a)

| # | Pertanyaan | Usulan |
|---|---|---|
| K1 | Catatan keuangan saat akun dihapus | Dipertahankan (hanya `user_id`), dikonfirmasi lewat konsultasi hukum |
| K2 | Admin grup (bukan creator) boleh mengubah harga? | Tidak; hanya creator grup yang mitra |
| K3 | Grup berbayar boleh dijadikan publik? | Tidak; nonaktifkan berbayar dulu |

## 8. Urutan kerja Tahap 2a (setelah disetujui)

1. Backend: tabel dan migrasi, store buku besar + dompet (transaksi, kunci, idempoten), pengaturan, mitra kreator, grup berbayar, pembayaran akses, refund, kredit uji, endpoint, sakelar, tes SQLite + Postgres (termasuk pembayaran bersamaan dan invarian saldo).
2. **[SELESAI 14 Nov 2026, uji ujung-ke-ujung lokal]** `/admin` web: halaman Star (kreator, pengguna, refund, kredit uji, pengaturan).
3. **[SELESAI di kode 14 Nov 2026, *tes saja*; uji HP menunggu build + sakelar uji]** Mobile: dompet, undangan berbayar, pengaturan harga kreator (semua tersembunyi bila sakelar mati).
4. Dokumen: domain baru `docs/domains/STARS_WALLET.md`, `GROUP_FORUM.md`, API, OpenAPI, `ARCHITECTURE.md`, `OPERATIONS.md` (sakelar), progres.
5. Uji di produksi hanya dengan sakelar dinyalakan sementara pada akun uji dan `STARS_TEST_GRANTS`, lalu dimatikan lagi.
