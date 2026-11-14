# Star Tahap 0: Daftar Kerja Nonkode (sebelum Play Billing)

> **Status (14 Nov 2026): DIMULAI.** Keputusan pengguna 14 Nov 2026: **jual Star atas nama pribadi dulu** (akun developer Play Console berjenis **personal/individu**); badan usaha menyusul. Bagian dari `STARS_PAID_GROUPS.md` (V2 Tahap 2); Tahap 2b (Play Billing) dan rilis Star ke pengguna **menunggu seluruh gerbang di bagian 4**. Prinsip, risiko, dan fakta kebijakan Play: `ADS_AND_REWARDS_PLAN.md` bagian 14.
> Dokumen ini bukan nasihat hukum atau pajak. Butir bertanda **(verifikasi)** adalah dugaan yang harus dipastikan dari sumber resmi atau konsultan.

## 1. Fakta yang sudah diperiksa (14 Nov 2026, Bantuan Google Play)

- **Jenis profil pembayaran (individu/organisasi) dan negaranya tidak bisa diubah** setelah profil dibuat. Profil organisasi butuh nomor D-U-N-S, dan nama/alamatnya harus sama dengan data Dun & Bradstreet. Akun developer individu bisa dikonversi menjadi organisasi, tetapi tidak sebaliknya. Laporan forum (bukan sumber resmi): pindah dari individu ke organisasi untuk pembayaran bisa berarti membuat profil pembayaran baru.
- Akun personal dan organisasi punya fungsi yang sama dan sama-sama bisa memonetisasi lewat profil pembayaran.
- **Financial features declaration wajib untuk semua aplikasi** di track mana pun (termasuk Internal/Closed testing); aplikasi tanpa fitur keuangan tetap mengisi "tidak menyediakan fitur keuangan". Diisi di Play Console > Kebijakan > Konten aplikasi dan ditinjau Google.
- Dari riset 5 Nov 2026 (rencana bagian 14): menjual Star wajib Play Billing; mata uang virtual terkunci ke satu aplikasi; dilarang mengarahkan ke metode bayar lain; Indonesia belum masuk program billing choice; potongan 15% (sampai USD 1 juta/tahun) hingga 30%; pencairan ke kreator tidak diatur kebijakan Play.

Sumber: support.google.com/googleplay/android-developer/answer/13634885, /answer/13628312, /answer/13849271; support.google.com/paymentscenter/answer/9028746.

## 2. Konsekuensi memilih "atas nama pribadi dulu"

- Uang penjualan Star masuk ke rekening pribadi dan menjadi **penghasilan pribadi** pemilik akun; bagian kreator dibayar dari rekening pribadi itu (pembayaran manual, Tahap 3).
- Profil pembayaran individu terkunci jenisnya. Saat badan usaha dibuat nanti, kemungkinan perlu profil pembayaran baru, dan pemindahan aplikasi/penghasilan perlu direncanakan (tanyakan ke dukungan Play, butir 3.B3).
- Perjanjian dengan kreator ditandatangani atas nama pribadi; tanggung jawab tidak terpisah dari harta pribadi.

## 3. Daftar kerja (urut; P = pengguna, AI = bisa dibantu AI)

### A. Play Console: profil pembayaran (P)
1. Cek apakah profil pembayaran sudah ada: Play Console > Pengaturan > Profil pembayaran. Bila belum, buat **jenis individu, negara Indonesia**, sama persis dengan identitas akun developer.
2. Lengkapi rekening bank (atas nama yang sama), informasi pajak, dan verifikasi identitas yang diminta Google.
3. Catat di `docs/OPERATIONS.md` (tanpa nomor rekening/identitas): tanggal aktif, jenis profil, mata uang pembayaran.
4. Setelah aktif, Play Console mengizinkan membuat produk dalam aplikasi; **jangan membuat produk Star dulu** sampai gerbang bagian 4 lengkap.

### B. Pertanyaan ke dukungan Play (P kirim; AI bisa menyusun draf)
1. Bolehkah pengguna membayar akses ke grup privat **buatan pengguna lain** dengan mata uang virtual yang dibeli lewat Play Billing, lalu sebagian nilainya dibagikan ke pembuat grup di luar Google (pembayaran manual)?
2. Apakah ada persyaratan tambahan untuk konten/akses digital yang dijual kreator (mis. kebijakan "konten buatan pengguna" atau program kreator)?
3. Bila kelak pindah ke badan usaha: bagaimana memindahkan aplikasi berbayar dan profil pembayaran tanpa memutus pembelian dan langganan yang ada?

### C. Konsultasi hukum dan pajak (P; AI bisa menyusun brief bila diminta)
1. **Mata uang virtual tertutup:** apakah Star (dibeli lewat Google, hanya bisa dibelanjakan di Wuzz Chat, tidak bisa ditransfer atau ditarik) termasuk uang elektronik atau layanan sistem pembayaran yang perlu izin BI/OJK? **(verifikasi)**
2. **Bagi hasil ke kreator:** apakah membayar kreator berdasarkan perjanjian bagi hasil (bukan "menukar Star jadi uang") aman dilakukan perorangan, dan perjanjian seperti apa yang dibutuhkan?
3. **Pajak penjual perorangan:** PPh atas penghasilan dari Google (tarif, kewajiban NPWP, pencatatan); siapa yang memungut PPN atas penjualan lewat Google Play di Indonesia **(verifikasi: dugaan Google sebagai pemungut PPN PMSE)**; apakah pembayaran ke kreator menimbulkan kewajiban potong pajak.
4. **Perlindungan konsumen dan refund:** kebijakan refund yang wajib, isi syarat layanan Star, penanganan grup berbayar yang dihapus atau bermasalah.
5. **Data pribadi (UU PDP):** catatan keuangan dipertahankan saat akun dihapus (`STARS_WALLET.md` aturan 12, keputusan K1).
6. **Kapan wajib berbadan usaha:** batas omzet atau kondisi yang membuat perorangan tidak lagi memadai.

### D. Keputusan produk (P, AI membantu menghitung)
1. Harga paket Star dalam rupiah mengikuti tingkat harga Play, lalu sesuaikan `star_value_minor` (kini Rp100/Star, sementara).
2. Persentase platform (kini 20%, sementara), masa tahan (kini 14 hari), batas harga grup (kini 10-5.000 Star).
3. Syarat mitra kreator: siapa yang boleh, verifikasi identitas dan rekening kreator, minimum pembayaran, jadwal pembayaran manual.
4. Ambang "penyesuaian besar" yang butuh persetujuan kedua (rencana bagian 14, keputusan terbuka 7).

### E. Dokumen untuk pengguna (P memutuskan; AI bisa menyusun draf setelah C selesai)
1. Syarat layanan: bagian Star (tidak bisa ditransfer/ditarik, refund, grup berbayar).
2. Kebijakan privasi: data transaksi dan riwayat Star, masa simpan.
3. Perjanjian mitra kreator (bagi hasil, jadwal, pajak, penghentian).

### F. Deklarasi Play (P mengisi; AI bisa menyusun isian)
1. **Financial features declaration:** tentukan apakah fitur Star termasuk salah satu kategori fitur keuangan; perbarui sebelum build ber-Star masuk track mana pun.
2. **Data Safety:** tambah riwayat pembelian/transaksi (gerbang rilis di `docs/OPERATIONS.md`).

## 4. Gerbang sebelum Tahap 2b dan rilis Star

Tahap 2b (produk Star di Play, library billing, verifikasi pembelian server) baru dimulai bila **semua** ini terpenuhi:
- [ ] A: profil pembayaran individu aktif dan terverifikasi. *(Profil dibuat dan pendaftaran 15% selesai 14 Nov 2026; rekening bank belum ditambahkan.)*
- [ ] B1-B2: jawaban dukungan Play tidak melarang model grup berbayar.
- [ ] C1-C3: hasil konsultasi tertulis tidak mewajibkan izin yang belum dimiliki.
- [ ] D1-D2: harga paket dan persentase diputuskan.
- [ ] E1-E3 siap terbit sebelum rilis (boleh paralel dengan 2b).
- [ ] F1-F2 diperbarui sebelum build ber-Star masuk track Play mana pun.

## 5. Catatan kemajuan

- 14 Nov 2026: Tahap 0 dimulai; diputuskan menjual atas nama pribadi dulu; akun developer berjenis personal.
- 14 Nov 2026 (A1, sebagian): profil pembayaran Play **dibuat**, jenis individu, negara Indonesia, atas nama sah pemilik akun. Profil penjual publik memakai nama merek "WuzzChat", situs `https://chat.wuzzhub.id`, email dukungan `support@semanticdigital.id`, nama di tagihan kartu "WUZZCHAT"; alamat publik wajib diisi (diisi pengguna). Account group "WuzzHub" dibuat (akun ini Primary, tidak ada akun terkait) dan **pendaftaran tarif layanan 15% diterima** (banner hilang; pastikan email konfirmasi Google).
- **Belum (A2):** rekening bank. Metode pembayaran untuk Indonesia hanya "wire transfer" (SWIFT); pakai bank yang menerima transfer internasional masuk (bank digital belum tentu), nama pemilik rekening sama persis dengan profil. Ditunda pengguna 14 Nov 2026; pendapatan ditahan sampai rekening ada. Wajib terpasang dan terverifikasi sebelum Star dirilis.
- **Belum:** "app-level trader status declaration" (status pedagang UE) muncul di dashboard Play. Bila tergolong trader, nama, alamat, telepon, email ditampilkan publik untuk pengguna UE; putuskan setelah cek negara distribusi dan ketentuan resmi. Jangan diisi asal.
- **Untuk D1 (harga):** artikel resmi tarif 15% berasal dari 2021; halaman Google yang lebih baru menyebut struktur lain (mis. 10% untuk pemasangan baru di program Apps & Games, tarif bergantung pada pemasangan baru atau lama). Periksa ulang dari support.google.com/googleplay/android-developer/answer/16954621 sebelum menetapkan `store_fee_pct`.
