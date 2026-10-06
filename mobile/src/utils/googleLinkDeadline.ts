/**
 * Logika pengumuman "hubungkan akun Google sebelum batas waktu". Modul murni (tanpa React/native) supaya bisa diuji unit.
 *
 * Server hanya mengirim `google_link_required_by` (RFC3339) untuk akun yang BELUM tertaut; klien menurunkan tingkat
 * urgensi dari sisa waktu. Pengumuman ini informatif: pembekuan akun setelah batas waktu bukan bagian dari modul ini.
 */

export type LinkUrgency = 'none' | 'info' | 'warning' | 'urgent' | 'expired';

export interface LinkDeadlineState {
  urgency: LinkUrgency;
  /** Sisa hari dibulatkan ke atas (0 bila sudah lewat). */
  daysLeft: number;
  /** Teks satu baris untuk banner. Kosong bila urgency 'none'. */
  message: string;
  /** Banner boleh ditutup sementara. Dua tingkat terakhir (urgent, expired) tidak boleh. */
  dismissible: boolean;
  /** Lama banner disembunyikan setelah ditutup (ms). 0 bila tidak boleh ditutup. */
  snoozeMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const NONE: LinkDeadlineState = { urgency: 'none', daysLeft: 0, message: '', dismissible: false, snoozeMs: 0 };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** "31 Des 2026" menurut zona waktu perangkat, tanpa bergantung pada Intl (tidak lengkap di semua build Hermes). */
export function formatDeadlineDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Menurunkan keadaan banner. `requiredBy` kosong, tidak valid, atau akun sudah tertaut = tidak ada pengumuman.
 *   > 30 hari   : info, ditunda 7 hari
 *   8-30 hari   : info, ditunda 3 hari
 *   3-7 hari    : warning, ditunda 1 hari
 *   1-2 hari    : urgent, tidak bisa ditutup
 *   sudah lewat : expired, tidak bisa ditutup
 */
export function getLinkDeadlineState(
  requiredBy: string | null | undefined,
  googleLinked: boolean | null | undefined,
  now: Date
): LinkDeadlineState {
  if (googleLinked === true || !requiredBy) return NONE;
  const deadline = new Date(requiredBy);
  if (Number.isNaN(deadline.getTime())) return NONE;

  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return {
      urgency: 'expired',
      daysLeft: 0,
      message: 'Batas waktu menautkan akun Google sudah lewat. Hubungkan sekarang.',
      dismissible: false,
      snoozeMs: 0,
    };
  }

  const daysLeft = Math.ceil(remainingMs / DAY_MS);
  const date = formatDeadlineDate(deadline);

  if (remainingMs < DAY_MS) {
    return {
      urgency: 'urgent',
      daysLeft,
      message: 'Batas waktu menautkan akun Google berakhir dalam 24 jam.',
      dismissible: false,
      snoozeMs: 0,
    };
  }

  const message = `Hubungkan akun Google sebelum ${date} (${daysLeft} hari lagi)`;
  if (daysLeft <= 2) return { urgency: 'urgent', daysLeft, message, dismissible: false, snoozeMs: 0 };
  if (daysLeft <= 7) return { urgency: 'warning', daysLeft, message, dismissible: true, snoozeMs: DAY_MS };
  if (daysLeft <= 30) return { urgency: 'info', daysLeft, message, dismissible: true, snoozeMs: 3 * DAY_MS };
  return { urgency: 'info', daysLeft, message, dismissible: true, snoozeMs: 7 * DAY_MS };
}

/** Penunda tersimpan sebagai epoch ms (string). Nilai rusak dianggap tidak ada, bukan "tertunda selamanya". */
export function parseSnoozeUntil(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isSnoozed(snoozeUntil: number | null, now: Date): boolean {
  return snoozeUntil !== null && snoozeUntil > now.getTime();
}

/** Nama kunci penyimpanan per akun (SecureStore hanya menerima [A-Za-z0-9._-]). */
export function snoozeStorageKey(userId: string): string {
  return `wuzz_google_link_snooze_${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}
