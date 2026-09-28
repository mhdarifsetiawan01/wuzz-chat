# DECISION LOG — Milestone M-Mobile-Release-Opt1

## DEC-001: Penundaan Pemisahan Arsitektur ABI (Langkah A) dan Keystore Release
- **Konteks**: Pengguna ingin menguji optimasi internal (R8, Resource Shrinking, Hermes) terlebih dahulu pada satu APK universal sebelum memutuskan split ABI atau generate keystore release resmi.
- **Keputusan**: `reactNativeArchitectures` tetap dipertahankan 4 ABI (`armeabi-v7a,arm64-v8a,x86,x86_64`) dan signing config tetap menggunakan `signingConfigs.debug`.
- **Dampak**: Ukuran APK akan berkurang dari sisi bytecode Java/Kotlin (DEX) dan resource XML/drawable, namun native libraries emulator x86/x86_64 tetap ada di dalam APK.

## DEC-002: Implementasi Langkah A (ABI Splits Menghasilkan 2 APK Fisik)
- **Konteks**: Pengguna memutuskan untuk memisahkan build APK per arsitektur untuk menghasilkan APK terpisah yang super ringan.
- **Keputusan**: Konfigurasi `splits { abi { enable true ... } }` dan batasi `reactNativeArchitectures` ke `armeabi-v7a,arm64-v8a`. Mengecualikan arsitektur emulator `x86` dan `x86_64`.
- **Dampak**: Menghasilkan tepat 2 file APK release: `app-arm64-v8a-release.apk` (~40MB) untuk HP Android modern 64-bit, dan `app-armeabi-v7a-release.apk` (~30-35MB) untuk HP Android 32-bit.

