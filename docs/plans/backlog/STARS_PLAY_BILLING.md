# Star Tahap 2b: Pembelian Star lewat Google Play Billing

> **Status (14 Nov 2026): desain DISETUJUI pengguna (K4-K8 sesuai usulan). Backend SELESAI di `dev`** (*tes saja*: SQLite + Postgres 16, termasuk token sama bersamaan); sakelar `STARS_PLAY_BILLING` mati, belum dideploy. **Mobile selesai di `dev` 14 Nov 2026** (*tes saja*, butuh build APK). Belum: web admin, persiapan Play Console/Google Cloud, uji nyata. Lanjutan `STARS_PAID_GROUPS.md` (Tahap 2a selesai). Keputusan pengguna 14 Nov 2026: kode 2b boleh dikerjakan **paralel** dengan Tahap 0 (`STARS_STAGE0.md`) di belakang sakelar mati; **rilis ke pengguna tetap menunggu gerbang Tahap 0** (dokumen pengguna, deklarasi Play, jawaban dukungan Play, konsultasi). Aturan Star yang berlaku: `docs/domains/STARS_WALLET.md`.
> Butir bertanda **(verifikasi)** harus dipastikan dari dokumentasi resmi saat implementasi.

## 1. Cakupan

**Masuk 2b:** produk Star di Play Console, pembelian di mobile, verifikasi dan kredit di server, konsumsi pembelian, pemulihan pembelian yang belum diproses, penanganan pembelian yang dibatalkan/direfund Google (voided), alat admin untuk melihat pembelian, sakelar `STARS_PLAY_BILLING`.

**Bukan 2b:** pembayaran ke kreator dan laporan bulanan (Tahap 3), langganan, iOS, web (web tidak menjual Star; kebijakan pembayaran Play hanya mengatur aplikasi Android, tetapi web dijeda).

## 2. Fakta yang dipakai (diperiksa 14 Nov 2026)

- Star = **produk sekali beli yang dikonsumsi** (consumable one-time product). Pembelian yang belum di-acknowledge/dikonsumsi dalam **3 hari** direfund otomatis oleh Google; produk consumable yang belum dikonsumsi tidak bisa dibeli lagi.
- Server memeriksa status lewat Play Developer API `purchases.productsv2.getproductpurchasev2` (status harus PURCHASED sebelum memberi Star) dan mengonsumsi lewat `purchases.products.consume` (v1; belum ada padanan v2 di dokumentasi) **(verifikasi)**.
- Pembelian yang dibatalkan, direfund, atau chargeback tersedia di **Voided Purchases API** (bisa dipanggil berkala, tanpa Pub/Sub).
- Play Billing Library 8 tidak lagi bisa mengambil pembelian consumable yang sudah dikonsumsi dari perangkat, jadi riwayat pembelian harus disimpan server.
- Pustaka mobile: **`expo-iap` 6.4.4** (dicek di npm 14 Nov 2026; monorepo `hyodotdev/openiap`). Klaim pihak ketiga bahwa `react-native-iap` diarsipkan **keliru**: paket itu tetap dirawat (17.3.6, berbasis Nitro); `expo-iap` dipilih karena Expo Module + config plugin. Butuh **build APK baru**.

Sumber: developers.google.com/android-publisher (productsv2, voided-purchases), developer.android.com/google/play/billing (lifecycle/one-time, security), hyochan.github.io/expo-iap.

## 3. Produk di Play Console

| Product ID (tidak bisa diubah) | Star | Harga sementara (IDR) |
|---|---|---|
| `star_50` | 50 | Rp5.000 |
| `star_100` | 100 | Rp10.000 |
| `star_500` | 500 | Rp50.000 |

- Jumlah Star per produk **ditentukan server** (tabel `star_settings`, kunci baru `play_products`: `{"star_50":50,...}`), bukan oleh aplikasi. Harga tampil dari Play (sudah dilokalkan); harga bisa diubah di Console tanpa rilis.
- Product ID permanen; jangan memakai ID yang sama untuk jumlah Star berbeda di kemudian hari. Paket baru = ID baru.

## 4. Alur pembelian

1. **Daftar paket:** `GET /api/me/stars/packages` → `{"packages":[{"product_id":"star_50","stars":50}]}`. 404 bila `STARS_PLAY_BILLING` mati → tombol "Tambah Star" tersembunyi.
2. **Beli (mobile):** ambil detail produk dari Play (harga lokal), luncurkan alur pembelian dengan `obfuscatedAccountId = SHA-256(user_id)` (heksadesimal, ≤ 64 karakter) agar pembelian terikat ke akun Wuzz.
3. **Kirim ke server:** `POST /api/me/stars/purchases` `{"product_id","purchase_token"}`. Server:
   1. Kunci idempoten = `purchase:` + SHA-256(token) (token mentah bisa lebih dari 200 karakter, batas kolom `idempotency_key`).
   2. Panggil `getproductpurchasev2`; tolak bila nama paket bukan `com.wuzzchat.mobile`, produk tak dikenal, status bukan PURCHASED, atau `obfuscatedExternalAccountId` ≠ SHA-256(user pemanggil) (`403 purchase_account_mismatch`).
   3. Satu transaksi: sisip `play_purchases` (unik per token) → entri `star_ledger` `kind=purchase`, `delta=+stars`, `ref_id` = ID pembelian. Token yang sudah dikreditkan = 200 dengan hasil sama (idempoten).
   4. Setelah commit: `purchases.products.consume`. Gagal = ditandai `consume_pending` dan dicoba ulang oleh worker (kredit tidak dibatalkan).
   5. Jawab `{"stars_added","balance","state"}`.
4. **Pemulihan:** saat aplikasi dibuka dan saat layar Saldo Star dibuka, mobile mengambil pembelian yang belum selesai dari Play lalu mengirim ulang ke langkah 3 (aman karena idempoten). Ini menutup kasus aplikasi mati setelah bayar tetapi sebelum server menjawab.
5. **Pembelian tertunda (PENDING, mis. bayar tunai di gerai):** jangan kreditkan; tampilkan "Pembayaran diproses". Kredit terjadi saat status menjadi PURCHASED (pemulihan langkah 4 atau worker).

## 5. Pembelian dibatalkan/direfund Google (voided)

- Worker berkala (mis. tiap 6 jam) memanggil Voided Purchases API sejak waktu terakhir, mencocokkan token ke `play_purchases`.
- Untuk setiap pembelian yang sudah dikreditkan: entri `star_ledger` `kind=reversal`, `delta=-stars`, kunci `reversal:<token_hash>` (sekali saja).
- **Saldo tidak boleh negatif** (invarian 2a). Bila Star sudah dibelanjakan: kurangi sampai saldo 0, sisanya dicatat sebagai **utang Star** (`star_wallets.debt`, kolom baru). Selama utang > 0: pembelian Star berikutnya melunasi utang dulu, dan membayar akses grup ditolak (`402 stars_debt`). Admin melihat daftar akun berutang di `/admin/stars`. **Keputusan terbuka K4.**
- Bagian kreator dari Star yang ternyata direfund tidak dibalik otomatis (Star bersifat fungible); masa tahan 14 hari dan tinjauan admin menjadi penangkalnya. Pola penyalahgunaan (beli, belanja ke grup sendiri, refund) dipantau lewat daftar utang. **Keputusan terbuka K5.**

## 6. Model data baru

**`play_purchases`**: `token_hash` (PK, SHA-256 token), `purchase_token` (teks penuh, untuk API), `order_id`, `product_id`, `user_id`, `stars`, `state` (`credited` / `consumed` / `voided`), `is_test` (pembelian penguji lisensi), `purchase_time`, `ledger_id`, `reversal_ledger_id`, `created_at`, `updated_at`. Dipertahankan saat hapus akun seperti catatan keuangan lain (K1).

**`star_wallets.debt`** (INTEGER, bawaan 0) bila K4 disetujui. Konstanta `StarKindReversal = "reversal"` (sudah tercantum di rencana 2a, belum di kode).

**Pengaturan:** `play_products` di `star_settings`; cursor waktu voided di `star_settings` atau tabel status worker.

## 7. Sakelar dan konfigurasi (env, bawaan mati)

| Env | Isi |
|---|---|
| `STARS_PLAY_BILLING` | Menyalakan daftar paket, endpoint pembelian, worker konsumsi dan voided. Butuh `STARS_ENABLED=true`. |
| `PLAY_PACKAGE_NAME` | Bawaan `com.wuzzchat.mobile` |
| `PLAY_SERVICE_ACCOUNT_FILE` | Berkas JSON service account Google Cloud yang diberi akses di Play Console. **Terpisah dari kredensial FCM.** Disimpan di VPS, tidak di-commit. |

Token akses diambil dengan JWT service account (scope `https://www.googleapis.com/auth/androidpublisher`), memakai ulang pola `push/fcm.go` (dipindah ke helper bersama), tanpa dependensi baru.

## 8. Mobile

- Pustaka `expo-iap` (config plugin) → build baru. Pembelian hanya di Android.
- Layar Saldo Star: bagian **"Tambah Star"** dengan kartu paket (jumlah Star + harga dari Play) bila `GET /packages` 200. Status: memproses, berhasil (saldo bertambah), tertunda, gagal/dibatalkan pengguna (tanpa pesan galat).
- Layar undangan berbayar saat saldo kurang: tautan "Tambah Star" ke layar Saldo Star.
- Riwayat: label `purchase` = "Tambah Star", `reversal` = "Pembatalan pembelian".
- Pemulihan pembelian saat aplikasi dibuka (bagian 4 langkah 4), di latar belakang, tanpa memblokir UI.
- Teks netral: tidak menyebut metode bayar lain, tidak menjanjikan pencairan.

## 9. Admin

`/admin/stars` pengguna: daftar pembelian Play (produk, Star, status, uji/tidak, waktu, `order_id`), entri reversal, utang. Refund uang tetap lewat Play Console (Order management); refund itu nanti terbaca sebagai voided dan membalik Star otomatis.

## 10. Persiapan di Play Console dan Google Cloud (pengguna; AI memandu)

1. **Produk:** buat 3 produk sekali beli (bagian 3), harga IDR, status aktif. Tidak terlihat pengguna sampai aplikasi memakainya.
2. **Penguji lisensi:** Pengaturan > Pengujian lisensi; tambahkan akun Google penguji (pembelian uji tidak menagih).
3. **Akses API:** buat/ pilih proyek Google Cloud, aktifkan *Google Play Android Developer API*, buat service account, unduh kunci JSON; di Play Console > Pengguna dan izin, undang email service account dengan izin melihat data keuangan dan mengelola pesanan **(verifikasi nama izin)**. Izin baru bisa butuh waktu sampai sekitar sehari sebelum aktif **(verifikasi)**.
4. Simpan JSON di VPS, isi `PLAY_SERVICE_ACCOUNT_FILE`, sakelar tetap mati sampai uji.
5. Uji di track **Internal testing** dengan build ber-`expo-iap`.

## 11. Pengujian

- Backend: tes klien Play dengan server HTTP palsu (status PURCHASED/PENDING/salah paket/akun tidak cocok), idempotensi token, konsumsi gagal lalu dicoba ulang, voided dengan saldo cukup dan dengan utang, Postgres untuk pembelian bersamaan dengan token sama.
- Mobile: tes unit klien API; uji HP dengan penguji lisensi: beli tiap paket, batalkan di tengah, matikan aplikasi setelah bayar (pemulihan), refund dari Order management (voided terbaca, Star dibalik).

## 12. Keputusan terbuka

| # | Pertanyaan | Usulan |
|---|---|---|
| K4 | Refund Google setelah Star dibelanjakan | Saldo dipotong sampai 0, sisanya utang; belanja diblokir sampai lunas |
| K5 | Bagian kreator dari Star yang direfund | Tidak dibalik otomatis; tinjauan admin + masa tahan |
| K6 | Product ID dan isi paket | `star_50`, `star_100`, `star_500` (permanen) |
| K7 | Harga paket | Sementara Rp5.000 / Rp10.000 / Rp50.000; diputuskan di Tahap 0 D1 |
| K8 | Pembelian penguji lisensi di produksi | Dikreditkan, ditandai `is_test`, terlihat di admin |

## 12b. Penyimpangan implementasi dari draf (14 Nov 2026)

- **Pemetaan produk:** tidak ada kunci `play_products`; ID produk diturunkan dari pengaturan `packages` (`star_<n>`). Menambah paket = tambah angka di `packages` + buat produk dengan ID itu di Play Console.
- **Utang:** tabel terpisah `star_debts`, bukan kolom `star_wallets.debt` (tanpa ALTER pada tabel lama). Dompet tetap memuat `debt` di API.
- **Token Google:** sumber token service account baru di `playbilling/token.go`; `push/fcm.go` tidak diubah (menghindari risiko pada push).
- `GET /api/me/stars/packages` juga mengembalikan `account_id` (SHA-256 ID pengguna) untuk dipasang sebagai `obfuscatedAccountId`.
- Token yang sudah dikreditkan lalu dikirim ulang dengan `product_id` lain ditolak `product_mismatch` (ditemukan oleh tes handler).
- **(verifikasi saat uji nyata)** nama parameter halaman Voided Purchases: dipakai `pageSelection.token` (tabel skema), padahal contoh URL Google memakai `token`.

## 12c. Mobile (14 Nov 2026)

- `expo-iap` dipasang dengan plugin `["expo-iap", {"android": {"store": "play"}}]` di `app.json`. **Jebakan:** folder `android/` lokal tidak di-prebuild ulang oleh skrip rilis, jadi pin toko juga ditulis manual di `android/gradle.properties` lokal (`openiapStore=play`); tanpa itu, Gradle memilih toko dari flavor/perangkat.
- `src/services/starBilling.ts` satu-satunya pemakai `expo-iap`: koneksi sekali, harga dari Play, `requestPurchase` dengan `obfuscatedAccountId` = `account_id` dari server, `purchaseUpdatedListener` → POST server → `finishTransaction(isConsumable)` **hanya setelah server menjawab credited**. Tidak diselesaikan saat: tertunda, server 202, akun lain (Google mengembalikan dana bila tak diklaim dalam 3 hari), galat jaringan (dipulihkan nanti). Token yang sedang diproses tidak dikirim dua kali.
- Pemulihan `recoverStarPurchases()`: 5 detik setelah sesi terbentuk (`App.tsx`, modul dimuat malas) dan saat layar Saldo Star dibuka; tidak membuka koneksi Play bila `/packages` 404.
- UI: bagian "Tambah Star" di `StarsScreen` (kartu paket: jumlah Star + harga Play; tombol terkunci sampai ada hasil; pesan sukses/tertunda/gagal; harga gagal dimuat = tautan coba lagi), kartu peringatan utang, label riwayat `reversal`/`debt_repay`. `InviteScreen`: tombol "Tambah Star" saat saldo kurang (hanya bila `/packages` tersedia), galat `stars_debt`, penyegaran saat kembali fokus.

## 13. Urutan kerja (setelah disetujui)

1. **[SELESAI 14 Nov 2026, tes saja]** Backend: helper token Google, klien Play (get, consume, voided), tabel dan migrasi, endpoint paket dan pembelian, worker konsumsi dan voided, utang (bila K4), admin, sakelar, tes SQLite + Postgres.
2. Web `/admin/stars`: daftar pembelian dan utang.
3. **[SELESAI di kode 14 Nov 2026, tes saja]** Mobile: `expo-iap`, bagian Tambah Star, pemulihan, tes unit; build APK (pengguna).
4. Pengguna menyiapkan Play Console dan Google Cloud (bagian 10); uji Internal testing dengan penguji lisensi.
5. Dokumen: `STARS_WALLET.md`, API, OpenAPI (dua salinan), `ARCHITECTURE.md`, `OPERATIONS.md`, progres.
6. Rilis: hanya setelah gerbang `STARS_STAGE0.md` bagian 4 lengkap.
