/**
 * Ringkasan satu baris untuk kutipan balasan (banner di input bar, isi `reply_to`, dan kotak
 * kutipan di bubble). Satu sumber supaya media dan postingan terbagi tidak tampil sebagai
 * teks mentah (termasuk penanda `wuzzchat://post/<id>`).
 */

import { parseSharedPost } from './feedShare';

interface QuoteSource {
  media_type?: string | null;
  media_url?: string | null;
  content?: string | null;
}

export function quotePreviewText(source: QuoteSource): string {
  if (source.media_type === 'audio') return '🎙️ Pesan Suara';
  if (source.media_url) return '📷 Foto';
  if (parseSharedPost(source.content)) return '📢 Postingan Komunitas';
  return source.content || 'Pesan';
}
