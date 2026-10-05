/**
 * WuzzChat Crash Reporting (Firebase Crashlytics)
 *
 * - Crash native dan error JS fatal ditangkap otomatis oleh Crashlytics (jejak JS memakai nomor baris bundle Hermes; untuk
 *   membacanya gunakan source map build yang sama, lihat docs/CRASH_REPORTING.md).
 * - Error JS non-fatal (global handler) dan error render React (AppErrorBoundary) dicatat lewat recordNonFatal.
 * - Pengumpulan hanya aktif pada build rilis (`!__DEV__`). Modul native tidak ada di Expo Go/uji unit: semua fungsi aman dipanggil.
 *
 * PRIVASI: kirim hanya ID akun acak (UUID) dan konteks teknis. JANGAN pernah mengirim isi pesan, username, token, kunci,
 * atau kata sandi ke Crashlytics (baik lewat log, atribut, maupun pesan error yang dibuat sendiri).
 */

let crashlyticsModule: any = null;
let crashlytics: any = null;
let initialized = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  crashlyticsModule = require('@react-native-firebase/crashlytics');
  crashlytics = crashlyticsModule.getCrashlytics();
} catch {
  // Modul native tidak tersedia (Expo Go / uji unit): semua fungsi menjadi no-op
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // Pelaporan crash tidak boleh pernah menyebabkan crash
  }
}

/** Mengaktifkan pengumpulan (hanya rilis) dan memasang penangkap error JS non-fatal. Panggil sekali di awal App. */
export function initCrashReporting(): void {
  if (initialized) return;
  initialized = true;
  if (!crashlytics) return;

  safe(() => {
    void crashlyticsModule.setCrashlyticsCollectionEnabled(crashlytics, !__DEV__);
  });

  const errorUtils = (globalThis as any).ErrorUtils;
  if (errorUtils?.setGlobalHandler && errorUtils?.getGlobalHandler) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      // Fatal: biarkan penangan bawaan RN memicu crash native yang dicatat otomatis (hindari laporan ganda).
      if (!isFatal) recordNonFatal(error, 'js_global_handler');
      previous?.(error, isFatal);
    });
  }
}

/** Mengaitkan laporan dengan ID akun acak (UUID). Berikan null saat logout/hapus akun. */
export function setCrashUser(userId: string | null | undefined): void {
  if (!crashlytics) return;
  safe(() => {
    void crashlyticsModule.setUserId(crashlytics, userId || '');
  });
}

/** Mencatat error non-fatal. `context` pendek tanpa data pribadi (mis. 'error_boundary'). */
export function recordNonFatal(error: unknown, context?: string): void {
  if (!crashlytics) return;
  safe(() => {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Non-Error thrown');
    if (context) crashlyticsModule.log(crashlytics, `context:${context}`);
    crashlyticsModule.recordError(crashlytics, err);
  });
}
