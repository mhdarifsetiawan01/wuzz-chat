# DECISION LOG

## DEC-001: Dual-Layer Identity & Adaptive Icon Configuration
- **Context**: Aplikasi mobile menggunakan Expo dengan prebuilt native Android. Nama aplikasi perlu diubah menjadi `WuzzChat` dan icon baru perlu diterapkan.
- **Decision**: Update konfigurasi di 2 layer:
  1. **Expo SSOT (`app.json` + `mobile/assets/`)**: Mengubah `name` menjadi `WuzzChat`, `backgroundColor` menjadi `#0462E8`, serta membuat asset master `icon.png` (1024x1024), `android-icon-foreground.png` (512x512 safe-zone centered), `android-icon-background.png` (512x512 solid `#0462E8`), dan `android-icon-monochrome.png` (432x432) untuk Android 13+ themed icons.
  2. **Android Native Resource (`strings.xml`, `colors.xml`, `mipmap-*`)**: Mengubah `<string name="app_name">WuzzChat</string>`, `<color name="iconBackground">#0462E8</color>`, dan men-generate 25 file icon `.webp` di seluruh screen density (`mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`) serta `splashscreen_logo.png` di `drawable-*`.
- **Impact**: Nama dan icon aplikasi 100% konsisten baik saat build via Expo EAS, Expo Prebuild, maupun saat build native Android via Gradle.

