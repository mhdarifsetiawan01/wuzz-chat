# Decision Log — Client App Versioning & Force Update Gatekeeper

### DEC-001: Penggunaan Integer `versionCode`/`buildNumber` untuk Evaluasi Batas Versi
- **Konteks**: Backend membutuhkan cara cepat dan andal untuk menentukan apakah aplikasi mobile berhak mengakses API atau harus dipaksa update.
- **Pilihan**:
  1. Parsing semver string (`"1.0.2"` vs `"1.1.0"`).
  2. Evaluasi integer monotonik (`buildNumber`/`versionCode` >= `min_build`).
- **Keputusan**: Opsi 2 (Integer `X-App-Build`).
- **Rasional**: Perbandingan numerik di Go `clientBuild < minBuild` bersifat O(1), zero-allocation, dan tahan terhadap anomali formatting semver. Google Play Store dan Apple App Store juga secara baku mewajibkan integer ini selalu bertambah pada setiap rilis.

### DEC-002: Pengecualian Transparan untuk Web Client
- **Konteks**: Web frontend (`https://chat.wuzzhub.id`) tidak memiliki concept version code app store dan selalu ter-refresh secara otomatis saat rilis baru dideploy.
- **Keputusan**: `VersionMiddleware` hanya memberlakukan validasi `MinMobileBuild` jika header `X-Device-Platform` teridentifikasi sebagai `android` atau `ios`. Request dari browser web dilewatkan langsung secara transparan.

### DEC-003: Kode Status HTTP 426 Upgrade Required
- **Konteks**: Diperlukan kode status standar HTTP untuk mengindikasikan pembaruan versi klien.
- **Keputusan**: Menggunakan standar RFC 2817 / 9110: `426 Upgrade Required`.
- **Rasional**: Status 426 secara semantik tepat untuk menandakan bahwa klien wajib meningkatkan versinya sebelum diizinkan melanjutkan request.

### DEC-004: Strict Production Enforcement (Default `MIN_MOBILE_BUILD=1`)
- **Konteks**: Permintaan user agar pengamanan langsung aktif untuk lingkungan production tanpa bypass 0, agar efektivitas pemblokiran langsung terbukti.
- **Keputusan**: Default `MIN_MOBILE_BUILD` di backend diatur langsung bernilai `1`. Seluruh request mobile wajib membawa `X-App-Build >= 1`. Request mobile tanpa header atau dengan build < 1 langsung ditolak 426.

### DEC-005: Zero-Manual Version Bumping via Automation Script
- **Konteks**: Mencegah kesalahan manusia saat mengedit `app.json` dan `package.json` secara manual.
- **Keputusan**: Menyediakan script otomatis `scripts/bump-version.js` yang mendukung `bump:build`, `bump:patch`, `bump:minor`, dan `bump:major`. Perubahan `versionCode` dan `buildNumber` ditangani 100% otomatis.
