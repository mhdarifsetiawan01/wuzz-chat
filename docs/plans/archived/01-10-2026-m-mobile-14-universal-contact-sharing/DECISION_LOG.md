# Active Decision Log

### DEC-042: Dual-Protocol Deep Linking Strategy (`wuzzchat://` & `https://chat.wuzzhub.id/u/`)
- **Konteks**: Aplikasi luar seperti WhatsApp, Telegram, atau browser memiliki perlakuan berbeda terhadap link. Universal links `https://` ramah untuk diklik di semua aplikasi, sementara custom scheme `wuzzchat://` adalah direct protocol fallback.
- **Keputusan**:
  1. Daftarkan kedua skema di Android Intent Filter (`https://chat.wuzzhub.id/u/*` dan `wuzzchat://*`).
  2. Format link default yang dibagikan oleh pengguna adalah format web universal `https://chat.wuzzhub.id/u/{username}`. Hal ini memastikan jika link dibuka di perangkat yang belum terpasang aplikasi, link tidak rusak.

### DEC-043: Privacy-Preserving Direct Chat Dispatcher
- **Konteks**: Pengguna ingin membagikan profil agar orang lain bisa langsung chat, namun tetap menghormati pengaturan akun privat.
- **Keputusan**:
  1. Saat tautan profil dibuka, aplikasi mengecek `is_private_account` target dan status pertemanan via `connectionsApi.getConnectionStatus`.
  2. **Akun Publik / Teman**: Aplikasi langsung memanggil `startDirectChat` dan menavigasikan pengguna ke jendela `Chat`, memberikan pengalaman instan 0-friction.
  3. **Akun Privat & Belum Teman**: Navigasikan ke `UserProfileScreen` dan picu notifikasi proteksi akun privat (`PrivateAccountNoticeModal`) sehingga pengguna diarahkan mengirim permintaan pertemanan terlebih dahulu.

### DEC-044: Android Digital Asset Links (`.well-known/assetlinks.json`) untuk Android 12-16 App Links
- **Konteks**: Pada Android 12 hingga Android 16 (API 31+), tautan web `https://` yang didaftarkan dengan `android:autoVerify="true"` wajib diverifikasi secara kriptografis terhadap domain web agar tidak dilempar langsung ke web browser.
- **Keputusan**:
  1. Buat file `frontend/public/.well-known/assetlinks.json` yang berisi delegasi wewenang `delegate_permission/common.handle_all_urls` untuk package `com.wuzzchat.mobile` dengan SHA-256 fingerprint keystore penandatangan APK.
  2. Konfigurasikan header `Content-Type: application/json` di `frontend/next.config.ts` untuk endpoint `/.well-known/assetlinks.json`.
  3. Dengan konfigurasi ini, setelah web dideploy, Android 12-16 akan memverifikasi kepemilikan domain `chat.wuzzhub.id` saat instalasi aplikasi, sehingga link `https://chat.wuzzhub.id/u/*` otomatis membuka aplikasi WuzzChat tanpa melalui browser.

