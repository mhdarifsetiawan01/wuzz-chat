# Active Implementation Progress

- [x] **Task 1: Konfigurasi Scheme & Intent Filters Android / Expo**
  - [x] Update `mobile/app.json` (tambahkan `scheme: "wuzzchat"` dan intentFilters https domain `chat.wuzzhub.id`).
  - [x] Update `mobile/android/app/src/main/AndroidManifest.xml` (tambahkan `<intent-filter>` pada `.MainActivity` untuk `wuzzchat://` dan `https://chat.wuzzhub.id/u/*`).

- [x] **Task 2: Implementasi Universal Profile Deep Link Router di `mobile/App.tsx`**
  - [x] Implementasikan regex URL extractor untuk `/u/:username`, `wuzzchat://u/:username`, `?user=:username`.
  - [x] Implementasikan handler async `handleProfileDeepLink(username)` dengan fetching profile & connection status.
  - [x] Integrasikan percabangan privasi: buka chat langsung jika publik/berteman, buka profil jika privat dan belum berteman.
  - [x] Tangani skenario akun sendiri & penanganan error ramah jika user tidak ditemukan.

- [x] **Task 3: Implementasi Fitur "Bagikan Profil Saya" di Mobile UI**
  - [x] Tambahkan aksi "Bagikan Profil" di `mobile/src/screens/SettingsScreen.tsx`.
  - [x] Tambahkan tombol "Bagikan Profil" di `mobile/src/screens/UserProfileScreen.tsx` untuk profil diri sendiri (`isSelf`).

- [x] **Task 4: Dokumentasi Arsitektur Web Masa Depan & Tiered Sync**
  - [x] Catat rencana Web Landing Page `/u/:username` di `docs/domains/PROFILE_IDENTITY.md` dan `ROADMAP.md`.
  - [x] Dokumentasikan keputusan di `DECISION_LOG.md` (DEC-042 & DEC-043).

- [x] **Task 5: Verifikasi Kualitas & Automated Testing**
  - [x] Jalankan `npx tsc --noEmit` di `mobile/` (0 error).
  - [x] Jalankan `go test ./...` di `backend/` untuk memastikan tidak ada regresi.
  - [x] Jalankan `npm run build` di `frontend/` (0 error).

- [x] **Task 6: Konfigurasi Android Digital Asset Links di Web Frontend (Opsi 1)**
  - [x] Buat file `frontend/public/.well-known/assetlinks.json` dengan package name `com.wuzzchat.mobile` dan SHA-256 cert fingerprint.
  - [x] Tambahkan header MIME `application/json` di `frontend/next.config.ts`.

