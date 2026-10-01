# Decision Log — Smart Version Bumper & Conventional Commits SOP

### DEC-001: Deteksi SemVer Cerdas Menggunakan Conventional Commits
- **Konteks**: Diperlukan mekanisme otomatis untuk menentukan apakah versi aplikasi harus dinaikkan sebagai Major, Minor, atau Patch tanpa input manual developer saat build release.
- **Keputusan**: Menggunakan standar **Conventional Commits**:
  - `BREAKING CHANGE:` / `!:` ➔ MAJOR bump (`1.x.x` ➔ `2.0.0`)
  - `feat:` / `feat(...)` ➔ MINOR bump (`1.0.0` ➔ `1.1.0`)
  - `fix:`, `perf:`, `refactor:`, `style:` ➔ PATCH bump (`1.0.0` ➔ `1.0.1`)
  - Tidak ada commit fitur/fix baru ➔ BUILD number bump saja (`versionCode + 1`).
- **Rasional**: Standar ini diadopsi luas di industri (Angular, semantic-release, lerna) dan sepenuhnya deterministik.

### DEC-002: Single Source of Truth via `app.json` di Android Gradle
- **Konteks**: Sebelumnya `android/app/build.gradle` memiliki hardcoded `versionCode 1` dan `versionName "1.0.0"`.
- **Keputusan**: Gradle membaca langsung `versionCode` dan `versionName` dari `app.json` via Groovy `JsonSlurper`.
- **Rasional**: Menghilangkan duplikasi konfigurasi antara ekosistem Expo/React-Native (`app.json`) dan native Android (`build.gradle`).
