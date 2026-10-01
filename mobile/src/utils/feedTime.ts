/** Waktu relatif untuk postingan feed; setelah 7 hari beralih ke tanggal absolut. */
export function formatPostTime(dateString: string): string {
  const ts = new Date(dateString).getTime();
  if (Number.isNaN(ts)) return '';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'Baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}j lalu`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}h lalu`;
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
