/**
 * WuzzChat Mobile Theme - Palet gelap.
 * Kunci wajib identik dengan `lightColors` (dijaga tipe `ColorTokens` dan `scripts/test/theme-palettes.test.js`).
 * Latar memakai slate biru-kehitaman, bukan hitam murni, supaya kontras dengan teks tidak menyilaukan di layar OLED.
 */

import type { ColorTokens } from './colors';

export const darkColors: ColorTokens = {
  // Background & Surface
  bgBase: '#0b1220',
  bgSurface: '#111a2b',
  bgSurfaceHover: '#18243a',
  bgElevated: '#162033',
  bgOverlay: 'rgba(0, 0, 0, 0.6)',
  bgCard: '#111a2b',
  bgCardSolid: '#111a2b',
  bgInput: '#18243a',
  bgInputFocused: '#1f2d47',

  // Border & Dividers
  borderSubtle: '#1a2538',
  borderDefault: '#243049',
  borderStrong: '#35445f',
  borderFocus: '#30AFFF',

  // Text Hierarchy
  textPrimary: '#e8eef7',
  textSecondary: '#9aa8bd',
  textMuted: '#74829a',
  textInverse: '#0b1220',
  textOnAccent: '#ffffff',

  // Accent & Tints
  accentPrimary: '#30AFFF',
  accentHover: '#5bc0ff',
  tintAccent10: 'rgba(48, 175, 255, 0.12)',
  tintAccent20: 'rgba(48, 175, 255, 0.22)',
  tintAccent30: 'rgba(48, 175, 255, 0.32)',
  tintError10: 'rgba(248, 113, 113, 0.14)',
  tintError20: 'rgba(248, 113, 113, 0.24)',
  tintSuccess10: 'rgba(52, 211, 153, 0.14)',
  tintWarning10: 'rgba(251, 191, 36, 0.14)',
  tintPurple10: 'rgba(192, 132, 252, 0.16)',

  // Isian dengan teks putih: lebih dalam dari warna aksen/status supaya kontras >= 4.5:1.
  accentFill: '#1479cc',
  dangerFill: '#dc2626',
  successFill: '#047857',
  warningFill: '#b45309',

  // Status & Semantic
  colorOnline: '#34d399',
  colorError: '#f87171',
  colorWarning: '#fbbf24',
  colorSuccess: '#34d399',
  colorDanger: '#f87171',
  colorVerified: '#30AFFF',
  colorCyanNeon: '#38bdf8',
  colorPurple: '#c084fc',
  colorInfoText: '#7cc7ff',
  colorWarningText: '#fbbf24',

  // Compatibility & Key Accents
  monoAmber: '#fbbf24',
  monoAmberDark: '#f59e0b',
  monoIceCyan: '#38bdf8',
  monoSteelBlue: '#243049',

  // Unread badge on avatar
  unreadBadgeBg: '#1479cc',
  unreadBadgeText: '#ffffff',
};
