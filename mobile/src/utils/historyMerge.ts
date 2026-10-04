import type { Message } from '../api/types';

function messageTime(m: Message): number {
  return new Date(m.timestamp || m.created_at || 0).getTime();
}

/**
 * Menggabungkan jendela riwayat dari server (`serverWindow`, sudah dipetakan) dengan pesan yang sudah ada di memori.
 * Dipertahankan:
 * - seluruh jendela server (sumber kebenaran untuk rentang waktunya);
 * - pesan optimistic yang belum dikonfirmasi server;
 * - pesan yang LEBIH LAMA dari pesan tertua di jendela server (halaman hasil `loadOlderMessages` atau hidrasi SQLite),
 *   karena server hanya mengirim jendela terbaru; membuangnya membuat daftar menyusut dan posisi scroll melompat.
 * Pesan di dalam rentang jendela server yang tidak dikirim server tetap dibuang (mis. sudah terhapus di server).
 * Jendela kosong tidak mempertahankan apa pun selain pesan optimistic (perilaku lama).
 */
export function mergeHistoryWindow(existing: Message[], serverWindow: Message[]): Message[] {
  const serverIds = new Set(serverWindow.map((m) => m.id));

  const pendingOptimistic = existing.filter(
    (m) => (m.status === 'sending' || (m as any).request_id) && !serverIds.has(m.id)
  );

  let olderThanWindow: Message[] = [];
  if (serverWindow.length > 0) {
    const oldestServer = Math.min(...serverWindow.map(messageTime));
    const optimisticIds = new Set(pendingOptimistic.map((m) => m.id));
    olderThanWindow = existing.filter(
      (m) => !serverIds.has(m.id) && !optimisticIds.has(m.id) && messageTime(m) < oldestServer
    );
  }

  const merged = [...serverWindow, ...olderThanWindow, ...pendingOptimistic];
  merged.sort((a, b) => messageTime(a) - messageTime(b));
  return merged;
}
