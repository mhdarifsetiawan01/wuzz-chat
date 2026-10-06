import { colors } from './colors';

/**
 * Palet bubble "Pesan ini telah dihapus". Satu permukaan netral terang untuk bubble Anda maupun lawan, karena bubble
 * normal berwarna pekat (#30AFFF dan #334155) dan placeholder tidak boleh meminjam warnanya. Sebelumnya latar slate
 * gelap 45% di atas kanvas terang berkontras 1.1:1 dengan teks (nyaris tak terbaca).
 *
 * Teks dan jam wajib >= 4.5:1 terhadap latar (WCAG 2.1 AA, lihat mobile/DESIGN.md); dijaga tes
 * `scripts/test/deleted-bubble-contrast.test.js`.
 */
export const deletedBubblePalette = {
  background: colors.bgCard,
  border: colors.borderStrong,
  text: colors.textSecondary,
  time: colors.textSecondary,
} as const;
