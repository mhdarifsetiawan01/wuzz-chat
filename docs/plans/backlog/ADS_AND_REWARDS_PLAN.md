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
- Pembelian hanya di Android (web tidak bisa memakai Play Billing). Teks UI netral sampai aturan Play diverifikasi dari sumber resmi.
- Prasyarat di luar kode: profil pembayaran/merchant Play Console, produk dibuat di Console, penguji lisensi, dan aplikasi sudah diunggah ke track pengujian.
- Pengujian membutuhkan build yang diunggah ke Play (internal testing); build dan unggah dilakukan pengguna.

## 12. Evaluasi angka (belum dijadwalkan)

Usulan pemicu, bukan tanggal: tinjau setelah iklan tayang sekitar 30 hari **dan** ada minimal beberapa ratus tontonan hadiah. Bahan: eCPM nyata dari AdMob, rata-rata tontonan per pengguna per hari, rasio pengguna Free yang menyentuh langit-langit, jumlah ringkasan AI yang dibuat dari hadiah beserta biayanya, dan apakah ada penurunan minat berlangganan Pro.

## 10. Risiko

- Mengunggah build ber-AdMob selama closed testing bertentangan dengan deklarasi dan dapat memicu tinjau ulang.
- Hadiah tanpa SSV mudah dipalsukan.
- Hadiah permanen atau tanpa langit-langit membuat batas Free tidak berarti.
- Menyamarkan iklan sebagai postingan asli melanggar kebijakan Google.
