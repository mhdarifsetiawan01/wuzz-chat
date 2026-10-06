/**
 * Pemetaan galat login Google (ApiError dari server atau GoogleAuthError dari SDK) ke pesan untuk pengguna.
 * Modul murni: tanpa React/native agar bisa diuji unit.
 */

export interface GoogleFlowError {
  status?: number;
  code?: string;
  detail?: string;
  message?: string;
}

/** Konflik batas 2 perangkat (HTTP 409 dengan code DEVICE_LIMIT_REACHED). */
export function isDeviceLimitError(err: GoogleFlowError | null | undefined): boolean {
  return err?.code === 'DEVICE_LIMIT_REACHED';
}

/** link_token kedaluwarsa/tidak sah: layar harus mengambil token baru atau memulai ulang. */
export function isLinkTokenError(err: GoogleFlowError | null | undefined): boolean {
  return err?.code === 'LINK_TOKEN_INVALID';
}

/** ID token Google ditolak/kedaluwarsa: pengguna harus memilih akun Google lagi. */
export function isGoogleTokenError(err: GoogleFlowError | null | undefined): boolean {
  return err?.code === 'GOOGLE_TOKEN_INVALID';
}

const MESSAGES: Record<string, string> = {
  GOOGLE_NOT_CONFIGURED: 'Login Google belum tersedia saat ini. Gunakan login dengan username.',
  GOOGLE_TOKEN_INVALID: 'Verifikasi akun Google gagal. Silakan pilih akun Google lagi.',
  GOOGLE_REAUTH_STALE: 'Verifikasi Google sudah kedaluwarsa. Silakan coba lagi.',
  GOOGLE_MISMATCH: 'Akun Google yang dipilih bukan akun yang terhubung ke akun Wuzz ini.',
  LINK_TOKEN_INVALID: 'Sesi verifikasi Google sudah berakhir. Silakan mulai ulang.',
  INVALID_CREDENTIALS: 'Username atau password salah.',
  GOOGLE_LINKED_TO_OTHER_ACCOUNT: 'Akun Google ini sudah terhubung ke akun Wuzz lain.',
  ACCOUNT_ALREADY_HAS_GOOGLE: 'Akun Wuzz ini sudah terhubung ke sebuah akun Google.',
  USERNAME_TAKEN: 'Username sudah digunakan, silakan pilih username lain.',
  PASSWORD_LOGIN_UNAVAILABLE: 'Akun ini tidak memiliki password, sehingga akun Google tidak dapat diputus.',
  GOOGLE_SAME_ACCOUNT: 'Akun Google yang dipilih sama dengan yang sudah terhubung.',
  GOOGLE_TENANT_NOT_ALLOWED: 'Login Google tidak tersedia untuk akun ini.',
  ACCOUNT_SUSPENDED: 'Akun ini ditangguhkan karena melanggar ketentuan layanan. Ajukan banding lewat email ke support.',
};

/**
 * Pesan untuk pengguna. VALIDATION_ERROR memakai pesan server apa adanya (sudah berbahasa Indonesia dan aman
 * ditampilkan, mis. "username minimal 3 karakter"). Selain itu jatuh ke detail server, lalu ke `fallback`.
 */
export function googleErrorMessage(err: GoogleFlowError | null | undefined, fallback: string): string {
  if (err?.code && MESSAGES[err.code]) return MESSAGES[err.code];
  if (err?.code === 'VALIDATION_ERROR' && err.detail) return err.detail;
  if (err?.status === 0) return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.';
  if (err?.status === 429) return 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.';
  return err?.detail || err?.message || fallback;
}
