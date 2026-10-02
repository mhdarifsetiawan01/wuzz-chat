# PLAY_STORE_MIGRATION.md — Persiapan Rilis Play Store & Play In-App Updates

> Status per 2026-10-02: aplikasi mobile dibagikan sebagai **APK via Google Drive publik**; web `chat.wuzzhub.id` dijeda dan mengarahkan pengguna ke APK. Dokumen ini adalah checklist untuk saat Play Console mulai disiapkan. **Play In-App Updates sengaja ditunda** sampai build ada di Play Store.

---

## 1. Kondisi Saat Ini (Sudah Berjalan)

| Komponen | Lokasi | Fungsi |
|---|---|---|
| Gatekeeper versi | `backend/internal/api/version_middleware.go` | `MIN_MOBILE_BUILD`: build di bawah batas → HTTP 426 / WS close 4426 → `ForceUpdateModal` (wajib update) |
| Endpoint info versi | `backend/internal/api/version_handler.go` | `GET /api/app/version?platform=&channel=` (publik, dikecualikan dari gatekeeper) |
| Env backend | `backend/.env.example` | `MIN_MOBILE_BUILD`, `LATEST_MOBILE_BUILD`, `LATEST_MOBILE_VERSION`, `APK_DOWNLOAD_URL`, `PLAY_STORE_URL`, `APP_STORE_URL`, `MOBILE_RELEASE_NOTES` |
| Banner pembaruan | `mobile/src/components/UpdateBanner.tsx` | Strip tipis, bisa ditutup (muncul lagi saat aplikasi dibuka ulang), disembunyikan saat panggilan |
| Service | `mobile/src/services/appUpdate.ts` | Fetch + cache 30 menit, timeout 8 detik, gagal = diam |
| Cek manual | `mobile/src/screens/SettingsScreen.tsx` | Tautan "Cek pembaruan" di footer |
| Channel instalasi | `mobile/src/utils/appVersion.ts` | `EXPO_PUBLIC_UPDATE_CHANNEL` (`apk` default, `play` untuk build Play Store); dikirim sebagai header `X-App-Channel` dan query WS `app_channel` |
| Gate web | `frontend/app/WebPausedGate.tsx`, `frontend/lib/app-download.ts` | `NEXT_PUBLIC_WEB_PAUSED`, `NEXT_PUBLIC_APK_URL` |

Prosedur rilis APK sekarang:
1. Perbarui file di Google Drive lewat **Manage versions → Upload new version** (ID/link tidak berubah).
2. Naikkan `LATEST_MOBILE_BUILD` dan `LATEST_MOBILE_VERSION` di env VPS lalu deploy backend (`ssh deploy@<VPS_IP> ./deploy-chat.sh`).
3. Naikkan `MIN_MOBILE_BUILD` hanya jika versi lama harus diblokir.

---

## 2. Checklist Sebelum Rilis Play Store

### 2.1 Tanda tangan (PRIORITAS — tentukan dulu)
- [ ] Cek bagaimana APK Drive saat ini ditandatangani (keystore mana, debug atau release).
- [ ] Putuskan memakai **Play App Signing** (disarankan). Kunci tanda tangan Play bisa berbeda dari APK Drive.
- [ ] Jika tanda tangan berbeda: pengguna APK **tidak bisa** menimpa langsung ke versi Play Store; harus uninstall dulu → data lokal dan **kunci E2EE hilang** kecuali sudah dipindah. Siapkan panduan migrasi: pindahkan kunci via transfer QR sebelum uninstall (lihat `docs/domains/MESSAGING_CHAT.md` / alur `DeviceTransferModal`).
- [ ] Pastikan `versionCode` build Play lebih besar dari semua APK yang beredar (`mobile/app.json` → `android.versionCode`, sekarang 12).

#### Keystore release (keputusan 2026-10-02)
APK sebelumnya (hingga build 18) ditandatangani **kunci debug bawaan template** (`CN=Android Debug`, SHA-256 `FA:C6:17:45:…:3B:9C`): kunci publik, tidak aman, dan ditolak Play Console. Rencana: satu keystore release dipakai APK Drive **dan** diimpor sebagai kunci Play App Signing, sehingga tanda tangannya sama dan APK ↔ Play bisa saling menimpa.

1. Buat keystore (simpan di luar repo, **backup di dua tempat**; kehilangannya = APK tidak bisa diperbarui lagi):
   ```
   keytool -genkeypair -v -keystore ~/wuzzchat-release.jks -alias wuzzchat -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Build release membaca env berikut (plugin `mobile/plugins/withAndroidReleaseSigning.js`); tanpa itu build **berhenti**:
   `WUZZ_KEYSTORE_PATH`, `WUZZ_KEYSTORE_PASSWORD`, `WUZZ_KEY_ALIAS`, `WUZZ_KEY_PASSWORD`
3. Setelah mengubah plugin: `npx expo prebuild --platform android`, lalu `./gradlew assembleRelease`.
4. Di Play Console, saat rilis pertama pilih **"Export and upload a key from a Java keystore"** (alat `pepk`) agar kunci Play = kunci APK. Opsi ini hanya ada di rilis pertama; kunci yang dibuat otomatis oleh Google tidak bisa diunduh dan akan berbeda dari APK.
5. Verifikasi tanda tangan: `apksigner verify --print-certs app-arm64-v8a-release.apk`.

**Dampak:** pengguna APK lama (kunci debug) tidak bisa menimpa ke build kunci baru ("package conflicts"); harus uninstall dulu. Lakukan sekali, sekarang, selagi pengguna masih sedikit.

### 2.2 Konfigurasi Play Console
- [ ] Buat aplikasi dengan package `com.wuzzchat.mobile`.
- [ ] Isi formulir kebijakan (privasi, data safety, izin: notifikasi, kamera untuk pindai QR, mikrofon untuk pesan suara/panggilan).
- [ ] Unggah build ke **internal testing** terlebih dahulu.
- [ ] Siapkan tautan kebijakan privasi dan aset toko (ikon, screenshot, deskripsi).

### 2.3 Konfigurasi Build & Backend
- [ ] Build Play Store memakai `EXPO_PUBLIC_UPDATE_CHANNEL=play`.
- [ ] Pastikan `PLAY_STORE_URL` di backend sesuai paket `com.wuzzchat.mobile`.
- [ ] Setelah Play live: ganti `NEXT_PUBLIC_APK_URL` frontend ke tautan Play Store, rebuild frontend.
- [ ] Pertimbangkan membiarkan `APK_DOWNLOAD_URL` tetap terisi selama masih ada pengguna APK.

---

## 3. Play In-App Updates (Ditunda)

**Kenapa ditunda:** API hanya bekerja untuk aplikasi yang terpasang dari Play Store dan tidak bisa diuji sebelum build ada di Play (minimal internal testing). APK sideload selalu mendapat "update tidak tersedia".

### 3.1 Pembagian peran
- Channel `apk` dan iOS: tetap memakai banner + `/api/app/version`.
- Channel `play`: banner tidak ditampilkan (sudah dipasang di `UpdateBanner.tsx` lewat `APP_CHANNEL !== 'play'`); pembaruan diurus Play Store (auto update). Keputusan 2026-10-02: tidak perlu membangun In-App Updates dulu, cukup auto update Play Store. `ForceUpdateModal` untuk build di bawah `MIN_MOBILE_BUILD` tetap aktif.

### 3.2 Jenis update
- **Flexible** (default): unduh di latar belakang, lalu banner kecil "Pembaruan siap — Restart". Untuk build di bawah `LATEST` tetapi di atas `MIN`.
- **Immediate**: layar penuh milik Play. Untuk pembaruan kritis; secara fungsi mirip `ForceUpdateModal`. Alternatif lebih sederhana: pertahankan `ForceUpdateModal` untuk build di bawah `MIN` dengan tombol ke Play Store.
- Opsional: baca **update priority** (0–5, diatur lewat Play Developer API saat rilis) dan "staleness" untuk menentukan kekerasan pembaruan.

### 3.3 Library
- Belum dipilih. Kandidat: `sp-react-native-in-app-updates`, atau modul native tipis sendiri yang membungkus `AppUpdateManager`.
- **Verifikasi dulu:** kompatibilitas dengan Expo SDK 57 dan arsitektur baru React Native, status perawatan library, kebutuhan config plugin.
- Modul native tidak jalan di Expo Go. Proyek sudah memakai build gradle lokal (`mobile/android/`, tanpa `eas.json`) dan modul native lain (`react-native-webrtc`, `expo-notifications`), jadi dampak build kecil.

### 3.4 Rancangan integrasi
1. Hanya aktif jika `APP_CHANNEL === 'play'` dan platform Android.
2. Cek saat aplikasi dibuka / kembali ke foreground (throttle seperti `fetchAppUpdateInfo`).
3. Ada pembaruan → mulai flexible update; setelah unduhan selesai tampilkan banner "Restart" (gunakan ulang `UpdateBanner`).
4. Pengujian: Internal App Sharing atau track internal testing, dengan dua versi `versionCode` berbeda.

---

## 4. Hal yang Tetap Berlaku Setelah Play Live
- `MIN_MOBILE_BUILD` dan `ForceUpdateModal` tetap dibutuhkan: Play tidak bisa memaksa pengguna update, dan versi lama bisa tidak cocok dengan API backend.
- iOS tidak mendukung API ini; banner tetap dipakai (`APP_STORE_URL`).
- Banner untuk pengguna APK tetap berguna selama masih ada yang memasang manual.
- Pengguna PWA/web lama: halaman `/transfer/share` (lihat `frontend/app/transfer/share/`) tetap tersedia untuk memindahkan kunci ke aplikasi selama web dijeda.
