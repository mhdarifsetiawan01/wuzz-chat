/**
 * Gerbang usia pembuatan akun: pengguna wajib menyatakan berusia minimal 13 tahun (sesuai Syarat Layanan,
 * Kebijakan Privasi, dan halaman keselamatan anak). Ini pernyataan diri; backend tidak menegakkannya agar build
 * lama (yang belum punya kotak centang) tetap bisa mendaftar. Dipakai di pendaftaran biasa dan onboarding Google
 * ("Buat akun baru"); jalur login dan penautan akun lama tidak membuat akun baru sehingga tidak memerlukannya.
 */

export const MIN_AGE_YEARS = 13;

export const AGE_GATE_ERROR = `Centang pernyataan usia (minimal ${MIN_AGE_YEARS} tahun) untuk membuat akun.`;

/** Mengembalikan pesan galat bila pernyataan usia belum dicentang, atau null bila boleh lanjut. */
export function validateAgeConfirmed(confirmed: boolean): string | null {
  return confirmed ? null : AGE_GATE_ERROR;
}
