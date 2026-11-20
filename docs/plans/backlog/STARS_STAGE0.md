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

### B. Pertanyaan ke dukungan Play (P kirim; draf siap di Lampiran B)
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

> **Keputusan pengguna 21 Nov 2026 (D1-D2): angka FINAL.** 1 Star = Rp100; paket 50/100/500 Star = Rp5.000/10.000/50.000 tanpa diskon (bagian kreator dihitung dari satu nilai per Star, diskon paket akan ditanggung platform); potongan toko 15% (AI asisten Play + order nyata: diterima 85% harga daftar, PPN 11% ditambahkan di atas harga dan dibayar pembeli); platform 20%; masa tahan 14 hari; **harga grup 10-1.000 Star** (turun dari 5.000 karena paket terbesar 500; bila perlu grup lebih mahal, tambah produk `star_1000` dulu). Per Rp10.000: Google 1.500, platform 1.700, kreator 6.800. `group_price_max`=1000 **sudah diubah pengguna di `/admin/stars` 21 Nov 2026**. Harga produk di Play Console tidak berubah.
3. Syarat mitra kreator: siapa yang boleh, verifikasi identitas dan rekening kreator, minimum pembayaran, jadwal pembayaran manual.
4. Ambang "penyesuaian besar" yang butuh persetujuan kedua (rencana bagian 14, keputusan terbuka 7).

### E. Dokumen untuk pengguna (P memutuskan; AI bisa menyusun draf setelah C selesai)
> 15 Nov 2026: **teks E1-E2 sudah ditulis** di halaman `/terms` (5a), `/privacy`, `/delete-account` (**tayang 15 Nov 2026**; rincian `docs/PLAY_STORE_LISTING.md` 2.6), dengan keputusan pengguna K9 (saldo hangus + konfirmasi di aplikasi), K10 (catatan keuangan 10 tahun), K11 (refund akses grup 7 hari, manual) di `STARS_PAID_GROUPS.md`; klaim "Star bukan uang elektronik" sengaja tidak ditulis. Konsultan tetap dibutuhkan untuk C1-C3, dan sebaiknya ikut membaca teks ini. E3 (perjanjian mitra kreator): **draf dibuat 21 Nov 2026** di Claude Docs "Perjanjian Mitra Kreator WuzzChat (Draf)" (https://claude.ai/artifact/72wjBSGgP6ws2E9vkYNQsn, privat milik pengguna); belum final, belum dibaca konsultan, isian kurung siku dan angka sementara belum diisi.
1. Syarat layanan: bagian Star (tidak bisa ditransfer/ditarik, refund, grup berbayar).
2. Kebijakan privasi: data transaksi dan riwayat Star, masa simpan.
3. Perjanjian mitra kreator (bagi hasil, jadwal, pajak, penghentian).

### F. Deklarasi Play (P mengisi; isian usulan siap di `docs/PLAY_STORE_LISTING.md` bagian 2.6)
> 15 Nov 2026: **F1 dan F2 selesai** (Data Safety dipublikasikan; Financial features tetap "tidak ada"; IARC pembelian digital Ya dikirim). Hasil: `PLAY_STORE_LISTING.md` 2.6 "Hasil pengisian Console".
1. **Financial features declaration:** tentukan apakah fitur Star termasuk salah satu kategori fitur keuangan; perbarui sebelum build ber-Star masuk track mana pun.
2. **Data Safety:** tambah riwayat pembelian/transaksi (gerbang rilis di `docs/OPERATIONS.md`).

## 4. Gerbang sebelum Tahap 2b dan rilis Star

> **Keputusan pengguna 15 Nov 2026: buka pembelian Star untuk semua pengguna TANPA menunggu B1-B2 dan C1-C3** (risiko diterima secara sadar oleh pemilik akun: penolakan/penangguhan Play bila model grup berbayar dinilai melanggar, serta risiko izin BI/OJK dan pajak penghasilan pribadi). B dan C tetap dikerjakan setelah Star live. Cakupan: semua pengguna boleh membeli Star dan membayar akses grup berbayar; **membuat grup berbayar tetap khusus mitra kreator** pilihan admin, dengan tombol "Daftar menjadi Creator" (`STARS_WALLET.md` aturan 6a). E3 (perjanjian mitra kreator) wajib disepakati **sebelum** menyetujui kreator selain pemilik akun.
> **Gerbang yang tetap wajib sebelum sakelar dinyalakan:** A2 rekening bank terpasang; ~~D1-D2 harga paket di Play Console dan `star_settings` final~~ (diputuskan dan diterapkan 21 Nov 2026); ~~build 78+ (peringatan saldo saat hapus akun, tombol Creator) tayang di Produksi lalu `MIN_MOBILE_BUILD=78`~~ (selesai 21 Nov 2026); kode "Daftar menjadi Creator" dan daftar pembelian admin dideploy. Urutan menyalakan: `docs/OPERATIONS.md` bagian Star.

Tahap 2b (produk Star di Play, library billing, verifikasi pembelian server) baru dimulai bila **semua** ini terpenuhi:
- [ ] A: profil pembayaran individu aktif dan terverifikasi. *(Profil dibuat dan pendaftaran 15% selesai 14 Nov 2026; rekening bank belum ditambahkan.)*
- [ ] B1-B2: jawaban dukungan Play tidak melarang model grup berbayar.
- [ ] C1-C3: hasil konsultasi tertulis tidak mewajibkan izin yang belum dimiliki.
- [x] D1-D2: harga paket dan persentase diputuskan. *(21 Nov 2026; `group_price_max`=1000 sudah diterapkan)*
- [ ] E1-E3 siap terbit sebelum rilis (boleh paralel dengan 2b).
- [x] F1-F2 diperbarui sebelum build ber-Star masuk track Play mana pun. *(15 Nov 2026)*

## 5. Catatan kemajuan

- 14 Nov 2026: Tahap 0 dimulai; diputuskan menjual atas nama pribadi dulu; akun developer berjenis personal.
- 14 Nov 2026 (A1, sebagian): profil pembayaran Play **dibuat**, jenis individu, negara Indonesia, atas nama sah pemilik akun. Profil penjual publik memakai nama merek "WuzzChat", situs `https://chat.wuzzhub.id`, email dukungan `support@semanticdigital.id`, nama di tagihan kartu "WUZZCHAT"; alamat publik wajib diisi (diisi pengguna). Account group "WuzzHub" dibuat (akun ini Primary, tidak ada akun terkait) dan **pendaftaran tarif layanan 15% diterima** (banner hilang; pastikan email konfirmasi Google).
- **Belum (A2):** rekening bank. Metode pembayaran untuk Indonesia hanya "wire transfer" (SWIFT); pakai bank yang menerima transfer internasional masuk (bank digital belum tentu), nama pemilik rekening sama persis dengan profil. Ditunda pengguna 14 Nov 2026; pendapatan ditahan sampai rekening ada. Wajib terpasang dan terverifikasi sebelum Star dirilis.
- **Belum:** "app-level trader status declaration" (status pedagang UE) muncul di dashboard Play. Bila tergolong trader, nama, alamat, telepon, email ditampilkan publik untuk pengguna UE; putuskan setelah cek negara distribusi dan ketentuan resmi. Jangan diisi asal.
- 14-15 Nov 2026 (persiapan 2b, sisi Play): build 1.45.0 (77) ber-billing di **Internal testing** saja (lalu dikirim ke Produksi 15 Nov 2026 setelah E dan F1-F2 selesai, sakelar tetap mati); produk `star_50`/`star_100`/`star_500` aktif, hanya Indonesia, harga sementara Rp5.000/10.000/50.000; daftar penguji lisensi `Penguji Star` (hanya akun pemilik). Uji pembelian nyata lolos (`STARS_PLAY_BILLING.md` 12d); semua sakelar Star dimatikan lagi.
- 15 Nov 2026: teks Star `/privacy` `/terms` `/delete-account` tayang; Data Safety (plus 4 kategori lama yang ternyata kurang) dipublikasikan; IARC pembelian digital Ya dikirim (Brasil naik ke 14+); Financial features dicek, tetap "tidak ada". Trader status UE tingkat aplikasi masih kosong (isu quick checks dilewati).
- **Untuk C (pajak):** dialog pembelian Play menulis "+ tax" sedangkan Console menulis "No VAT" untuk Indonesia. Tanyakan apakah harga sudah termasuk PPN dan siapa yang menyetor. **Terjawab 21 Nov 2026 dari Order management** (pembelian nyata 15 Nov, `star_50`): List price IDR 5.000, Tax IDR 550 (11%), Total IDR 5.550 dibayar pembeli, Estimated revenue USD 0,23. Artinya **pajak ditambahkan di atas harga dan ditanggung pembeli** (dipungut Google), dan yang diterima pengembang = 85% dari harga daftar (USD 0,23 ≈ Rp4.250 pada kurs tersirat ±Rp18.500/USD dari laporan yang sama). Rumus `creator_earnings` (gross = harga × `star_value_minor`, lalu potongan toko 15%) sudah sesuai. Pendapatan dilaporkan dalam USD: ada risiko selisih kurs saat membayar kreator dalam rupiah.
- **Untuk D1 (harga):** artikel resmi tarif 15% berasal dari 2021; halaman Google yang lebih baru menyebut struktur lain (mis. 10% untuk pemasangan baru di program Apps & Games, tarif bergantung pada pemasangan baru atau lama). Periksa ulang dari support.google.com/googleplay/android-developer/answer/16954621 sebelum menetapkan `store_fee_pct`. **21 Nov 2026:** AI asisten Play menyebut 15% rata untuk Indonesia (Lampiran B, jawaban 5); tunggu konfirmasi peninjau manusia.

## Lampiran B. Draf pertanyaan ke dukungan Play (disusun 14 Nov 2026, diperbarui 21 Nov 2026 setelah Star live; BELUM dikirim)

Kirim lewat Play Console > Help (?) > Contact support, topik terdekat *Policy* atau *Monetization/Payments*. Jangan menambahkan data pribadi; tiket sudah terkait akun. Setelah dikirim, catat tanggal dan nomor tiket di bawah, lalu jawaban Google per nomor pertanyaan.

> **Subject:** Policy confirmation: in-app currency used to pay for access to creator-run private groups (com.wuzzchat.mobile)
>
> Hello Google Play team,
>
> We publish **WuzzChat** (package `com.wuzzchat.mobile`), a messaging app with private and public groups, available in production. Version 1.46.0 (versionCode 78) includes an in-app currency called "Star". We would like to confirm that the model below complies with Google Play policies, and adjust it if needed.
>
> **Current model**
> 1. Users buy Stars **only through Google Play Billing** (consumable in-app products `star_50`, `star_100`, `star_500`, available in Indonesia). No other payment method is offered, linked or mentioned in the app.
> 2. Stars can **only be spent inside WuzzChat**. They cannot be transferred between users, withdrawn or exchanged for money.
> 3. A small number of **approved creators** (users can apply in the app; we review and approve each one manually) can mark a *private* group they created as paid. Other users pay a one-time price in Stars to join, which gives access to the group's chat messages and media for as long as they remain a member.
> 4. We intend to share part of the value with creators **outside the app**: under a written agreement, we pay creators by bank transfer from our own earnings, only after Google has paid us and after a holding period. The app has no cash-out or withdrawal feature, and creators do not hold a Star balance from these payments.
> 5. Refunds of Stars for group access are reviewed manually by our staff. When Google refunds or voids a Star purchase, we remove those Stars from the user's balance.
>
> **Questions**
> 1. Is it allowed under Google Play policies for users to pay, with an in-app currency bought through Play Billing, for access to a private group **created and run by another user** (a creator), where the content is chat messages and media posted in that group?
> 2. Is sharing part of the revenue with those creators **outside the app** (manual bank transfers under a written agreement, not an in-app cash-out feature) compatible with the Payments policy? Are there any disclosure requirements towards users or creators?
> 3. Which category, if any, should we select in the **Financial features declaration** for this feature? We currently declare that the app has no financial features.
> 4. Our developer account and payments profile are registered as an **individual** in Indonesia. If we later form a company, what is the recommended way to move the app and its in-app revenue to an organization account and a new payments profile without interrupting existing purchases?
> 5. We are enrolled in the 15% service fee tier. Could you confirm which service fee applies to **consumable in-app currency** purchases in Indonesia for our app (including any difference between new and existing installs)?
>
> Thank you. We can provide screenshots, a screen recording or test access if helpful.

Pemetaan ke daftar kerja: pertanyaan 1-2 = B1-B2, 3 = F1, 4 = B3, 5 = D1.

**Status pengiriman:** tiket dibuat pengguna 21 Nov 2026 lewat formulir dukungan Play Console ("No, create support ticket" setelah saran AI). **Case ID 9-6163000041569**, judul "Policy compliance for in-app currency model", kategori Managing monetization, status Open. Menunggu jawaban staf Google (lewat email akun developer).

**Jawaban Google, 21 Nov 2026: rekomendasi AI asisten Play Console** (muncul saat mengirim tiket; Google sendiri menulis "may make mistakes". **Bukan jawaban resmi peninjau**, jadi belum menutup B1-B2):
1. **Grup berbayar dengan Star:** dinyatakan sesuai Payments policy (akses konten digital wajib lewat Play Billing; mata uang virtual hanya untuk aplikasi tempat dibeli). Syarat: patuhi kebijakan User Generated Content (laporan, blokir, moderasi; sudah ada sejak Okt 2026).
2. **Bagi hasil ke kreator di luar aplikasi:** tidak melanggar selama tidak ada fitur cash-out/penarikan/transfer uang antarpengguna, pengguna dan kreator tidak diarahkan membayar di luar Play Billing, dan syarat layanan serta perjanjian kreator menjelaskan Star tidak bisa ditransfer/ditarik dan aturan kompensasi kreator (sudah di `/terms` 5a dan draf E3).
3. **Financial features:** "My app doesn't provide any financial features" sudah tepat untuk mata uang virtual tertutup dan pembayaran developer ke kreator di luar platform.
4. **Pindah ke badan usaha:** akun individu bisa dikonversi langsung (Account details > About you > Change account type; butuh situs organisasi terverifikasi dan D-U-N-S; profil pembayaran organisasi baru ditautkan). Nama paket, pengguna, dan katalog produk tetap.
5. **Potongan Google:** 15% rata untuk USD 1 juta pertama per tahun per account group, 30% di atasnya; beda pemasangan baru/lama hanya di wilayah tertentu (AS, UK, EEA, Jepang, Australia), **tidak berlaku untuk Indonesia**. Cocok dengan `store_fee_pct` 15% saat ini.
