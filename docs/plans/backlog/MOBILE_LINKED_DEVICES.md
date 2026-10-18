# Backlog: Perangkat Tertaut Mobile

> Dibuat 18 Oktober 2026. **Status: tahap pertama diimplementasikan dan UI diperiksa di HP; pencabutan dua perangkat nyata serta audit inventaris/kuota masih terbuka.**

> Verifikasi 18 Oktober 2026: UI sudah diperiksa di HP pada v1.38.1 build 67 setelah pengguna mengonfirmasi deployment backend/pembaruan APK. Daftar, penanda perangkat ini, konfirmasi/Batal, refresh, pintasan QR pengirim, Back dan buka ulang bekerja; tidak ada error ReactNativeJS/AndroidRuntime pada jendela log yang diperiksa. Pengeluaran perangkat sungguhan dan kondisi kegagalan jaringan belum diuji.
> Dicatat atas permintaan pengguna agar pengelolaan perangkat tertaut tidak terlupakan setelah pemisahan alur transfer kunci.

## Tujuan

Tambahkan menu **Perangkat Tertaut** di Pengaturan mobile untuk melihat perangkat yang masih memiliki akses ke akun dan mengeluarkan perangkat lain. Menu **Transfer Kunci ke Perangkat Lain** yang sudah tersedia tetap berfungsi untuk berbagi kunci E2EE; keduanya memiliki tujuan berbeda.

## Cakupan dan checklist

- [x] Audit kontrak dan perilaku aktual endpoint perangkat/sesi, identitas perangkat saat ini, serta pencabutan akses HTTP/WebSocket sebelum menentukan endpoint yang dipakai.
- [x] Tambahkan menu **Perangkat Tertaut** dan layar/modal daftar perangkat aktif di Pengaturan mobile.
- [x] Tampilkan nama perangkat, platform, aktivitas terakhir jika tersedia, serta penanda **Perangkat Ini** berdasarkan identitas perangkat yang stabil.
- [x] Kelompokkan sesi yang berasal dari perangkat fisik yang sama agar refresh token tidak menampilkan perangkat duplikat. Memakai endpoint perangkat dengan deduplikasi `devices.id`, tanpa menginventaris sesi.
- [x] Sediakan tombol **Keluarkan** pada perangkat lain, dengan dialog konfirmasi berisi nama perangkat dan dampaknya.
- [ ] Setelah pencabutan berhasil, perbarui daftar dan pastikan seluruh sesi/perangkat target kehilangan akses sesuai kontrak server, termasuk WebSocket; sesi perangkat yang sedang digunakan tetap aktif.
- [x] Tangani daftar yang sudah berubah, target sudah keluar, loading, daftar kosong, gagal jaringan, timeout, refresh, dan ketukan ganda tanpa menampilkan sukses palsu.
- [x] Sediakan akses yang jelas ke **Transfer Kunci ke Perangkat Lain** tanpa membuka tab penerimaan pada perangkat dengan kunci aktif.
- [x] Pertahankan kunci E2EE perangkat saat ini dan ikuti aturan cleanup sesi perangkat target yang sudah berlaku; aksi keluarkan perangkat tidak mereset kunci akun.
- [ ] Ikuti theme terang/gelap, safe area, aksesibilitas, dan perilaku Back Android sesuai desain mobile.
- [x] Tambahkan tes regresi untuk pemetaan perangkat saat ini, deduplikasi sesi, pencabutan perangkat lain, serta respons terlambat setelah akun/sesi berganti.
- [ ] Jalankan typecheck dan tes unit mobile, build frontend, tes backend, lalu uji langsung di HP dengan dua perangkat/sesi yang sah.
- [ ] Sinkronkan panduan integrasi, konteks mobile, keamanan/API bila terdampak, dan log progres saat implementasi selesai.
- [ ] Lanjutan keamanan push: ikat `push_subscriptions` ke identitas perangkat/sesi dan cabut subscription dari server saat Keluarkan. Saat ini tabel hanya mengikat subscription ke user; cleanup klien lewat `unsubscribeDevice` tidak menjamin berhasil setelah tokennya dicabut, khususnya target offline. Verifikasi penghentian push terpisah dari pencabutan HTTP/WebSocket.
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

- Revisi desain setelah masukan pengguna: daftar kompak terbagi Perangkat Ini/Perangkat Lain, ikon per platform, Keluarkan sebagai aksi teks samping (sentuh ≥44 dp), ringkasan jumlah aktual, dan pintasan transfer kunci berbentuk baris. Konfirmasi mengganti isi sheet dengan tombol Batal/Keluarkan berdampingan. Desain revisi diperiksa di HP Android 11 dalam tema terang/gelap; Back/Batal kembali ke daftar. Tema awal dipulihkan dan tidak ada sesi dicabut. Audit kuota dan pencabutan dua perangkat nyata tetap terbuka.

- `LinkedDevicesModal` memakai `BottomSheetModal`, tema dinamis, daftar scrollable, dan konfirmasi dalam sheet. Uji visual, Back, tema gelap, serta dua perangkat nyata belum dilakukan.
- `GET /api/auth/devices` mengembalikan baris perangkat aktif; `id` sama dengan `DeviceContext.deviceId`. `last_seen_at` diperbarui saat koneksi WebSocket, bukan bukti sedang online. Request DELETE membawa `X-Device-ID` dan token eksplisit dari sesi pembuka.
- Audit menemukan handler lama mengabaikan kegagalan `RevokeDeviceSessions` dan masih membalas sukses. Kini pemilik divalidasi, pencabutan diwajibkan dan dijalankan sebelum penonaktifan. Bila revoke gagal, target tetap aktif/terlihat; bila penonaktifan sesudah revoke gagal, request membalas error dan dapat diulang. Operasi ini belum atomik.
- Tes integrasi menguji dua token target ditolak lewat middleware JWT asli dan token pemanggil tetap berlaku; mock hub memastikan kick ke target. Tes lifecycle/WebSocket yang sudah ada tetap dijalankan dalam suite backend. Pencabutan dua perangkat nyata masih perlu diuji.
- Typecheck dan tes unit mobile, build frontend, serta seluruh tes backend lulus. Perubahan backend belum dideploy; APK baru belum dibangun. Tidak mencakup login melalui QR tanpa kredensial atau sinkronisasi riwayat/media lama.

## Kriteria selesai

Pengguna dapat membedakan perangkat ini dan perangkat lain, melihat informasi yang tersedia, lalu mengeluarkan perangkat lain dengan konfirmasi. Perangkat target benar-benar kehilangan akses, perangkat ini tetap aktif, dan kegagalan jaringan tidak menghasilkan status berhasil yang keliru.

Pengujian pencabutan memakai akun/perangkat uji yang jelas; bukti pengujian membedakan pemeriksaan kode, tes otomatis, dan uji perangkat nyata.

## Referensi

- [Roadmap Fase 11](../../ROADMAP.md).
- [Spesifikasi autentikasi dan sesi](../../domains/AUTH_SESSION.md).
- [Rencana transfer kunci yang sudah selesai](../archived/18-10-2026-mobile-key-transfer-roles/IMPLEMENTATION_PLAN.md), yang memisahkan daftar perangkat dan aksi keluarkan sebagai pekerjaan lanjutan.
