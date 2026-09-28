# Handover Document — Mobile Device Limit Override Selection

## Summary
Fitur pemilihan perangkat yang ingin di-kick saat login perangkat ke-3 di aplikasi mobile React Native telah selesai diimplementasikan.

## Changes Detail
1. `mobile/src/api/types.ts`: Menambahkan interface `ActiveDeviceItem` dan mengekspos properti `active_devices` & `data` pada `ApiError`.
2. `mobile/src/api/client.ts`: Memastikan respons HTTP 409 `DEVICE_LIMIT_REACHED` menyertakan `active_devices` ke instance error yang dilempar.
3. `mobile/src/components/DeviceLimitModal.tsx`: Komponen modal React Native dengan:
   - Parser User-Agent (identifikasi icon 📱, 💻, 🖥️, 🐧 dan nama OS/browser).
   - Indikator badge "Paling Lama" pada perangkat tertua.
   - Format waktu relatif keaktifan perangkat.
   - Pilihan radio button / selection item yang intuitif.
   - Tombol "Batal" dan "Keluarkan & Masuk" dengan loading state indicator.
4. `mobile/src/screens/LoginScreen.tsx`: Menggantikan `Alert.alert` konfirmasi biner dengan `DeviceLimitModal`. Mengirim `kick_device_id` bersama `confirm_override: true` ke backend saat pengguna memilih perangkat spesifik.

## Verification Evidence
- `mobile/` TypeScript check (`npx tsc --noEmit`): Exit code 0 (0 error).
- `frontend/` production build (`npm run build`): Exit code 0 (0 error).
- `backend/` automated tests (`go test ./...`): Exit code 0 (100% passed).
