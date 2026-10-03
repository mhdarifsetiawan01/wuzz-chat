/**
 * WuzzChat Mobile - messageStore
 * Store kecil di luar React untuk cache pesan per-room. Komponen berlangganan lewat
 * useSyncExternalStore dengan selector, sehingga perubahan di room A tidak me-render
 * ulang layar yang hanya memantau room B (akar masalah pada MessageContext lama).
 *
 * Aturan: updater slice wajib mengembalikan referensi LAMA bila tidak ada perubahan,
 * dan hanya mengganti referensi room yang benar-benar berubah.
 */

import { Message } from '../api/types';

export interface MessageStoreState {
  messagesByRoom: Record<string, Message[]>;
  roomLoading: Record<string, boolean>;
  roomRevalidating: Record<string, boolean>;
  hasMoreOlder: Record<string, boolean>;
  loadingOlder: Record<string, boolean>;
}

export interface MessageStore {
  getState: () => MessageStoreState;
  subscribe: (listener: () => void) => () => void;
  /** Ubah satu slice; tidak ada notifikasi bila updater mengembalikan referensi yang sama. */
  setSlice: <K extends keyof MessageStoreState>(
    key: K,
    updater: (prev: MessageStoreState[K]) => MessageStoreState[K]
  ) => void;
  /** Reset seluruh state (logout / bersihkan semua cache). */
  reset: () => void;
}

/** Konstanta stabil: snapshot "kosong" tidak boleh berupa array/objek baru tiap dibaca. */
export const EMPTY_MESSAGES: Message[] = [];

const createInitialState = (): MessageStoreState => ({
  messagesByRoom: {},
  roomLoading: {},
  roomRevalidating: {},
  hasMoreOlder: {},
  loadingOlder: {},
});

export function createMessageStore(): MessageStore {
  let state = createInitialState();
  const listeners = new Set<() => void>();

  const emit = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setSlice: (key, updater) => {
      const prevSlice = state[key];
      const nextSlice = updater(prevSlice);
      if (nextSlice === prevSlice) return;
      state = { ...state, [key]: nextSlice };
      emit();
    },
    reset: () => {
      state = createInitialState();
      emit();
    },
  };
}
