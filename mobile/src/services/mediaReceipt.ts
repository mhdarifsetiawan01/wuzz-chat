import type { Message } from '../api/types';
import { mediaCache } from './mediaCache';

const completed = new Set<string>();
const pending = new Map<string, Promise<void>>();
let generation = 0;

export function resetMediaReceipts(): void {
  generation++;
  completed.clear();
  pending.clear();
}

/** ACK means a complete file exists locally. Never ACK merely because a component mounted. */
export async function acknowledgeCachedMedia(
  message: Message,
  userId: string,
  send: (messageId: string, roomId?: string) => Promise<unknown>
): Promise<void> {
  if (!userId || !message.id || message.sender_id === userId || !message.media_url ||
    /^(grp_|sub_)/.test(message.room_id) || message.media_status === 'downloaded') return;
  const key = `${userId}:${message.id}`;
  if (completed.has(key)) return;
  const running = pending.get(key);
  if (running) return running;
  const epoch = generation;
  const job = (async () => {
    const uri = await mediaCache.getCachedMediaUri(message.media_url, message.id, message.file_name, message.file_size);
    if (!uri || epoch !== generation) return;
    await send(message.id, message.room_id);
    if (epoch !== generation) return;
    completed.add(key);
    if (completed.size > 2000) completed.delete(completed.values().next().value!);
  })();
  pending.set(key, job);
  try { await job; } finally {
    if (pending.get(key) === job) pending.delete(key);
  }
}
