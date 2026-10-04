import { Linking } from 'react-native';
import { showAlert } from '../services/dialog';

/**
 * Regex pendeteksi URL HTTP/HTTPS, www, dan domain umum (id, com, net, org, io, dll).
 */
export const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|org|net|id|io|co|app|dev|me|ai|tv|xyz|edu|gov)(?:\/[^\s]*)?)/gi;

/**
 * Karakter tanda baca di ujung yang sering tidak sengaja ikut terbawa
 * saat pengguna mengetik URL di dalam kalimat (misal: "cek https://google.com.")
 */
const TRAILING_PUNCTUATION = /[.,;:!?()\[\]"']+$/;

/**
 * Membersihkan URL dari tanda baca di akhir string.
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  return rawUrl.trim().replace(TRAILING_PUNCTUATION, '');
}

/**
 * Memastikan URL memiliki skema http:// atau https://
 */
export function normalizeUrl(url: string): string {
  const clean = sanitizeUrl(url);
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) {
    return clean;
  }
  // Jika www. atau nama domain valid tanpa skema, tambahkan https://
  if (/^(www\.|[a-zA-Z0-9][-a-zA-Z0-9]*\.)/i.test(clean)) {
    return `https://${clean}`;
  }
  return clean;
}

/**
 * Memeriksa apakah suatu string adalah URL valid dengan skema http atau https saja.
 * Menolak skema berbahaya (javascript:, file:, content:, intent:, data:).
 */
export function isSafeHttpUrl(url: string): boolean {
  if (!url) return false;
  const normalized = normalizeUrl(url);
  try {
    return /^https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/i.test(normalized);
  } catch {
    return false;
  }
}

/**
 * Mengekstrak URL valid pertama dari sebuah teks pesan untuk keperluan LinkPreview.
 * Mengembalikan null jika tidak ada URL valid yang ditemukan.
 */
export function extractFirstUrl(text?: string): string | null {
  if (!text) return null;
  const matches = text.match(URL_REGEX);
  if (!matches || matches.length === 0) return null;

  for (const match of matches) {
    const cleaned = normalizeUrl(match);
    if (isSafeHttpUrl(cleaned)) {
      return cleaned;
    }
  }
  return null;
}

/**
 * Membuka URL eksternal dengan pengamanan skema dan penanganan error try-catch.
 * Pada Android 11+ (API 30+), canOpenURL() sering mengembalikan false karena package visibility filtering.
 * Oleh karena itu, setelah URL dipastikan aman (skema http/https), Linking.openURL() dipanggil langsung
 * di dalam blok try-catch untuk menjamin kompatibilitas Android & iOS.
 */
export async function safeOpenUrl(rawUrl: string): Promise<boolean> {
  const targetUrl = normalizeUrl(rawUrl);

  if (!isSafeHttpUrl(targetUrl)) {
    showAlert('Tautan Ditolak', 'Tautan ini tidak menggunakan protokol web yang aman (hanya http/https).');
    return false;
  }

  try {
    await Linking.openURL(targetUrl);
    return true;
  } catch (error) {
    console.warn('[safeOpenUrl] Gagal membuka URL:', targetUrl, error);
    showAlert('Gagal Membuka Tautan', 'Tidak dapat membuka browser untuk memuat tautan ini.');
    return false;
  }
}


export interface LinkToken {
  text: string;
  /** Terisi hanya jika token adalah URL aman (http/https) yang boleh diketuk. */
  url?: string;
}

const MAX_LINKIFY_LENGTH = 5000;

/**
 * Memecah teks menjadi token teks biasa dan URL. Memakai RegExp baru per panggilan
 * (bukan URL_REGEX global bersama) agar tidak terkena state `lastIndex`.
 * Teks ditampilkan apa adanya (tidak ada label yang menyembunyikan tujuan link), skema
 * berbahaya ditolak oleh isSafeHttpUrl, dan alamat email (didahului '@') tidak dianggap link.
 */
export function tokenizeLinks(text: string): LinkToken[] {
  if (!text) return [];
  if (text.length > MAX_LINKIFY_LENGTH) return [{ text }];

  const re = new RegExp(URL_REGEX.source, 'gi');
  const tokens: LinkToken[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last && !last.url) last.text += value;
    else tokens.push({ text: value });
  };

  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    const clean = sanitizeUrl(raw);
    const normalized = normalizeUrl(clean);

    if (!clean || text[start - 1] === '@' || !isSafeHttpUrl(normalized)) {
      continue; // biarkan sebagai teks biasa
    }

    pushText(text.slice(cursor, start));
    tokens.push({ text: clean, url: normalized });
    pushText(raw.slice(clean.length));
    cursor = start + raw.length;
  }

  pushText(text.slice(cursor));
  return tokens;
}
