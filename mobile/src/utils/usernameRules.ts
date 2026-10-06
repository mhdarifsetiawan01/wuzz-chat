/**
 * Petunjuk username di sisi klien. Mencerminkan aturan dasar server (validator.ValidateUsername): 3 sampai 30 karakter,
 * hanya huruf, angka, titik, strip, dan underscore. Server tetap yang berwenang (juga memeriksa kata terlarang dan
 * ketersediaan); ini hanya memberi tahu pengguna lebih awal. Modul murni agar bisa diuji unit.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USERNAME_RULES_TEXT = `${USERNAME_MIN} sampai ${USERNAME_MAX} karakter: huruf, angka, titik, strip, atau underscore.`;

export type UsernameHintState = 'idle' | 'ok' | 'error';

export interface UsernameHint {
  state: UsernameHintState;
  message: string;
}

const ALLOWED = /^[a-zA-Z0-9_.-]+$/;

/** Kosong = 'idle' (hanya menampilkan aturan). Galat baru muncul setelah pengguna mulai mengetik. */
export function getUsernameHint(raw: string): UsernameHint {
  const value = raw.trim();
  if (value.length === 0) return { state: 'idle', message: USERNAME_RULES_TEXT };
  if (!ALLOWED.test(value)) {
    return { state: 'error', message: 'Hanya huruf, angka, titik, strip, dan underscore (tanpa spasi).' };
  }
  if (value.length < USERNAME_MIN) return { state: 'error', message: `Minimal ${USERNAME_MIN} karakter.` };
  if (value.length > USERNAME_MAX) return { state: 'error', message: `Maksimal ${USERNAME_MAX} karakter.` };
  return { state: 'ok', message: 'Format username sesuai. Ketersediaan diperiksa saat akun dibuat.' };
}
