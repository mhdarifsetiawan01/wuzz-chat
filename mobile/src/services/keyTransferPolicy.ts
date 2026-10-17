export type TransferRole = 'sender' | 'receiver';

export interface TransferState {
  userId: string | null;
  session: string | null;
  status: string;
  blocked: boolean;
  hasKey: boolean;
}

export function canTransfer(role: TransferRole, state: TransferState): boolean {
  if (!state.userId || !state.session || state.blocked) return false;
  return role === 'sender'
    ? state.status === 'ready' && state.hasKey
    : role === 'receiver' && state.status === 'conflict' && !state.hasKey;
}

/** One import at a time; a late response never commits into a different session. */
export function createTransferImporter<T>(options: {
  getState: () => TransferState;
  consume: (code: string) => Promise<T>;
  persist: (userId: string, pair: T, assertCurrent: () => void) => Promise<void>;
  discard: (userId: string, pair: T) => Promise<void>;
  activate: (pair: T) => void;
}) {
  let generation = 0;
  let busy = false;
  return {
    invalidate() { generation++; },
    async run(code: string, signal?: AbortSignal) {
      const start = { ...options.getState() };
      if (busy || !canTransfer('receiver', start) || signal?.aborted) {
        throw new Error('Penerimaan kunci hanya tersedia saat terjadi konflik kunci.');
      }
      busy = true;
      const operation = generation;
      const assertCurrent = () => {
        const now = options.getState();
        if (signal?.aborted || operation !== generation || !canTransfer('receiver', now)
          || start.userId !== now.userId || start.session !== now.session) {
          throw new Error('Transfer dibatalkan karena perangkat atau sesi sudah berubah.');
        }
      };
      try {
        assertCurrent();
        const pair = await options.consume(code);
        assertCurrent();
        await options.persist(start.userId!, pair, assertCurrent);
        try {
          assertCurrent();
        } catch (error) {
          // Native storage writes cannot be aborted once submitted.
          await options.discard(start.userId!, pair);
          throw error;
        }
        options.activate(pair);
      } finally {
        busy = false;
      }
    },
  };
}
