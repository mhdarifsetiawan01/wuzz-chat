/**
 * Data game hari ini untuk kartu di Feed dan layar permainan.
 * - Cache modul per pengguna: kartu langsung tampil dari data terakhir (tanpa spinner) lalu disegarkan.
 * - Zona waktu perangkat disinkronkan ke server saat berubah (hari baru mengikuti jam lokal pengguna).
 * - Seluruh panggilan lewat apiClient (timeout 15 dtk); kegagalan jaringan tidak menghapus data terakhir.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, GameSubmitResult, GameToday, gameApi } from '../api';
import { gameReminder } from '../services/gameReminder';
import { gameStorage } from '../services/gameStorage';

export type GameLoadStatus = 'loading' | 'ready' | 'disabled' | 'error';

const cache = new Map<string, GameToday>();

function deviceTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

/** Menyimpan zona waktu perangkat ke server bila berbeda dari yang terakhir tersinkron. true = tersimpan. */
async function syncTimezone(userId: string): Promise<boolean> {
  const tz = deviceTimezone();
  if (!tz) return false;
  if ((await gameStorage.getSyncedTimezone(userId)) === tz) return false;
  try {
    await gameApi.updateSettings({ timezone: tz });
    await gameStorage.setSyncedTimezone(userId, tz);
    return true;
  } catch (err) {
    // 409 = zona waktu masih terkunci 24 jam: jangan ulangi tiap membuka aplikasi.
    if ((err as ApiError)?.status === 409) await gameStorage.setSyncedTimezone(userId, tz);
    return false;
  }
}

export interface UseGameToday {
  status: GameLoadStatus;
  data: GameToday | null;
  error: string | null;
  refresh: () => Promise<void>;
  start: () => Promise<GameToday | null>;
  submit: (placement: number[]) => Promise<GameSubmitResult>;
}

export function useGameToday(userId: string | undefined): UseGameToday {
  const cached = userId ? cache.get(userId) ?? null : null;
  const [data, setData] = useState<GameToday | null>(cached);
  const [status, setStatus] = useState<GameLoadStatus>(
    cached ? (cached.enabled ? 'ready' : 'disabled') : 'loading'
  );
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const apply = useCallback(
    (next: GameToday) => {
      if (userId) {
        cache.set(userId, next);
        // Selaraskan jadwal pengingat (jam dari server, dilewati bila hari ini sudah selesai). Aman dipanggil berulang.
        void gameReminder.sync(userId, next);
      }
      if (!alive.current) return;
      setData(next);
      setStatus(next.enabled ? 'ready' : 'disabled');
      setError(null);
    },
    [userId]
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    // Panggilan bersamaan (fokus + tarik-segarkan) digabung menjadi satu permintaan.
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try {
        let today = await gameApi.getToday();
        if (today.enabled && (await syncTimezone(userId))) {
          today = await gameApi.getToday();
        }
        apply(today);
      } catch (err) {
        if (!alive.current) return;
        // Data terakhir tetap ditampilkan; hanya tandai galat bila belum ada apa pun.
        setError((err as ApiError)?.detail || 'Tidak dapat memuat game hari ini.');
        setStatus((prev) => (prev === 'loading' ? 'error' : prev));
      }
    })();
    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
    }
  }, [userId, apply]);

  const start = useCallback(async () => {
    try {
      const next = await gameApi.start();
      apply(next);
      return next;
    } catch (err) {
      if (alive.current) setError((err as ApiError)?.detail || 'Tidak dapat memulai game.');
      return null;
    }
  }, [apply]);

  const submit = useCallback(
    async (placement: number[]) => {
      const res = await gameApi.submit(placement);
      if (userId) {
        const prev = cache.get(userId);
        if (prev) {
          apply({ ...prev, attempt: res.attempt, streak: res.streak ?? prev.streak });
        }
      }
      return res;
    },
    [userId, apply]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, data, error, refresh, start, submit };
}
