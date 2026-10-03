/**
 * WuzzChat Mobile - undecryptable
 * Mengenali penanda pesan E2EE yang gagal dibuka karena kunci tidak cocok (mis. kunci direset atau aplikasi
 * dipasang ulang) agar bisa ditampilkan dengan jujur dan ringkas. Murni presentasi: teks penanda tetap
 * tersimpan apa adanya di SQLite (MessageContext / ChatScreen / decryptSnippet), jadi tidak ada migrasi data.
 *
 * Pencocokan sengaja persis (bukan startsWith) agar teks pengguna yang kebetulan mirip tidak ikut berubah.
 * Kasus "kunci belum siap / sedang sinkron" (e2ee: mentah atau decrypt_failed) BUKAN bagian dari sini.
 */

/** Penanda yang ditulis MessageContext/ChatScreen saat AES-GCM gagal diverifikasi. */
const PLACEHOLDER_KEY_MISMATCH = '🔒 Pesan terenkripsi (kunci tidak cocok)';
/** Penanda yang dikembalikan decryptSnippet (pratinjau daftar chat) saat dekripsi gagal. */
const PLACEHOLDER_SNIPPET = '🔒 Pesan terenkripsi';

/** Teks pratinjau daftar chat. Hanya dipakai saat render (tidak disimpan); diawali 🔒 agar IconText menampilkan ikon gembok. */
export const UNDECRYPTABLE_PREVIEW = '🔒 Pesan tidak dapat dibuka';

export function isUndecryptablePlaceholder(content?: string | null): boolean {
  if (!content) return false;
  const text = content.trim();
  return text === PLACEHOLDER_KEY_MISMATCH || text === PLACEHOLDER_SNIPPET;
}

export const UNDECRYPTABLE_INFO_TITLE = 'Kenapa pesan ini tidak bisa dibuka?';
export const UNDECRYPTABLE_INFO_BODY =
  'Pesan ini dienkripsi dengan kunci yang berbeda dari kunci aktif di perangkat ini. ' +
  'Itu terjadi bila kunci enkripsi direset, aplikasi dipasang ulang tanpa memindahkan kunci, ' +
  'atau lawan bicara mengganti kuncinya.\n\n' +
  'Pesan ini tidak bisa dibuka tanpa kunci lama. Pesan baru tidak terpengaruh.';
