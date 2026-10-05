/**
 * Tata letak tombol aksi mengambang (FAB) di tab Obrolan, Feed, dan Panggilan.
 * Satu sumber supaya posisi dan ukurannya sama saat pindah tab.
 */

import type { ViewStyle } from 'react-native';
import { colors } from './colors';

export const FAB_SIZE = 56;
export const FAB_RIGHT = 20;

/** Jarak dari bawah layar; cukup tinggi agar berada di atas tab bar. */
export function getFabBottom(safeAreaBottom: number): number {
  return Math.max(safeAreaBottom + 70, 85);
}

export const fabStyle: ViewStyle = {
  position: 'absolute',
  right: FAB_RIGHT,
  width: FAB_SIZE,
  height: FAB_SIZE,
  borderRadius: FAB_SIZE / 2,
  backgroundColor: colors.accentPrimary,
  alignItems: 'center',
  justifyContent: 'center',
  elevation: 6,
  shadowColor: colors.accentPrimary,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 8,
  zIndex: 90,
};
