# Perjanjian Mitra Kreator WuzzChat (Draf)

> **Salinan repo.** Versi yang diedit bersama (dan dibagikan ke kreator/konsultan) ada di Claude Docs milik pengguna: https://claude.ai/artifact/72wjBSGgP6ws2E9vkYNQsn (privat). Disalin 21 Nov 2026 (revisi dokumen 16). Bila keduanya berbeda, **Claude Docs yang terbaru**; perbarui salinan ini setiap kali isi pasal berubah. Konteks: `../STARS_STAGE0.md` bagian E3, aturan aplikasi `docs/domains/STARS_WALLET.md`.

## Catatan draf (hapus sebelum ditandatangani)

Draf ini belum final dan **bukan nasihat hukum atau pajak**. Sebaiknya dibaca konsultan bersama pertanyaan C1-C3 di `STARS_STAGE0.md` sebelum dipakai untuk kreator selain pemilik akun.

- Isian dalam kurung siku, misalnya **[Nama Lengkap Pengelola]**, wajib diganti.
- Angka sudah **final** (diputuskan 21 Nov 2026) dan dipakai di pasal-pasal: 1 Star = Rp100, potongan toko 15%, bagian platform 20%, masa tahan 14 hari, harga grup 10-1.000 Star. PPN Google Play 11% dibayar pembeli di atas harga, sehingga tidak mengurangi Nilai Kotor.
- Perjanjian dibuat atas nama **pribadi** pemilik akun Play, karena akun developer dan profil pembayaran berjenis individu. Bila nanti ada badan usaha, perjanjian perlu dialihkan atau dibuat ulang.
- Isinya mengikuti aturan yang sudah berjalan di aplikasi: `docs/domains/STARS_WALLET.md` aturan 5-10 dan 15, serta `/terms` bagian 5a.
- Pertanyaan terbuka: minimum pencairan, jadwal pembayaran, dan biaya transfer ditanggung siapa (Pasal 4); apakah perlu meterai (Pasal 10).

## Pasal 1. Para pihak dan definisi

Perjanjian ini dibuat pada tanggal **[tanggal]** antara:

1. **[Nama Lengkap Pengelola]**, perorangan, beralamat di **[alamat]**, selaku pengelola aplikasi WuzzChat (paket `com.wuzzchat.mobile`) dan pemilik akun developer Google Play-nya, selanjutnya disebut **Pengelola**; dan
2. **[Nama Lengkap Kreator]**, nomor identitas (KTP) **[nomor]**, beralamat di **[alamat]**, pemilik akun WuzzChat **@[username]**, selanjutnya disebut **Kreator**.

Dalam perjanjian ini:

- **Star**: satuan digital di WuzzChat yang dibeli pengguna lewat Google Play. Star hanya bisa dibelanjakan di WuzzChat, tidak bisa ditransfer, ditukar dengan uang, atau ditarik.
- **Grup Berbayar**: grup privat yang dibuat Kreator dan diaktifkan sebagai grup berbayar. Pengguna membayar sejumlah Star sekali untuk masuk.
- **Nilai Kotor**: harga akses dalam Star dikali nilai 1 Star dalam rupiah yang berlaku saat pembayaran.
- **Potongan Toko**: persentase yang diperhitungkan sebagai biaya Google Play.
- **Bagian Platform**: persentase yang menjadi hak Pengelola.
- **Bagi Hasil Kreator**: bagian Nilai Kotor yang menjadi hak Kreator setelah dikurangi Potongan Toko dan Bagian Platform (Pasal 4).
- **Masa Tahan**: jangka waktu sejak pembayaran akses sebelum Bagi Hasil Kreator boleh dibayarkan.
- **Panel Admin**: halaman pengelolaan WuzzChat yang mencatat setiap pembayaran akses dan Bagi Hasil Kreator.

## Pasal 2. Pendaftaran dan status mitra kreator

Status mitra kreator berlaku sejak Pengelola menyetujuinya di Panel Admin, setelah perjanjian ini ditandatangani kedua pihak.

1. Pendaftaran lewat "Daftar menjadi Creator" di aplikasi hanya permohonan. Pengelola bebas menerima atau menolaknya tanpa wajib memberi alasan.
2. Sebelum disetujui, Kreator menyerahkan: nama sesuai KTP, salinan KTP, NPWP bila ada, dan rekening bank **atas nama Kreator sendiri**. Pengelola boleh meminta verifikasi tambahan.
3. Kreator berusia minimal **18 tahun** dan cakap secara hukum.
4. Status mitra tidak dapat dialihkan. Satu orang hanya boleh memegang satu akun mitra.
5. Kreator wajib memberi tahu Pengelola paling lambat **7 hari** setelah data identitas atau rekeningnya berubah. Pembayaran ke rekening lama sebelum pemberitahuan dianggap sah.

## Pasal 3. Grup berbayar dan harga

Kreator menetapkan sendiri harga akses grupnya dalam Star, di dalam rentang yang ditetapkan Pengelola: saat ini **10-1.000 Star**.

1. Hanya grup **privat** yang dibuat Kreator sendiri yang bisa dijadikan berbayar. Grup berbayar tidak bisa dijadikan publik.
2. Pembayaran akses berlaku sekali. Anggota yang keluar atau dikeluarkan lalu masuk lagi membayar lagi.
3. Mengubah harga atau status berbayar membuat tautan undangan lama berhenti berlaku. Perubahan harga hanya berlaku untuk pembayaran berikutnya.
4. Kreator tidak boleh meminta atau menerima pembayaran akses grup **di luar aplikasi** (transfer, dompet digital, pulsa, atau cara lain), dan tidak boleh menyebut cara bayar lain di grup maupun di profilnya. Larangan ini mengikuti kebijakan pembayaran Google Play.
5. Kreator tidak boleh menjanjikan imbal hasil uang, hadiah uang, atau penukaran Star kepada anggota.
6. Pengelola dapat mengubah rentang harga atau nilai 1 Star dengan pemberitahuan paling lambat **14 hari** sebelumnya. Perubahan tidak berlaku surut.

## Pasal 4. Bagi hasil, masa tahan, dan pencairan

Kreator berhak atas Nilai Kotor setelah dikurangi Potongan Toko lalu Bagian Platform, dibayar dalam rupiah ke rekening Kreator setiap bulan.

```latex
\text{Bagi Hasil} = \text{harga (Star)} \times \text{nilai 1 Star} \times (1 - \text{Potongan Toko}) \times (1 - \text{Bagian Platform})
```

Hasilnya dibulatkan ke bawah ke rupiah penuh. Angka yang dipakai adalah angka yang berlaku **saat pembayaran akses terjadi**, sebagaimana tercatat di Panel Admin.

| Contoh: akses 100 Star | Rupiah |
| --- | --- |
| Nilai Kotor (100 × Rp100) | 10.000 |
| Potongan Toko 15% | −1.500 |
| Bagian Platform 20% dari sisa | −1.700 |
| **Bagi Hasil Kreator** | **6.800** |

1. **Masa tahan:** Bagi Hasil baru dapat dibayar **14 hari** setelah pembayaran akses, dan setelah Google Play membayarkan pendapatan bulan bersangkutan kepada Pengelola.
2. **Jadwal:** Pengelola membayar Bagi Hasil yang sudah lewat Masa Tahan paling lambat tanggal **[15]** setiap bulan, beserta rincian per grup.
3. **Minimum:** bila total di bawah **Rp[50.000]**, pembayaran digabung ke bulan berikutnya.
4. **Biaya transfer** ditanggung **[Pengelola / Kreator]**.
5. Bagi Hasil dibayar Pengelola dari pendapatannya sendiri berdasarkan perjanjian ini. Kreator tidak memegang saldo Star dan tidak ada fitur penarikan di aplikasi.
6. Kreator boleh meminta rincian transaksi grupnya. Keberatan atas rincian diajukan paling lambat **30 hari** setelah pembayaran diterima; lewat dari itu rincian dianggap disetujui.

## Pasal 5. Refund, pembalikan, dan koreksi

Bagi Hasil atas pembayaran akses yang di-refund batal dan tidak dibayarkan kepada Kreator.

1. Pengelola mengembalikan Star kepada anggota bila, **dalam 7 hari** setelah membayar, (a) grup dihapus, (b) anggota dikeluarkan bukan karena melanggar aturan, atau (c) akses grup tidak berfungsi, sesuai Syarat Layanan WuzzChat bagian 5a. Keputusan refund ada pada Pengelola.
2. Bila refund terjadi setelah Bagi Hasil terlanjur dibayar, jumlahnya **dipotong dari pembayaran berikutnya**.
3. Bila Google membatalkan atau mengembalikan dana pembelian Star yang lalu dibelanjakan di grup Kreator, Pengelola boleh menahan atau memotong Bagi Hasil terkait dari pembayaran berikutnya.
4. Bila status mitra berakhir sementara masih ada potongan yang belum tertutup, Kreator wajib mengembalikannya paling lambat **30 hari** setelah ditagih tertulis.
5. Kesalahan perhitungan di pihak mana pun dikoreksi pada pembayaran berikutnya, dengan rincian yang ditunjukkan kepada Kreator.

## Pasal 6. Kewajiban kreator dan aturan konten

Kreator bertanggung jawab penuh atas isi grup berbayarnya dan wajib mematuhi Syarat Layanan WuzzChat serta hukum Indonesia.

1. Kreator menjelaskan isi grup dengan jujur di nama dan deskripsi grup. Kreator tidak boleh menjanjikan sesuatu yang tidak diberikan.
2. Dilarang di grup berbayar: pornografi dan konten seksual, judi, investasi bodong atau skema cepat kaya, penipuan, penjualan barang ilegal, ujaran kebencian, serta konten yang melanggar hak cipta atau hak orang lain.
3. Kreator wajib menindak laporan anggota dan bekerja sama dengan moderasi WuzzChat, termasuk menghapus konten bila diminta.
4. Kreator tidak boleh menggunakan akun palsu, membeli akses grupnya sendiri, atau mengatur pembelian untuk menaikkan Bagi Hasil.
5. Kreator tetap memegang hak atas kontennya dan memberi Pengelola izin terbatas untuk menyimpan dan menampilkannya di WuzzChat sejauh diperlukan untuk menjalankan grup.
6. Kreator tidak boleh menyatakan diri sebagai karyawan, wakil, atau mitra resmi Pengelola di luar perjanjian ini. Hubungan para pihak adalah kemitraan bagi hasil, **bukan hubungan kerja**.

## Pasal 7. Pajak

Setiap pihak menanggung dan melaporkan sendiri pajak atas penghasilannya dari perjanjian ini.

1. Bila peraturan perpajakan mewajibkan Pengelola memotong pajak atas Bagi Hasil, Pengelola memotongnya dan memberikan bukti potong kepada Kreator.
2. Kreator menyerahkan NPWP atau NIK yang sudah dipadankan bila diminta untuk keperluan pajak.
3. Pengelola menyimpan catatan pembayaran Bagi Hasil selama **10 tahun** sebagai dokumen pajak.

*Catatan draf: ketentuan potong pajak menunggu jawaban konsultan (C3). Pasal ini sengaja tidak menyebut jenis atau tarif pajak.*

## Pasal 8. Data pribadi

Kreator hanya boleh memakai data anggota grup untuk menjalankan grup itu di dalam WuzzChat.

1. Kreator tidak boleh menyalin, menjual, atau membagikan data anggota (nama, username, nomor, isi pesan) ke luar WuzzChat, dan tidak boleh memakainya untuk promosi di luar grup tanpa izin anggota.
2. Rincian transaksi yang diberikan Pengelola kepada Kreator hanya memuat data yang perlu untuk mencocokkan pembayaran.
3. Pengelola memproses data identitas dan rekening Kreator hanya untuk perjanjian ini dan kewajiban pajak, sesuai Kebijakan Privasi WuzzChat dan UU Pelindungan Data Pribadi.

## Pasal 9. Penangguhan dan pengakhiran

Perjanjian berlaku **1 tahun** sejak ditandatangani dan diperpanjang otomatis untuk 1 tahun berikutnya, kecuali salah satu pihak mengakhirinya.

1. Masing-masing pihak boleh mengakhiri perjanjian dengan pemberitahuan tertulis (termasuk email) paling lambat **30 hari** sebelumnya.
2. Pengelola boleh **langsung** mencabut status mitra, menonaktifkan grup berbayar, dan menahan Bagi Hasil yang belum dibayar bila Kreator melanggar Pasal 3 ayat 4-5, Pasal 6, atau Pasal 8, atau bila diminta Google atau aparat berwenang.
3. Bagi Hasil yang ditahan karena pelanggaran dipakai lebih dulu untuk menutup refund dan kerugian akibat pelanggaran itu. Sisanya dibayarkan setelah pemeriksaan selesai, paling lama **90 hari**.
4. Bila perjanjian berakhir bukan karena pelanggaran, Bagi Hasil yang tersisa dibayar pada jadwal berikutnya setelah Masa Tahan dan refund terkait selesai.
5. Setelah status mitra dicabut, grup tetap ada sebagai grup privat biasa. Anggota yang sudah membayar tetap menjadi anggota, tetapi grup tidak lagi menerima pembayaran.
6. Bila Pengelola menghentikan fitur Star atau grup berbayar, perjanjian berakhir pada tanggal penghentian. Bagi Hasil yang sudah menjadi hak Kreator tetap dibayar sesuai ayat 4.

## Pasal 10. Ketentuan lain dan tanda tangan

Perjanjian ini tunduk pada hukum Republik Indonesia.

1. **Batas tanggung jawab:** Pengelola tidak menjamin WuzzChat selalu tersedia atau grup Kreator menghasilkan pendapatan tertentu. Tanggung jawab Pengelola paling besar senilai Bagi Hasil yang sudah menjadi hak Kreator tetapi belum dibayar.
2. **Ganti rugi:** Kreator menanggung tuntutan pihak ketiga yang timbul dari isi grup atau pelanggaran Kreator terhadap perjanjian ini.
3. **Keadaan kahar:** pihak yang terhalang oleh bencana, gangguan layanan Google, atau keputusan pemerintah tidak dianggap lalai selama halangan itu berlangsung.
4. **Perubahan:** Pengelola dapat mengubah perjanjian dengan pemberitahuan tertulis paling lambat **14 hari** sebelumnya. Kreator yang tidak setuju boleh mengakhiri perjanjian sebelum perubahan berlaku tanpa kehilangan Bagi Hasil yang sudah menjadi haknya.
5. **Sengketa:** diselesaikan dengan musyawarah dalam **30 hari**. Bila gagal, diselesaikan di Pengadilan Negeri **[kota]**.
6. **Pemberitahuan** dikirim ke email Pengelola **support@semanticdigital.id** dan email Kreator **[email]**.
7. **Bentuk:** perjanjian ini sah ditandatangani secara elektronik atau dibuat rangkap dua di atas kertas bermeterai, masing-masing berkekuatan hukum sama.

| | Pengelola | Kreator |
| --- | --- | --- |
| Nama | [Nama Lengkap Pengelola] | [Nama Lengkap Kreator] |
| Tanda tangan | | |
| Tanggal | | |
