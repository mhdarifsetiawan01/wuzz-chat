# IMPLEMENTATION PLAN — Mobile App Identity & Android Icon

## 1. Objectives
- Ganti nama aplikasi saat terinstal di perangkat HP menjadi `WuzzChat` (tanpa spasi).
- Terapkan logo baru (background biru `#0462E8`, double chat bubble putih berbentuk W, dan petir kuning di tengah) sebagai icon aplikasi Android.
- Pastikan konfigurasi tersinkronisasi di kedua layer:
  1. Expo SSOT (`app.json` + `mobile/assets/`)
  2. Android Native Resource (`strings.xml`, `colors.xml`, `mipmap-*`, `drawable-*`)

## 2. Target Modified & Created Files
- `mobile/app.json`: name -> "WuzzChat", adaptiveIcon backgroundColor -> "#0462E8"
- `mobile/android/app/src/main/res/values/strings.xml`: app_name -> "WuzzChat"
- `mobile/android/app/src/main/res/values/colors.xml`: iconBackground -> "#0462E8"
- `mobile/assets/icon.png`: 1024x1024 master icon
- `mobile/assets/android-icon-foreground.png`: 512x512 adaptive foreground (safe zone centered)
- `mobile/assets/android-icon-background.png`: 512x512 solid `#0462E8`
- `mobile/assets/android-icon-monochrome.png`: 432x432 monochrome silhouette for Android 13+ themed icons
- `mobile/assets/favicon.png`: 48x48 web favicon
- `mobile/android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/*`:
  - `ic_launcher.webp`: legacy square/squircle
  - `ic_launcher_round.webp`: circular icon
  - `ic_launcher_background.webp`: solid background
  - `ic_launcher_foreground.webp`: adaptive icon foreground
  - `ic_launcher_monochrome.webp`: themed icon layer
- `mobile/android/app/src/main/res/drawable-*/splashscreen_logo.png`: splash screen logo

## 3. Verification Strategy
- Verifikasi dimensi & format seluruh file gambar hasil generate dengan script Python (Pillow).
- Verifikasi XML syntax (`strings.xml`, `colors.xml`).
- Jalankan test otomatis backend (`go test ./...`) dan frontend build (`npm run build`) sesuai Mandatory Testing Rule.

