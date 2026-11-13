# Rencana Iklan & Hadiah (AdMob, Sponsor Mitra, Poin) — Draf Diskusi

> **Status:** draf rencana, disusun 23 Oktober 2026. **Belum ada kode, belum ada keputusan angka.** Tidak ada perubahan pada build yang sedang di closed testing.
> **Aturan kerja:** deploy backend/frontend dan build APK dilakukan pengguna. Jangan menaikkan versi/build number. Tidak ada `git push` tanpa persetujuan tertulis terpisah.
> **Syarat waktu:** SDK iklan dan build berisi iklan BARU dirilis setelah akses produksi Play disetujui (deklarasi App content saat ini: Ads = Tidak, Advertising ID = No). Pekerjaan lokal di `dev` boleh jalan lebih dulu, di balik sakelar mati.

---

## 1. Keputusan yang sudah disepakati

| Topik | Keputusan |
|---|---|
| Iklan hadiah (rewarded) | Satu-satunya iklan yang dipilih pengguna; tidak ada banner/interstitial |
| Angka | Disepakati 23 Okt (bagian 4); **dapat diubah kapan saja dari server, tanpa build** (bagian 4.1) |
| Pro vs sponsor mitra | Pro tidak menghilangkan sponsor mitra; hanya iklan AdMob bila `ad_free` diaktifkan |
| Hadiah awal | **Langsung** (nonton iklan = dapat manfaat saat itu juga), bukan streak 7 hari |
| Iklan feed | Tetap ada, bentuk native yang menyerupai postingan, di Linimasa saja, tidak pernah di chat |
| Sakelar | Fleksibel dari server; paket Pro nanti bisa menghilangkan semua iklan |
| Langganan Pro | Bisa menghilangkan iklan (belum aktif; pembayaran Fase 5 masih ditunda) |
| Poin yang bisa dibeli uang | Belum diputuskan; bila ya, wajib Play Billing |
| Platform awal | Mobile saja (AdMob tidak untuk web) |

## 2. Dua jalur terpisah di Linimasa

| | **Iklan AdMob (native)** | **Postingan sponsor mitra** |
|---|---|---|
| Sumber | Jaringan AdMob | Mitra yang bekerja sama langsung |
| Penerbit | SDK, otomatis | `wuzz_admin` lewat `post_type: sponsored` (sudah ada di kode) |
| Pembayaran | Dari AdMob | Kesepakatan langsung; di luar sistem aplikasi |
| Dimatikan Pro? | Bisa (hak `ad_free`, saat ini belum aktif) | Tidak (diputuskan 23 Okt) |
| Aturan label | Wajib "Iklan" + AdChoices, aset dari AdMob | Wajib label "Sponsored" + nama mitra yang jelas |

Fakta kode (23 Okt): `PostTypeSponsored` sudah ada di `backend/internal/feed/entity.go` dan divalidasi di `feed/service.go`; mobile sudah memiliki lencana di `FeedScreen.tsx` dan pilihan tipe di `CreatePostModal.tsx`; `metadata` JSON dirancang untuk CTA/deep-link. Jalur mitra sebagian besar **sudah tersedia**; yang perlu ditambah hanya tata kelola (bagian 6).

Pelajaran 8 Okt: postingan "Sponsored" akun Semantic dihapus karena menjanjikan fitur yang tidak ada. Postingan sponsor harus berisi klaim yang benar dan dari mitra yang jelas, bukan buatan sendiri yang meniru iklan.

## 3. Sakelar & hak akun (diatur server)

Tiga lapis, semua dibaca aplikasi dari server:
1. **Global:** `ADS_ENABLED`.
2. **Per jenis:** `ADS_FEED_ENABLED`, `ADS_REWARDED_ENABLED`, (opsional) `SPONSORED_POSTS_ENABLED`.
3. **Per hak akun:** `ad_free` pada paket. Hari ini Pro belum menghilangkan iklan; nanti cukup satu nilai berubah.

Prinsip: aplikasi bertanya ke server, tidak menanam aturan. Tenant non-default tidak ikut dibatasi (konsisten dengan catatan monetisasi forum). Semua default **mati**.

## 4. Iklan hadiah & aturan langit-langit

**Aturan utama:** hasil hadiah tidak boleh melebihi batas Pro.

**Angka awal (disepakati 23 Okt 2026, hipotesis yang dievaluasi setelah ada data nyata):**

| Parameter | Nilai awal | Catatan |
|---|---|---|
| Tontonan per hari | 5 per akun | Mencegah kelelahan iklan dan penipuan |
| Jeda antar tontonan | 60 detik | Membatasi pemutaran beruntun |
| Tontonan per 1 kredit forum | 2 | Slot lebih berharga daripada ringkasan |
| Masa pakai kredit forum yang belum dipakai | 48 jam | Mencegah penimbunan |
| **Langit-langit forum aktif Free** | **3** (Pro 5) | Free + hadiah tidak boleh menyamai Pro |
| Durasi forum dari hadiah | 7 hari saja | 30 hari tetap hanya Pro |
| Tontonan per 1 kredit ringkasan AI | 1 | Biaya LLM kecil |
| Tambahan ringkasan dari hadiah | maks +6 per bulan (total Free maks 8; Pro 20) | Tetap jauh di bawah Pro |
| Masa pakai kredit ringkasan | sampai akhir bulan kalender (UTC) | Selaras dengan periode kuota yang ada |
| Jeda iklan feed | 1 per 8 postingan, pertama di posisi ke-5 | Terasa lunak |
| Batas iklan feed per sesi layar | maks 3 | Feed tidak terasa penuh iklan |

Dasar hitungan (perkiraan, belum terukur): biaya LLM per ringkasan biasa jauh di bawah seperseratus dolar (batas terburuk 1.000 pesan × 1.000 karakter hanya beberapa sen); pendapatan rewarded Indonesia kira-kira $0,001-0,005 per tontonan. Satu tontonan kira-kira menutup biaya satu ringkasan biasa, jadi kendala utamanya adalah menjaga nilai Pro, bukan biaya LLM. Bila batas hadiah Free disamakan dengan Pro, keunggulan jumlah forum Pro hilang; karena itu langit-langit Free 3.

### 4.1 Fleksibilitas (wajib): semua angka dapat diubah kapan saja, termasuk setelah produksi

Syarat desain, bukan sekadar harapan:
- **Tidak ada angka yang ditanam di aplikasi.** Semua parameter di atas dibaca dari server (konfigurasi/tabel), jadi mengubahnya tidak butuh build APK baru, tidak butuh rilis Play, dan berlaku untuk semua versi terpasang.
- **Cara mengubah:** lewat halaman `/admin` (seperti `/admin/plans`) atau env VPS; perubahan berlaku tanpa deploy ulang kode bila memakai konfigurasi di database. Pilihan penyimpanan diputuskan saat implementasi (tabel pengaturan lebih disukai daripada env agar tidak perlu restart).
- **Perubahan tidak merusak yang sudah dimiliki pengguna:** kredit yang sudah diperoleh tetap menghitung dengan nilai saat diperoleh (atau disimpan sebagai kredit jadi), sehingga mengubah "2 tontonan per kredit" tidak mengurangi kredit yang sudah ada. Slot forum yang sudah dibuat tidak dicabut ketika langit-langit diturunkan (sama seperti aturan downgrade Pro: hanya pembuatan baru yang dibatasi).
- **Sakelar darurat:** `ADS_ENABLED`/`ADS_REWARDED_ENABLED`/`ADS_FEED_ENABLED` dapat dimatikan seketika; aplikasi menampilkan keadaan tanpa iklan dengan rapi.
- Teks UI memakai angka dari server (mis. "tonton 2 iklan"), bukan teks tetap, agar tidak salah setelah angka berubah.
- Pengecualian yang membutuhkan build: mengganti ID unit iklan AdMob, menambah jenis iklan baru, atau mengubah tampilan kartu.

**Keamanan:** klaim hadiah hanya sah lewat **server-side verification (SSV)** dari AdMob (callback bertanda tangan, `transaction_id` unik anti-ulang). Klien tidak pernah menambah hadiah sendiri.

**Poin (lapisan kedua, nanti):** pengumpulan tanpa reset (bukan streak yang hangus). Ditunda sampai hadiah langsung terbukti.

## 5. Iklan native di feed

- Format native AdMob; kartu menyerupai postingan tetapi dengan label **"Iklan"**, ikon AdChoices, dan aset dirender dari data AdMob.
- Tidak boleh dibuat seolah-olah dari akun nyata atau menyamar sebagai postingan organik.
- Posisi: hanya Linimasa, jeda tetap (mis. satu iklan tiap 8 postingan), tidak di chat/percakapan.
- Gagal memuat = tidak menampilkan apa pun (tanpa ruang kosong); jaringan lambat/putus tidak boleh menahan render feed.

## 6. Tata kelola postingan sponsor mitra (kebutuhan baru)

Tujuan: mitra dapat memposting produk/promosi di Wuzz Chat. Yang sudah ada hanya penerbitan oleh `wuzz_admin`. Yang perlu dirumuskan:
- Bukti kesepakatan dengan mitra (catatan internal) dan masa tayang (mulai/akhir).
- Nama mitra wajib tampil (pengiklan bukan "Wuzz Chat").
- Tautan keluar jelas; tidak ada klaim palsu atau menyesatkan (kebijakan Play: tidak menyesatkan).
- Kemampuan menurunkan/menonaktifkan postingan sponsor kapan saja (sudah ada jalur moderasi).
- Pencatatan tayangan/klik jika mitra membutuhkan laporan (belum ada).
- Apakah mitra punya akun sendiri atau selalu diterbitkan staf (default: staf `wuzz_admin`, tanpa swalayan).

### 6.1 Laporan tayangan dan klik untuk mitra

- Peristiwa dicatat di tabel sendiri: `impression` (kartu terlihat minimal sekitar 1 detik dan 50% area) dan `click` (tombol/tautan ditekan), per postingan sponsor.
- Deduplikasi tayangan per akun, per postingan, per hari, supaya gulir bolak-balik tidak menggelembungkan angka.
- Hanya angka agregat untuk mitra (tayangan, klik, rasio klik per hari); tidak ada data pribadi pengguna yang dibagikan.
- Tampil di halaman `/admin` (per postingan, per rentang tanggal) dan dapat diekspor CSV untuk dikirim ke mitra.
- Pengiriman peristiwa harus tahan jaringan lambat (antre, kirim batch, tidak memblokir render feed).

## 7. Kepatuhan & privasi (dikerjakan saat rilis iklan)

- Perbarui **App content**: Ads = Ya; Advertising ID = Ya (izin `AD_ID` di manifest).
- Perbarui **Data safety** dan kebijakan privasi (`/privacy`): pengiriman data ke AdMob. Isi pesan E2EE tidak pernah dikirim ke iklan.
- **UMP** (persetujuan) sesuai wilayah; label iklan opsional dan jelas.
- Target usia 13+: terapkan penandaan anak sesuai kebijakan AdMob bila berlaku.
- Poin yang bisa dibeli uang = Play Billing (komisi 15-30%). Jangan menjual poin lewat jalur lain.
- Akun AdMob: aplikasi dihubungkan ke listing Play; iklan uji sebelum tayang.

## 8. Keputusan terbuka

**Sudah diputuskan (23 Okt 2026):**
- Pro **tidak** menghilangkan postingan sponsor mitra. Pro hanya dapat menghilangkan iklan AdMob, dan hanya bila nanti diatur demikian lewat hak `ad_free` (sakelar server).
- Angka awal bagian 4 disetujui, dan dapat diubah kapan saja (bagian 4.1).

**Diputuskan 23 Okt 2026 (lanjutan):**
- Poin **ingin bisa dibeli dengan uang** (lewat Google Play Billing, produk consumable). Pembelian bukan bagian rilis iklan pertama; desain data disiapkan sejak awal (bagian 11).
- Mitra **butuh laporan tayangan dan klik** (bagian 6.1).
- Angka disimpan di **tabel pengaturan di database** (bukan env VPS).
- Jadwal evaluasi angka **belum ditentukan**; usulan pemicu ada di bagian 12.

- Poin yang dibeli **tetap tunduk pada langit-langit Free** (tidak melampauinya) dan **tidak kedaluwarsa**. (Periksa kebijakan Play soal mata uang virtual saat Play Billing dirancang.)
- Kesetaraan poin (usulan, selaras bagian 4): 1 tontonan = 1 poin; 1 kredit ringkasan AI = 1 poin; 1 kredit forum = 2 poin.

**Masih terbuka:** daftar harga paket poin (menunggu verifikasi komisi dan syarat merchant Play).

## 13. Status dan aturan untuk fitur lain (diputuskan 23 Okt 2026)

- **Dokumen ini hanya rencana. Jangan dieksekusi** (tidak ada kode, SDK, atau perubahan deklarasi Play) sampai pengguna memerintahkan secara eksplisit. Ada fitur lain yang dikerjakan lebih dulu.
- **Setiap fitur baru wajib diperiksa terhadap rencana ini** sebelum dikerjakan. Periksa: batas Free/Pro dan langit-langit hadiah (bagian 4), hak `ad_free`, ledger poin (bagian 11), tempat iklan feed dan sponsor (bagian 2 dan 5), serta kepatuhan Play/privasi (bagian 7).
- Bila sebuah fitur **bertabrakan** dengan rencana (misalnya menambah batas baru, jalur yang melewati kuota, atau tempat yang menyerang aturan "tidak ada iklan di chat"), jangan lanjut diam-diam: putuskan bersama pengguna antara **memperbarui rencana ini** atau **menyesuaikan fiturnya**, lalu catat keputusan di dokumen ini.
- Fitur yang menambah kapasitas/biaya (penyimpanan, LLM, forum, media) sebaiknya ditandai: apakah ia perlu kuota Free/Pro dan apakah dapat menjadi hadiah.

## 14. Star dan grup privat berbayar (IDE, belum diputuskan; dicatat 5 Nov 2026)

> **Status: draf ide. Jangan dieksekusi** (tidak ada kode, tabel, produk Play, atau perubahan deklarasi) sampai pengguna memerintahkan secara eksplisit. **Pembaruan 14 Nov 2026:** pengguna memerintahkan Tahap 1 (tautan undangan, selesai) dan Tahap 2a (Star tanpa Play Billing, backend di `dev`, sakelar mati): `STARS_PAID_GROUPS.md`, `docs/domains/STARS_WALLET.md`. Produk Play dan deklarasi tetap belum. Dicatat karena bertabrakan dengan bagian 1 dan 11 (Poin tidak bisa dicairkan), sesuai aturan bagian 13.

**Ide pengguna (5 Nov 2026):** admin dapat menjadikan grup privat berbayar. Pengunjung tautan grup membeli "Star" di Wuzz Chat (dibeli dengan uang), membayar dengan Star itu untuk masuk, lalu pemilik grup menerima Star dan dapat mencairkannya (withdraw). Mirip grup berbayar Telegram dengan Stars.

**Hubungan dengan rencana Poin (bagian 11):**
- Star **bukan** Poin. Poin tunduk pada langit-langit Free dan tidak bisa dicairkan; Star bernilai seperti uang dan (rencananya) bisa dicairkan. Jangan digabung dalam satu saldo.
- Yang bisa dipakai bersama: pola buku besar (*ledger*) berkunci idempoten (`purchase_token`) dan tabel pengaturan di database. ROADMAP.md juga menyebut kebutuhan wallet untuk marketplace avatar; satu infrastruktur dompet bisa melayani keduanya.
- Saldo perlu dipisah menurut jenis: **dibeli** (hanya bisa dibelanjakan) dan **diterima kreator** (bisa dicairkan setelah masa tahan).

**Risiko dan hal yang harus dipastikan sebelum desain dikunci (ditulis sebelum riset; lihat bagian "Hasil verifikasi" di bawah bila sudah diisi):**

| Area | Masalah |
|---|---|
| Google Play Billing | Penjualan Star adalah barang digital di aplikasi; asumsi: wajib Play Billing (komisi 15-30%). Belum jelas: apakah membayar akses ke grup buatan pengguna lewat mata uang virtual diperbolehkan, dan bagaimana aturan pembayaran antarpengguna serta pencairan |
| Pencairan | Mata uang virtual yang dapat ditukar uang kemungkinan teregulasi di Indonesia (uang elektronik / penyelenggara jasa pembayaran, BI/OJK). Butuh konsultasi hukum **sebelum** desain dikunci |
| Pajak dan identitas | PPN jasa digital, PPh penerima, KYC (identitas dan rekening), batas pencairan minimum |
| Penipuan | Kartu curian untuk beli Star, dicairkan lewat grup sendiri (pencucian uang). Penangkal: masa tahan saldo, KYC, batas pencairan |
| Refund | Google dapat menarik kembali pembelian setelah Star dicairkan; tanpa masa tahan, saldo kreator bisa negatif |
| Konten | Penipuan "bayar lalu grup dihapus", konten bermasalah di grup berbayar; butuh kebijakan refund, laporan, dan alat moderasi |
| Data Safety Play | Pembelian dan riwayat transaksi wajib dideklarasikan sebelum rilis (gerbang rilis di `OPERATIONS.md`) |
| Badan usaha | Profil merchant Play dan mitra pencairan biasanya butuh badan usaha; belum diputuskan |

**Prasyarat teknis (diperkirakan):**
- Gerbang masuk grup bertipe: terbuka, persetujuan admin, berbayar. Tautan undangan berupa **token terpisah yang bisa dicabut**, bukan kode pendek permanen (`conversations.short_code`) atau ID `grp_<uuid>`, karena keduanya tidak bisa dicabut.
- Pondasi sudah ada untuk persetujuan admin: tabel `conversation_join_requests` dan alur `RequestToJoinSubGroup`/`RespondJoinRequest` (kini hanya untuk forum privat).
- Verifikasi pembelian di server (Google Play Developer API), transaksi atomik "bayar lalu masuk", buku besar berimbang dengan kunci idempoten, alat admin untuk sengketa dan pencairan, jejak audit, tes di Postgres.

**Urutan usulan (belum disetujui):**
1. Tahap 0 (tanpa kode): verifikasi kebijakan Play dari sumber resmi, konsultasi hukum soal mata uang virtual dan pencairan, putuskan badan usaha/merchant, model harga (tarif beli versus tarif cairkan, persen platform).
2. Tahap 1: token undangan yang bisa dicabut, gerbang terbuka/persetujuan admin, tombol reset tautan. Berguna sendiri, tanpa uang.
3. Tahap 2: Star dibeli lewat Play Billing, **hanya bisa dibelanjakan** (tanpa pencairan).
4. Tahap 3 (awal): **laporan pendapatan per kreator** (ekspor per bulan) dan pembayaran manual oleh pengguna setelah dana Google diterima. Tahap 3b (hanya setelah tahap 0 jelas): pencairan di dalam aplikasi, kemungkinan lewat mitra penyalur dana berlisensi, dengan KYC, masa tahan, dan alat admin sengketa.

**Arah yang dicondongkan pengguna (5 Nov 2026, belum keputusan final):** awalnya **program mitra kreator**: hanya kreator yang disetujui (hak diberikan manual lewat `/admin`, pola `user_entitlements`) yang boleh membuat grup berbayar; **pembayaran ke kreator dilakukan manual di luar aplikasi** oleh pengguna, sistem hanya mencatat dan menampilkan jumlah Star dan laporan pendapatan. Bila urusan hukum sudah jelas, pencairan di dalam aplikasi mungkin ditambahkan, jadi **desain harus fleksibel sejak awal** (lihat 14.1). Syarat agar posisinya aman: Star tidak bisa ditarik oleh siapa pun, kreator menerima **bagi hasil menurut perjanjian tertulis** (bukan "penukaran Star menjadi uang"), kurs dan persentase ditetapkan di perjanjian, UI tidak menjanjikan pencairan, dan pembayaran manual dilakukan **setelah dana dari Google diterima** plus masa tahan.

**Keputusan terbuka (menunggu pengguna):**
1. ~~Apakah pencairan ke rekening termasuk cakupan awal~~ Arah awal: pembayaran manual (lihat di atas); tinggal dikonfirmasi bersama hasil konsultasi hukum.
2. Satu kali bayar atau langganan per grup (usulan: satu kali dulu).
3. Persentase platform; target pasar hanya Indonesia (rupiah)?
4. Badan usaha/merchant yang akan menjadi penerima dan penerbit.
5. Apakah pemohon boleh melihat nama/avatar grup privat sebelum membayar (menyangkut kebocoran keberadaan grup).
6. Apakah anggota baru boleh melihat riwayat lama (sudah ada `history_gate` untuk grup).
7. ~~Satuan tampilan dan persetujuan kedua~~ **Diputuskan 5 Nov 2026:** tampil dalam Star; penyesuaian besar disetujui `wuzz_admin` atau `wuzz_finance` yang bukan pembuatnya (14.1 butir 11-13). Dikonfirmasi 5 Nov 2026: `wuzz_finance` boleh membuat maupun menyetujui; semua penyesuaian hanya oleh `wuzz_admin`/`wuzz_finance`. Tersisa: besar ambang "penyesuaian besar".

### 14.1 Prinsip desain fleksibel (agar pencairan otomatis bisa ditambah tanpa membongkar yang lama)

Yang disiapkan sekarang hanya **bentuk datanya**. Pencairan mandiri, KYC, dan integrasi bank/mitra **tidak dibangun** sampai tahap 3b.
1. **Buku besar append-only dan idempoten.** Jenis entri: `purchase` (kunci: `purchase_token` Google), `spend` (bayar masuk grup), `refund`, `creator_earning`, `payout`, `adjustment` (admin), `reversal`. Koreksi lewat entri pembalik, tidak pernah mengubah/menghapus baris. Berimbang (debit = kredit) dan diuji di Postgres.
2. **Pisahkan dua hal:** (a) saldo **Star pengguna** (hanya bisa dibelanjakan) dan (b) **pendapatan kreator** (nilai uang dalam satuan minor + kode mata uang, bukan Star). Kolom mata uang tidak di-hardcode ke rupiah.
3. **Rekam snapshot di setiap transaksi:** ID pesanan Play, jumlah kotor dan mata uang, persen potongan Google yang berlaku, persen platform, bagian kreator. Perubahan tarif atau hukum di kemudian hari tidak menulis ulang riwayat.
4. **Status pendapatan:** `pending` -> `available` (setelah masa tahan `hold_days`, parameter di tabel pengaturan database) -> `paid`. Reversal saat refund hanya berlaku sebelum `paid`.
5. **Payout adalah entitas sendiri** (kreator, jumlah, periode, status, metode, referensi, dibuat oleh siapa). Sekarang diisi admin: ekspor laporan, bayar manual, tandai `paid`. Nanti, permintaan dari aplikasi membuat baris yang sama dengan status `requested -> approved -> paid`. Yang berganti hanya siapa/apa yang membuat baris, bukan skemanya. Kolom `method` memungkinkan mengganti ke mitra penyalur berlisensi.
6. **Kelayakan kreator lewat hak (entitlement)**, bukan hard-code. Awalnya diberikan manual; nanti bisa menjadi swalayan dengan status verifikasi (tabel profil pembayaran baru, ditambahkan saat dibutuhkan).
7. **Sakelar bertingkat, bawaan mati:** `STARS_ENABLED`, `PAID_GROUPS_ENABLED`, `CREATOR_SELF_SERVICE_PAYOUT` (mati sampai hukum jelas). Angka (harga paket, persen platform, `hold_days`) di tabel pengaturan database seperti bagian 4.1.
8. **Jejak audit** untuk semua tindakan admin (pola `moderation_actions`), dan semua angka di laporan harus dapat ditelusuri ke entri buku besar.
9. **Teks UI dan perjanjian netral:** tidak menyebut "tarik/cairkan" sebelum hukum jelas.
10. **Rekonsiliasi:** laporan bulanan dicocokkan dengan laporan pembayaran Play Console sebelum kreator dibayar.
11. **Penyesuaian saldo kreator oleh admin Wuzz (persyaratan pengguna, 5 Nov 2026).** Admin harus bisa mengurangi (atau menambah) saldo kreator, mis. setelah kreator dibayar manual. Caranya **selalu lewat entri baru di buku besar, tidak pernah menimpa angka saldo**:
    - Tindakan **"Catat pembayaran"** membuat entri `payout` (jumlah, periode, referensi transfer, pencatat) yang mengurangi saldo tersedia. Ini jalur normal.
    - Tindakan **`adjustment`** untuk koreksi (salah hitung, penipuan, refund), dengan **alasan wajib**; bisa menambah atau mengurangi.
    - Hanya peran `wuzz_admin` (bukan moderator); jejak audit lengkap; kunci idempoten agar klik ganda tidak mengurangi dua kali; konfirmasi jumlah dan batas wajar per tindakan; saldo tidak boleh negatif tanpa konfirmasi eksplisit.
    - **Kreator dapat melihat riwayatnya** (pembayaran dan koreksi beserta alasan).
    - Saldo Star **pengguna biasa** tidak disentuh jalur ini; pengembalian ke pengguna lewat alur refund terpisah.
    - **Satuan tampilan: Star (diputuskan pengguna, 5 Nov 2026).** Nilai tersimpan tetap uang (satuan minor + kode mata uang); tampilan Star dikonversi dengan kurs tetap yang tertulis di perjanjian.
12. **Istilah UI netral (diputuskan 5 Nov 2026).** Di aplikasi dan listing toko hindari kata "pendapatan", "penghasilan", "earnings", "tarik", "cairkan", "withdraw". Pakai "Star diterima", "Saldo Star", "Riwayat Star" (isi: diterima, penyesuaian, penyelesaian). Nama kolom/tabel internal boleh teknis. **Batasan:** netralitas hanya untuk tampilan; jawaban di Play Console (Financial features declaration, Data Safety) dan saat review harus **jujur** bahwa kreator menerima bagi hasil.
13. **Penyesuaian besar memakai maker-checker (diputuskan 5 Nov 2026).** Peran baru **`wuzz_finance`** (penulisan dikonfirmasi pengguna). **Semua** penyesuaian saldo kreator, kecil maupun besar, termasuk "Catat pembayaran", **hanya bisa dilakukan oleh `wuzz_admin` atau `wuzz_finance`** (keduanya boleh membuat); peran lain, termasuk `wuzz_moderator`, ditolak. Penyesuaian di bawah ambang langsung berlaku; di atas ambang berstatus **menunggu persetujuan** dan harus disetujui `wuzz_admin` atau `wuzz_finance` yang **bukan pembuatnya** (termasuk bila pembuatnya admin). Ambang di tabel pengaturan database. Moderator tidak punya akses. Peran baru perlu perubahan pada pemeriksaan peran istimewa (`auth.RequireJWT`, verifikasi DB + cache 15 detik), konstanta peran, dan `/admin` untuk memberikannya; dokumentasikan di `AUTH_SESSION.md` saat dikerjakan.

**Hasil verifikasi kebijakan resmi Google Play (5 Nov 2026).** Sumber: tiga halaman Play Console Help yang dibaca langsung (ringkasan teks dibuat subagen, kutipan di bawah dari laporannya; halaman tidak mencantumkan tanggal "last updated"), jadi **cek ulang kutipan di halaman aslinya sebelum keputusan final**: [Payments](https://support.google.com/googleplay/android-developer/answer/9858738), [Understanding Payments policy (FAQ)](https://support.google.com/googleplay/android-developer/answer/10281818), [Service fees](https://support.google.com/googleplay/android-developer/answer/112622), [lower service fees](https://support.google.com/googleplay/android-developer/answer/16954621), [billing choice program](https://support.google.com/googleplay/android-developer/answer/17161464).

*Terverifikasi dari teks resmi:*
- **Menjual Star wajib Play Billing.** Payments, poin 2: aplikasi yang menerima pembayaran untuk "in-app features or services, including any app functionality, digital content or goods" wajib memakai Google Play Billing; contoh yang disebut termasuk "virtual currencies" dan "avatars". FAQ: "if these points (or other types of virtual currency) are sold in-app, Google Play's billing system must be used".
- **Mata uang virtual terkunci ke satu aplikasi.** Poin 5: "In-app virtual currencies must only be used within the app or game title for which they were purchased." Star tidak boleh dirancang sebagai mata uang lintas aplikasi.
- **Dilarang mengarahkan ke metode bayar lain di dalam aplikasi** (poin 4), termasuk tombol, tautan, atau kalimat ajakan membeli di luar aplikasi. Di luar aplikasi pengembang bebas berkomunikasi soal opsi pembelian lain. Ini memperkuat aturan "teks UI netral" yang sudah dipakai.
- **Pengecualian pembayaran antarpengguna (P2P)** hanya untuk kasus sempit. FAQ tips/kontribusi kreator: bila "100% of the tip or contribution from a user goes to the creator and the payment does not grant access to any digital content or services", dianggap P2P dan Play Billing tidak wajib; "If any of these things is not true", Play Billing wajib. Layanan 1:1 berbayar dikecualikan hanya bila antara dua individu dan tidak bisa diputar ulang.
- **Biaya untuk Indonesia (masuk "all remaining markets")**: 15% untuk USD 1 juta pertama pendapatan tahunan pengembang dan 30% di atasnya; langganan berulang 15%. Struktur baru (biaya layanan dan biaya penagihan terpisah, 10-25% + biaya penagihan) baru berlaku untuk "Rest of World" pada **30 September 2027**, dan rincian biaya penagihan wilayah lain masih "forthcoming".
- **Indonesia tidak termasuk program billing choice** (alternative billing): pasar yang tersedia hanya Australia, Jepang, Inggris, EEA, dan AS. Jadi untuk Indonesia, jalur satu-satunya per 5 Nov 2026 adalah Play Billing.

*Kesimpulan yang ditarik dari teks (BUKAN kutipan; halaman tidak menyebut kata "group" atau "community"):*
- Membayar untuk masuk grup privat memberi akses ke konten/layanan digital, dan platform mengambil sebagian (bukan 100% ke kreator). Dengan dua syarat P2P gagal, pembelian Star untuk itu **wajib Play Billing**, dan **Star tidak bisa dibayar lewat jalur lain** di Android.

*Tidak disebutkan di halaman mana pun (perlu jalur lain):*
- **Pencairan (payout) ke kreator**: tidak ada ketentuan tentang pengembang yang menyalurkan uang ke pengguna lain, tentang menukar mata uang virtual menjadi uang nyata, maupun tentang lisensi finansial atau KYC. Kebijakan Play tidak melarang maupun mengizinkannya secara eksplisit. Artinya jawabannya harus datang dari **konsultasi hukum (BI/OJK)** dan, bila perlu, **pertanyaan langsung ke dukungan Play**. Ada juga halaman Play Console "Financial features declaration" yang judulnya terlihat tetapi isinya belum dibaca; wajib diperiksa.
- **Pajak** (PPN jasa digital, PPh penerima) bukan urusan kebijakan Play.

*Belum terverifikasi (hanya hasil pencarian berita, bukan sumber resmi):* putusan KPPU dan Mahkamah Agung (Maret 2026) yang disebut mewajibkan Google membuka pilihan penagihan di Indonesia. Halaman resmi billing choice belum mencantumkan Indonesia, jadi jangan merencanakan jalur selain Play Billing sampai halaman resmi berubah. Pantau halaman billing choice.

*Dampak ke rencana:* (1) potongan Google 15% (hingga USD 1 juta per tahun) sampai 30% harus dihitung di harga Star sebelum bagian platform dan kreator; (2) tarif pencairan harus lebih rendah dari tarif pembelian; (3) tahap 0 yang tersisa: konsultasi hukum soal pencairan, pertanyaan ke dukungan Play soal pembayaran akses grup buatan pengguna dan pencairan, baca Financial features declaration, putuskan badan usaha.

## 9. Urutan kerja (usulan)

0. **Sekarang:** selesaikan closed testing dan ajukan produksi tanpa perubahan deklarasi.
1. **Backend (di `dev`, uji tanpa AdMob):** sakelar + hak `ad_free`, model hadiah (tabel klaim, `transaction_id` unik), pemeriksaan langit-langit di jalur pembuatan forum/ringkasan, endpoint konfigurasi iklan.
2. **Tata kelola sponsor mitra:** metadata, masa tayang, label, penonaktifan.
3. **Mobile (di balik sakelar):** UI tawaran kontekstual ("kuota habis → tonton iklan"), kartu iklan feed, penanganan gagal-muat.
4. **SDK AdMob + SSV + UMP** (setelah produksi disetujui), uji dengan iklan uji.
5. **Rilis iklan:** perbarui App content, Data safety, privasi; build dan deploy oleh pengguna.
6. Lapisan poin, dan Pro tanpa iklan (setelah Play Billing diverifikasi).

## 11. Poin yang bisa dibeli (Play Billing) — rancangan awal

- **Satu buku besar poin** (ledger) untuk semua sumber: `ad_reward`, `purchase`, `grant` (admin), `refund`, `spend`. Setiap baris punya kunci idempoten (`transaction_id` AdMob atau `purchase_token` Google) agar tidak terhitung dua kali. Saldo = jumlah buku besar. Desain ini dibuat sejak backend iklan supaya pembelian tinggal ditambahkan.
- Produk Play: **consumable** (paket poin), bukan langganan. Lebih sederhana daripada langganan Pro, yang butuh siklus perpanjangan, masa tenggang, dan pembatalan.
- Backend memverifikasi pembelian lewat Google Play Developer API (akun layanan), lalu mengakui/mengonsumsi pembelian. Pengembalian dana (refund) ditangani lewat notifikasi atau pemeriksaan berkala dan dicatat sebagai baris `refund`.
- Pembelian hanya di Android (web tidak bisa memakai Play Billing). Teks UI netral (larangan mengarahkan ke metode bayar lain terverifikasi dari teks resmi 5 Nov 2026; sisanya: bagian 14).
- Prasyarat di luar kode: profil pembayaran/merchant Play Console, produk dibuat di Console, penguji lisensi, dan aplikasi sudah diunggah ke track pengujian.
- Pengujian membutuhkan build yang diunggah ke Play (internal testing); build dan unggah dilakukan pengguna.

## 12. Evaluasi angka (belum dijadwalkan)

Usulan pemicu, bukan tanggal: tinjau setelah iklan tayang sekitar 30 hari **dan** ada minimal beberapa ratus tontonan hadiah. Bahan: eCPM nyata dari AdMob, rata-rata tontonan per pengguna per hari, rasio pengguna Free yang menyentuh langit-langit, jumlah ringkasan AI yang dibuat dari hadiah beserta biayanya, dan apakah ada penurunan minat berlangganan Pro.

## 10. Risiko

- Mengunggah build ber-AdMob selama closed testing bertentangan dengan deklarasi dan dapat memicu tinjau ulang.
- Hadiah tanpa SSV mudah dipalsukan.
- Hadiah permanen atau tanpa langit-langit membuat batas Free tidak berarti.
- Menyamarkan iklan sebagai postingan asli melanggar kebijakan Google.
