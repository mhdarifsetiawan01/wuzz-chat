/**
 * Daftar nama lawan bicara yang sedang mengetik di sebuah room (kosong bila tidak ada).
 * Mendengarkan event `typing` dan `message` dari websocketClient; lihat TypingTracker untuk aturan kedaluwarsa.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../context';
import { websocketClient } from '../services/websocket';
import { TypingTracker, typerKey } from '../utils/typingTracker';

// Web mematikan indikator setelah 2,5 dtk; klien mengirim event tiap 2 dtk selama mengetik
const TYPING_TTL_MS = 3000;

export function usePeerTyping(roomId: string): string[] {
  const { user } = useAuth();
  const selfId = user?.id || '';
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    setNames([]);
    const tracker = new TypingTracker(TYPING_TTL_MS, setNames);

    const offTyping = websocketClient.on('typing', (event: any) => {
      if (event?.room !== roomId) return;
      const key = typerKey(event, selfId);
      if (key) tracker.mark(key, String(event?.nickname || ''));
    });
    // Pesan dari orang itu berarti ia sudah selesai mengetik
    const offMessage = websocketClient.on('message', (event: any) => {
      if (event?.room !== roomId) return;
      const key = typerKey(event, selfId);
      if (key) tracker.remove(key);
    });

    return () => {
      offTyping();
      offMessage();
      tracker.dispose();
    };
  }, [roomId, selfId]);

  return names;
}
