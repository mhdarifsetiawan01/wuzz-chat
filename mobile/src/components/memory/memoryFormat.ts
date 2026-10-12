/** Format tanggal singkat untuk tampilan memori ("18 Sep 2026"); string kosong bila tidak valid. */
export function formatMemoryDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Memecah ringkasan AI menjadi judul (kalimat pertama) dan sisanya, untuk daftar arsip.
 * Nama topik buatan pengguna sering generik ("Forum Diskusi"), sedangkan kalimat pertama ringkasan menjelaskan isinya.
 */
export function splitMemoryHeadline(summary: string, maxLen = 110): { headline: string; rest: string } {
  const text = (summary || '').trim().replace(/\s+/g, ' ');
  if (!text) return { headline: '', rest: '' };
  const match = text.match(/^(.{15,}?[.!?])(?:\s+|$)/);
  if (match && match[1].length <= maxLen) {
    return { headline: match[1], rest: text.slice(match[0].length).trim() };
  }
  if (text.length <= maxLen) return { headline: text, rest: '' };
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  const headline = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
  return { headline, rest: text.slice(headline.length - 1).trim() };
}
