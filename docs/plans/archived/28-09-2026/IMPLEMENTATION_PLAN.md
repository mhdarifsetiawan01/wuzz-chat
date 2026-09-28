# Implementation Plan — Mobile Device Limit Override Selection

## Objectives
1. Memperkaya `ApiError` di mobile REST API Client agar menyimpan daftar `active_devices` yang dikembalikan server pada status 409 Conflict.
2. Membangun komponen UI `DeviceLimitModal` pada React Native yang mendukung:
   - Parser User Agent & Platform Icon (📱 iOS/Android, 💻 macOS/Windows/Linux, 🌐 Web).
   - Format waktu relatif keaktifan perangkat.
   - Indikator khusus "Paling Lama" pada perangkat tertua.
   - Pilihan interaktif (radio button/card tap) untuk memilih target kick device.
   - Tombol Batal & Konfirmasi "Keluarkan & Masuk" dengan loading state.
3. Mengintegrasikan modal ke `mobile/src/screens/LoginScreen.tsx` saat error `DEVICE_LIMIT_REACHED` terjadi.
4. Memvalidasi implementasi melalui `tsc --noEmit` di direktori `mobile/` dan automated test di `frontend/` & `backend/`.
