# CRASH_REPORTING.md — Pelaporan Crash (Firebase Crashlytics)

> Ditambahkan 5 Okt 2026. Paket: `@react-native-firebase/app` dan `@react-native-firebase/crashlytics` **26.4.0** (versi tepat, jangan naikkan tanpa menguji build rilis).
> Proyek Firebase: `wuzz-chat-fcm` (sama dengan FCM). Kode: `mobile/src/services/crashReporting.ts`, `mobile/src/components/AppErrorBoundary.tsx`, pemasangan di `mobile/App.tsx`.

## 1. Yang ditangkap
| Jenis | Cara | Catatan |
|---|---|---|
| Crash native (Java/Kotlin/C++) | otomatis oleh Crashlytics | jejak Java dibaca lewat `mapping.txt` yang diunggah plugin Gradle saat build rilis |
| Error JS **fatal** | otomatis (RN melempar crash native) | jejak JS berupa nomor baris/kolom bundle Hermes (bukan nama file); lihat bagian 3 |
| Error JS non-fatal | `ErrorUtils.setGlobalHandler` -> `recordNonFatal` | |
| Error render React | `AppErrorBoundary` -> `recordNonFatal`, layar "Terjadi kesalahan" + tombol Coba Lagi | |
| **TIDAK ditangkap** | *unhandled promise rejection*, ANR, error WebSocket/jaringan yang sudah di-`catch` | sengaja tidak ditambah agar tidak berisik; tambahkan `recordNonFatal` di titik tertentu bila perlu |

Pengumpulan **hanya aktif pada build rilis** (`setCrashlyticsCollectionEnabled(!__DEV__)`); manifest bawaan library menetapkan koleksi **mati** sampai JS menyalakannya,
sehingga crash native yang terjadi sebelum JS pertama kali berjalan pada instalasi pertama bisa tidak tercatat. Setelah JS berjalan sekali, pengaturan tersimpan untuk peluncuran berikutnya.

## 2. Aturan privasi (WAJIB)
- Kirim **hanya** ID akun acak (UUID) lewat `setCrashUser`. **Jangan** mengirim isi pesan, username, nama, token, kunci E2EE, atau kata sandi, baik lewat `log`, atribut, maupun pesan `Error` yang dibuat sendiri.
- Pesan error dari library bisa memuat data; periksa laporan pertama untuk memastikan tidak ada data pribadi, dan bersihkan di sumber bila ada.
- Pengungkapan ada di `/privacy` (Laporan kerusakan, Firebase Crashlytics) dan Data Safety (`docs/PLAY_STORE_LISTING.md`). Setiap perubahan data yang dikirim ke Crashlytics **harus** memperbarui keduanya.

## 3. Membaca jejak JS (Hermes)
Build rilis memakai Hermes bytecode, jadi jejak di Crashlytics tidak menyebut file/fungsi JS sumber. Simpan **source map** setiap rilis:
- Dihasilkan Gradle saat build rilis: `mobile/android/app/build/intermediates/sourcemaps/react/release/index.android.bundle.packager.map` (dan versi komposit Hermes bila ada di folder `sourcemaps`/`generated`).
- **Simpan berkas `.map` dan `mapping.txt` (`app/build/outputs/mapping/release/`) per `versionCode`** di tempat yang sama dengan APK/AAB (Drive). Tanpa itu jejak build lama tidak bisa dibaca.
- Penerjemahan jejak ke nama file/baris asli memakai `metro-symbolicate` (atau alat setara) dengan `.map` build yang sama. **Prosedur ini belum diverifikasi pada crash nyata**; uji sekali setelah rilis pertama dengan crash sintetis (bagian 5).

## 4. Penyiapan satu kali di Firebase (dilakukan pemilik akun)
1. Buka Firebase Console -> proyek `wuzz-chat-fcm` -> **Crashlytics** -> *Enable Crashlytics*. Tanpa ini laporan tidak tampil.
2. Pastikan aplikasi Android `com.wuzzchat.mobile` ada di proyek (sudah, dari `google-services.json`).
3. Atur peringatan email untuk *new issue / regression* (Alerts) ke alamat yang dipantau.
4. Setiap build rilis mengunggah `mapping.txt` otomatis (plugin Gradle `com.google.firebase.crashlytics`); build butuh akses internet.

## 5. Verifikasi setelah rilis pertama (checklist)
- [ ] Pasang build rilis di HP uji, buka aplikasi sekali, tutup. (Pengaturan koleksi tersimpan.)
- [ ] Picu satu crash sintetis (sementara) lewat build uji khusus yang memanggil `crash(getCrashlytics())`; buka ulang aplikasi agar laporan terkirim.
- [ ] Laporan muncul di Firebase Console dalam beberapa menit, dengan versi (`versionName/versionCode`) yang benar dan jejak Java terbaca.
- [ ] Periksa bahwa laporan **tidak memuat** data pribadi (bagian 2).
- [ ] Hapus kode crash sintetis sebelum rilis publik.

## 6. Dampak lain
- Tidak menambah izin Android atau Foreground Service (diverifikasi pada manifest hasil merge).
- Menambah komponen native Firebase; ukur ulang ukuran AAB dan jalankan `mobile/scripts/check-16kb-alignment.py` pada AAB/APK berikutnya.
- Crashlytics mengumpulkan Firebase Installation ID; sudah diperhitungkan di Data Safety ("ID perangkat atau ID lain", "Log kerusakan", "Diagnostik").
