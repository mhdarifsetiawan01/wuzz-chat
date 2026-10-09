import { colors } from './colors';

/**
 * Palet bubble chat. Kanvas chat terang (`bgBase`), jadi bubble lawan putih bertepi tipis (pola WhatsApp mode terang)
 * dan bubble Anda biru yang cukup dalam agar teks putih lolos WCAG AA. Sebelumnya bubble lawan slate gelap `#334155`
 * (blok pekat di kanvas terang, kontras 9,6:1) dan bubble Anda `#30AFFF` dengan teks putih (2,4:1), keduanya dikeluhkan
 * "menyakitkan mata".
 *
 * Semua warna teks/ikon wajib >= 4.5:1 terhadap latar bubble-nya; dijaga `scripts/test/bubble-palette-contrast.test.js`.
 * Latar bubble dan teks harus hex opak supaya kontras terukur. Overlay kartu (rgba) hanya untuk lapisan di atas bubble.
 */
export const bubblePalette = {
  self: {
    background: '#0a6cb8',
    text: '#ffffff',
    textSecondary: '#e0f2fe', // jam, "diedit", diteruskan, ikon
    link: '#ffffff',
    accent: '#ffffff', // bar aksen kutipan, nama pengirim kutipan
    quoteBox: 'rgba(0, 0, 0, 0.22)',
    card: 'rgba(255, 255, 255, 0.14)',
    cardBorder: 'rgba(255, 255, 255, 0.28)',
    border: '#0a6cb8',
  },
  other: {
    background: colors.bgCardSolid,
    text: colors.textPrimary,
    textSecondary: '#475569',
    link: '#0369a1',
    accent: '#0369a1',
    quoteBox: '#f1f5f9',
    card: colors.bgBase,
    cardBorder: colors.borderDefault,
    border: colors.borderDefault,
  },
  // Bubble yang sedang disorot (hasil pencarian / lompat ke kutipan): tint terang, bukan navy pekat.
  highlight: {
    self: '#084f87', // teks putih tetap terbaca
    other: '#dbeafe', // teks gelap tetap terbaca
    border: colors.accentPrimary,
  },
  // Nama pengirim di grup, dipilih per nama. Varian gelap karena bubble lawan kini putih (>= 4.5:1 di atas putih).
  senderNames: ['#0369a1', '#0f766e', '#4338ca', '#a16207', '#be185d', '#6d28d9', '#15803d'],
} as const;
