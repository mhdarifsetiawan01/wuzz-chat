# Backlog: Perangkat Tertaut Mobile

> Dibuat 18 Oktober 2026. **Status: implementasi dan alur utama selesai; pencabutan dua perangkat nyata serta penghentian push pada target sudah lulus uji produksi. Audit akar penyebab inventaris lama/kuota dan target yang sepenuhnya offline masih terbuka.**

> Verifikasi 18 Oktober 2026: UI awal diperiksa pada v1.38.1 build 67; uji pencabutan nyata dilanjutkan pada v1.39.0 build 68. Perangkat lama berhasil dikeluarkan, inventaris akhirnya turun menjadi perangkat aktif saja, dan perangkat pemanggil tetap aktif. Uji push terkontrol memakai akun pengirim skrip membuktikan kedua HP menerima baseline, lalu setelah remote revoke hanya HP aktif yang menerima. Target berada di background dan masih terhubung jaringan; kasus target sepenuhnya offline belum diuji.
> Dicatat atas permintaan pengguna agar pengelolaan perangkat tertaut tidak terlupakan setelah pemisahan alur transfer kunci.

## Tujuan

Tambahkan menu **Perangkat Tertaut** di Pengaturan mobile untuk melihat perangkat yang masih memiliki akses ke akun dan mengeluarkan perangkat lain. Menu **Transfer Kunci ke Perangkat Lain** yang sudah tersedia tetap berfungsi untuk berbagi kunci E2EE; keduanya memiliki tujuan berbeda.

## Cakupan dan checklist

- [x] Audit kontrak dan perilaku aktual endpoint perangkat/sesi, identitas perangkat saat ini, serta pencabutan akses HTTP/WebSocket sebelum menentukan endpoint yang dipakai.
- [x] Tambahkan menu **Perangkat Tertaut** dan layar/modal daftar perangkat aktif di Pengaturan mobile.
- [x] Tampilkan nama perangkat, platform, aktivitas terakhir jika tersedia, serta penanda **Perangkat Ini** berdasarkan identitas perangkat yang stabil.
- [x] Kelompokkan sesi yang berasal dari perangkat fisik yang sama agar refresh token tidak menampilkan perangkat duplikat. Memakai endpoint perangkat dengan deduplikasi `devices.id`, tanpa menginventaris sesi.
- [x] Sediakan tombol **Keluarkan** pada perangkat lain, dengan dialog konfirmasi berisi nama perangkat dan dampaknya.
- [ ] Setelah pencabutan berhasil, perbarui daftar dan pastikan seluruh sesi/perangkat target kehilangan akses sesuai kontrak server, termasuk WebSocket; sesi perangkat yang sedang digunakan tetap aktif. **Sebagian terverifikasi di produksi:** daftar diperbarui dan perangkat pemanggil tetap aktif; penolakan request HTTP/handshake WebSocket dari perangkat target belum diamati langsung setelah revoke.
- [x] Tangani daftar yang sudah berubah, target sudah keluar, loading, daftar kosong, gagal jaringan, timeout, refresh, dan ketukan ganda tanpa menampilkan sukses palsu.
- [x] Sediakan akses yang jelas ke **Transfer Kunci ke Perangkat Lain** tanpa membuka tab penerimaan pada perangkat dengan kunci aktif.
- [x] Pertahankan kunci E2EE perangkat saat ini dan ikuti aturan cleanup sesi perangkat target yang sudah berlaku; aksi keluarkan perangkat tidak mereset kunci akun.
- [x] Ikuti theme terang/gelap, safe area, aksesibilitas, dan perilaku Back Android sesuai desain mobile.
- [x] Tambahkan tes regresi untuk pemetaan perangkat saat ini, deduplikasi sesi, pencabutan perangkat lain, serta respons terlambat setelah akun/sesi berganti.
- [x] Jalankan typecheck dan tes unit mobile, build frontend, tes backend, lalu uji langsung di HP dengan dua perangkat/sesi yang sah.
- [x] Sinkronkan panduan integrasi, konteks mobile, keamanan/API bila terdampak, dan log progres saat implementasi selesai.
- [x] Verifikasi penghentian push terpisah dari pencabutan HTTP/WebSocket pada target di background: baseline masuk ke dua HP; setelah remote revoke hanya perangkat aktif yang menerima.
- [ ] Lanjutan hardening push untuk target sepenuhnya offline: ikat `push_subscriptions` ke identitas perangkat/sesi dan pastikan subscription server dicabut deterministik saat Keluarkan. Uji 18 Oktober memakai target background dengan jaringan aktif, sehingga belum membuktikan cleanup saat target offline total.
- [ ] Audit konsistensi inventaris/kuota: uji HP mengembalikan 3 entri `is_active` sementara batas yang ditampilkan adalah 2. Dua entri lama terakhir terlihat 9 dan 7 Oktober. Periksa hubungan sesi valid, registrasi ulang/handshake WebSocket, dan kuota login sebelum menyimpulkan penyebab atau menonaktifkan data lama. Jangan mencabut perangkat pengguna sebagai cleanup otomatis.

## Titik awal teknis

Roadmap Fase 11 mencatat fondasi perangkat/sesi sudah tersedia. **Verifikasi ulang implementasinya saat pekerjaan dimulai**, terutama perbedaan ID sesi, ID baris perangkat, dan `device_id`:

- `GET /api/auth/devices` dan `DELETE /api/auth/devices/:id`.
- `GET /api/auth/sessions` dan `DELETE /api/auth/sessions/:id`.
- `mobile/src/screens/SettingsScreen.tsx` untuk titik masuk Pengaturan.
- `mobile/src/context/DeviceContext.tsx` untuk identitas perangkat saat ini.
- `mobile/src/context/AuthContext.tsx` untuk lifecycle sesi dan cleanup.
- UI pengelolaan perangkat web sebagai referensi perilaku, setelah diperiksa ulang.

Jangan mengasumsikan penghapusan satu baris sesi otomatis mengeluarkan seluruh sesi pada satu perangkat. Bila audit menemukan kebutuhan perbaikan backend, catat dan uji cakupannya sebelum menghubungkan tombol Keluarkan.

## Hasil implementasi tahap pertama

- Revisi desain setelah masukan pengguna: daftar kompak terbagi Perangkat Ini/Perangkat Lain, ikon per platform, Keluarkan sebagai aksi teks samping (sentuh ≥44 dp), ringkasan jumlah aktual, dan pintasan transfer kunci berbentuk baris. Konfirmasi mengganti isi sheet dengan tombol Batal/Keluarkan berdampingan. Desain revisi diperiksa di HP Android 11 dalam tema terang/gelap; Back/Batal kembali ke daftar. Tema awal dipulihkan.

- `LinkedDevicesModal` memakai `BottomSheetModal`, tema dinamis, daftar scrollable, dan konfirmasi dalam sheet. Uji visual, Back, tema gelap, serta dua perangkat nyata sudah dilakukan pada 18 Oktober 2026.
- `GET /api/auth/devices` mengembalikan baris perangkat aktif; `id` sama dengan `DeviceContext.deviceId`. `last_seen_at` diperbarui saat koneksi WebSocket, bukan bukti sedang online. Request DELETE membawa `X-Device-ID` dan token eksplisit dari sesi pembuka.
- Audit menemukan handler lama mengabaikan kegagalan `RevokeDeviceSessions` dan masih membalas sukses. Kini pemilik divalidasi, pencabutan diwajibkan dan dijalankan sebelum penonaktifan. Bila revoke gagal, target tetap aktif/terlihat; bila penonaktifan sesudah revoke gagal, request membalas error dan dapat diulang. Operasi ini belum atomik.
- Tes integrasi menguji dua token target ditolak lewat middleware JWT asli dan token pemanggil tetap berlaku; mock hub memastikan kick ke target. Tes lifecycle/WebSocket yang sudah ada tetap dijalankan dalam suite backend.
- Uji produksi dua HP pada v1.39.0 build 68: perangkat lama berhasil dikeluarkan, daftar setelah cold start/refresh menyisakan perangkat aktif, dan perangkat pemanggil tidak terganggu. Percobaan request HTTP atau handshake WebSocket langsung dari target setelah revoke belum direkam.
- Uji push produksi memakai akun skrip `surotong` di grup publik yang sama. Pesan baseline diterima dua HP. Setelah HP target dikeluarkan dan kedua aplikasi kembali di-background-kan, pesan kedua diterima HP aktif dan tidak diterima HP target. Server memberi ACK untuk kedua pesan; akun skrip keluar kembali dari grup setelah pengujian.
- Typecheck dan tes unit mobile, build frontend, serta seluruh tes backend lulus. Backend dan APK terkait telah tersedia saat uji produksi. Tidak mencakup login melalui QR tanpa kredensial, sinkronisasi riwayat/media lama, target offline total, atau iOS.

## Kriteria selesai

Pengguna dapat membedakan perangkat ini dan perangkat lain, melihat informasi yang tersedia, lalu mengeluarkan perangkat lain dengan konfirmasi. Perangkat target benar-benar kehilangan akses, perangkat ini tetap aktif, dan kegagalan jaringan tidak menghasilkan status berhasil yang keliru.

Pengujian pencabutan memakai akun/perangkat uji yang jelas; bukti pengujian membedakan pemeriksaan kode, tes otomatis, dan uji perangkat nyata.

## Referensi

- [Roadmap Fase 11](../../ROADMAP.md).
- [Spesifikasi autentikasi dan sesi](../../domains/AUTH_SESSION.md).
- [Rencana transfer kunci yang sudah selesai](../archived/18-10-2026-mobile-key-transfer-roles/IMPLEMENTATION_PLAN.md), yang memisahkan daftar perangkat dan aksi keluarkan sebagai pekerjaan lanjutan.
