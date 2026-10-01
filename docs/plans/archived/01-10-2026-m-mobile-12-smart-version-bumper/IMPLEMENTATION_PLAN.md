# Implementation Plan — Smart Version Bumper & Conventional Commits SOP

## 🎯 1. Deskripsi & Tujuan
Menerapkan otomatisasi rilis cerdas (*Smart Version Bumper*) pada klien mobile yang mendeteksi jenis kenaikan versi (Major, Minor, Patch, Build) berdasarkan riwayat Git Conventional Commits dan terpicu otomatis saat perintah Android Release Gradle dijalankan (`./gradlew assembleRelease`).

---

## 📂 2. File yang Dibuat / Dimodifikasi

### Workspace Rules (`.agents/`)
- `.agents/AGENTS.md`: Menambahkan aturan baku **Mandatory Conventional Commits & Semantic Versioning Rule (MANDATORY)** yang mengikat AI dan developer.

### Mobile App Scripts (`mobile/scripts/`)
- `mobile/scripts/smart-bump.js`: Engine analisis git log cerdas:
  - Deteksi commit sejak commit terakhir `app.json`.
  - Klasifikasi: `BREAKING CHANGE / !:` (Major), `feat:` (Minor), `fix/perf/refactor:` (Patch), lainnya (Build +1).
  - Sinkronisasi otomatis ke `mobile/app.json` dan `mobile/package.json`.
  - Mendukung opsi `--dry-run` untuk inspeksi tanpa menulis file.
- `mobile/package.json`: Menambahkan script `"bump:smart": "node scripts/smart-bump.js"`.

### Android Gradle Configuration (`mobile/android/app/`)
- `mobile/android/app/build.gradle`:
  - Menghilangkan hardcoded `versionCode 1` dan `versionName "1.0.0"`.
  - Menggunakan `JsonSlurper` untuk membaca `versionCode` dan `versionName` langsung dari `app.json`.
  - Mendaftarkan Gradle task `smartBumpVersion` yang secara otomatis dipanggil sebelum task `assembleRelease` atau `bundleRelease`.

---

## 🧪 3. Strategi Verifikasi & Testing
1. **Verifikasi Dry Run**: Jalankan `node scripts/smart-bump.js --dry-run` untuk membuktikan mesin deteksi git log bekerja dengan benar.
2. **Typecheck Mobile**: `npx tsc --noEmit` di `mobile/` (0 error).
3. **Gradle Verification**: Jalankan Gradle task check di `mobile/android/` untuk memastikan konfigurasi `build.gradle` valid dan task `smartBumpVersion` terdaftar rapi.
