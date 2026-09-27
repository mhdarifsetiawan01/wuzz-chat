# DECISION LOG — M-Mobile-8.21

## [DEC-016] Unified Modal Architecture for SettingsScreen
- **Context**: `SettingsScreen.tsx` membutuhkan 5 modal interaktif: Device Transfer, Kunci E2EE, Penyimpanan & Data, Notifikasi, dan Edit Profil.
- **Decision**: Menggunakan komponen modal terisolasi dengan prop `visible`, `onClose`, dan integrasi safe-area insets serta keyboard avoidance agar konsisten dengan `mobile/DESIGN.md`.

## [DEC-017] Non-Destructive Storage Cleanup Policy
- **Context**: Pembersihan cache lokal harus aman dan tidak menyebabkan user ter-logout atau kehilangan keypair E2EE.
- **Decision**: `clearMessageCacheOnly` hanya menghapus data tabel `local_messages`, mempertahankan `local_conversations` (agar daftar obrolan tidak hilang) dan tidak menyentuh `secureStorage` (token JWT & private key tetap aman di Keystore).
