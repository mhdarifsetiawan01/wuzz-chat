# Backlog: Perangkat Tertaut Mobile

> Dibuat 18 Oktober 2026. **Status: direncanakan, belum diimplementasikan.**
> Dicatat atas permintaan pengguna agar pengelolaan perangkat tertaut tidak terlupakan setelah pemisahan alur transfer kunci.

## Tujuan

Tambahkan menu **Perangkat Tertaut** di Pengaturan mobile untuk melihat perangkat yang masih memiliki akses ke akun dan mengeluarkan perangkat lain. Menu **Transfer Kunci ke Perangkat Lain** yang sudah tersedia tetap berfungsi untuk berbagi kunci E2EE; keduanya memiliki tujuan berbeda.

## Cakupan dan checklist

- [ ] Audit kontrak dan perilaku aktual endpoint perangkat/sesi, identitas perangkat saat ini, serta pencabutan akses HTTP/WebSocket sebelum menentukan endpoint yang dipakai.
- [ ] Tambahkan menu **Perangkat Tertaut** dan layar/modal daftar perangkat aktif di Pengaturan mobile.
- [ ] Tampilkan nama perangkat, platform, aktivitas terakhir jika tersedia, serta penanda **Perangkat Ini** berdasarkan identitas perangkat yang stabil.
- [ ] Kelompokkan sesi yang berasal dari perangkat fisik yang sama agar refresh token tidak menampilkan perangkat duplikat.
- [ ] Sediakan tombol **Keluarkan** pada perangkat lain, dengan dialog konfirmasi berisi nama perangkat dan dampaknya.
- [ ] Setelah pencabutan berhasil, perbarui daftar dan pastikan seluruh sesi/perangkat target kehilangan akses sesuai kontrak server, termasuk WebSocket; sesi perangkat yang sedang digunakan tetap aktif.
- [ ] Tangani daftar yang sudah berubah, target sudah keluar, loading, daftar kosong, gagal jaringan, timeout, refresh, dan ketukan ganda tanpa menampilkan sukses palsu.
- [ ] Sediakan akses yang jelas ke **Transfer Kunci ke Perangkat Lain** tanpa membuka tab penerimaan pada perangkat dengan kunci aktif.
- [ ] Pertahankan kunci E2EE perangkat saat ini dan ikuti aturan cleanup sesi perangkat target yang sudah berlaku; aksi keluarkan perangkat tidak mereset kunci akun.
- [ ] Ikuti theme terang/gelap, safe area, aksesibilitas, dan perilaku Back Android sesuai desain mobile.
- [ ] Tambahkan tes regresi untuk pemetaan perangkat saat ini, deduplikasi sesi, pencabutan perangkat lain, serta respons terlambat setelah akun/sesi berganti.
- [ ] Jalankan typecheck dan tes unit mobile, build frontend, tes backend, lalu uji langsung di HP dengan dua perangkat/sesi yang sah.
- [ ] Sinkronkan panduan integrasi, konteks mobile, keamanan/API bila terdampak, dan log progres saat implementasi selesai.

## Titik awal teknis

Roadmap Fase 11 mencatat fondasi perangkat/sesi sudah tersedia. **Verifikasi ulang implementasinya saat pekerjaan dimulai**, terutama perbedaan ID sesi, ID baris perangkat, dan `device_id`:

- `GET /api/auth/devices` dan `DELETE /api/auth/devices/:id`.
- `GET /api/auth/sessions` dan `DELETE /api/auth/sessions/:id`.
- `mobile/src/screens/SettingsScreen.tsx` untuk titik masuk Pengaturan.
- `mobile/src/context/DeviceContext.tsx` untuk identitas perangkat saat ini.
- `mobile/src/context/AuthContext.tsx` untuk lifecycle sesi dan cleanup.
- UI pengelolaan perangkat web sebagai referensi perilaku, setelah diperiksa ulang.

Jangan mengasumsikan penghapusan satu baris sesi otomatis mengeluarkan seluruh sesi pada satu perangkat. Bila audit menemukan kebutuhan perbaikan backend, catat dan uji cakupannya sebelum menghubungkan tombol Keluarkan.

## Kriteria selesai

Pengguna dapat membedakan perangkat ini dan perangkat lain, melihat informasi yang tersedia, lalu mengeluarkan perangkat lain dengan konfirmasi. Perangkat target benar-benar kehilangan akses, perangkat ini tetap aktif, dan kegagalan jaringan tidak menghasilkan status berhasil yang keliru.

Pengujian pencabutan memakai akun/perangkat uji yang jelas; bukti pengujian membedakan pemeriksaan kode, tes otomatis, dan uji perangkat nyata.

## Referensi

- [Roadmap Fase 11](../../ROADMAP.md).
- [Spesifikasi autentikasi dan sesi](../../domains/AUTH_SESSION.md).
- [Rencana transfer kunci yang sudah selesai](../archived/18-10-2026-mobile-key-transfer-roles/IMPLEMENTATION_PLAN.md), yang memisahkan daftar perangkat dan aksi keluarkan sebagai pekerjaan lanjutan.
