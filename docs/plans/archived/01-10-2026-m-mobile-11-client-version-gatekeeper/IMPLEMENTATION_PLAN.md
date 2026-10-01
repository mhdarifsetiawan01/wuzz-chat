# Implementation Plan — Client App Versioning & Force Update Gatekeeper

## 🎯 1. Deskripsi & Tujuan
Menerapkan identitas versi aplikasi pada klien mobile WuzzChat (`mobile/`) dan menambahkan proteksi `VersionMiddleware` di backend Go (`backend/`) secara langsung dalam mode produksi aktif (`MIN_MOBILE_BUILD=1`), serta menyediakan otomatisasi penuh rilis versi (*zero manual json editing*).

---

## 📂 2. File yang Dibuat / Dimodifikasi

### Mobile App (`mobile/`)
- `mobile/app.json`: Daftarkan `version: "1.0.0"`, `android.versionCode: 1`, `ios.buildNumber: "1"`.
- `mobile/scripts/bump-version.js`: Skrip otomatisasi penambahan versi (`patch`, `minor`, `major`, `build`). Otomatis sinkronkan `app.json` dan `package.json` tanpa edit manual.
- `mobile/package.json`: Tambahkan script `bump:patch`, `bump:minor`, `bump:major`, `bump:build`.
- `mobile/src/api/client.ts`: Injeksi header `X-App-Version`, `X-App-Build`, `X-Client-ID` dari `expo-constants`, serta interceptor HTTP 426.
- `mobile/src/services/websocket.ts`: Tambahkan query param `app_version` dan `app_build` saat inisiasi WebSocket.
- `mobile/src/components/ForceUpdateModal.tsx`: Modal non-dismissible peringatan update dengan tombol ke Play Store / App Store.
- `mobile/App.tsx`: Registrasi `ForceUpdateModal` di root aplikasi.

### Backend Go (`backend/`)
- `backend/internal/shared/config/config.go`: Tambahkan parameter `MinMobileBuild` (default `1` - strict production), `PlayStoreURL`, `AppStoreURL`.
- `backend/internal/api/version_middleware.go`: Implementasi HTTP middleware pengecekan versi client mobile (Strict: tolak jika tanpa header build atau build < MinMobileBuild).
- `backend/internal/api/version_middleware_test.go`: Unit test komprehensif untuk middleware (mobile build 1 lolos, mobile build 0/hilang ditolak 426, web bypass lolos 200).
- `backend/internal/app/router.go`: Pasang `VersionMiddleware` di rute HTTP utama.
- `backend/internal/api/chat_handler.go`: Validasi versi pada handshake WebSocket upgrade.

---

## 🧪 3. Strategi Verifikasi & Testing
1. **Unit Test Backend**: `go test -v ./internal/api/...` (khususnya `version_middleware_test.go`).
2. **Typecheck Mobile**: `npx tsc --noEmit` di `mobile/` memastikan 0 error TypeScript.
3. **Simulasi Direct Verification**:
   - Hit endpoint via cURL/Postman dengan header mobile tanpa build / build 0 -> langsung terbukti menerima HTTP 426 Upgrade Required.
   - Hit endpoint dengan `X-Device-Platform: android` dan `X-App-Build: 1` -> lolos normal (HTTP 200).
   - Hit endpoint dari Web browser -> lolos normal (HTTP 200).
