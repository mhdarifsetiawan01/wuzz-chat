/**
 * WuzzChat Icon Registry
 *
 * Satu-satunya tempat set ikon Wuzz didefinisikan. Setiap ikon digambar pada
 * kanvas 24×24 sebagai garis (stroke) tanpa isian, lalu diwarnai lewat prop
 * `color` komponen <Icon />.
 *
 * Cara menambah / mengganti ikon dari SVG gambar sendiri:
 *  1. Ekspor SVG dengan viewBox="0 0 24 24", stroke saja (tanpa fill).
 *  2. Ambil nilai atribut `d` dari setiap <path> dan masukkan ke array `outline`.
 *     Bentuk lain (<circle>, <rect>, <line>) dikonversi ke path (Figma:
 *     Outline Stroke tidak perlu; cukup "Flatten" / Copy as SVG path).
 *  3. (Opsional) `filled` = varian aktif/terpilih. Bila kosong, Icon memakai
 *     `outline` dengan garis yang lebih tebal.
 *
 * Aturan gaya Wuzz: garis seragam, ujung & sambungan membulat, tanpa isian
 * pada varian outline. Ketebalan diatur terpusat di Icon (STROKE_WIDTH).
 */

export interface IconDef {
  /** Path `d` pada kanvas 24×24, digambar sebagai garis. */
  outline: string[];
  /** Varian aktif: path yang diisi warna penuh. Opsional. */
  filled?: string[];
  /** Ikon selalu terisi penuh (mis. hati yang sudah di-like). */
  solid?: boolean;
}

// ⚠️ PLACEHOLDER SEMENTARA — bentuk sederhana agar kabel Icon bisa diuji.
// Ganti isi `outline` dengan path dari SVG gambar sendiri.
const GLOBE = [
  'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  'M3 12h18',
  'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
];

const CALL =
  'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z';

const BELL = ['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z', 'M10 21a2 2 0 0 0 4 0'];
const MIC = [
  'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z',
  'M5 11a7 7 0 0 0 14 0',
  'M12 18v3',
];
const HEART = ['M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.2 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z'];
const SPEAKER = ['M4 10v4h4l5 4V6L8 10H4Z'];

export const ICONS = {
  // Tab bawah
  chat: {
    outline: [
      'M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8.5l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
      'M8 10.5v.01',
      'M12 10.5v.01',
      'M16 10.5v.01',
    ],
  },
  feed: { outline: GLOBE },
  call: { outline: [CALL] },
  settings: {
    outline: [
      'M4 7h9',
      'M17 7h3',
      'M15 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
      'M4 17h3',
      'M11 17h9',
      'M9 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
    ],
  },
  // Keamanan & status pesan
  lock: {
    outline: [
      'M6 11h12a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a1 1 0 0 1 1-1Z',
      'M8 11V8a4 4 0 0 1 8 0v3',
    ],
  },
  check: { outline: ['M5 12.5l4.5 4.5L19 7.5'] },
  checkDouble: { outline: ['M1.5 12.5L6 17l9-9.5', 'M10.5 16l1 1L21 7.5'] },
  clock: { outline: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7.5V12l3 2'] },
  pin: { outline: ['M9 4h6l-1 6 3 3H7l3-3-1-6Z', 'M12 13v7'] },
  // Chat & media
  search: { outline: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z', 'M20 20l-4-4'] },
  attach: {
    outline: [
      'M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8',
    ],
  },
  mic: { outline: MIC },
  send: { outline: ['M21 3L10 14', 'M21 3l-7 18-4-7-7-4 18-7Z'] },
  camera: {
    outline: [
      'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z',
      'M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
    ],
  },
  image: {
    outline: [
      'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
      'M8.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
      'M21 16l-5-5-8 9',
    ],
  },
  // Orang & peran
  users: {
    outline: [
      'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
      'M2.5 20a6.5 6.5 0 0 1 13 0',
      'M16 4.5a3.5 3.5 0 0 1 0 6.5',
      'M18 14.2A6.5 6.5 0 0 1 21.5 20',
    ],
  },
  user: { outline: ['M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 21a8 8 0 0 1 16 0'] },
  crown: { outline: ['M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z'] },
  shield: { outline: ['M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3Z'] },
  // Status & info
  alert: { outline: ['M12 3.5l9.5 16.5h-19L12 3.5Z', 'M12 10v4.5', 'M12 17.5v.01'] },
  checkCircle: {
    outline: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M8 12.5l2.8 2.8L16 9.5'],
  },
  bell: { outline: BELL },
  sparkle: { outline: ['M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z'] },
  // Objek & konten
  globe: { outline: GLOBE },
  megaphone: {
    outline: [
      'M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z',
      'M15 9a4 4 0 0 1 0 6',
      'M18 6.5a8 8 0 0 1 0 11',
    ],
  },
  article: {
    outline: ['M17 8h3v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1h12v14', 'M7.5 8h6', 'M7.5 12h6', 'M7.5 15.5h4'],
  },
  mail: {
    outline: [
      'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
      'M3 7l9 6.5L21 7',
    ],
  },
  forum: {
    outline: ['M3 9.5L12 4l9 5.5', 'M5 10v8', 'M9.5 10v8', 'M14.5 10v8', 'M19 10v8', 'M3 20h18'],
  },
  device: {
    outline: [
      'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z',
      'M11 18h2',
    ],
  },
  copy: {
    outline: [
      'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z',
      'M16 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3',
    ],
  },
  plus: { outline: ['M12 5v14', 'M5 12h14'] },
  // Aksi pesan & berkas
  edit: { outline: ['M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z', 'M14 7l3 3'] },
  trash: { outline: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'] },
  reply: { outline: ['M10 6L4 12l6 6', 'M4 12h10a6 6 0 0 1 6 6v1'] },
  forwardMessage: { outline: ['M14 6l6 6-6 6', 'M20 12H10a6 6 0 0 0-6 6v1'] },
  share: { outline: ['M12 15V4', 'M8 8l4-4 4 4', 'M5 14v5h14v-5'] },
  external: { outline: ['M7 17L17 7', 'M9 7h8v8'] },
  ban: { outline: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M5.6 5.6l12.8 12.8'] },
  exit: { outline: ['M10 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4', 'M15 8l4 4-4 4', 'M19 12H9'] },
  file: { outline: ['M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z', 'M14 3v5h5'] },
  folder: { outline: ['M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z'] },
  link: {
    outline: [
      'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1',
      'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    ],
  },
  music: {
    outline: [
      'M9 18V6l10-2v12',
      'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
      'M19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    ],
  },
  video: {
    outline: [
      'M4 7h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z',
      'M15 10.5l6-3v9l-6-3',
    ],
  },
  play: { outline: ['M8 5l11 7-11 7V5Z'] },
  storage: {
    outline: [
      'M12 4C7.6 4 4 5.3 4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7c0-1.7-3.6-3-8-3Z',
      'M4 7c0 1.7 3.6 3 8 3s8-1.3 8-3',
      'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    ],
  },
  broom: {
    outline: [
      'M15 4l5 5',
      'M13 7l4 4-6.5 6.5c-2 2-5 2.5-7.5 2 .5-2.5 1-5.5 3-7.5L13 7Z',
    ],
  },
  // Suara & perangkat
  mute: { outline: [...MIC, 'M4 4l16 16'] },
  volume: { outline: [...SPEAKER, 'M16 9a4 4 0 0 1 0 6', 'M18.5 6.5a8 8 0 0 1 0 11'] },
  volumeLow: { outline: [...SPEAKER, 'M16 9.5a3.5 3.5 0 0 1 0 5'] },
  bellOff: { outline: [...BELL, 'M4 4l16 16'] },
  phoneOff: { outline: [CALL, 'M3 3l18 18'] },
  laptop: {
    outline: ['M5 6h14a1 1 0 0 1 1 1v9H4V7a1 1 0 0 1 1-1Z', 'M2.5 19h19'],
  },
  // Ekspresi & dekorasi
  heart: { outline: HEART },
  heartFilled: { outline: HEART, solid: true },
  star: {
    outline: ['M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5Z'],
  },
  bolt: { outline: ['M13 3L5 13.5h6L10 21l9-11h-6.5L13 3Z'] },
  bulb: {
    outline: [
      'M9 18h6',
      'M10 21h4',
      'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z',
    ],
  },
  smile: {
    outline: [
      'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
      'M8.5 14a4.5 4.5 0 0 0 7 0',
      'M9 9.5v.01',
      'M15 9.5v.01',
    ],
  },
  mapPin: {
    outline: [
      'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11Z',
      'M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
    ],
  },
  briefcase: {
    outline: [
      'M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z',
      'M9 8V5h6v3',
      'M3 13h18',
    ],
  },
  // Info & kontrol
  info: { outline: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 11v5', 'M12 8v.01'] },
  more: { outline: ['M12 6v.01', 'M12 12v.01', 'M12 18v.01'] },
  pause: { outline: ['M8 5v14', 'M16 5v14'] },
  hourglass: {
    outline: ['M7 3h10', 'M7 21h10', 'M8 3v3l4 6-4 6v3', 'M16 3v3l-4 6 4 6v3'],
  },
  keyboard: {
    outline: [
      'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
      'M7 10h.01',
      'M11 10h.01',
      'M15 10h.01',
      'M7 14h10',
    ],
  },
  userPlus: {
    outline: [
      'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
      'M2.5 21a7.5 7.5 0 0 1 15 0',
      'M19 8v6',
      'M16 11h6',
    ],
  },
  userMinus: {
    outline: [
      'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
      'M2.5 21a7.5 7.5 0 0 1 15 0',
      'M16 11h6',
    ],
  },
  // Panah
  chevronUp: { outline: ['M6 15l6-6 6 6'] },
  chevronDown: { outline: ['M6 9l6 6 6-6'] },
  arrowUp: { outline: ['M12 19V5', 'M6 11l6-6 6 6'] },
  arrowDown: { outline: ['M12 5v14', 'M6 13l6 6 6-6'] },
  arrowUpLeft: { outline: ['M17 17L7 7', 'M15 7H7v8'] },
  arrowDownLeft: { outline: ['M17 7L7 17', 'M7 9v8h8'] },
  // Navigasi
  close: { outline: ['M6 6l12 12', 'M18 6L6 18'] },
  back: { outline: ['M15 5l-7 7 7 7'] },
  forward: { outline: ['M9 5l7 7-7 7'] },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;
