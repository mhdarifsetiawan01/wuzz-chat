// Konfigurasi jeda web & tautan unduh aplikasi mobile (satu sumber untuk semua halaman).
// Nilai NEXT_PUBLIC_* di-inline saat build: ubah env lalu rebuild untuk membuka/menutup web.

// Format direct download Google Drive: https://drive.google.com/uc?export=download&id=<FILE_ID>
// Update APK cukup lewat Drive > Manage versions agar ID/link tidak berubah.
export const APP_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_APK_URL || 'https://drive.google.com/uc?export=download&id=GANTI_DENGAN_FILE_ID'

export const IS_WEB_PAUSED = process.env.NEXT_PUBLIC_WEB_PAUSED === 'true'

// Route landing deep link dan /transfer/share (kirim kunci E2EE ke aplikasi mobile; halaman penerima /transfer tetap di-gate) tetap normal saat web dijeda
export const WEB_PAUSED_EXEMPT_PREFIXES = ['/u', '/g', '/sub', '/room', '/transfer/share']
