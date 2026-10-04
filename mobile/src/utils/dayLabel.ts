/**
 * Label hari untuk pemisah tanggal di linimasa chat ("Hari ini", "Kemarin", nama hari, tanggal).
 * Semua perbandingan memakai zona waktu lokal perangkat, sama seperti jam yang tampil di bubble.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(ts?: string | number | Date | null): Date | null {
  if (ts === undefined || ts === null || ts === '') return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Kunci hari lokal; dua waktu di hari yang sama menghasilkan kunci sama. Null bila tanggal tidak valid. */
export function dayKey(ts?: string | number | Date | null): string | null {
  const d = toDate(ts);
  return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : null;
}

export function formatDayLabel(ts: string | number | Date, now: Date = new Date()): string {
  const d = toDate(ts);
  if (!d) return '';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  // Math.round menyerap selisih 23/25 jam pada pergantian jam musim panas
  const diffDays = Math.round((startOf(now) - startOf(d)) / DAY_MS);

  if (diffDays === 0) return 'Hari ini';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays > 1 && diffDays < 7) return WEEKDAYS[d.getDay()];
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}
