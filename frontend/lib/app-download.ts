// Konfigurasi jeda web & tautan unduh aplikasi mobile (satu sumber untuk semua halaman).
// Nilai NEXT_PUBLIC_* di-inline saat build: ubah env lalu rebuild untuk membuka/menutup web.

// Tautan unduh mengarah ke Google Play (aplikasi sudah rilis di Produksi sejak 28 Okt 2026).
export const APP_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_APK_URL || 'https://play.google.com/store/apps/details?id=com.wuzzchat.mobile'

export const IS_WEB_PAUSED = process.env.NEXT_PUBLIC_WEB_PAUSED === 'true'

// Halaman legal publik (/privacy, /terms, /delete-account, /child-safety) wajib tetap terbuka untuk Play Console.
// /admin = alat moderasi internal (login sendiri, tidak memakai sesi chat; wajib tetap terbuka walau web pengguna dijeda).
// Route landing deep link dan /transfer/share (kirim kunci E2EE ke aplikasi mobile; halaman penerima /transfer tetap di-gate) tetap normal saat web dijeda
export const WEB_PAUSED_EXEMPT_PREFIXES = ['/u', '/g', '/sub', '/room', '/transfer/share', '/privacy', '/terms', '/delete-account', '/child-safety', '/admin']
