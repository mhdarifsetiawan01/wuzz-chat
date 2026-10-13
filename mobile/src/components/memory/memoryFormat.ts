/** Format tanggal singkat untuk tampilan memori ("18 Sep 2026"); string kosong bila tidak valid. */
export function formatMemoryDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
