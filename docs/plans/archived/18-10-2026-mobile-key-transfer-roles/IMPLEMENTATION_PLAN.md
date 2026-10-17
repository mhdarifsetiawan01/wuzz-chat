# Active Implementation Plan

## Pemisahan alur pengirim dan penerima transfer kunci E2EE mobile

- Tanggal: 18 Oktober 2026.
- Branch: `dev`.
- Status: implementasi dan gate otomatis selesai (typecheck mobile, 37/37 berkas tes mobile, build frontend, tes backend, diff check). Alur pengirim terverifikasi di HP Android 11; alur penerima dan iOS belum diuji langsung. Belum commit/push.
- Persetujuan cakupan: pengguna menyetujui pemisahan peran, perubahan nama menu, dan pengamanan fungsi impor.

### 1. Masalah dan hasil yang dituju

Modal yang sama digunakan dari Pengaturan, menu aksi Obrolan, dan dialog konflik kunci setelah login. `initialMode` hanya memilih tab awal, sehingga perangkat dengan kunci aktif juga dapat membuka tab penerimaan dan menimpa kunci lokal.

Hasil yang dituju:

| Kondisi perangkat | Tampilan | Aksi yang diizinkan |
| --- | --- | --- |
| Sesi aktif, E2EE `ready`, keypair tersedia | Transfer Kunci ke Perangkat Lain | Tampilkan QR, salin kode, buat ulang kode kedaluwarsa |
| Sesi aktif, E2EE `conflict` | Terima Kunci dari Perangkat Lain | Pindai QR atau input kode manual |
| E2EE belum siap/loading/error, keluar akun, dibekukan, atau ditangguhkan | Transfer tidak tersedia; pesan sesuai kondisi bila diperlukan | Tidak membuat atau menerima transfer |

Penerimaan ditentukan oleh kebutuhan kunci (`conflict`), bukan sekadar login baru. Login ulang dengan kunci yang cocok tetap langsung masuk tanpa penerimaan. Akun baru yang berhasil membuat kunci sendiri tidak perlu memindai QR.

### 2. Cakupan dan batas

- Ubah mobile saja; gunakan endpoint transfer, format QR, TTL, dan kriptografi yang ada.
- Ubah nama menu “Perangkat Tertaut” menjadi “Transfer Kunci ke Perangkat Lain” di Pengaturan. Selaraskan menu “Tautkan Perangkat” beserta subtitle di menu aksi Obrolan.
- Pengirim tidak memiliki tab Pindai QR/Input Kode. Penerima hanya memiliki Pindai QR/Input Kode, tanpa Bagi Kunci.
- Daftar sesi/perangkat dan aksi keluarkan perangkat menjadi pekerjaan terpisah.
- Pertahankan alur reset kunci, bukti password/Google, serta peringatan kehilangan akses pesan yang sudah ada.
- Tidak melakukan commit, push, build APK, instalasi, atau deployment pada tahap perencanaan ini.

### 3. Urutan implementasi

1. **Pisahkan peran modal secara eksplisit.**
   - Di `mobile/src/components/DeviceTransferModal.tsx`, tambahkan peran pengirim/penerima yang wajib diberikan pemanggil; bedakan peran dari pilihan tab penerima.
   - Semua hook tetap dipanggil konsisten sebelum guard tampilan.
   - Inisialisasi upload hanya pada modal pengirim yang terlihat, sesi sah, dan kunci siap. Penerima tidak boleh otomatis membuat sesi berbagi.
   - Blokir handler yang tidak sesuai peran atau status, sekalipun dipanggil tanpa melewati tampilan.

2. **Sesuaikan seluruh titik masuk dan teks.**
   - `mobile/src/screens/SettingsScreen.tsx`: pemanggil pengirim, nama/subtitle menjelaskan berbagi kunci ke perangkat lain.
   - `mobile/src/screens/RecentChatsScreen.tsx`: pemanggil pengirim dengan teks yang konsisten.
   - `mobile/App.tsx`: dialog konflik membuka penerima pada Pindai QR; Input Kode tetap alternatif.
   - `mobile/src/components/KeyConflictModal.tsx`: periksa konsistensi petunjuk dan pembatalan tanpa mengubah alur reset.
   - Judul dan petunjuk menjelaskan bahwa akun yang sama harus sudah login di perangkat penerima; QR memindahkan kunci enkripsi, bukan melakukan login.

3. **Pusatkan dan lindungi penulisan kunci.**
   - `consumeAndImportTransfer` saat ini menulis SecureStore, lalu `importTransferredKeyPair` menulis lagi. Refactor tahap consume/dekripsi agar hanya mengembalikan keypair; penulisan dilakukan satu kali melalui AuthContext.
   - Di `mobile/src/context/AuthContext.tsx`, izinkan impor hanya untuk sesi aktif yang masih membutuhkan penerimaan (`conflict`). Perangkat `ready` ditolak sebelum ada perubahan kunci.
   - Periksa kelayakan sebelum consume dan ulangi setelah operasi async sebelum menyimpan: akun, sesi, dan kebutuhan penerimaan harus masih sama. Gunakan identitas sesi/generasi operasi agar respons akun lama tidak dapat menulis ke akun baru, termasuk login ulang pada akun yang sama.
   - Cegah dua proses impor bersamaan; pembatalan, penutupan modal, logout, reset kunci, dan perubahan status membatalkan hasil operasi yang terlambat.
   - Validasi keypair hasil dekripsi sebelum menyimpan. Hanya setelah penulisan berhasil, aktifkan keypair dan lanjutkan koneksi sesuai alur sesi.
   - Consume yang sudah diterima server mungkin menghabiskan token meski pengguna membatalkan atau jaringan putus; tampilkan kegagalan yang jelas dan arahkan membuat kode baru. Jangan mencoba ulang consume tanpa batas.

4. **Rapikan lifecycle transfer yang terdampak.**
   - Batalkan timeout inisialisasi, countdown, dan pembaruan clipboard ketika modal ditutup/unmount.
   - Gunakan pembatalan request jika didukung API client; abaikan hasil async yang sudah tidak berlaku.
   - Pembukaan ulang tidak boleh menampilkan QR lama sebagai sesi baru, membuat timer ganda, atau menerapkan hasil upload/impor lama.
   - Ikuti theme dan aturan modal `mobile/DESIGN.md`; tidak memperluas pekerjaan ke desain ulang seluruh modal.

### 4. Pengujian dan kriteria penerimaan

- Pengaturan dan menu aksi Obrolan: nama konsisten, hanya pengirim, QR/salin kode/refresh TTL berfungsi.
- Login di perangkat baru dengan konflik: hanya Pindai QR/Input Kode; kedua cara menerima kunci yang sama dan melanjutkan akses aplikasi.
- Login ulang dengan kunci cocok dan pendaftaran akun baru: tidak diminta menerima transfer.
- Panggilan langsung handler/fungsi impor saat `ready` ditolak; keypair lokal dan koneksi tidak berubah.
- Logout, pergantian sesi, reset, atau penutupan modal saat upload/consume berjalan: hasil lama tidak menulis kunci atau mengaktifkan sesi kembali.
- Ketukan ganda, kode salah/kedaluwarsa/sudah dipakai, data bundle tidak valid, offline, timeout, serta kegagalan penyimpanan: pesan jelas, tidak menampilkan sukses palsu.
- Buka/tutup modal berulang: tidak ada perubahan jumlah hook atau timer yang tertinggal.
- Verifikasi tampilan terang/gelap, izin kamera ditolak, tombol Back Android, dan keyboard input manual Android/iOS; bedakan pemeriksaan kode dari pengujian perangkat yang benar-benar dilakukan.
- Tambahkan tes regresi bermakna untuk kebijakan peran/status, penolakan impor pada perangkat siap, dan hasil async dari sesi lama; gunakan pola harness mobile yang ada.
- Gate otomatis setelah implementasi: `npx tsc --noEmit` dan `npm run test:unit` di `mobile/`, `npm run build` di `frontend/`, `go test -v ./...` di `backend/`, serta `git diff --check`.

### 5. Dokumentasi dan penyelesaian

- Sinkronkan bagian transfer kunci di `docs/MOBILE_INTEGRATION_GUIDE.md` dan invarian terkait di `docs/context/MOBILE.md` bila implementasi mengubahnya.
- Catat hasil implementasi dan bukti pengujian di `docs/PROGRESS.md`.
- Laporkan file yang diubah, hasil tes, dan batas verifikasi perangkat. Commit tetap menunggu instruksi pengguna.
