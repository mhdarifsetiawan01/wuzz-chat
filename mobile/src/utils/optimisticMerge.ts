/**
 * Penggabungan pesan optimistik (yang kita buat sebelum server menjawab) dengan pesan resmi dari server.
 * Dipisah dari MessageContext agar bisa diuji tanpa React.
 */

import type { Message } from '../api/types';

/**
 * Pesan resmi server menggantikan yang optimistik. Aturan media:
 *  - Gambar/audio/berkas: pertahankan `media_url` optimistik (lokal) bila ada, supaya tidak berkedip saat berganti.
 *  - Video: pakai `media_url` SERVER (jarak jauh). Thumbnail video diturunkan dari URL jarak jauh itu; bila yang
 *    tersimpan adalah path lokal, thumbnail hilang setelah chat dibuka ulang. Pemutaran tetap memakai salinan lokal
 *    persisten (mediaCache, kunci id pesan), jadi pengirim tidak mengunduh ulang. Pratinjau lokal (`local_thumb_uri`)
 *    dipertahankan supaya thumbnail tidak berkedip saat berganti.
 */
export function mergeOptimisticWithServer(optimistic: Message, server: Message): Message {
  const isVideo = (server.media_type || optimistic.media_type) === 'video';
  const media_url = isVideo
    ? server.media_url || optimistic.media_url
    : optimistic.media_url || server.media_url;
  return {
    ...server,
    id: server.id || optimistic.id,
    media_url,
    ...(isVideo && optimistic.local_thumb_uri ? { local_thumb_uri: optimistic.local_thumb_uri } : {}),
  };
}
