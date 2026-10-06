/**
 * KONFIGURASI TAMPILAN GOOGLE untuk seluruh aplikasi. Mengganti desain nanti cukup mengubah berkas ini:
 *
 *  - buttonAppearance 'brand' : tombol putih bergaris resmi Google (sesuai pedoman merek).
 *  - buttonAppearance 'app'   : tombol bergaya aplikasi (token DESIGN.md) dengan logo yang sama.
 *  - renderLogo               : ganti dengan komponen sendiri, mis. (size) => <LogoGoogleBuatanSaya size={size} />.
 *    CATATAN: logo Google di tombol "masuk dengan Google" sebaiknya tetap logo resmi; bila diganti, pastikan masih
 *    memenuhi pedoman merek Google (cek ulang sebelum rilis Play Store).
 *
 * Setiap pemakaian tetap bisa menimpa nilai default ini lewat props `appearance` / `renderLogo` pada GoogleSignInButton.
 */

import React from 'react';
import { GOOGLE_BRAND } from '../../theme/brand/google';
import { GoogleLogo } from './GoogleLogo';

export type GoogleButtonAppearance = 'brand' | 'app';

export interface GoogleUiConfig {
  buttonAppearance: GoogleButtonAppearance;
  renderLogo: (size: number) => React.ReactNode;
}

export const GOOGLE_UI: GoogleUiConfig = {
  buttonAppearance: 'brand',
  renderLogo: (size = GOOGLE_BRAND.logoSize) => <GoogleLogo size={size} />,
};
