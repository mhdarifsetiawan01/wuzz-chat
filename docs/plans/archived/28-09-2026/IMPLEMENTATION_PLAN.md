# IMPLEMENTATION PLAN — Milestone M-Mobile-Release-Opt2

## Tujuan
Mengimplementasikan Langkah A dengan strategi ABI Splits (memisahkan build APK per arsitektur) agar menghasilkan 2 file APK rilis fisik independen:
1. `app-arm64-v8a-release.apk` (HP Android modern 64-bit).
2. `app-armeabi-v7a-release.apk` (HP Android 32-bit).

## Rencana Teknis
1. **Pembaruan `mobile/android/gradle.properties`**:
   - Ubah `reactNativeArchitectures` dari `armeabi-v7a,arm64-v8a,x86,x86_64` menjadi `armeabi-v7a,arm64-v8a`.
   - Mengeliminasi kompilasi dan bundling library emulator PC Intel `x86` dan `x86_64`.
2. **Pembaruan `mobile/android/app/build.gradle`**:
   - Tambahkan blok `splits { abi { reset(); enable true; universalApk false; include "armeabi-v7a", "arm64-v8a" } }` di dalam blok `android { ... }`.
3. **Pembaruan Config Plugin Expo (`mobile/plugins/withAndroidReleaseOptimization.js`)**:
   - Pastikan plugin menjaga konsistensi nilai `reactNativeArchitectures` dan `splits` jika `npx expo prebuild` dijalankan kembali.
4. **Verifikasi Build**:
   - Jalankan `./gradlew assembleRelease` di direktori `mobile/android`.
   - Pastikan Gradle menghasilkan 2 file APK rilis dan catat ukuran masing-masing APK.
