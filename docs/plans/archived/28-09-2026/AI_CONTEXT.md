# AI Context — Milestone M-Mobile-Release-Opt1

## Boundaries & Constraints
- **Scope**: Optimasi Release APK Android (Langkah B: Minifikasi R8, Langkah C: Resource Shrinking, Langkah D: Hermes runtime optimization).
- **Excluded**: Langkah A (ABI Split / arsitektur universal tetap dipertahankan 4 ABI), Release Keystore (tetap menggunakan debug signing atas permintaan pengguna).
- **Target Files**:
  - `mobile/android/gradle.properties`
  - `mobile/android/app/proguard-rules.pro`
- **Verification**:
  - `cd mobile && npx tsc --noEmit`
  - `cd mobile/android && ./gradlew assembleRelease`
  - Analisis perbandingan ukuran APK baru vs 151 MB sebelumnya.
