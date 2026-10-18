/** One source intent at a time; cancellation and late transports cannot navigate or render. */
export const SOURCE_UNAVAILABLE = 'Pesan sumber sudah tidak tersedia. Kutipan tersimpan sebagai bagian audit Memori.';
export class SourceRequest {
  private active?: AbortController;
  cancel() { this.active?.abort(); this.active = undefined; }
  async run<T>(fetch: (signal: AbortSignal) => Promise<T>, timeoutMs = 15000): Promise<{ value: T } | { error: string } | null> {
    this.cancel();
    const controller = new AbortController();
    this.active = controller;
    let timedOut = false;
    let expire!: (value: { error: string }) => void;
    const timeout = new Promise<{ error: string }>(resolve => { expire = resolve; });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      expire({ error: 'Konteks pesan gagal dimuat. Periksa koneksi lalu coba lagi.' });
    }, timeoutMs);
    try {
      const result = await Promise.race([fetch(controller.signal).then(value => ({ value })), timeout]);
      if (this.active !== controller || (controller.signal.aborted && !timedOut)) return null;
      return result;
    } catch (err: any) {
      if (this.active !== controller || (controller.signal.aborted && !timedOut)) return null;
      return { error: [403, 404].includes(err?.status) ? SOURCE_UNAVAILABLE : 'Konteks pesan gagal dimuat. Periksa koneksi lalu coba lagi.' };
    } finally {
      clearTimeout(timer);
      if (this.active === controller) this.active = undefined;
    }
  }
}

export function sourceContextPath(room: string, message: string): string {
  return `/api/messages?room_id=${encodeURIComponent(room)}&message_id=${encodeURIComponent(message)}`;
}
export function hasSourceTarget(rows: unknown, room: string, message: string): rows is any[] {
  return Array.isArray(rows) && rows.length <= 41 && rows.every(m => m?.room_id === room) &&
    rows.some(m => m.id === message && !m.is_deleted);
}
