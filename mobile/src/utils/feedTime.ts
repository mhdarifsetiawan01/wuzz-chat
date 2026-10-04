/**
 * Waktu relatif untuk postingan feed dan komentar ("5 mnt lalu", "3 jam lalu", "4 hari lalu");
 * setelah 7 hari beralih ke tanggal absolut. Kata penuh (bukan "m/j/h") agar tidak ambigu:
 * "4h" terbaca sebagai 4 jam padahal 4 hari. Gaya sama dengan DeviceLimitModal.
 */
export function formatPostTime(dateString: string, nowMs: number = Date.now()): string {
  const ts = new Date(dateString).getTime();
  if (Number.isNaN(ts)) return '';
  const diff = Math.max(0, (nowMs - ts) / 1000);
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} hari lalu`;
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
