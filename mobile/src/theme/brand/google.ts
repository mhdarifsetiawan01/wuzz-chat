/**
 * Konstanta merek "Sign in with Google" (sumber: Google Identity branding guidelines,
 * https://developers.google.com/identity/branding-guidelines).
 *
 * SATU-SATUNYA tempat warna hex mentah untuk merek Google. DESIGN.md melarang hex mentah di komponen, tetapi warna logo
 * dan tombol resmi Google ditetapkan oleh pedoman mereka dan tidak boleh diubah (logo tidak boleh diwarnai ulang).
 *
 * Ingin tombol/logo versi sendiri? Jangan ubah berkas ini: pasang `renderLogo` kustom atau ubah `appearance` di
 * `components/google/googleUi.tsx` (satu baris untuk seluruh aplikasi).
 */

export const GOOGLE_BRAND = {
  /** Empat warna logo "G" resmi. */
  logo: {
    red: '#EA4335',
    blue: '#4285F4',
    yellow: '#FBBC05',
    green: '#34A853',
  },
  /** Tombol tema terang resmi. */
  button: {
    fill: '#FFFFFF',
    stroke: '#747775',
    text: '#1F1F1F',
  },
  /** Ukuran logo di dalam tombol (dp). */
  logoSize: 20,
  /** Jarak ikon ke teks (dp), sesuai pedoman. */
  iconGap: 10,
} as const;
