# IMPLEMENTATION PLAN — M-Mobile-8.21: SettingsScreen Modals & Interactive Settings

## 1. Objectives
Menggantikan seluruh aksi placeholder di `SettingsScreen.tsx` dengan modal interaktif yang fungsional, terhubung ke context & service yang sudah tersedia, serta menambahkan manajemen penyimpanan SQLite:
1. Hubungkan menu **Perangkat Tertaut** ke `DeviceTransferModal` (dukungan generate QR & scan QR).
2. Hubungkan menu **Notifikasi & Suara** ke `NotificationSettingsModal`.
3. Buat dan hubungkan modal **Kunci & Keamanan E2EE** (`E2EEKeyModal.tsx`) untuk menampilkan status Android Keystore, fingerprint SHA-256 / 30-digit Safety Number kunci pengguna sendiri, serta QR identity verification.
4. Tambahkan menu & modal **Penyimpanan & Data** (`StorageSettingsModal.tsx`):
   - Tambah helper di `sqliteStorage.ts` untuk menghitung statistik penyimpanan lokal (`getStorageStats`) dan membersihkan cache pesan lokal (`clearMessageCacheOnly`).
   - Tambah aksi pembersihan media cache menggunakan `expo-file-system`.
5. Tambahkan modal/dialog **Edit Profil** (`EditProfileModal.tsx`) untuk mengubah Display Name akun secara langsung.

## 2. Target Modified & Created Files
- `mobile/src/services/sqliteStorage.ts` (Modifikasi: tambah `getStorageStats`, `clearMessageCacheOnly`)
- `mobile/src/components/E2EEKeyModal.tsx` (File Baru: modal detail kunci kriptografi pengguna)
- `mobile/src/components/StorageSettingsModal.tsx` (File Baru: modal statistik & pembersih cache storage)
- `mobile/src/components/EditProfileModal.tsx` (File Baru: modal ubah nama tampilan profil)
- `mobile/src/components/index.ts` (Export modal baru)
- `mobile/src/screens/SettingsScreen.tsx` (Modifikasi: integrasi state & komponen modal)

## 3. Verification Strategy
1. **Type Safety & Lint**: Jalankan `npx tsc --noEmit` di direktori `mobile/` (0 errors).
2. **Backend Integrity**: Jalankan `go test ./...` di direktori `backend/` (100% PASS).
3. **Smoke Verification**: Pastikan seluruh modal memiliki penanganan tombol Back fisik Android, scrollable saat keyboard aktif, serta mengadopsi tema Aurora Dark Mode.
